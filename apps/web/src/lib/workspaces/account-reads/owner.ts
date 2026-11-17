import type { FluxIQ } from "fluxiq";
import type { PlatformStore } from "fluxiq/platform";
import { resolveFluxIQProfile } from "fluxiq/platform/profile";
import type { FluxIQWorkspaceManager, WorkspaceLease, WorkspaceRouteContext } from "..";
import { AccountReadError } from "./error";
import type { AccountAuditReader, WorkspaceAccountReadContext } from "./types";

type Runtime = Pick<typeof import("../../fluxiq"), "getFluxIQWorkspaces" | "isCurrentFluxIQPrimary">;
type PlatformReadStore = Pick<PlatformStore, "getAccount" | "getMembership" | "getWorkspace" | "listMembershipsOfWorkspace">;

/** One buffered account read, with distinct held tenant and primary identity lifetimes. */
export class WorkspaceAccountReadOwner {
  readonly context: WorkspaceAccountReadContext;
  private readonly manager: FluxIQWorkspaceManager;
  private readonly primary: FluxIQ;
  private readonly identity: FluxIQ["programs"]["identityAccess"];
  private primaryLease: WorkspaceLease | undefined;
  private store: Promise<PlatformReadStore> | undefined;
  private audit: Promise<AccountAuditReader> | undefined;
  private readonly pending = new Set<Promise<unknown>>();
  private readFailure: AccountReadError | undefined;
  private ending = false;
  private cleanup: Promise<void> | undefined;
  private released = false;

  constructor(private readonly selected: WorkspaceRouteContext, private readonly runtime: Runtime, private readonly signal: AbortSignal) {
    this.manager = runtime.getFluxIQWorkspaces();
    this.primary = this.manager.primary().fluxiq;
    this.identity = this.primary.programs.identityAccess;
    this.context = Object.freeze({
      workspaceId: selected.workspaceId,
      userId: selected.binding.userId,
      tenancy: this.manager.tenancy,
      profile: resolveFluxIQProfile(process.env),
      store: Object.freeze({
        getAccount: (userId: string) => this.read(() => this.fromStore(store => store.getAccount(userId))),
        getMembership: (userId: string) => this.read(() => this.fromStore(store => store.getMembership(selected.workspaceId, userId))),
        getWorkspace: () => this.read(() => this.fromStore(store => store.getWorkspace(selected.workspaceId))),
        listMemberships: () => this.read(() => this.fromStore(store => store.listMembershipsOfWorkspace(selected.workspaceId)))
      }),
      identityAccess: Object.freeze({ snapshot: () => this.read(() => this.identity.snapshot()) }),
      audit: () => this.auditReader()
    });
  }

  async initialize(): Promise<void> {
    this.assertCurrent();
    if (this.selected.workspaceId !== this.manager.primaryWorkspaceId) {
      const lease = await this.manager.acquire(this.manager.primaryWorkspaceId);
      // Adoption precedes the next guard, including abort/runtime replacement.
      this.primaryLease = lease;
      if (lease.fluxiq !== this.primary) throw new AccountReadError();
    }
    await this.guard();
  }

  async guard(): Promise<void> {
    this.assertCurrent();
    const current = await this.selected.revalidate();
    this.assertCurrent();
    if (!current.ok) throw new AccountReadError(current);
  }

  release(): Promise<void> {
    if (this.released) return Promise.resolve();
    if (this.cleanup) return this.cleanup;
    this.ending = true;
    this.cleanup = Promise.resolve().then(async () => {
      // A rejected Promise.all may leave another checked name read in flight.
      // New reads cannot start after ending; existing operations must settle.
      await Promise.allSettled([...this.pending]);
      this.releaseSettled();
    });
    return this.cleanup;
  }

  /** Stop data work and quiesce before the final authority/serialization boundary. */
  async settleReads(): Promise<void> {
    this.ending = true;
    await Promise.allSettled([...this.pending]);
    if (this.readFailure) throw this.readFailure;
  }

  /** No await is allowed between the last currentness check, release and response publication. */
  releaseSettled(): void {
    if (this.released) return;
    if (this.pending.size !== 0) throw new AccountReadError();
    this.ending = true;
    this.released = true;
    try {
      try {
        this.primaryLease?.release();
      } finally {
        this.selected.release();
      }
    } catch {
      console.error("account_read.cleanup_failed");
      throw new AccountReadError();
    }
  }

  /** Synchronous continuation guard; no authority source or replacement runtime is selected here. */
  assertCurrent(): void {
    if (this.signal.aborted) throw new AccountReadError({ ok: false, status: 401, error: "Authentication required" });
    if (this.released || this.runtime.getFluxIQWorkspaces() !== this.manager || !this.runtime.isCurrentFluxIQPrimary(this.primary)
      || this.primary.programs.identityAccess !== this.identity || this.manager.get(this.selected.workspaceId)?.fluxiq !== this.selected.fluxiq) throw new AccountReadError();
    if (!this.selected.current()) throw new AccountReadError({ ok: false, status: 401, error: "Authentication required" });
  }

  private assertReadable(): void {
    if (this.ending) throw new AccountReadError();
    this.assertCurrent();
  }

  private read<T>(operation: () => Promise<T>): Promise<T> {
    if (this.ending) return Promise.reject(new AccountReadError());
    const task = Promise.resolve().then(() => this.performRead(operation));
    this.pending.add(task);
    const settled = () => { this.pending.delete(task); };
    const failed = (error: unknown) => {
      this.readFailure ??= error instanceof AccountReadError ? error : new AccountReadError();
      this.pending.delete(task);
    };
    // Bookkeeping only: the original rejection is returned to the reader,
    // and cleanup waits for every still-held operation through allSettled.
    task.then(settled, failed);
    return task;
  }

  private async performRead<T>(operation: () => Promise<T>): Promise<T> {
    this.assertReadable();
    await this.guard();
    this.assertReadable();
    let value: T;
    try {
      value = await operation();
    } catch (error) {
      if (error instanceof AccountReadError) throw error;
      this.assertReadable();
      await this.guard();
      throw new AccountReadError();
    }
    this.assertReadable();
    await this.guard();
    this.assertReadable();
    return value;
  }

  private async fromStore<T>(operation: (store: PlatformReadStore) => Promise<T>): Promise<T> {
    const store = await this.platformStore();
    this.assertReadable();
    return operation(store);
  }

  private platformStore(): Promise<PlatformReadStore> {
    this.store ??= this.read(async () => {
      const { platformReadStoreFor } = await import("../../../server/provisioning-listener");
      this.assertReadable();
      return platformReadStoreFor(this.primary);
    });
    return this.store;
  }

  private async auditReader(): Promise<AccountAuditReader> {
    this.audit ??= this.read(async () => {
      const { platformIamAuditReaderFor } = await import("../../../server/provisioning-listener");
      this.assertReadable();
      return platformIamAuditReaderFor(this.primary);
    });
    const audit = await this.read(() => this.audit!);
    this.assertReadable();
    return Object.freeze({ read: (query: Parameters<AccountAuditReader["read"]>[0]) => this.read(() => audit.read(query)) });
  }
}
