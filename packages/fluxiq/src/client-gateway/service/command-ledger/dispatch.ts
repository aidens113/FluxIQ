import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { ClientGatewayActionCommand, ClientGatewayActionResult } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayConfig } from "../config.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { ClientGatewayEventBus } from "../event-bus.ts";
import { COMMAND_ANSWER_MARGIN_MS } from "../command-answer-margin.ts";
import { ClientGatewayCommandContext } from "./context.ts";
import { ClientGatewayCommandOutcome } from "./outcome.ts";
import { ClientGatewayCommandLedgerController as Controller } from "./controller.ts";
import type { ClientGatewayCommandClaim, ClientGatewayCommandLedgerLease, ClientGatewayCommandReceipt, ClientGatewayDurableActionOptions, ClientGatewayDurableActionResponse, ClientGatewayDurableDispatchResult, ClientGatewayCommandOutcomeObserver, ClientGatewayCommandCompletion } from "./contracts.ts";

type Answer = { result: ClientGatewayActionResult; receipt: ClientGatewayCommandReceipt };
type Entry = {
  sessionId: string; clientId: string; claim: ClientGatewayCommandClaim;
  phase: "preparing" | "waiting" | "reserved" | "terminal";
  abort: AbortController; timer?: ReturnType<typeof setTimeout>; detach(): void;
  resolve(answer: Answer): void; reject(): void;
  answer: Promise<Answer>; completion: Promise<ClientGatewayDurableDispatchResult<ClientGatewayActionResult>>;
  context: ClientGatewayCommandContext; observer?: ClientGatewayCommandOutcomeObserver; proof?: object;
  uncertainty?: Promise<void>;
};
type Ports = { config: ClientGatewayConfig; sessions: ClientGatewaySessionRegistry; transport: ClientGatewayTransport; events: ClientGatewayEventBus; resolve?: (context: ClientGatewayCommandContext) => Promise<ClientGatewayCommandLedgerLease> };
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
    this.unsubscribe = ports.events.subscribe(event => { if (event.type === "session.disconnected") for (const entry of this.pending.values()) if (entry.sessionId === event.session.sessionId) this.uncertain(entry); });
  }
  execute(sessionId: string, input: ClientGatewayActionCommand, options: ClientGatewayDurableActionOptions): ClientGatewayDurableActionResponse {
    if (this.closed) throw new Error("durable_command.closed");
    if (!options || typeof options !== "object" || Object.getPrototypeOf(options) !== Object.prototype || Reflect.ownKeys(options).some(key => typeof key !== "string" || !["context", "signal"].includes(key)) || !Object.hasOwn(options, "context") || Object.values(Object.getOwnPropertyDescriptors(options)).some(descriptor => !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) throw new Error("durable_command.invalid_options");
    if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new Error("durable_command.invalid_signal");
    const owner = ClientGatewayCommandContext.owner(options.context);
    const requestDigest = Controller.digest(input), command = structuredClone(input);
    this.validateCommand(command); this.freeze(command);
    const session = this.ports.sessions.requireReady(sessionId);
    if (session.projectId && session.projectId !== owner.projectId) throw new Error("durable_command.project_denied");
    const commandId = Controller.commandId(owner);
    if (this.pending.has(commandId)) throw new Error("durable_command.already_pending");
    const claim: ClientGatewayCommandClaim = { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId, clientId: session.clientId, sessionId }, requestDigest };
    Controller.validateClaim(claim); this.freeze(claim);
    const message = this.ports.transport.message("server.execute_action", { ...command, commandId }, session); this.freeze(message);
    let resolve!: Entry["resolve"], reject!: Entry["reject"];
    const answer = new Promise<Answer>((yes, no) => { resolve = yes; reject = () => no(new Error("durable_command.outcome_unknown")); });
    void answer.catch(/* best-effort: preadmission cancellation is reported by public completion */ () => undefined);
    const observer = ClientGatewayCommandOutcome.observer(options.context);
    const entry: Entry = { sessionId, clientId: session.clientId, claim, context: options.context, ...(observer ? { observer } : {}), phase: "preparing", abort: new AbortController(), detach: () => undefined, resolve, reject, answer, completion: Promise.resolve({ status: "outcome_unknown" }) };
    const abort = () => this.uncertain(entry);
    options.signal?.addEventListener("abort", abort, { once: true }); entry.detach = () => options.signal?.removeEventListener("abort", abort);
    if (options.signal?.aborted) this.uncertain(entry);
    this.pending.set(commandId, entry);
    if (observer) entry.timer = setTimeout(() => this.uncertain(entry), command.timeoutMs === undefined ? this.ports.config.commandTimeoutMs : command.timeoutMs + COMMAND_ANSWER_MARGIN_MS);
    const pipeline = this.run(entry, options.context, command, message);
    entry.completion = pipeline; this.pipelines.add(pipeline);
    void pipeline.finally(() => this.pipelines.delete(pipeline)).catch(/* best-effort: derived observer mirrors the public failure */ () => undefined);
    return { commandId, message, result: pipeline };
  }
  has(commandId: string): boolean { return this.pending.has(commandId); }
  async settle(sessionId: string, input: ClientGatewayActionResult): Promise<"settled" | "wrong_session" | "suppressed" | "unknown_command"> {
    const entry = this.pending.get(input?.commandId);
    if (!entry) return "unknown_command";
    const sender = this.ports.sessions.require(sessionId);
    if (sessionId !== entry.sessionId || sender.clientId !== entry.clientId) return "wrong_session";
    if (entry.phase !== "waiting") return "suppressed";
    let result: ClientGatewayActionResult, resultDigest: string;
    try { resultDigest = Controller.digest(input); result = this.parseResult(input); this.freeze(result); }
    catch { return "suppressed"; }
    if (result.status === "unknown" || result.status === "timed_out" || result.status === "cancelled") { this.uncertain(entry); await entry.completion; return "suppressed"; }
    entry.phase = "reserved"; if (!entry.observer) clearTimeout(entry.timer);
    const receipt: ClientGatewayCommandReceipt = { schemaVersion: "gateway_command_receipt.v1", commandId: entry.claim.binding.commandId, requestDigest: entry.claim.requestDigest, clientId: entry.clientId, sessionId: entry.sessionId, status: result.status, receivedAt: this.ports.config.now(), resultDigest, redaction: "receipt_only", ...(result.status === "failed" ? { failureClass: "action_failed" as const } : {}) };
    entry.resolve({ result, receipt });
    const completed = await entry.completion;
    return completed.status === "completed" && completed.receipt.resultDigest === resultDigest ? "settled" : "suppressed";
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
        const waitMs = command.timeoutMs === undefined ? this.ports.config.commandTimeoutMs : command.timeoutMs + COMMAND_ANSWER_MARGIN_MS;
        if (!entry.observer) entry.timer = setTimeout(() => this.uncertain(entry), waitMs);
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
      clearTimeout(entry.timer); entry.detach(); entry.phase = "terminal";
      this.pending.delete(entry.claim.binding.commandId);
      if (entry.proof) ClientGatewayDurableDispatch.proofs.delete(entry.proof);
      if (lease) {
        const owned = lease, cleanup = async () => { try { await observing; } catch { /* best-effort: public result already records observer refusal */ } try { await owned.close(); } catch (error) { this.cleanupErrors.push(error); } };
        if (observing && entry.abort.signal.aborted) { const pending = cleanup(); this.pipelines.add(pending); void pending.finally(() => this.pipelines.delete(pending)); } else await cleanup();
      }
    }
  }
  private uncertain(entry: Entry): void {
    if ((!entry.observer && entry.phase === "reserved") || entry.phase === "terminal") return;
    if (entry.proof) ClientGatewayDurableDispatch.proofs.delete(entry.proof);
    entry.phase = "terminal"; clearTimeout(entry.timer); entry.abort.abort(); entry.reject();
  }
  private notifyUncertainty(entry: Entry, disposition: string): Promise<void> { entry.uncertainty ??= Promise.resolve().then(() => entry.observer!.uncertain(entry.context, disposition)); return entry.uncertainty; }
  private validateCommand(command: ClientGatewayActionCommand): void {
    const fields = ["actionType", "parameters", "target", "timeoutMs", "metadata"];
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
