import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { withSqlPerformanceContext } from "../../../_shared/performance-metrics.ts";
import { AutomationStudioStatementCache } from "./statement-cache.ts";

export type AutomationStudioSqlRunResult = { changes: number; lastID: number };
export type AutomationStudioWalCheckpointMode = "passive" | "full" | "restart" | "truncate";
export type AutomationStudioWalCheckpointResult = { busy: number; log: number; checkpointed: number };

export type AutomationStudioSqlExecutor = {
  run(sql: string, params?: readonly unknown[]): Promise<AutomationStudioSqlRunResult>;
  get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /**
   * Runs a script of parameterless statements in one call, stopping at the
   * first error. Offered by the project database so schema work reaches SQLite
   * as one round trip instead of one per statement; other executors may omit it.
   */
  exec?(script: string): Promise<void>;
};

export type AutomationStudioProjectDatabaseLease = {
  projectId: string;
  database: AutomationStudioProjectDatabase;
  release(): Promise<void>;
};

export type AutomationStudioProjectDatabasePoolOptions = {
  rootDir: string;
  busyTimeoutMs?: number;
  /**
   * How long a project database stays open after its last lease is released,
   * in case another lease follows. 0 (the default) closes it on that release.
   * See `AutomationStudioProjectDatabasePool`.
   */
  idleCloseMs?: number;
};

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
 */
export class AutomationStudioProjectDatabasePool {
  readonly rootDir: string;
  private readonly busyTimeoutMs: number;
  private readonly idleCloseMs: number;
  private readonly entries = new Map<string, Promise<PoolEntry>>();
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
    if (this.closing) throw new Error("Automation Studio project database pool is closing.");
    const normalizedProjectId = normalizeProjectId(projectId);
    // The entry is awaited before the lease is counted, so the last lease may be
    // released (closing the entry and removing it from the map) during that await.
    // Only count a lease on an entry that is still the current one; otherwise open afresh.
    let entryPromise = this.currentOrOpenEntry(normalizedProjectId);
    let entry = await entryPromise;
    while (this.entries.get(normalizedProjectId) !== entryPromise) {
      if (this.closing) throw new Error("Automation Studio project database pool is closing.");
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
          await currentEntry.database.close();
          return;
        }
        clearIdleTimer(currentEntry);
        currentEntry.idleTimer = setTimeout(() => {
          currentEntry.idleTimer = undefined;
          if (currentEntry.leases || this.entries.get(normalizedProjectId) !== currentEntryPromise) return;
          this.entries.delete(normalizedProjectId);
          void currentEntry.database.close().catch(/* best-effort: nobody awaits an idle close, and the entry has already left the pool */ () => undefined);
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
    if (!entryPromise) return;
    // Only waits for the open to settle: one that failed has left the map (see
    // `currentOrOpenEntry`), and its error already went to the lease that asked.
    await entryPromise.then(() => undefined, () => undefined);
    if (this.entries.get(normalizedProjectId) !== entryPromise) return;
    const entry = await entryPromise;
    // Checked again after that await: a lease may have been taken, or the idle
    // close may have run and a new entry taken this one's place.
    if (entry.leases || this.entries.get(normalizedProjectId) !== entryPromise) return;
    clearIdleTimer(entry);
    this.entries.delete(normalizedProjectId);
    await entry.database.close();
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
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map(async (entryPromise) => {
      const entry = await entryPromise;
      clearIdleTimer(entry);
      await entry.database.close();
    }));
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

  private async openEntry(projectId: string): Promise<PoolEntry> {
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

export class AutomationStudioProjectDatabase implements AutomationStudioSqlExecutor {
  readonly projectId: string;
  readonly filePath: string;
  private operationTail: Promise<void> = Promise.resolve();
  private pendingOperations = 0;
  private closed = false;
  private closePromise: Promise<void> | null = null;
  // Every statement this connection runs goes through here, in issue order,
  // with `run` and `all` statements kept prepared; see statement-cache.ts.
  private readonly statements: AutomationStudioStatementCache;

  private constructor(private readonly handle: sqlite3.Database, input: { projectId: string; filePath: string }) {
    this.projectId = input.projectId;
    this.filePath = input.filePath;
    this.statements = new AutomationStudioStatementCache(handle);
  }

  static async open(input: { projectId: string; filePath: string; busyTimeoutMs: number }): Promise<AutomationStudioProjectDatabase> {
    const handle = await openDatabase(input.filePath, input.busyTimeoutMs);
    const database = new AutomationStudioProjectDatabase(handle, input);
    try {
      // One script, in the same order: every open pays one round trip here, not five.
      await database.execute((sql) => sql.exec!([
        "pragma foreign_keys = ON",
        "pragma journal_mode = WAL",
        "pragma synchronous = NORMAL",
        "pragma temp_store = MEMORY",
        `pragma busy_timeout = ${Math.max(100, Math.trunc(input.busyTimeoutMs))}`
      ].join(";\n")));
    } catch (error) {
      await database.close().catch(() => undefined);
      throw error;
    }
    return database;
  }

  get queuedOperations(): number {
    return this.pendingOperations;
  }

  run(sql: string, params: readonly unknown[] = []): Promise<AutomationStudioSqlRunResult> {
    return this.execute((executor) => executor.run(sql, params));
  }

  get<T>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    return this.execute((executor) => executor.get<T>(sql, params));
  }

  all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.execute((executor) => executor.all<T>(sql, params));
  }

  execute<TResult>(operation: (executor: AutomationStudioSqlExecutor) => Promise<TResult>): Promise<TResult> {
    return this.enqueue(() => operation(this.directExecutor()));
  }

  transaction<TResult>(operation: (transaction: AutomationStudioSqlExecutor) => Promise<TResult>): Promise<TResult> {
    return this.enqueue(async () => {
      const executor = this.directExecutor();
      await executor.run("begin immediate");
      try {
        const result = await operation(executor);
        await executor.run("commit");
        return result;
      } catch (error) {
        await executor.run("rollback").catch(() => undefined);
        throw error;
      }
    });
  }

  async integrityCheck(): Promise<string[]> {
    const rows = await this.all<Record<string, string>>("pragma integrity_check");
    return rows.map((row) => Object.values(row)[0] ?? "");
  }

  async checkpoint(mode: AutomationStudioWalCheckpointMode = "passive"): Promise<AutomationStudioWalCheckpointResult> {
    const normalized = mode.toLowerCase() as AutomationStudioWalCheckpointMode;
    if (!["passive", "full", "restart", "truncate"].includes(normalized)) throw new Error("Invalid Automation Studio WAL checkpoint mode.");
    const row = await this.get<Record<string, number>>(`pragma wal_checkpoint(${normalized})`);
    if (!row) throw new Error("Automation Studio WAL checkpoint did not return a result.");
    const values = Object.values(row);
    return { busy: Number(values[0] ?? 0), log: Number(values[1] ?? 0), checkpointed: Number(values[2] ?? 0) };
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    // SQLite refuses to close a connection that still has prepared statements.
    this.closePromise = this.operationTail.catch(() => undefined)
      .then(() => this.statements.finalizeAll())
      .then(() => closeDatabase(this.handle));
    return this.closePromise;
  }

  private enqueue<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    if (this.closed) return Promise.reject(new Error(`Automation Studio project database ${this.projectId} is closed.`));
    this.pendingOperations += 1;
    const result = this.operationTail.catch(() => undefined).then(() =>
      withSqlPerformanceContext({ repositoryKind: "automation-studio-v2", databaseName: path.basename(this.filePath) }, operation)
    );
    this.operationTail = result.then(() => undefined, () => undefined).finally(() => {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1);
    });
    return result;
  }

  private directExecutor(): AutomationStudioSqlExecutor {
    return {
      run: (sql, params = []) => this.statements.run(sql, params),
      get: <T>(sql: string, params: readonly unknown[] = []) => this.statements.get<T>(sql, params),
      all: <T>(sql: string, params: readonly unknown[] = []) => this.statements.all<T>(sql, params),
      exec: (script: string) => this.statements.exec(script)
    };
  }
}

function normalizeProjectId(projectId: string): string {
  const value = projectId.trim();
  if (!value || value.length > 200 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error("Automation Studio project ID must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  return value;
}

function openDatabase(filePath: string, busyTimeoutMs: number): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const handle = new sqlite3.Database(filePath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX, (error) => {
      if (error) reject(error);
      else {
        handle.serialize();
        resolve(handle);
      }
    });
    handle.configure("busyTimeout", busyTimeoutMs);
  });
}

function closeDatabase(handle: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => handle.close((error) => error ? reject(error) : resolve()));
}
