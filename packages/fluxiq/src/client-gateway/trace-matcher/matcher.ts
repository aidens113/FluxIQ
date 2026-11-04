// A gateway client answered from a recorded trace (traces and offline trials,
// P4b; source plan 7.2 and 7.3). Built from a trace store's indexed reads, it
// is the socket of a session attached under a channel scope -- with the public
// view the trace recorded when it first claimed the session -- so the trial's
// own gateway sends it commands and reads its answers through `receiveRaw`,
// Core's real decoder, like any client's.
//
// Strict matching (`./operation/match.ts`): each action command must equal the
// recorded operation at the cursor. On a match the clock is moved by the
// recorded latency and the segment recorded after that operation is fed in
// recorded order, each event after moving the clock by its recorded delta
// (`./recorded-deliveries.ts`), with recorded command ids translated
// (`./command-id-translation.ts`). A recorded reconcile answer is held until
// the trial's gateway asks that question, so it is never fed before it was
// asked. On a mismatch, or past the recorded end, the command is answered at
// once with a classified, non-retryable gap (`./gap-answer.ts`), the gap is
// recorded, and every later command is answered with a gap too: an unrelated
// recorded suffix is never consumed, and nothing recorded after the matched
// point is ever delivered. A trace that is incomplete or recorded under
// another contract is refused at load, and every command gets its gap.
//
// Reevaluation (P5, D31-D33). With a reevaluator in its input, a command that
// differs from the recorded operation at the cursor but keeps its action type
// is first offered to it, when the segment recorded after that operation holds
// exactly one result for it (`./reevaluation-request.ts`). `answered`: the
// cursor advances and the segment is fed in recorded order, with that one
// result's payload replaced by the answer (its envelope kept, its command id
// the recorded one, then translated as any other); the matched entry says it
// was `reevaluated` and which fields differed. `gap`: the command is answered
// with that gap (cause `reevaluation`) and the matcher diverges. `declined`:
// the mismatch gap, as without a reevaluator. A reevaluator that throws, or
// answers something else, is an `incomplete_capture` gap (cause
// `reevaluation`, its message kept in `refusedDeliveries`), never a pass.
// Nothing else is ever offered: not a command of another action type, one past
// the recorded end, one after a gap or on a refused trace.
//
// A recorded event or artifact the matcher cannot read or feed when its point
// comes (an input written down unreadably, an artifact the store no longer
// gives back or whose bytes the gateway refuses, no session to feed) is an
// evidence gap too, at the matched command it was delivered after (ordinal 0
// and no command before the first), with cause `failed_delivery`: never a
// free-text note, never a silent skip. The rest of that segment is still fed,
// so the command it answers is not left waiting, and every later command is
// answered as after any other gap. What the gateway does with a recorded input
// it was handed (it may throw, as it may have for the original) stays a note
// in `refusedDeliveries`.
//
// The session is attached with the view the trace recorded when it first
// claimed the session, else with a view the caller supplies; never a supplied
// one over a recorded one, and never a made-up default: a session that serves
// nothing would leave every command unsent, and the trial would read as the
// candidate's failure. With neither there is no view and `attach` refuses.
//
// Commands are handled one at a time in the order the gateway sent them.

import type { ClientGatewayClientHello, ClientGatewaySession, ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import { clientGatewayTraceGapAnswer } from "./gap-answer.ts";
import { CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS } from "./gap-reasons.ts";
import { matchClientGatewayTraceOperation, readClientGatewayTraceOperation } from "./operation/index.ts";
import { CLIENT_GATEWAY_TRACE_OPENING as OPENING, ClientGatewayTraceRecordedFeed, type ClientGatewayTraceDeliveredAfter as DeliveredAfter } from "./recorded-feed.ts";
import { clientGatewayTraceReevaluationRequest } from "./reevaluation-request.ts";
import { admitClientGatewayTraceForMatching } from "./trace-admission.ts";
import type {
  ClientGatewayTraceMatchedOperation,
  ClientGatewayTraceMatcherAdmission,
  ClientGatewayTraceMatcherGap,
  ClientGatewayTraceMatcherGapReason,
  ClientGatewayTraceMatcherInput,
  ClientGatewayTraceMatcherReport,
  ClientGatewayTraceMatcherSessionView,
  ClientGatewayTraceOperation,
  ClientGatewayTraceOperationMatch
} from "./types.ts";

type JsonRecord = { readonly [key: string]: unknown };

export class ClientGatewayTraceMatcher implements ClientGatewaySocket {
  private readonly input: ClientGatewayTraceMatcherInput;
  private readonly admission: ClientGatewayTraceMatcherAdmission;
  /** How recorded events reach the trial's gateway. */
  private readonly feed: ClientGatewayTraceRecordedFeed;
  private readonly matched: ClientGatewayTraceMatchedOperation[] = [];
  private readonly gaps: ClientGatewayTraceMatcherGap[] = [];
  private readonly unanswered: string[] = [];
  private queue: Promise<void> = Promise.resolve();
  private released: Promise<void> = Promise.resolve();
  private cursor = 0;
  private ordinal = 0;
  /** The command being answered: where a failure inside that step is placed. */
  private answering: DeliveredAfter = OPENING;
  private diverged = false;

  private constructor(input: ClientGatewayTraceMatcherInput, admission: ClientGatewayTraceMatcherAdmission) {
    this.input = input;
    this.admission = admission;
    this.feed = new ClientGatewayTraceRecordedFeed({
      store: input.store, traceId: input.traceId, gateway: input.gateway, clock: input.clock,
      manifest: () => admission.manifest,
      onFailedDelivery: (after, reason, sequence) => this.failedDelivery(after, reason, sequence)
    });
  }

  /** Reads and judges the trace (`./trace-admission.ts`); a refused trace still yields a matcher, which answers every command with its gap. */
  static async load(input: ClientGatewayTraceMatcherInput): Promise<ClientGatewayTraceMatcher> {
    const admission = await admitClientGatewayTraceForMatching({ store: input.store, traceId: input.traceId, contractVersions: input.contractVersions, sessionRef: input.sessionRef });
    return new ClientGatewayTraceMatcher(input, admission);
  }

  /** The view the session would be attached with: the one the trace recorded, else `supplied`; `null` with neither. */
  sessionView(supplied?: ClientGatewayClientHello): ClientGatewayTraceMatcherSessionView | null {
    const recorded = this.admission.claimedView;
    if (recorded !== null) return { source: "recorded", view: recorded };
    return supplied === undefined ? null : { source: "supplied", view: supplied };
  }

  /** Attaches this matcher's session under `scopeId` with `sessionView(supplied)`; throws, attaching nothing, when there is no view. */
  attach(scopeId: string, supplied?: ClientGatewayClientHello): ClientGatewaySession {
    const chosen = this.sessionView(supplied);
    if (chosen === null) throw new Error(`trace_matcher.no_session_view: the trace ${this.input.traceId} recorded no session view (no session.claimed) and none was supplied`);
    return this.feed.attach(scopeId, this, chosen.view);
  }

  /** Feeds what the trace delivered before its first operation, timed from the trace's start. Resolves once fed. */
  deliverOpening(): Promise<void> {
    this.enqueue(() => this.feed.deliver(this.admission.deliveries.opening, 0, OPENING), () => OPENING);
    return this.settled();
  }

  /** The gateway's transport: an action command is matched, a reconcile question releases its recorded answer. */
  send(raw: string): void {
    const message = parseRecord(raw);
    const type = typeof message?.type === "string" ? message.type : "(unreadable)";
    const payload = isRecord(message?.payload) ? message.payload : {};
    if (type === "server.execute_action") this.enqueue(() => this.answer(payload), () => this.answering);
    else if (type === "server.reconcile_command" && typeof payload.commandId === "string") this.release(payload.commandId);
    else this.unanswered.push(type);
  }

  /** Resolves once every command sent so far is answered and everything due is fed. */
  async settled(): Promise<void> {
    let queue: Promise<void>;
    let released: Promise<void>;
    do {
      queue = this.queue;
      released = this.released;
      await Promise.all([queue, released]);
    } while (queue !== this.queue || released !== this.released);
  }

  report(): ClientGatewayTraceMatcherReport {
    return Object.freeze({
      traceId: this.input.traceId,
      sourceEpisodeId: this.admission.manifest?.episodeId ?? null,
      refusal: this.admission.refusal,
      recordedOperations: this.admission.operations.length,
      matchedOperations: Object.freeze([...this.matched]),
      gaps: Object.freeze([...this.gaps]),
      deliveredSequences: Object.freeze([...this.feed.delivered]),
      refusedDeliveries: Object.freeze([...this.feed.refusedDeliveries]),
      unansweredMessageTypes: Object.freeze([...this.unanswered])
    });
  }

  private enqueue(work: () => Promise<void>, where: () => DeliveredAfter): void {
    this.queue = this.queue.then(() => this.guarded(work, where));
  }

  /**
   * Runs one step; a failure in it is an evidence gap where the step was
   * (`incomplete_capture`), its message kept in `refusedDeliveries`, and the
   * next step still runs.
   */
  private async guarded(work: () => Promise<void>, where: () => DeliveredAfter): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.feed.refusedDeliveries.push(`the matcher failed: ${messageOf(error)}`);
      this.failedDelivery(where(), "incomplete_capture", null);
    }
  }

  private async answer(payload: JsonRecord): Promise<void> {
    this.ordinal += 1;
    const commandId = typeof payload.commandId === "string" ? payload.commandId : "";
    const operation = readClientGatewayTraceOperation(payload);
    const gap = { ordinal: this.ordinal, commandId, actionType: operation.actionType };
    this.answering = gap;
    const refusal = this.admission.refusal;
    if (refusal !== null) return this.answerGap({ ...gap, reason: refusal.reason, cause: "refused_trace", fields: [], recordedSequence: null });
    if (this.diverged) return this.answerGap({ ...gap, reason: "missing_transition", cause: "after_gap", fields: [], recordedSequence: null });
    const match = matchClientGatewayTraceOperation(operation, this.cursor, this.admission.operations);
    if (match.status === "gap") {
      if (await this.reevaluate(payload, operation, match, gap)) return;
      return this.answerGap({ ...gap, reason: match.reason, cause: match.cause, fields: match.fields, recordedSequence: match.recordedSequence });
    }
    const segment = this.admission.deliveries.segments[this.cursor] ?? [];
    const unreadable = this.feed.unreadable(segment);
    if (unreadable !== undefined) return this.answerGap({ ...gap, reason: unreadable, cause: "unreadable_answer", fields: [], recordedSequence: match.recorded.sequence });
    this.cursor += 1;
    this.feed.translate(match.recorded.commandId, commandId);
    this.matched.push({ ...gap, recordedCommandId: match.recorded.commandId, recordedSequence: match.recorded.sequence, answeredFrom: "recorded", fields: [] });
    await this.feed.deliver(segment, match.recorded.logicalMs, gap);
  }

  /**
   * Offers a mismatched command to the reevaluator, when there is one, the
   * command keeps the recorded operation's action type and the segment holds
   * one result to replace. Only an `argument_mismatch` is offered: a recorded
   * operation whose fields were withheld at capture (`redacted_input`) stays
   * that gap, so a step that carried a secret is never reevaluated. `true` once
   * the command is answered (matched from the answer, or a gap); `false` when
   * the mismatch gap is still to be answered (not offered, or declined).
   */
  private async reevaluate(payload: JsonRecord, operation: ClientGatewayTraceOperation, match: Extract<ClientGatewayTraceOperationMatch, { status: "gap" }>, gap: DeliveredAfter): Promise<boolean> {
    const reevaluator = this.input.reevaluator;
    const recorded = this.admission.operations[this.cursor];
    const manifest = this.admission.manifest;
    if (reevaluator === undefined || manifest === null || match.cause !== "mismatch" || match.reason !== "argument_mismatch" || recorded === undefined || recorded.actionType !== operation.actionType) return false;
    const answerFailure = async (reason: string): Promise<true> => {
      this.feed.refusedDeliveries.push(`the reevaluator failed: ${reason}`);
      await this.answerGap({ ...gap, reason: "incomplete_capture", cause: "reevaluation", fields: match.fields, recordedSequence: recorded.sequence });
      return true;
    };
    const segment = this.admission.deliveries.segments[this.cursor] ?? [];
    let ask: Awaited<ReturnType<typeof clientGatewayTraceReevaluationRequest>>;
    let answer: unknown;
    try {
      ask = await clientGatewayTraceReevaluationRequest({ store: this.input.store, traceId: this.input.traceId, manifest, operations: this.admission.operations, cursor: this.cursor, segment, command: payload, operation, fields: match.fields });
      answer = ask === undefined ? undefined : await reevaluator.reevaluate(ask.request);
    } catch (error) {
      return answerFailure(messageOf(error));
    }
    if (ask === undefined) return false;
    if (!isRecord(answer)) return answerFailure("its answer is not an object");
    if (answer.status === "declined") return false;
    if (answer.status === "gap") {
      if (!isGapReason(answer.reason) || !isFieldList(answer.fields)) return answerFailure("it answered a gap with an unknown reason or unreadable fields");
      await this.answerGap({ ...gap, reason: answer.reason, cause: "reevaluation", fields: [...answer.fields], recordedSequence: recorded.sequence });
      return true;
    }
    if (answer.status !== "answered" || !isRecord(answer.result)) return answerFailure("it answered neither a result object, a gap nor a decline");
    this.cursor += 1;
    this.feed.translate(recorded.commandId, gap.commandId);
    this.matched.push({ ...gap, recordedCommandId: recorded.commandId, recordedSequence: recorded.sequence, answeredFrom: "reevaluated", fields: match.fields });
    const replacement = JSON.stringify({ ...ask.envelope, payload: { ...answer.result, commandId: recorded.commandId } });
    await this.feed.deliver(segment, recorded.logicalMs, gap, new Map([[ask.replaced.event.sequence, replacement]]));
    return true;
  }

  /** A recorded event that could not be read or fed: a gap after the command it came after; every later command is answered as after a gap. */
  private failedDelivery(after: DeliveredAfter, reason: ClientGatewayTraceMatcherGapReason, recordedSequence: number | null): void {
    this.gaps.push({ ...after, reason, cause: "failed_delivery", fields: [], recordedSequence });
    this.diverged = true;
  }

  private async answerGap(gap: ClientGatewayTraceMatcherGap): Promise<void> {
    this.gaps.push(gap);
    this.diverged = true;
    await this.feed.receive(clientGatewayTraceGapAnswer(gap.commandId, gap.reason), `the gap answer to ${gap.commandId}`);
  }

  /** The trial's gateway asked about `commandId`: its held recorded answer is fed now, outside the command queue, which may be waiting on the clock. */
  private release(commandId: string): void {
    for (const { feed, after } of this.feed.release(commandId)) {
      this.released = this.released.then(() => this.guarded(feed, () => after));
    }
  }
}

function parseRecord(text: string): JsonRecord | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isGapReason(value: unknown): value is ClientGatewayTraceMatcherGapReason {
  return CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS.some((reason) => reason === value);
}

function isFieldList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((field) => typeof field === "string");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
