import { randomUUID } from "node:crypto";
import { ClientGatewayCommandLedgerController as Rules, ClientGatewayCommandContext as Context, ClientGatewayCommandOutcome as Outcome, ClientGatewayDurableDispatch as Dispatch, type ClientGatewayCommandClaim, type ClientGatewayCommandReceipt, type ClientGatewayCommandRecord, type ClientGatewayCommandUnknownReason, type ClientGatewayCommandOutcomeObserver, type ClientGatewayCommandLedgerLease } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioProjectCommandLedgerStore as Store, type AutomationStudioCommandRunAdmission } from "../../../storage/project/index.ts";
import { AutomationStudioCommandRunScope, type AutomationStudioCommandRunOwner, type AutomationStudioCommandRunPorts, type AutomationStudioCommandEffectProvenance } from "./contracts.ts";

type Effect = { context: Context; capability: object; provenance: AutomationStudioCommandEffectProvenance; observer: ClientGatewayCommandOutcomeObserver; claim?: ClientGatewayCommandClaim; ticket?: object; receipt?: ClientGatewayCommandReceipt; consumed: boolean };
type State = { owner: AutomationStudioCommandRunOwner; incarnation: string; fingerprint: string; store: Store; admission: AutomationStudioCommandRunAdmission; signal?: AbortSignal; detach(): void; first: ClientGatewayCommandClaim | null; blocked: string | null; closed: boolean; pipelines: Set<Promise<unknown>>; closing?: Promise<void>; effects: Map<Context, Effect>; consumed: Map<object, { claim: ClientGatewayCommandClaim; receipt: ClientGatewayCommandReceipt }> };
/** Private receipt consumption contracts; actual executor issuance/Flow activation remain unwired. */
export class AutomationStudioCommandRunController {
  private readonly registered = new WeakMap<AutomationStudioCommandRunScope, State>();
  private readonly states = new Set<State>();
  private readonly openings = new Set<Promise<unknown>>();
  private readonly reservedRuns = new Set<string>();
  private readonly contexts = new WeakMap<Context, { state: State; scope: AutomationStudioCommandRunScope; effect: Effect }>();
  private readonly cleanupErrors: unknown[] = [];
  private closed = false;
  private closing?: Promise<void>;
  constructor(private readonly ports: AutomationStudioCommandRunPorts) {}
  issueEffect(scope: AutomationStudioCommandRunScope, capability: object): Promise<Context> {
    const state = this.state(scope);
    return this.operation(state, async () => {
      await this.live(state); this.available(state);
      const provenance = this.ports.executorOwner?.inspectEffect(capability);
      if (!provenance || provenance.scope !== scope || !provenance.consumer || typeof provenance.consumer !== "object") throw new Error("command_run.foreign_effect");
      for (const id of [provenance.invocationId, provenance.attemptId, provenance.nodeId, provenance.executingFlowId]) if (typeof id !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(id)) throw new Error("command_run.invalid_effect_id");
      if (typeof provenance.executingFlowDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(provenance.executingFlowDigest) || !Number.isSafeInteger(provenance.effectOrdinal) || provenance.effectOrdinal < 0) throw new Error("command_run.invalid_effect_provenance");
      if (state.effects.size >= 4096 || [...state.effects.values()].some(effect => effect.capability === capability || effect.provenance.invocationId === provenance.invocationId && effect.provenance.attemptId === provenance.attemptId && effect.provenance.effectOrdinal === provenance.effectOrdinal)) throw new Error("command_run.duplicate_effect");
      const context = Context.issue({ projectId: state.owner.projectId, runId: state.owner.runId, flowId: state.owner.rootFlowId, invocationId: provenance.invocationId, attemptId: provenance.attemptId, effectOrdinal: provenance.effectOrdinal });
      const effect: Effect = { context, capability, provenance: Object.freeze({ ...provenance }), observer: { completed: proof => this.observe(scope, state, effect, proof), uncertain: async received => { if (received !== context) throw new Error("command_run.foreign_uncertainty"); state.blocked ??= "command_run.outcome_unknown"; } }, consumed: false };
      Outcome.require(context, effect.observer); state.effects.set(context, effect); this.contexts.set(context, { state, scope, effect }); return context;
    });
  }
  resolve(context: Context): Promise<ClientGatewayCommandLedgerLease> {
    const registered = this.contexts.get(context); if (!registered) throw new Error("command_run.foreign_context");
    const { state, scope, effect } = registered;
    return this.operation(state, async () => { await this.live(state); if (state.blocked || effect.consumed) throw new Error(state.blocked ?? "command_run.effect_consumed"); const exact = (input: ClientGatewayCommandClaim) => { const claim = this.claimForState(state, input); if (this.effectClaim(state, claim) !== effect) throw new Error("command_run.context_claim_conflict"); return claim; }; return { outcomeObserver: effect.observer, ledger: { claim: input => this.claim(scope, exact(input)), read: input => this.read(scope, exact(input)), commitReceipt: (input, receipt) => this.commitReceipt(scope, exact(input), receipt), markUnknown: (input, reason) => this.markUnknown(scope, exact(input), reason) }, close: async () => undefined }; });
  }
  consume(consumer: object, context: Context): Promise<void> {
    const registered = this.contexts.get(context); if (!registered) throw new Error("command_run.foreign_context");
    const { state, effect } = registered;
    return this.operation(state, async () => {
      await this.live(state);
      const witness = this.ports.executorOwner?.authorizeHandling(consumer, effect.capability, context), current = this.ports.executorOwner?.inspectEffect(effect.capability);
      if (state.blocked || effect.consumed || consumer !== effect.provenance.consumer || !witness || typeof witness !== "object" || !current || !this.sameProvenance(current, effect.provenance) || !effect.ticket || !effect.claim || !effect.receipt) throw new Error(state.blocked ?? "command_run.unhandled_outcome");
      state.consumed.set(effect.ticket, { claim: effect.claim, receipt: effect.receipt });
      await state.store.consumeForRun(state.admission, effect.ticket); await this.live(state);
      if (state.blocked) throw new Error(state.blocked); effect.consumed = true;
    });
  }
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
    const effect = this.effectClaim(state, claim);
    if (state.first && Rules.digest(state.first) !== Rules.digest(claim) && (!effect || [...state.effects.values()].some(item => item !== effect && !item.consumed))) { state.blocked ??= "command_run.first_command_only"; throw new Error("command_run.first_command_only"); }
    state.first = claim; if (effect) effect.claim ??= claim;
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
    const state = this.state(scope), claim = this.exactClaim(state, input);
    return this.reconcile(state, () => state.store.read(claim));
  }
  commitReceipt(scope: AutomationStudioCommandRunScope, input: ClientGatewayCommandClaim, receipt: ClientGatewayCommandReceipt): Promise<ClientGatewayCommandRecord> {
    const state = this.state(scope), claim = this.exactClaim(state, input), original = structuredClone(receipt); Rules.validateReceipt(claim, original);
    return this.reconcile(state, async () => { const result = await state.store.commitReceipt(claim, original); if (!this.effectClaim(state, claim)) state.blocked ??= "command_run.consumption_unsupported"; return result; });
  }
  markUnknown(scope: AutomationStudioCommandRunScope, input: ClientGatewayCommandClaim, reason: ClientGatewayCommandUnknownReason): Promise<ClientGatewayCommandRecord> {
    const state = this.state(scope), claim = this.exactClaim(state, input); if (!Rules.unknownReason(reason)) throw new Error("command_run.invalid_unknown_reason"); state.blocked ??= "command_run.outcome_unknown";
    return this.reconcile(state, () => state.store.markUnknown(claim, reason));
  }
  checkpoint(scope: AutomationStudioCommandRunScope): Promise<void> {
    const state = this.state(scope);
    return this.operation(state, async () => { await this.live(state); this.available(state); });
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
      let state!: State;
      const admission = await store.openRunAdmission(owner.runId, this.ports.executorOwner ? { resolveConsumed: ticket => state && !state.blocked && !state.closed && !this.closed ? state.consumed.get(ticket) ?? null : null } : undefined); this.requireOpen();
      if (signal?.aborted) throw new Error("command_run.cancelled");
      if (await this.fingerprint(owner) !== fingerprint) throw new Error("command_run.owner_changed"); this.requireOpen(); if (signal?.aborted) throw new Error("command_run.cancelled");
      const scope = AutomationStudioCommandRunScope.create(); state = { owner, incarnation: randomUUID(), fingerprint, store, admission, ...(signal ? { signal } : {}), detach: () => undefined, first: null, blocked: null, closed: false, pipelines: new Set(), effects: new Map(), consumed: new Map() };
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
  private exactClaim(state: State, input: ClientGatewayCommandClaim): ClientGatewayCommandClaim { const claim = this.claimForState(state, input), effect = this.effectClaim(state, claim); if (effect?.claim && Rules.digest(effect.claim) === Rules.digest(claim)) return effect.claim; if (!state.first || Rules.digest(state.first) !== Rules.digest(claim)) throw new Error("command_run.not_first_claim"); return claim; }
  private effectClaim(state: State, claim: ClientGatewayCommandClaim): Effect | undefined { return [...state.effects.values()].find(effect => { const owner = Context.owner(effect.context); return owner.invocationId === claim.binding.invocationId && owner.attemptId === claim.binding.attemptId && owner.effectOrdinal === claim.binding.effectOrdinal; }); }
  private available(state: State): void { if (state.blocked || [...state.effects.values()].some(effect => !effect.consumed) || state.first && !this.effectClaim(state, state.first)) throw new Error(state.blocked ?? "command_run.consumption_unsupported"); }
  private sameProvenance(a: AutomationStudioCommandEffectProvenance, b: AutomationStudioCommandEffectProvenance): boolean { return a.scope === b.scope && a.consumer === b.consumer && Rules.digest({ invocationId: a.invocationId, attemptId: a.attemptId, nodeId: a.nodeId, executingFlowId: a.executingFlowId, executingFlowDigest: a.executingFlowDigest, effectOrdinal: a.effectOrdinal }) === Rules.digest({ invocationId: b.invocationId, attemptId: b.attemptId, nodeId: b.nodeId, executingFlowId: b.executingFlowId, executingFlowDigest: b.executingFlowDigest, effectOrdinal: b.effectOrdinal }); }
  private observe(scope: AutomationStudioCommandRunScope, state: State, effect: Effect, proof: object): Promise<void> {
    return this.operation(state, async () => {
      const completion = Dispatch.readCompletionProof(proof, effect.context, effect.observer); await this.live(state);
      if (state.blocked || effect.ticket || !effect.claim || Rules.digest(effect.claim) !== Rules.digest(completion.claim) || Rules.digest(completion.result) !== completion.receipt.resultDigest) throw new Error("command_run.invalid_completion");
      const record = await this.read(scope, completion.claim); await this.live(state);
      Dispatch.readCompletionProof(proof, effect.context, effect.observer);
      if (state.blocked || !record || record.state !== "committed" || Rules.digest(record.receipt) !== Rules.digest(completion.receipt)) throw new Error("command_run.invalid_completion");
      effect.ticket = Object.freeze({}); effect.receipt = Object.freeze(structuredClone(completion.receipt));
    });
  }
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
