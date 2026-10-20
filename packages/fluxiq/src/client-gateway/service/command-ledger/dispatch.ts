import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { ClientGatewayActionCommand, ClientGatewayActionResult, ClientGatewayReconcileAnswer } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayConfig } from "../config.ts";
import type { ClientGatewayTimer, ClientGatewayTimerSource } from "../types.ts";
import type { ClientGatewayChannelScopeSource } from "../channel-scope/index.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { ClientGatewayEventBus } from "../event-bus.ts";
import { COMMAND_ANSWER_MARGIN_MS } from "../command-answer-margin.ts";
import { clientGatewayReconciledResult, clientGatewaySessionAnswersReconcile } from "../command-reconcile/index.ts";
import { clientGatewayHostLeaseStamp, isClientGatewayHostLease, type ClientGatewayHostLeaseSource } from "../host-lease/index.ts";
import { ClientGatewayCommandContext } from "./context.ts";
import { ClientGatewayCommandOutcome } from "./outcome.ts";
import { ClientGatewayCommandLedgerController as Controller } from "./controller.ts";
import type { ClientGatewayTraceTap } from "../trace-tap/index.ts";
import type { ClientGatewayCommandClaim, ClientGatewayCommandLedgerLease, ClientGatewayCommandReceipt, ClientGatewayDurableActionOptions, ClientGatewayDurableActionResponse, ClientGatewayDurableDispatchResult, ClientGatewayCommandOutcomeObserver, ClientGatewayCommandCompletion } from "./contracts.ts";

type Answer = { result: ClientGatewayActionResult; receipt: ClientGatewayCommandReceipt };
type Entry = {
  sessionId: string; clientId: string; claim: ClientGatewayCommandClaim;
  phase: "preparing" | "waiting" | "reserved" | "terminal";
  abort: AbortController; timer?: ClientGatewayTimer; detach(): void;
  resolve(answer: Answer): void; reject(): void;
  answer: Promise<Answer>; completion: Promise<ClientGatewayDurableDispatchResult<ClientGatewayActionResult>>;
  context: ClientGatewayCommandContext; observer?: ClientGatewayCommandOutcomeObserver; proof?: object;
  uncertainty?: Promise<void>;
  /** The timer source of the channel scope the command was dispatched in, read once at dispatch; undefined: the gateway's own (`../channel-scope/source.ts`). */
  timers: ClientGatewayTimerSource | undefined;
};
type Ports = { config: ClientGatewayConfig; sessions: ClientGatewaySessionRegistry; transport: ClientGatewayTransport; events: ClientGatewayEventBus; resolve?: (context: ClientGatewayCommandContext) => Promise<ClientGatewayCommandLedgerLease>; reconcile?: (commandId: string, timers: ClientGatewayTimerSource | undefined) => Promise<ClientGatewayReconcileAnswer | undefined>; hostLease?: ClientGatewayHostLeaseSource | undefined; channelScope?: ClientGatewayChannelScopeSource | undefined; trace: ClientGatewayTraceTap };
/** Explicit trusted gateway dispatch only; existing Flow/domain callers remain on the legacy path. */
export class ClientGatewayDurableDispatch {
  private static readonly proofs = new WeakMap<object, { entry: Entry; observer: ClientGatewayCommandOutcomeObserver; value: ClientGatewayCommandCompletion }>();
  static readCompletionProof(proof: object, context: ClientGatewayCommandContext, observer: ClientGatewayCommandOutcomeObserver): ClientGatewayCommandCompletion {
    const registered = this.proofs.get(proof);
    if (!registered || registered.entry.context !== context || registered.observer !== observer || registered.entry.abort.signal.aborted || registered.entry.phase !== "reserved") throw new Error("command_outcome.foreign_completion_proof");
    return registered.value;
  }
  private readonly pending = new Map<string, Entry>();
  private readonly pipelines = new Set<Promise<unknown>>();
  private readonly cleanupErrors: unknown[] = [];
  private readonly unsubscribe: () => void;
  private closed = false;
  private closing?: Promise<void>;
  constructor(private readonly ports: Ports) {
    this.unsubscribe = ports.events.subscribe(event => { if (event.type === "session.disconnected") for (const entry of this.pending.values()) if (entry.sessionId === event.session.sessionId) this.disconnected(entry, clientGatewaySessionAnswersReconcile(event.session)); });
  }
  execute(sessionId: string, input: ClientGatewayActionCommand, options: ClientGatewayDurableActionOptions): ClientGatewayDurableActionResponse {
    if (this.closed) throw new Error("durable_command.closed");
    if (!options || typeof options !== "object" || Object.getPrototypeOf(options) !== Object.prototype || Reflect.ownKeys(options).some(key => typeof key !== "string" || !["context", "signal"].includes(key)) || !Object.hasOwn(options, "context") || Object.values(Object.getOwnPropertyDescriptors(options)).some(descriptor => !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) throw new Error("durable_command.invalid_options");
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new Error("durable_command.invalid_signal");
    const owner = ClientGatewayCommandContext.owner(options.context);
    const leased = this.stampLease(input, sessionId);
    const requestDigest = Controller.digest(leased), command = structuredClone(leased);
    this.validateCommand(command); this.freeze(command);
    const session = this.ports.sessions.requireReady(sessionId);
    if (session.projectId && session.projectId !== owner.projectId) throw new Error("durable_command.project_denied");
    const commandId = Controller.commandId(owner);
    if (this.pending.has(commandId)) throw new Error("durable_command.already_pending");
    const claim: ClientGatewayCommandClaim = { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId, clientId: session.clientId, sessionId }, requestDigest };
    Controller.validateClaim(claim); this.freeze(claim);
    // Marked for capture under a traced episode after the digest, so tracing never changes what the ledger claims (`../trace-tap/`).
    const message = this.ports.trace.stampAction(this.ports.transport.message("server.execute_action", { ...command, commandId }, session), owner); this.freeze(message);
    let resolve!: Entry["resolve"], reject!: Entry["reject"];
    const answer = new Promise<Answer>((yes, no) => { resolve = yes; reject = () => no(new Error("durable_command.outcome_unknown")); });
    void answer.catch(/* best-effort: preadmission cancellation is reported by public completion */ () => undefined);
    const observer = ClientGatewayCommandOutcome.observer(options.context);
    const entry: Entry = { sessionId, clientId: session.clientId, claim, context: options.context, ...(observer ? { observer } : {}), phase: "preparing", abort: new AbortController(), detach: () => undefined, resolve, reject, answer, completion: Promise.resolve({ status: "outcome_unknown" }), timers: this.ports.channelScope?.timers?.() };
    const abort = () => this.uncertain(entry);
    options.signal?.addEventListener("abort", abort, { once: true }); entry.detach = () => options.signal?.removeEventListener("abort", abort);
    if (options.signal?.aborted) this.uncertain(entry);
    this.pending.set(commandId, entry);
    if (observer) entry.timer = this.startTimer(entry)({ kind: "answer", commandId }, this.answerWaitMs(command), () => this.answerNeverCameOrUnknown(entry, this.answerWaitMs(command)));
    const pipeline = this.run(entry, options.context, command, message);
    entry.completion = pipeline; this.pipelines.add(pipeline);
    void pipeline.finally(() => this.pipelines.delete(pipeline)).catch(/* best-effort: derived observer mirrors the public failure */ () => undefined);
    return { commandId, message, result: pipeline };
  }
  has(commandId: string): boolean { return this.pending.has(commandId); }
  /** `delivered` hears the result handed to the waiting caller, once it is committed as the command's outcome. */
  async settle(sessionId: string, input: ClientGatewayActionResult, delivered?: (result: ClientGatewayActionResult) => void): Promise<"settled" | "wrong_session" | "suppressed" | "unknown_command"> {
    const entry = this.pending.get(input?.commandId);
    if (!entry) return "unknown_command";
    const sender = this.ports.sessions.require(sessionId);
    if (sessionId !== entry.sessionId || sender.clientId !== entry.clientId) return "wrong_session";
    return await this.accept(entry, input, delivered);
  }
  /** Takes `input` as the answer of a command still waiting: committed as its receipt, or, for an outcome the client could not vouch for, unknown. */
  private async accept(entry: Entry, input: ClientGatewayActionResult, delivered?: (result: ClientGatewayActionResult) => void): Promise<"settled" | "suppressed"> {
    if (entry.phase !== "waiting") return this.suppressed(entry, "not_waiting");
    let result: ClientGatewayActionResult, resultDigest: string;
    try { resultDigest = Controller.digest(input); result = this.parseResult(input); this.freeze(result); }
    catch { return this.suppressed(entry, "invalid_result"); }
    if (result.status === "unknown" || result.status === "timed_out" || result.status === "cancelled") { this.uncertain(entry); await entry.completion; return this.suppressed(entry, "uncertain_status"); }
    entry.phase = "reserved"; if (!entry.observer) entry.timer?.cancel();
    const receipt: ClientGatewayCommandReceipt = { schemaVersion: "gateway_command_receipt.v1", commandId: entry.claim.binding.commandId, requestDigest: entry.claim.requestDigest, clientId: entry.clientId, sessionId: entry.sessionId, status: result.status, receivedAt: this.ports.config.now(), resultDigest, redaction: "receipt_only", ...(result.status === "failed" ? { failureClass: "action_failed" as const } : {}) };
    entry.resolve({ result, receipt });
    const completed = await entry.completion;
    if (completed.status !== "completed" || completed.receipt.resultDigest !== resultDigest) return this.suppressed(entry, "not_committed");
    delivered?.(result);
    return "settled";
  }
  /** An answer not taken as the command's outcome, recorded as Core's own decision in the command's trace. */
  private suppressed(entry: Entry, reason: string): "suppressed" {
    this.ports.trace.synthesized(entry.claim.binding.commandId, "server.execute_action", { outcome: "suppressed", reason });
    return "suppressed";
  }
  drain(): Promise<void> {
    this.closing ??= (async () => {
      this.closed = true; for (const entry of this.pending.values()) this.uncertain(entry);
      try { while (this.pipelines.size) await Promise.allSettled([...this.pipelines]); }
      finally { this.unsubscribe(); }
      if (this.cleanupErrors.length) throw new AggregateError(this.cleanupErrors, "durable_command.lease_cleanup_failed");
    })();
    return this.closing;
  }
  private async run(entry: Entry, context: ClientGatewayCommandContext, command: ClientGatewayActionCommand, message: ClientGatewayDurableActionResponse["message"]): Promise<ClientGatewayDurableDispatchResult<ClientGatewayActionResult>> {
    let lease: ClientGatewayCommandLedgerLease | undefined;
    let observing: Promise<void> | undefined;
    try {
      if (!this.ports.resolve) throw new Error("durable_command.storage_unavailable");
      lease = await this.ports.resolve(context);
      if (entry.observer && lease.outcomeObserver !== entry.observer) throw new Error("command_outcome.observer_mismatch");
      const outcome = await new Controller(lease.ledger).dispatch(entry.claim, async () => {
        const current = this.ports.sessions.requireReady(entry.sessionId);
        if (entry.abort.signal.aborted || this.closed || current.clientId !== entry.clientId || current.projectId && current.projectId !== entry.claim.binding.projectId) throw new Error("durable_command.admission_refused");
        entry.phase = "waiting";
        const waitMs = this.answerWaitMs(command);
        if (!entry.observer) entry.timer = this.startTimer(entry)({ kind: "answer", commandId: entry.claim.binding.commandId }, waitMs, () => this.answerNeverCameOrUnknown(entry, waitMs));
        // Account for send rejection without awaiting a transport's possibly stalled flush before the answer deadline.
        void this.ports.transport.sendChecked(entry.sessionId, entry.clientId, message).catch(() => { /* best-effort: send rejection becomes durable unknown through the answer pipeline */ this.uncertain(entry); });
        return await entry.answer;
      }, entry.abort.signal);
      if (!entry.observer) return outcome;
      if (outcome.status !== "completed" || entry.abort.signal.aborted || this.closed) { this.uncertain(entry); await this.notifyUncertainty(entry, outcome.status); return { status: "outcome_unknown" }; }
      const proof = Object.freeze({}); entry.proof = proof;
      const value = { context, claim: entry.claim, receipt: structuredClone(outcome.receipt), result: structuredClone(outcome.result) }; this.freeze(value.claim); this.freeze(value.receipt); this.freeze(value.result); Object.freeze(value);
      ClientGatewayDurableDispatch.proofs.set(proof, { entry, observer: entry.observer, value });
      let detach: () => void = () => undefined;
      const stopped = new Promise<void>((_resolve, reject) => { const abort = () => reject(new Error("command_outcome.interrupted")); entry.abort.signal.addEventListener("abort", abort, { once: true }); detach = () => entry.abort.signal.removeEventListener("abort", abort); if (entry.abort.signal.aborted) abort(); });
      observing = Promise.resolve().then(() => entry.observer!.completed(proof));
      try { await Promise.race([observing, stopped]); } finally { detach(); ClientGatewayDurableDispatch.proofs.delete(proof); }
      if (entry.abort.signal.aborted || this.closed) throw new Error("command_outcome.interrupted");
      return outcome;
    } catch (error) {
      if (!entry.observer) throw error;
      this.uncertain(entry); await this.notifyUncertainty(entry, "observer_or_dispatch_failed"); return { status: "outcome_unknown" };
    } finally {
      entry.timer?.cancel(); entry.detach(); entry.phase = "terminal";
      this.pending.delete(entry.claim.binding.commandId);
      if (entry.proof) ClientGatewayDurableDispatch.proofs.delete(entry.proof);
      if (lease) {
        const owned = lease, cleanup = async () => { try { await observing; } catch { /* best-effort: public result already records observer refusal */ } try { await owned.close(); } catch (error) { this.cleanupErrors.push(error); } };
        if (observing && entry.abort.signal.aborted) { const pending = cleanup(); this.pipelines.add(pending); void pending.finally(() => this.pipelines.delete(pending)); } else await cleanup();
      }
    }
  }
  /** Where `entry`'s answer wait runs: its dispatching scope's timers when it has them, else the gateway's own. */
  private startTimer(entry: Entry): ClientGatewayTimerSource {
    return entry.timers ?? this.ports.config.startTimer;
  }
  private answerWaitMs(command: ClientGatewayActionCommand): number {
    return command.timeoutMs === undefined ? this.ports.config.commandTimeoutMs : command.timeoutMs + COMMAND_ANSWER_MARGIN_MS;
  }
  // The wait for a sent command's answer ran out (C8, B3). Before its outcome
  // is called unknown -- which marks its ledger entry `unknown` and stops a
  // required run for good -- the client it went to is asked by command id,
  // exactly as for an ordinary command (`../commands.ts`, `answerNeverCame`):
  // the result it kept is taken as the command's answer and committed like any
  // answer, so the act is never made twice; `not_seen` is committed as a
  // failure that did nothing, so a retry may follow; `running`, `unknown`, a
  // kept result that is itself uncertain, or nobody to ask leave it unknown, as
  // before. The command stays waiting meanwhile, so its own answer still wins.
  // A result that only arrives after this is late and is never committed.
  private async answerNeverCame(entry: Entry, waitMs: number): Promise<void> {
    if (entry.phase !== "waiting" || !this.ports.reconcile) {
      this.uncertain(entry);
      return;
    }
    const commandId = entry.claim.binding.commandId;
    const answer = await this.ports.reconcile(commandId, entry.timers);
    if (entry.phase !== "waiting") return;
    const result = clientGatewayReconciledResult(commandId, answer, waitMs);
    this.ports.trace.synthesized(commandId, "server.execute_action", { outcome: "answer_never_came", reconcileState: answer?.state ?? null, waitMs, result });
    await this.accept(entry, result);
    if (entry.phase === "waiting") this.uncertain(entry);
  }
  /** A question that could not be asked at all leaves the command unknown, as before it could be asked. */
  private answerNeverCameOrUnknown(entry: Entry, waitMs: number): void {
    void this.answerNeverCame(entry, waitMs).catch(/* best-effort: an unaskable client leaves the outcome unknown, which the ledger records */ () => this.uncertain(entry));
  }
  // A dropped session usually means the client's worker restarted mid-command.
  // A client that answers reconcile questions may come back on a new session
  // and say what became of the command, so the command keeps waiting out its
  // own answer window and is reconciled then; any other client's command is
  // unknown at once, as before.
  private disconnected(entry: Entry, answersReconcile: boolean): void {
    if (answersReconcile && entry.phase === "waiting" && this.ports.reconcile) return;
    this.uncertain(entry);
  }
  private uncertain(entry: Entry): void {
    if ((!entry.observer && entry.phase === "reserved") || entry.phase === "terminal") return;
    if (entry.proof) ClientGatewayDurableDispatch.proofs.delete(entry.proof);
    entry.phase = "terminal"; entry.timer?.cancel(); entry.abort.abort(); entry.reject();
    this.ports.trace.synthesized(entry.claim.binding.commandId, "server.execute_action", { outcome: "uncertain" });
  }
  private notifyUncertainty(entry: Entry, disposition: string): Promise<void> { entry.uncertainty ??= Promise.resolve().then(() => entry.observer!.uncertain(entry.context, disposition)); return entry.uncertainty; }
  /**
   * The command as it is digested, claimed and sent: carrying the lease of the
   * scope dispatching it (`../host-lease/`), so the request digest covers the
   * lease. A malformed lease is an invalid command; a stale, foreign or missing
   * one throws here, before anything is claimed.
   */
  private stampLease(input: ClientGatewayActionCommand, sessionId: string): ClientGatewayActionCommand {
    if (!input || typeof input !== "object" || Array.isArray(input)) return input;
    if (Object.hasOwn(input, "lease") && !isClientGatewayHostLease(input.lease)) throw new Error("durable_command.invalid_command");
    const leased = clientGatewayHostLeaseStamp(input, this.ports.hostLease, sessionId);
    if (leased.refused) {
      this.ports.trace.synthesized(null, "server.execute_action", { outcome: "refused_unsent", code: leased.refused, sessionId, durable: true });
      throw new Error(`durable_command.${leased.refused}`);
    }
    return leased.command;
  }
  private validateCommand(command: ClientGatewayActionCommand): void {
    const fields = ["actionType", "parameters", "target", "timeoutMs", "metadata", "lease"];
    if (command?.lease !== undefined && !isClientGatewayHostLease(command.lease)) throw new Error("durable_command.invalid_command");
    if (!command || typeof command !== "object" || Array.isArray(command) || Object.keys(command).some(key => !fields.includes(key)) || typeof command.actionType !== "string" || !command.actionType.trim() || command.actionType.length > 200 || command.timeoutMs !== undefined && (!Number.isSafeInteger(command.timeoutMs) || command.timeoutMs <= 0 || command.timeoutMs > 2_147_483_647 - COMMAND_ANSWER_MARGIN_MS)) throw new Error("durable_command.invalid_command");
    for (const field of [command.parameters, command.target, command.metadata]) if (field !== undefined && (!field || typeof field !== "object" || Array.isArray(field))) throw new Error("durable_command.invalid_command");
  }
  private parseResult(input: ClientGatewayActionResult): ClientGatewayActionResult {
    const fields = ["commandId", "status", "startedAt", "completedAt", "message", "target", "payload", "error", "clearedWait", "failure", "metadata"];
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key)) || typeof input.commandId !== "string" || input.commandId.length > 200 || !["succeeded", "failed", "unknown", "timed_out", "cancelled"].includes(input.status)) throw new Error("durable_command.invalid_result");
    for (const timestamp of [input.startedAt, input.completedAt]) if (timestamp !== undefined && (!Number.isSafeInteger(timestamp) || timestamp < 0)) throw new Error("durable_command.invalid_result_time");
    if (input.startedAt !== undefined && input.completedAt !== undefined && input.completedAt < input.startedAt) throw new Error("durable_command.invalid_result_time");
    for (const text of [input.message, input.error]) if (text !== undefined && (typeof text !== "string" || text.length > 8192)) throw new Error("durable_command.invalid_result_text");
    for (const field of [input.target, input.payload, input.metadata]) if (field !== undefined && (!field || typeof field !== "object" || Array.isArray(field))) throw new Error("durable_command.invalid_result_object");
    if (input.failure !== undefined && !parseAutomationStudioFailureRecord(input.failure)) throw new Error("durable_command.invalid_failure");
    if (input.clearedWait !== undefined && (Object.keys(input.clearedWait).length !== 1 || !Object.hasOwn(input.clearedWait, "waitedMs") || !Number.isSafeInteger(input.clearedWait.waitedMs) || input.clearedWait.waitedMs < 0)) throw new Error("durable_command.invalid_cleared_wait");
    return structuredClone(input);
  }
  private freeze(value: unknown): void { if (value && typeof value === "object") { for (const item of Object.values(value)) this.freeze(item); Object.freeze(value); } }
}
