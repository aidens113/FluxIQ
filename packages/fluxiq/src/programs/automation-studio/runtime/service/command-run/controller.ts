import { randomUUID } from "node:crypto";
import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandClaim, type ClientGatewayCommandReceipt, type ClientGatewayCommandRecord, type ClientGatewayCommandUnknownReason } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioProjectCommandLedgerStore as Store, type AutomationStudioCommandRunAdmission } from "../../../storage/project/index.ts";
import { AutomationStudioCommandRunScope, type AutomationStudioCommandRunOwner, type AutomationStudioCommandRunPorts } from "./contracts.ts";

type State = { owner: AutomationStudioCommandRunOwner; incarnation: string; fingerprint: string; store: Store; admission: AutomationStudioCommandRunAdmission; signal?: AbortSignal; detach(): void; first: ClientGatewayCommandClaim | null; blocked: string | null; closed: boolean; pipelines: Set<Promise<unknown>>; closing?: Promise<void> };
/** CLOSED root-run foundation. No executor entry, receipt consumption or Flow activation. */
export class AutomationStudioCommandRunController {
  private readonly registered = new WeakMap<AutomationStudioCommandRunScope, State>();
  private readonly states = new Set<State>();
  private readonly openings = new Set<Promise<unknown>>();
  private readonly reservedRuns = new Set<string>();
  private readonly cleanupErrors: unknown[] = [];
  private closed = false;
  private closing?: Promise<void>;
  constructor(private readonly ports: AutomationStudioCommandRunPorts) {}
  open(input: AutomationStudioCommandRunOwner & { signal?: AbortSignal }): Promise<AutomationStudioCommandRunScope> {
    this.requireOpen();
    if (!input || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).some(key => typeof key !== "string" || !["projectId", "runId", "rootFlowId", "signal"].includes(key)) || Object.values(Object.getOwnPropertyDescriptors(input)).some(descriptor => !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) throw new Error("command_run.invalid_open_options");
    Rules.digest({ projectId: input.projectId, runId: input.runId, rootFlowId: input.rootFlowId });
    for (const id of [input.projectId, input.runId, input.rootFlowId]) if (typeof id !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(id)) throw new Error("command_run.invalid_owner_id");
    if (input.signal !== undefined && !(input.signal instanceof AbortSignal)) throw new Error("command_run.invalid_signal");
    const owner = Object.freeze({ projectId: input.projectId, runId: input.runId, rootFlowId: input.rootFlowId }), signal = input.signal;
    const promise = this.openStored(owner, signal); this.track(promise, this.openings); return promise;
  }
  claim(scope: AutomationStudioCommandRunScope, input: ClientGatewayCommandClaim): Promise<{ sendAllowed: boolean; record: ClientGatewayCommandRecord }> {
    const state = this.state(scope), claim = this.claimForState(state, input);
    if (state.first && Rules.digest(state.first) !== Rules.digest(claim)) { state.blocked ??= "command_run.first_command_only"; throw new Error("command_run.first_command_only"); }
    state.first ??= claim;
    return this.operation(state, async () => {
      // An exact first replay reconciles; it never grants send or continuation.
      await this.live(state); if (state.blocked) { const recorded = await state.store.read(claim); if (!recorded) throw new Error(state.blocked); return { sendAllowed: false, record: recorded }; }
      const result = await state.store.claimForRun(claim, state.admission);
      try { await this.live(state); } catch (error) { state.blocked ??= "command_run.owner_changed"; if (result.record.state === "pending") await state.store.markUnknown(claim, "cancelled_before_send"); throw error; }
      if (!result.sendAllowed) state.blocked ??= result.record.state === "committed" ? "command_run.result_unavailable" : "command_run.outcome_unknown";
      return result;
    });
  }
  read(scope: AutomationStudioCommandRunScope, input: ClientGatewayCommandClaim): Promise<ClientGatewayCommandRecord | null> {
    const state = this.state(scope), claim = this.exactFirst(state, input);
    return this.reconcile(state, () => state.store.read(claim));
  }
  commitReceipt(scope: AutomationStudioCommandRunScope, input: ClientGatewayCommandClaim, receipt: ClientGatewayCommandReceipt): Promise<ClientGatewayCommandRecord> {
    const state = this.state(scope), claim = this.exactFirst(state, input), original = structuredClone(receipt); Rules.validateReceipt(claim, original);
    return this.reconcile(state, async () => { const result = await state.store.commitReceipt(claim, original); state.blocked ??= "command_run.consumption_unsupported"; return result; });
  }
  markUnknown(scope: AutomationStudioCommandRunScope, input: ClientGatewayCommandClaim, reason: ClientGatewayCommandUnknownReason): Promise<ClientGatewayCommandRecord> {
    const state = this.state(scope), claim = this.exactFirst(state, input); if (!Rules.unknownReason(reason)) throw new Error("command_run.invalid_unknown_reason"); state.blocked ??= "command_run.outcome_unknown";
    return this.reconcile(state, () => state.store.markUnknown(claim, reason));
  }
  checkpoint(scope: AutomationStudioCommandRunScope): Promise<void> {
    const state = this.state(scope);
    return this.operation(state, async () => { await this.live(state); if (state.blocked || state.first) throw new Error(state.blocked ?? "command_run.consumption_unsupported"); });
  }
  close(scope?: AutomationStudioCommandRunScope): Promise<void> {
    if (scope !== undefined) { const state = this.registered.get(scope); if (!state) throw new Error("command_run.foreign_scope"); return this.closeState(state); }
    this.closed = true;
    for (const state of this.states) { state.closed = true; state.detach(); }
    this.closing ??= (async () => {
      await Promise.allSettled([...this.openings]);
      const results = await Promise.allSettled([...this.states].map(state => this.closeState(state)));
      const errors = [...this.cleanupErrors, ...results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason)];
      if (errors.length) throw new AggregateError(errors, "command_run.close_failed");
    })(); return this.closing;
  }
  private async openStored(owner: AutomationStudioCommandRunOwner, signal?: AbortSignal): Promise<AutomationStudioCommandRunScope> {
    if (signal?.aborted) throw new Error("command_run.cancelled");
    const fingerprint = await this.fingerprint(owner); this.requireOpen(); if (signal?.aborted) throw new Error("command_run.cancelled");
    const runKey = Rules.digest({ projectId: owner.projectId, runId: owner.runId });
    if (this.reservedRuns.has(runKey)) throw new Error("command_run.scope_already_issued");
    // Retained through failures and scoped close: a new scope cannot clear private uncertainty.
    this.reservedRuns.add(runKey);
    const store = await Store.open({ pool: this.ports.pool!, projectId: owner.projectId });
    try {
      const admission = await store.openRunAdmission(owner.runId); this.requireOpen();
      if (signal?.aborted) throw new Error("command_run.cancelled");
      if (await this.fingerprint(owner) !== fingerprint) throw new Error("command_run.owner_changed"); this.requireOpen(); if (signal?.aborted) throw new Error("command_run.cancelled");
      const scope = AutomationStudioCommandRunScope.create(), state: State = { owner, incarnation: randomUUID(), fingerprint, store, admission, ...(signal ? { signal } : {}), detach: () => undefined, first: null, blocked: null, closed: false, pipelines: new Set() };
      const abort = () => { state.blocked ??= "command_run.cancelled"; }; signal?.addEventListener("abort", abort, { once: true }); state.detach = () => signal?.removeEventListener("abort", abort);
      this.registered.set(scope, state); this.states.add(state); return scope;
    } catch (error) { try { await store.close(); } catch (cleanupError) { this.cleanupErrors.push(cleanupError); throw new AggregateError([error, cleanupError], "command_run.rejected_open_cleanup_failed"); } throw error; }
  }
  private requireOpen(): void { if (this.closed) throw new Error("command_run.closed"); if (!this.ports.pool || this.ports.pool.isClosing) throw new Error("command_run.storage_unavailable"); }
  private state(scope: AutomationStudioCommandRunScope): State { const state = this.registered.get(scope); if (!state) throw new Error("command_run.foreign_scope"); if (this.closed || state.closed) throw new Error("command_run.closed"); return state; }
  private claimForState(state: State, input: ClientGatewayCommandClaim): ClientGatewayCommandClaim {
    Rules.validateClaim(input); const claim = structuredClone(input);
    if (claim.binding.projectId !== state.owner.projectId || claim.binding.runId !== state.owner.runId || claim.binding.flowId !== state.owner.rootFlowId) throw new Error("command_run.claim_owner_conflict");
    Object.freeze(claim.binding); return Object.freeze(claim);
  }
  private exactFirst(state: State, input: ClientGatewayCommandClaim): ClientGatewayCommandClaim { const claim = this.claimForState(state, input); if (!state.first || Rules.digest(state.first) !== Rules.digest(claim)) throw new Error("command_run.not_first_claim"); return claim; }
  private async live(state: State): Promise<void> {
    if (this.closed || state.closed || state.signal?.aborted) { state.blocked ??= "command_run.cancelled_or_closed"; throw new Error(state.blocked); }
    try { if (await this.fingerprint(state.owner) !== state.fingerprint) throw new Error("command_run.owner_changed"); } catch (error) { state.blocked ??= "command_run.owner_changed"; throw error; }
    if (this.closed || state.closed || state.signal?.aborted) { state.blocked ??= "command_run.cancelled_or_closed"; throw new Error(state.blocked); }
  }
  private async fingerprint(owner: AutomationStudioCommandRunOwner): Promise<string> {
    const session = await this.ports.getRuntimeSession(owner.projectId, owner.runId);
    if (!session || session.schemaVersion !== "0.1" || session.projectId !== owner.projectId || session.runId !== owner.runId || session.flowId !== owner.rootFlowId || session.flow?.flowId !== owner.rootFlowId || !["queued", "running", "waiting"].includes(session.status) || session.finishedAt !== undefined) throw new Error("command_run.invalid_stored_session");
    return Rules.digest({ projectId: session.projectId, runId: session.runId, flowId: session.flowId, targetKind: session.targetKind, targetId: session.targetId, queuedAt: session.queuedAt, flow: session.flow });
  }
  private reconcile<T>(state: State, operation: () => Promise<T>): Promise<T> { return this.operation(state, async () => { try { await this.live(state); } catch { /* best-effort: authentic exact-first reconciliation preserves evidence while continuation stays blocked */ } const result = await operation(); try { await this.live(state); } catch { /* best-effort: owner changes latch blocked but do not discard honest journal evidence */ } return result; }); }
  private operation<T>(state: State, operation: () => Promise<T>): Promise<T> { const promise = operation().catch(error => { state.blocked ??= "command_run.operation_uncertain"; throw error; }); this.track(promise, state.pipelines); return promise; }
  private track(promise: Promise<unknown>, set: Set<Promise<unknown>>): void { set.add(promise); void promise.finally(() => set.delete(promise)).catch(/* best-effort: original operation promise reports its failure */ () => undefined); }
  private closeState(state: State): Promise<void> { state.closed = true; state.detach(); state.closing ??= (async () => { await Promise.allSettled([...state.pipelines]); try { await state.store.close(); } finally { this.states.delete(state); } })(); return state.closing; }
}
