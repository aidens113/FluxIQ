import { ClientGatewayCommandContext, ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandLedgerLease } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioProjectCommandLedgerStore } from "../../../storage/project/index.ts";
import type { AutomationStudioCommandContextOwner, AutomationStudioCommandContextPorts } from "./contracts.ts";

/** Trusted local root-Flow broker only. No API, metadata or executor path invokes issue yet. */
export class AutomationStudioCommandContextController {
  private readonly issued = new WeakMap<ClientGatewayCommandContext, { owner: AutomationStudioCommandContextOwner; sessionDigest: string }>();
  private readonly leases = new Set<ClientGatewayCommandLedgerLease>();
  private closed = false;
  constructor(private readonly ports: AutomationStudioCommandContextPorts) {}
  async issue(input: AutomationStudioCommandContextOwner): Promise<ClientGatewayCommandContext> {
    this.requireOpen();
    const context = ClientGatewayCommandContext.issue(input), owner = ClientGatewayCommandContext.owner(context);
    const sessionDigest = await this.sessionDigest(owner);
    this.requireOpen(); this.issued.set(context, { owner, sessionDigest }); return context;
  }
  async resolve(context: ClientGatewayCommandContext): Promise<ClientGatewayCommandLedgerLease> {
    this.requireOpen(); ClientGatewayCommandContext.owner(context);
    const issued = this.issued.get(context);
    if (!issued || await this.sessionDigest(issued.owner) !== issued.sessionDigest) throw new Error("command_context.stale_or_foreign_owner");
    this.requireOpen();
    const store = await AutomationStudioProjectCommandLedgerStore.open({ pool: this.ports.pool!, projectId: issued.owner.projectId });
    try {
      this.requireOpen();
      if (await this.sessionDigest(issued.owner) !== issued.sessionDigest) throw new Error("command_context.stale_or_foreign_owner");
      this.requireOpen();
    } catch (error) {
      try { await store.close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "command_context.rejected_lease_cleanup_failed"); }
      throw error;
    }
    let closed = false;
    const lease: ClientGatewayCommandLedgerLease = { ledger: store, close: async () => { if (closed) return; closed = true; try { await store.close(); } finally { this.leases.delete(lease); } } };
    if (this.closed) { await lease.close(); throw new Error("command_context.closed"); }
    this.leases.add(lease); return lease;
  }
  async close(): Promise<void> { this.closed = true; const results = await Promise.allSettled([...this.leases].map(lease => lease.close())); const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason); if (errors.length) throw new AggregateError(errors, "command_context.close_failed"); }
  private requireOpen(): void { if (this.closed) throw new Error("command_context.closed"); if (!this.ports.pool || this.ports.pool.isClosing) throw new Error("command_context.storage_unavailable"); }
  private async sessionDigest(owner: AutomationStudioCommandContextOwner): Promise<string> {
    const session = await this.ports.getRuntimeSession(owner.projectId, owner.runId);
    if (!session || session.schemaVersion !== "0.1" || session.projectId !== owner.projectId || session.runId !== owner.runId || session.flowId !== owner.flowId || session.flow?.flowId !== owner.flowId || !["queued", "running", "waiting"].includes(session.status) || session.finishedAt !== undefined) throw new Error("command_context.invalid_stored_session");
    return Rules.digest({ projectId: session.projectId, runId: session.runId, flowId: session.flowId, targetKind: session.targetKind, targetId: session.targetId, queuedAt: session.queuedAt, flow: session.flow });
  }
}
