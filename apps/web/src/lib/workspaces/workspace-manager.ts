import type { FluxIQ } from "fluxiq";
import { HeldKeys } from "fluxiq/secret-keys";
import { instanceBusy } from "./instance-busy";
import type { WorkspaceEntry, WorkspaceLease } from "./WorkspaceEntry";
import type { WorkspaceManagerOptions } from "./WorkspaceManagerOptions";

const DEFAULT_IDLE_MS = 15 * 60_000;
const DEFAULT_CACHE_MAX = 100;
const MAX_SWEEP_INTERVAL_MS = 60_000;
/** How often one `acquire` may find its workspace evicted again before it gives up; reached only under constant cache pressure. */
const MAX_OPEN_ATTEMPTS = 5;

/** The manager's own record behind a `WorkspaceEntry`. */
class OpenWorkspace implements WorkspaceEntry {
  leases = 0;

  constructor(
    readonly workspaceId: string,
    readonly primary: boolean,
    public fluxiq: FluxIQ,
    readonly heldKeys: HeldKeys | null,
    public lastUsedAt: number,
    private readonly reportsWork: (fluxiq: FluxIQ) => boolean
  ) {}

  get gateway(): FluxIQ["programs"]["clientGateway"] {
    return this.fluxiq.programs.clientGateway;
  }

  get busy(): boolean {
    return this.leases > 0 || this.reportsWork(this.fluxiq);
  }
}

/**
 * The web server's FluxIQ instances, one per workspace (hosted production
 * plan, Tenancy And Data; t813).
 *
 * - The primary workspace is today's instance, created on first use by
 *   `createPrimary` and never evicted. Under `single` it is the only one.
 * - Under `multi`, any other workspace is created on first `acquire` by
 *   `createTenant`, once per id however many callers ask at the same time. A
 *   create that fails is not kept. An open workspace is evicted
 *   (`close({ mode: "evict" })`) after `idleMs` unused, or least recently used
 *   first when more than `cacheMax` are open; a busy one never is, so a cache
 *   full of busy workspaces grows past `cacheMax` and says so.
 * - Each tenant has a `HeldKeys` that outlives its evictions, so its people
 *   stay unlocked when it is created again; it is revoked when the workspace
 *   is deleted or the manager closes.
 * - An `acquire` of a workspace being evicted waits for its close before
 *   creating it again on the same root. A delete is refused while the
 *   workspace is busy, and every `acquire` is refused while it runs.
 */
export class FluxIQWorkspaceManager {
  readonly tenancy: WorkspaceManagerOptions["tenancy"];
  readonly primaryWorkspaceId: string;
  private readonly idleMs: number;
  private readonly cacheMax: number;
  private readonly now: () => number;
  private primaryEntry: OpenWorkspace | null = null;
  private readonly open = new Map<string, OpenWorkspace>();
  private readonly opening = new Map<string, Promise<OpenWorkspace>>();
  private readonly closing = new Map<string, Promise<void>>();
  private readonly deletions = new Map<string, Promise<void>>();
  private readonly custody = new Map<string, HeldKeys>();
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;
  private closed: Promise<void> | null = null;
  private overCap = false;

  constructor(private readonly options: WorkspaceManagerOptions) {
    if (options.tenancy === "multi" && !options.createTenant) throw new Error("workspaces.tenant_factory_missing: a multi-tenant manager needs createTenant");
    this.tenancy = options.tenancy;
    this.primaryWorkspaceId = options.primaryWorkspaceId;
    this.idleMs = positive(options.idleMs, DEFAULT_IDLE_MS, "idleMs");
    this.cacheMax = positive(options.cacheMax, DEFAULT_CACHE_MAX, "cacheMax");
    this.now = options.now ?? Date.now;
    const interval = options.sweepIntervalMs ?? Math.min(this.idleMs, MAX_SWEEP_INTERVAL_MS);
    this.sweepTimer = options.tenancy === "multi" && interval > 0 ? setInterval(() => this.sweepInBackground(), interval) : null;
    // An idle sweep never keeps the process alive.
    this.sweepTimer?.unref?.();
  }

  /** The primary workspace, created on first use. */
  primary(): WorkspaceEntry {
    return this.primaryRecord();
  }

  /** Puts a new primary instance in place (a reload); the caller closed the old one. */
  replacePrimary(fluxiq: FluxIQ): void {
    if (this.primaryEntry) this.primaryEntry.fluxiq = fluxiq;
    else this.primaryEntry = new OpenWorkspace(this.primaryWorkspaceId, true, fluxiq, null, this.now(), (instance) => this.reportsWork(instance));
  }

  /** The open workspace, or undefined when it is not open now; never creates one. */
  get(workspaceId: string): WorkspaceEntry | undefined {
    if (workspaceId === this.primaryWorkspaceId) return this.primaryEntry ?? undefined;
    return this.open.get(workspaceId);
  }

  /** The ids of the open workspaces, the primary first when it exists. */
  workspaceIds(): string[] {
    return [...(this.primaryEntry ? [this.primaryWorkspaceId] : []), ...this.open.keys()];
  }

  /** Holds the workspace for one caller, creating it when it is not open. Release the lease when done. */
  async acquire(workspaceId: string): Promise<WorkspaceLease> {
    this.assertOpen();
    if (workspaceId === this.primaryWorkspaceId) return this.lease(this.primaryRecord());
    if (this.tenancy === "single") throw new Error("workspaces.unknown_workspace: this server holds one workspace");
    for (let attempt = 0; attempt < MAX_OPEN_ATTEMPTS; attempt += 1) {
      this.assertOpen();
      if (this.deletions.has(workspaceId)) throw new Error("workspaces.deleting: the workspace is being deleted");
      const closing = this.closing.get(workspaceId);
      if (closing) await closing;
      const open = this.open.get(workspaceId);
      if (open) return this.lease(open);
      if (this.closing.has(workspaceId)) continue;
      const opened = await (this.opening.get(workspaceId) ?? this.startOpening(workspaceId));
      if (this.open.get(workspaceId) === opened && !this.deletions.has(workspaceId)) return this.lease(opened);
    }
    throw new Error("workspaces.unavailable: the workspace was evicted each time it opened; try again");
  }

  /** Runs `work` on the workspace, held for its whole length. */
  async withWorkspace<T>(workspaceId: string, work: (fluxiq: FluxIQ) => Promise<T> | T): Promise<T> {
    const lease = await this.acquire(workspaceId);
    try {
      return await work(lease.fluxiq);
    } finally {
      lease.release();
    }
  }

  /** Evicts every idle workspace unused for `idleMs`, then the least recently used beyond `cacheMax`; resolves once they closed. */
  async sweep(): Promise<void> {
    if (this.closed) return;
    const now = this.now();
    const closes: Array<Promise<void>> = [];
    for (const record of [...this.open.values()]) {
      // Work in flight counts as use, so a workspace is idle from when its last run or build ended.
      if (record.busy) record.lastUsedAt = Math.max(record.lastUsedAt, now);
      else if (now - record.lastUsedAt >= this.idleMs) closes.push(this.evict(record));
    }
    closes.push(...this.enforceCap());
    await Promise.all(closes);
  }

  /**
   * Deletes a tenant workspace: closes it for good, revokes every key its
   * people unlocked, and removes its storage root. Refused for the primary,
   * and while the workspace is busy.
   */
  deleteWorkspace(workspaceId: string): Promise<void> {
    try {
      this.assertOpen();
    } catch (error) {
      return Promise.reject(error);
    }
    if (workspaceId === this.primaryWorkspaceId) return Promise.reject(new Error("workspaces.primary_undeletable: the primary workspace is the server's own"));
    if (this.tenancy === "single") return Promise.reject(new Error("workspaces.unknown_workspace: this server holds one workspace"));
    const pending = this.deletions.get(workspaceId);
    if (pending) return pending;
    const deletion = this.deleteNow(workspaceId).finally(() => this.deletions.delete(workspaceId));
    this.deletions.set(workspaceId, deletion);
    return deletion;
  }

  /** A real shutdown: closes every workspace, the primary last, and revokes every tenant's keys. Once; later calls share it. */
  close(): Promise<void> {
    this.closed ??= this.closeAll();
    return this.closed;
  }

  private primaryRecord(): OpenWorkspace {
    this.primaryEntry ??= new OpenWorkspace(this.primaryWorkspaceId, true, this.options.createPrimary(), null, this.now(), (instance) => this.reportsWork(instance));
    return this.primaryEntry;
  }

  private lease(record: OpenWorkspace): WorkspaceLease {
    record.leases += 1;
    record.lastUsedAt = this.now();
    // Held before the cap is enforced, so the workspace just asked for is never the one evicted to make room.
    if (!record.primary) void this.enforceCap();
    let released = false;
    return {
      workspaceId: record.workspaceId,
      fluxiq: record.fluxiq,
      release: () => {
        if (released) return;
        released = true;
        record.leases -= 1;
        record.lastUsedAt = this.now();
      }
    };
  }

  private startOpening(workspaceId: string): Promise<OpenWorkspace> {
    const heldKeys = this.custody.get(workspaceId) ?? new HeldKeys();
    this.custody.set(workspaceId, heldKeys);
    const opening = (async () => {
      const fluxiq = await this.options.createTenant!({ workspaceId, heldKeys, primary: this.primaryRecord().fluxiq });
      const record = new OpenWorkspace(workspaceId, false, fluxiq, heldKeys, this.now(), (instance) => this.reportsWork(instance));
      this.open.set(workspaceId, record);
      return record;
    })();
    this.opening.set(workspaceId, opening);
    const settled = () => {
      if (this.opening.get(workspaceId) === opening) this.opening.delete(workspaceId);
    };
    opening.then(settled, (error: unknown) => {
      settled();
      // A custody this create brought in that holds nothing goes with it; one still holding unlocks stays for the next create.
      if (!this.open.has(workspaceId) && this.custody.get(workspaceId) === heldKeys && heldKeys.sessionCount() === 0 && heldKeys.authorizationCount() === 0) this.custody.delete(workspaceId);
      this.warn("[FluxIQ] A workspace could not be opened.", { reason: describeError(error) });
    });
    return opening;
  }

  private evict(record: OpenWorkspace): Promise<void> {
    const { workspaceId } = record;
    this.open.delete(workspaceId);
    const closing: Promise<void> = record.fluxiq.close({ mode: "evict" })
      .then(
        () => undefined,
        (error: unknown) => this.warn("[FluxIQ] An evicted workspace did not close cleanly.", { reason: describeError(error) })
      )
      .finally(() => {
        if (this.closing.get(workspaceId) === closing) this.closing.delete(workspaceId);
      });
    this.closing.set(workspaceId, closing);
    return closing;
  }

  /** Evicts idle workspaces, least recently used first, until at most `cacheMax` are open; busy ones stay. */
  private enforceCap(): Array<Promise<void>> {
    const excess = this.open.size + (this.primaryEntry ? 1 : 0) - this.cacheMax;
    if (excess <= 0) {
      this.overCap = false;
      return [];
    }
    const idle = [...this.open.values()].filter((record) => !record.busy).sort((left, right) => left.lastUsedAt - right.lastUsedAt);
    const closes = idle.slice(0, excess).map((record) => this.evict(record));
    const stillOver = idle.length < excess;
    if (stillOver && !this.overCap) this.warn("[FluxIQ] More workspaces are busy than the workspace cache holds; keeping them all open.", { open: this.open.size + (this.primaryEntry ? 1 : 0), cacheMax: this.cacheMax });
    this.overCap = stillOver;
    return closes;
  }

  private async deleteNow(workspaceId: string): Promise<void> {
    const opening = this.opening.get(workspaceId);
    // Only waits for a create in flight to settle; its failure went to the caller that asked.
    if (opening) await opening.then(() => undefined, () => undefined);
    const record = this.open.get(workspaceId);
    if (record?.busy) throw new Error("workspaces.busy: the workspace is in use; delete it once its work has ended");
    try {
      if (record) {
        this.open.delete(workspaceId);
        await record.fluxiq.close({ mode: "shutdown" });
      }
      const closing = this.closing.get(workspaceId);
      if (closing) await closing;
    } finally {
      this.custody.get(workspaceId)?.revokeAll();
      this.custody.delete(workspaceId);
    }
    await this.options.removeTenantRoot?.({ workspaceId, primary: this.primaryRecord().fluxiq });
  }

  private async closeAll(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await Promise.allSettled([...this.opening.values(), ...this.deletions.values()]);
    const errors: unknown[] = [];
    const tenants = [...this.open.values()];
    this.open.clear();
    const closed = await Promise.allSettled(tenants.map((record) => record.fluxiq.close({ mode: "shutdown" })));
    for (const result of closed) {
      if (result.status === "rejected") errors.push(result.reason);
    }
    await Promise.allSettled([...this.closing.values()]);
    for (const heldKeys of this.custody.values()) heldKeys.revokeAll();
    this.custody.clear();
    if (this.primaryEntry) {
      try {
        await this.primaryEntry.fluxiq.close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "workspaces.close_failed");
  }

  private sweepInBackground(): void {
    this.sweep().catch((error: unknown) => this.warn("[FluxIQ] The workspace sweep failed.", { reason: describeError(error) }));
  }

  private reportsWork(fluxiq: FluxIQ): boolean {
    try {
      return (this.options.isBusy ?? instanceBusy)(fluxiq);
    } catch (error) {
      // Unknown is treated as busy: evicting a workspace mid-run would fail its work.
      this.warn("[FluxIQ] A workspace's activity could not be read; it is kept open.", { reason: describeError(error) });
      return true;
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("workspaces.closed: the web server is shutting down");
  }

  private warn(message: string, fields: Record<string, unknown>): void {
    if (this.options.warn) this.options.warn(message, fields);
    else console.warn(message, fields);
  }
}

function positive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`workspaces.invalid_option: ${name} must be a positive number`);
  return value;
}

/** A failure's name and message, for the log; nothing here carries a key, token or cookie. */
function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
}
