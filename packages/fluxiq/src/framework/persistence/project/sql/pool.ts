import { mkdir } from "node:fs/promises";
import path from "node:path";
import { AutomationStudioProjectDatabase } from "./database.ts";
import { AutomationStudioProjectStoreUnavailableError } from "./store-unavailable-error.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePoolOptions } from "./contracts/index.ts";

type PoolEntry = { database: AutomationStudioProjectDatabase; leases: number; idleTimer: ReturnType<typeof setTimeout> | undefined };

/**
 * One open connection per project, shared by every lease on it.
 *
 * With `idleCloseMs` 0 the connection closes on its last release. With a grace
 * period it stays open that long, and a lease taken in the meantime reuses it.
 * A service runs its operations back to back, each releasing before the next
 * acquires, so closing on every release reopened the database once per
 * operation: measured 2026-10-02 (t246), 18 opens for the four calls that
 * install a Flow's primary router and 25-37 per runtime-run test case, each
 * paying an open that creates the WAL and runs its pragmas, the full migration
 * check of every store set (the ready memo is per connection), and a close
 * that checkpoints the WAL to disk and deletes it. Nothing stays open once the
 * project has been idle for the grace period; `closeAll` and
 * `closeIdleProject` close at once, so a caller about to remove a project's
 * files does not wait for it.
 *
 * Every close the pool starts is tracked until it finishes. `closeAll` and
 * `closeIdleProject` wait for those already in flight, an idle close the timer
 * started among them, so neither returns while a connection still holds the
 * files; and a project is not opened again until its previous connection has
 * closed, so one project never has two connections.
 */
export class AutomationStudioProjectDatabasePool {
  readonly rootDir: string;
  private readonly busyTimeoutMs: number;
  private readonly idleCloseMs: number;
  private readonly entries = new Map<string, Promise<PoolEntry>>();
  private readonly closesInFlight = new Map<string, Set<Promise<void>>>();
  private closing = false;

  constructor(options: AutomationStudioProjectDatabasePoolOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.busyTimeoutMs = Math.max(100, Math.trunc(options.busyTimeoutMs ?? 10_000));
    this.idleCloseMs = Math.max(0, Math.trunc(options.idleCloseMs ?? 0));
  }

  /** Whether `closeAll` has been called: every later `acquire` is refused. */
  get isClosing(): boolean {
    return this.closing;
  }

  async acquire(projectId: string): Promise<AutomationStudioProjectDatabaseLease> {
    if (this.closing) throw new AutomationStudioProjectStoreUnavailableError("Automation Studio project database pool is closing.");
    const normalizedProjectId = normalizeProjectId(projectId);
    // The entry is awaited before the lease is counted, so the last lease may be
    // released (closing the entry and removing it from the map) during that await.
    // Only count a lease on an entry that is still the current one; otherwise open afresh.
    let entryPromise = this.currentOrOpenEntry(normalizedProjectId);
    let entry = await entryPromise;
    while (this.entries.get(normalizedProjectId) !== entryPromise) {
      if (this.closing) throw new AutomationStudioProjectStoreUnavailableError("Automation Studio project database pool is closing.");
      entryPromise = this.currentOrOpenEntry(normalizedProjectId);
      entry = await entryPromise;
    }
    const currentEntryPromise = entryPromise;
    const currentEntry = entry;
    // Counted in the same synchronous step as the check above, so an idle close
    // either ran before it (the entry is gone and was not reused) or never runs.
    clearIdleTimer(currentEntry);
    currentEntry.leases += 1;
    let released = false;
    return {
      projectId: normalizedProjectId,
      database: currentEntry.database,
      release: async () => {
        if (released) return;
        released = true;
        currentEntry.leases = Math.max(0, currentEntry.leases - 1);
        if (currentEntry.leases || this.entries.get(normalizedProjectId) !== currentEntryPromise) return;
        if (!this.idleCloseMs) {
          this.entries.delete(normalizedProjectId);
          await this.closeEntry(normalizedProjectId, currentEntry);
          return;
        }
        clearIdleTimer(currentEntry);
        currentEntry.idleTimer = setTimeout(() => {
          currentEntry.idleTimer = undefined;
          if (currentEntry.leases || this.entries.get(normalizedProjectId) !== currentEntryPromise) return;
          this.entries.delete(normalizedProjectId);
          void this.closeEntry(normalizedProjectId, currentEntry).catch(/* best-effort: no caller awaits an idle close, and closeAll and closeIdleProject still wait for it to settle */ () => undefined);
        }, this.idleCloseMs);
        // An idle connection never keeps the process alive.
        currentEntry.idleTimer.unref?.();
      }
    };
  }

  /**
   * Closes a project's database now if no lease holds it, rather than at the end
   * of its idle grace period. A caller about to remove the project's files calls
   * this first: an open connection holds `project.sqlite` and its WAL.
   */
  async closeIdleProject(projectId: string): Promise<void> {
    const normalizedProjectId = normalizeProjectId(projectId);
    const entryPromise = this.entries.get(normalizedProjectId);
    if (entryPromise) {
      // Only waits for the open to settle: one that failed has left the map (see
      // `currentOrOpenEntry`), and its error already went to the lease that asked.
      const [opened] = await Promise.allSettled([entryPromise]);
      // Checked after that await: a lease may have been taken, or the idle close
      // may have run and a new entry taken this one's place.
      if (opened.status === "fulfilled" && !opened.value.leases && this.entries.get(normalizedProjectId) === entryPromise) {
        this.entries.delete(normalizedProjectId);
        await this.closeEntry(normalizedProjectId, opened.value);
      }
    }
    // An idle close the timer started a moment ago still holds the files.
    await this.closesSettled(normalizedProjectId);
  }

  stats(): { openProjects: number; projects: Array<{ projectId: string; leases: number; queuedOperations: number }> } {
    const projects: Array<{ projectId: string; leases: number; queuedOperations: number }> = [];
    for (const [projectId, entryPromise] of this.entries) {
      void entryPromise.then((entry) => projects.push({ projectId, leases: entry.leases, queuedOperations: entry.database.queuedOperations }));
    }
    return { openProjects: this.entries.size, projects };
  }

  async closeAll(): Promise<void> {
    this.closing = true;
    const entries = [...this.entries.entries()];
    this.entries.clear();
    // An open that failed already gave its error to the lease that asked, and has nothing to close.
    const opened = await Promise.allSettled(entries.map(([, entryPromise]) => entryPromise));
    await Promise.all(opened.map((result, index) => result.status === "fulfilled" ? this.closeEntry(entries[index]![0], result.value) : undefined));
    await Promise.all([...this.closesInFlight.keys()].map((projectId) => this.closesSettled(projectId)));
  }

  private currentOrOpenEntry(projectId: string): Promise<PoolEntry> {
    const current = this.entries.get(projectId);
    if (current) return current;
    const entryPromise = this.openEntry(projectId);
    this.entries.set(projectId, entryPromise);
    entryPromise.catch(() => {
      if (this.entries.get(projectId) === entryPromise) this.entries.delete(projectId);
    });
    return entryPromise;
  }

  /** Starts closing an entry that has already left `entries`, and tracks the close until it settles. */
  private closeEntry(projectId: string, entry: PoolEntry): Promise<void> {
    clearIdleTimer(entry);
    const closed = entry.database.close();
    let inFlight = this.closesInFlight.get(projectId);
    if (!inFlight) this.closesInFlight.set(projectId, inFlight = new Set());
    const tracked = inFlight;
    tracked.add(closed);
    const settled = () => {
      tracked.delete(closed);
      if (!tracked.size && this.closesInFlight.get(projectId) === tracked) this.closesInFlight.delete(projectId);
    };
    // The close's own outcome goes to whoever awaits the returned promise.
    void closed.then(settled, settled);
    return closed;
  }

  /** Resolves once every close already started for the project has settled, failed ones included. */
  private async closesSettled(projectId: string): Promise<void> {
    await Promise.allSettled([...(this.closesInFlight.get(projectId) ?? [])]);
  }

  private async openEntry(projectId: string): Promise<PoolEntry> {
    // The previous connection closes first: one project never has two.
    await this.closesSettled(projectId);
    const projectDir = path.join(this.rootDir, "projects", projectId);
    await mkdir(projectDir, { recursive: true });
    const database = await AutomationStudioProjectDatabase.open({
      projectId,
      filePath: path.join(projectDir, "project.sqlite"),
      busyTimeoutMs: this.busyTimeoutMs
    });
    return { database, leases: 0, idleTimer: undefined };
  }
}

function clearIdleTimer(entry: PoolEntry): void {
  if (entry.idleTimer === undefined) return;
  clearTimeout(entry.idleTimer);
  entry.idleTimer = undefined;
}

function normalizeProjectId(projectId: string): string {
  const value = projectId.trim();
  if (!value || value.length > 200 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error("Automation Studio project ID must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  return value;
}
