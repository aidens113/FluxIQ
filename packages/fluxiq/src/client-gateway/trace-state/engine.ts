// The state rule behind the gateway's socket: a scoped session's client answered from one
// exploration's recording by page position and acts done, in place of the matcher's strict
// cursor. Its input is the same as the matcher's, and so is everything around the rule: the
// trace's admission, Core's real intake through `receiveRaw`, the trial's virtual clock, id
// translation, reconcile answers held for their question, and the classified gap answer
// (`../trace-matcher/recorded-feed.ts`, `../trace-matcher/gap-answer.ts`).
//
// **What is fed for an answered command.** Only what that command caused. The matcher can
// feed a whole segment, because its cursor has every earlier command already answered; here
// commands are skipped, so a segment can hold another command's late answer, whose id the
// trial's gateway never minted. It is left out and counted. The command's own answer is
// fetched from wherever it was recorded, even from a later segment. What arrived on its own
// after the command (a page's state update) is fed the first time its command is answered,
// not on a repeat of the same recorded read. A computed read keeps its recorded answer's
// envelope and replaces the payload.
//
// **A read gap does not end the run** (rule 1), and neither does a page move's (rule 2). The
// run goes on and one verdict reports every gap with the step it sits on: one gap per repair
// round would tell a model next to nothing. So a read or move the recording cannot answer
// gets the domain's `unansweredCall`, which says nothing was read and nothing moved, and is
// counted as the gap it is, so the verdict can only be `inconclusive`. It is no recorded
// answer, and whatever the run does with it is not evidence. An act gets the classified gap
// answer and its run stops: a run is never told an act landed when it did not, and the rule
// already refuses what would follow it (rule 4).
//
// Which calls are the recording: the model's and the Flow's, Core's own bookkeeping left
// out (`./bookkeeping-calls.ts`), up to the first trial when `upToFirstChild` asks, since a
// saved build's exploration goes on around its trials and Answer First's does not. The same
// bookkeeping the trial runner sends now (its end view, a result check) is not the Flow, so
// it is never compared with the recording: it gets a gap answer, is counted apart, and says
// nothing of the Flow. The rule never sees it, so it moves nothing the verdict reads.
//
// Commands are handled one at a time in the order the gateway sent them. Not wired into any
// live path: `framework/automation-service/service/offline-trial/state/run.ts` runs it.

import type { ClientGatewayClientHello, ClientGatewaySession, ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayTraceEvent, ClientGatewayTraceStore } from "../trace/index.ts";
import { readClientGatewayTraceInboundText } from "../trace-replay/index.ts";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";
import { admitClientGatewayTraceForMatching, CLIENT_GATEWAY_TRACE_OPENING as OPENING, clientGatewayTraceGapAnswer, ClientGatewayTraceRecordedFeed, readClientGatewayTraceOperation, type ClientGatewayTraceDeliveredAfter as DeliveredAfter, type ClientGatewayTraceMatcherAdmission, type ClientGatewayTraceMatcherClock, type ClientGatewayTraceMatcherDelivery, type ClientGatewayTraceMatcherGapReason, type ClientGatewayTraceMatcherGateway, type ClientGatewayTraceMatcherSessionView, type ClientGatewayTraceRecordedOperation } from "../trace-matcher/index.ts";
import { clientGatewayTraceStateEndCheck } from "./end-check.ts";
import { clientGatewayTraceStateIsBookkeepingCall } from "./bookkeeping-calls.ts";
import { clientGatewayTraceStateRecordedCalls } from "./recorded-calls.ts";
import { clientGatewayTraceStateRecording } from "./recording.ts";
import type { ClientGatewayTraceStateCallKind, ClientGatewayTraceStateClockSpan, ClientGatewayTraceStateComputedRead, ClientGatewayTraceStateDomain, ClientGatewayTraceStateEndCheck, ClientGatewayTraceStateGapCode, ClientGatewayTraceStateReceipt, ClientGatewayTraceStateRecordedCall, ClientGatewayTraceStateRecording, ClientGatewayTraceStateVerdict } from "./types.ts";
import { clientGatewayTraceStateVerdict } from "./verdict.ts";
import { ClientGatewayTraceStateWalker } from "./walker.ts";

type JsonRecord = { readonly [key: string]: unknown };

const ACTION_RESULT = "client.action_result";
const RECONCILE_RESULT = "client.reconcile_result";
/** Who an answer whose text was withheld belongs to, when nothing says: nobody, so it is never fed for another command. */
const WITHHELD_COMMAND = "(withheld)";

/** Why the state engine could not use a recorded event, or a command it could not answer. */
export type ClientGatewayTraceStateEngineGapCode = ClientGatewayTraceStateGapCode | ClientGatewayTraceMatcherGapReason;

export type ClientGatewayTraceStateEngineInput = {
  store: ClientGatewayTraceStore;
  traceId: string;
  gateway: ClientGatewayTraceMatcherGateway;
  clock: ClientGatewayTraceMatcherClock;
  contractVersions: Readonly<Record<string, string>>;
  domain: ClientGatewayTraceStateDomain;
  sessionRef?: string | undefined;
  /** Whether the recording ends at the trace's first trial. */
  upToFirstChild?: boolean | undefined;
  /** Receipts for recorded acts, by a call's ordinal among the calls the recording holds. */
  receipts?: ((calls: readonly ClientGatewayTraceStateRecordedCall[]) => ReadonlyMap<number, ClientGatewayTraceStateReceipt>) | undefined;
};

/** A command answered from the recording: by the recorded answer of `recordedSequence`, or computed from its rows. */
export type ClientGatewayTraceStateEngineAnswered = {
  readonly ordinal: number;
  readonly commandId: string;
  readonly actionType: string;
  readonly kind: ClientGatewayTraceStateCallKind;
  readonly recordedCommandId: string;
  readonly recordedSequence: number;
  readonly answeredFrom: "recorded" | "computed";
  readonly mayBeGoneNextTime: boolean;
};

/** A command answered with a gap, or (`failed_delivery`) a recorded event that could not be fed. */
export type ClientGatewayTraceStateEngineGap = {
  readonly ordinal: number;
  readonly commandId: string;
  readonly actionType: string;
  /** Whether the run was told nothing was there and went on, as for a read or a page move; `false` when it got the failing gap answer. */
  readonly wentOn: boolean;
  readonly reason: ClientGatewayTraceStateEngineGapCode;
  readonly cause: "refused_trace" | "state_rule" | "unreadable_answer" | "failed_delivery";
  readonly fields: readonly string[];
  readonly recordedSequence: number | null;
};

export type ClientGatewayTraceStateEngineReport = {
  readonly traceId: string;
  readonly sourceEpisodeId: string | null;
  readonly refusal: ClientGatewayTraceMatcherAdmission["refusal"];
  /** Calls in the recording, Core's bookkeeping left out. */
  readonly recordedOperations: number;
  readonly matchedOperations: readonly ClientGatewayTraceStateEngineAnswered[];
  readonly gaps: readonly ClientGatewayTraceStateEngineGap[];
  readonly deliveredSequences: readonly number[];
  readonly refusedDeliveries: readonly string[];
  readonly unansweredMessageTypes: readonly string[];
  /** Other commands' answers and inputs a segment held that no command here caused. */
  readonly withheldDeliveries: number;
  /** Every command the rule was asked about, by action type, in order: a gap's `ordinal` is its place here, from 1. */
  readonly commandActions: readonly string[];
  /** Commands the trial's own bookkeeping sent, which are not the Flow's: answered with a gap and read by nothing here. */
  readonly bookkeepingCommands: number;
  readonly end: ClientGatewayTraceStateEndCheck;
  readonly verdict: ClientGatewayTraceStateVerdict;
};

/** A command's place in the trace: the recorded operation, and the segment recorded after it. */
type Located = { readonly operation: ClientGatewayTraceRecordedOperation; readonly segment: readonly ClientGatewayTraceMatcherDelivery[] };

export class ClientGatewayTraceStateEngine implements ClientGatewaySocket {
  private readonly input: ClientGatewayTraceStateEngineInput;
  private readonly admission: ClientGatewayTraceMatcherAdmission;
  private readonly recording: ClientGatewayTraceStateRecording;
  private readonly walker: ClientGatewayTraceStateWalker;
  private readonly feed: ClientGatewayTraceRecordedFeed;
  private readonly located: ReadonlyMap<number, Located>;
  /** Each recorded command's own answer, wherever it was recorded. */
  private readonly ownAnswers: ReadonlyMap<string, readonly ClientGatewayTraceMatcherDelivery[]>;
  private readonly answered: ClientGatewayTraceStateEngineAnswered[] = [];
  private readonly gaps: ClientGatewayTraceStateEngineGap[] = [];
  private readonly unanswered: string[] = [];
  /** Segments already fed: a repeat of the same recorded read gets its answer alone. */
  private readonly fedSegments = new Set<number>();
  private withheld = 0;
  private bookkeeping = 0;
  private readonly commandActions: string[] = [];
  private queue: Promise<void> = Promise.resolve();
  private released: Promise<void> = Promise.resolve();
  private ordinal = 0;
  private answering: DeliveredAfter = OPENING;

  private constructor(input: ClientGatewayTraceStateEngineInput, admission: ClientGatewayTraceMatcherAdmission, recording: ClientGatewayTraceStateRecording) {
    this.input = input;
    this.admission = admission;
    this.recording = recording;
    this.walker = new ClientGatewayTraceStateWalker(recording, input.domain, { skippedActs: "gap", clock: clockSpanOf(admission) });
    this.feed = new ClientGatewayTraceRecordedFeed({
      store: input.store, traceId: input.traceId, gateway: input.gateway, clock: input.clock,
      manifest: () => admission.manifest,
      onFailedDelivery: (after, reason, sequence) => {
        this.gaps.push({ ...after, wentOn: false, reason, cause: "failed_delivery", fields: [], recordedSequence: sequence });
      }
    });
    const located = new Map<number, Located>();
    for (const [index, operation] of admission.operations.entries()) located.set(operation.sequence, { operation, segment: admission.deliveries.segments[index] ?? [] });
    this.located = located;
    this.ownAnswers = ownAnswersOf(admission);
  }

  /** Reads and judges the trace as the matcher does; a refused trace still yields an engine, which answers every command with its gap. */
  static async load(input: ClientGatewayTraceStateEngineInput): Promise<ClientGatewayTraceStateEngine> {
    const admission = await admitClientGatewayTraceForMatching({ store: input.store, traceId: input.traceId, contractVersions: input.contractVersions, sessionRef: input.sessionRef });
    const events: readonly ClientGatewayTraceEvent[] = admission.refusal === null ? await input.store.readEventRange(input.traceId, 1, Number.MAX_SAFE_INTEGER) : [];
    const { calls, firstChild } = clientGatewayTraceStateRecordedCalls(events);
    const served = new Set(admission.operations.map((operation) => operation.sequence));
    const held = calls.filter((call) => served.has(call.sequence) && !clientGatewayTraceStateIsBookkeepingCall(call.callId) && (input.upToFirstChild !== true || firstChild === null || call.sequence < firstChild));
    const recording = clientGatewayTraceStateRecording({ calls: held, domain: input.domain, ...(input.receipts === undefined ? {} : { receipts: input.receipts(held) }) });
    return new ClientGatewayTraceStateEngine(input, admission, recording);
  }

  /** The view the session would be attached with: the one the trace recorded, else `supplied`; `null` with neither. */
  sessionView(supplied?: ClientGatewayClientHello): ClientGatewayTraceMatcherSessionView | null {
    const recorded = this.admission.claimedView;
    if (recorded !== null) return { source: "recorded", view: recorded };
    return supplied === undefined ? null : { source: "supplied", view: supplied };
  }

  /** Attaches this engine's session under `scopeId` with `sessionView(supplied)`; throws, attaching nothing, when there is no view. */
  attach(scopeId: string, supplied?: ClientGatewayClientHello): ClientGatewaySession {
    const chosen = this.sessionView(supplied);
    if (chosen === null) throw new Error(`trace_state.no_session_view: the trace ${this.input.traceId} recorded no session view (no session.claimed) and none was supplied`);
    return this.feed.attach(scopeId, this, chosen.view);
  }

  /** Feeds what the trace delivered before its first operation, timed from the trace's start. Resolves once fed. */
  deliverOpening(): Promise<void> {
    this.enqueue(() => this.feed.deliver(this.admission.deliveries.opening, 0, OPENING), () => OPENING);
    return this.settled();
  }

  /** The gateway's transport: an action command is answered by the rule, a reconcile question releases its recorded answer. */
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

  report(): ClientGatewayTraceStateEngineReport {
    const end = clientGatewayTraceStateEndCheck(this.recording, this.walker);
    const codes = this.gaps.map((gap) => gap.reason) as ClientGatewayTraceStateGapCode[];
    return Object.freeze({
      traceId: this.input.traceId,
      sourceEpisodeId: this.admission.manifest?.episodeId ?? null,
      refusal: this.admission.refusal,
      recordedOperations: this.recording.entries.length,
      matchedOperations: Object.freeze([...this.answered]),
      gaps: Object.freeze([...this.gaps]),
      deliveredSequences: Object.freeze([...this.feed.delivered]),
      refusedDeliveries: Object.freeze([...this.feed.refusedDeliveries]),
      unansweredMessageTypes: Object.freeze([...this.unanswered]),
      withheldDeliveries: this.withheld,
      commandActions: Object.freeze([...this.commandActions]),
      bookkeepingCommands: this.bookkeeping,
      end,
      verdict: clientGatewayTraceStateVerdict({ recording: this.recording, end, gaps: codes })
    });
  }

  private enqueue(work: () => Promise<void>, where: () => DeliveredAfter): void {
    this.queue = this.queue.then(() => this.guarded(work, where));
  }

  /** Runs one step; a failure in it is an evidence gap where the step was, and the next step still runs. */
  private async guarded(work: () => Promise<void>, where: () => DeliveredAfter): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.feed.refusedDeliveries.push(`the state engine failed: ${error instanceof Error ? error.message : String(error)}`);
      this.gaps.push({ ...where(), wentOn: false, reason: "incomplete_capture", cause: "failed_delivery", fields: [], recordedSequence: null });
    }
  }

  private async answer(payload: JsonRecord): Promise<void> {
    const commandId = typeof payload.commandId === "string" ? payload.commandId : "";
    if (this.admission.refusal === null && clientGatewayTraceStateIsBookkeepingCall(callIdOf(payload))) {
      this.bookkeeping += 1;
      return this.feed.receive(clientGatewayTraceGapAnswer(commandId, "missing_transition"), `the gap answer to ${commandId}`);
    }
    this.ordinal += 1;
    const operation = readClientGatewayTraceOperation(payload);
    const command = { ordinal: this.ordinal, commandId, actionType: operation.actionType };
    this.commandActions.push(operation.actionType);
    this.answering = command;
    const refusal = this.admission.refusal;
    if (refusal !== null) return this.answerGap({ ...command, wentOn: false, reason: refusal.reason, cause: "refused_trace", fields: [], recordedSequence: null });
    const answer = this.walker.answer(operation);
    if (answer.status === "gap") {
      const recordedSequence = answer.refusedEntry === null ? null : this.recording.entries[answer.refusedEntry]!.call.sequence;
      const fields = answer.nearest?.fields ?? [];
      const goesOn = this.input.domain.labelCall(operation) === "act" ? null : this.input.domain.unansweredCall(operation);
      if (goesOn === null) return this.answerGap({ ...command, wentOn: false, reason: answer.code, cause: "state_rule", fields, recordedSequence });
      this.gaps.push({ ...command, wentOn: true, reason: answer.code, cause: "state_rule", fields, recordedSequence });
      return this.feed.receive(JSON.stringify({ id: `trace-gap.${commandId}`, type: ACTION_RESULT, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: { ...goesOn, commandId } }), `the unanswered call ${commandId}`);
    }
    const entry = this.recording.entries[answer.entry]!;
    const located = this.located.get(entry.call.sequence);
    if (located === undefined) return this.answerGap({ ...command, wentOn: false, reason: "incomplete_capture", cause: "unreadable_answer", fields: [], recordedSequence: entry.call.sequence });
    const recorded = located.operation;
    const own = this.ownAnswers.get(recorded.commandId) ?? [];
    const deliveries = this.deliveriesFor(located, own);
    const unreadable = answer.computed === null ? this.feed.unreadable(deliveries) : this.feed.unreadable(deliveries.filter((delivery) => !own.includes(delivery)));
    if (unreadable !== undefined) return this.answerGap({ ...command, wentOn: false, reason: unreadable, cause: "unreadable_answer", fields: [], recordedSequence: recorded.sequence });
    this.feed.translate(recorded.commandId, commandId);
    this.answered.push({ ...command, kind: entry.kind, recordedCommandId: recorded.commandId, recordedSequence: recorded.sequence, answeredFrom: answer.computed === null ? "recorded" : "computed", mayBeGoneNextTime: answer.mayBeGoneNextTime });
    await this.feed.deliver(deliveries, recorded.logicalMs, command, answer.computed === null ? undefined : computedAnswerText(answer.computed, own, recorded.commandId));
  }

  /** What is fed for one recorded command: its own answer, and on its first use what arrived on its own after it. */
  private deliveriesFor(located: Located, own: readonly ClientGatewayTraceMatcherDelivery[]): readonly ClientGatewayTraceMatcherDelivery[] {
    const first = !this.fedSegments.has(located.operation.sequence);
    this.fedSegments.add(located.operation.sequence);
    const others = located.segment.filter((delivery) => {
      if (own.includes(delivery)) return false;
      if (answeredCommand(delivery) === undefined) return first;
      if (first) this.withheld += 1;
      return false;
    });
    return [...own, ...others].sort((left, right) => left.event.sequence - right.event.sequence);
  }

  private async answerGap(gap: ClientGatewayTraceStateEngineGap): Promise<void> {
    this.gaps.push(gap);
    await this.feed.receive(clientGatewayTraceGapAnswer(gap.commandId, gap.reason), `the gap answer to ${gap.commandId}`);
  }

  private release(commandId: string): void {
    for (const { feed, after } of this.feed.release(commandId)) {
      this.released = this.released.then(() => this.guarded(feed, () => after));
    }
  }
}

/** The time the recording spans: from its clock's origin to the last thing it logged. */
function clockSpanOf(admission: ClientGatewayTraceMatcherAdmission): ClientGatewayTraceStateClockSpan | undefined {
  const fromMs = admission.manifest?.clockOrigin.epochMs;
  if (fromMs === undefined) return undefined;
  const logged = [...admission.deliveries.segments.flat(), ...admission.deliveries.opening].map((delivery) => delivery.atMs);
  return { fromMs, toMs: fromMs + Math.max(0, ...logged) };
}

/** The name a caller gave a command: Core's own bookkeeping names what it sends. */
function callIdOf(payload: JsonRecord): string | null {
  const metadata = payload.metadata;
  return isRecord(metadata) && typeof metadata.callId === "string" ? metadata.callId : null;
}

/** The text a computed read is fed as: its recorded answer's envelope around the computed payload, its command id the recorded one, then translated as any other. */
function computedAnswerText(computed: ClientGatewayTraceStateComputedRead, own: readonly ClientGatewayTraceMatcherDelivery[], recordedCommandId: string): ReadonlyMap<number, string> | undefined {
  const result = own.find((delivery) => delivery.kind === "input" && delivery.event.messageType === ACTION_RESULT);
  if (result === undefined) return undefined;
  const read = readClientGatewayTraceInboundText(result.event);
  if ("gap" in read) return undefined;
  return new Map([[result.event.sequence, JSON.stringify({ ...parseRecord(read.text), payload: { ...computed.answer, commandId: recordedCommandId } })]]);
}

/** Each recorded command's own answers and its own deadline, from every segment and in recorded order. */
function ownAnswersOf(admission: ClientGatewayTraceMatcherAdmission): ReadonlyMap<string, readonly ClientGatewayTraceMatcherDelivery[]> {
  const own = new Map<string, ClientGatewayTraceMatcherDelivery[]>();
  for (const segment of admission.deliveries.segments) {
    for (const delivery of segment) {
      const commandId = answeredCommand(delivery);
      if (commandId !== undefined) (own.get(commandId) ?? own.set(commandId, []).get(commandId)!).push(delivery);
    }
  }
  return own;
}

/** The recorded command a delivery answers: an action result, a reconcile result or a deadline; `undefined` for what arrived on its own. */
function answeredCommand(delivery: ClientGatewayTraceMatcherDelivery): string | undefined {
  const { event } = delivery;
  if (delivery.kind === "deadline") return event.correlation.commandId ?? undefined;
  if (delivery.kind !== "input" || (event.messageType !== ACTION_RESULT && event.messageType !== RECONCILE_RESULT)) return undefined;
  const read = readClientGatewayTraceInboundText(event);
  if ("gap" in read) return event.correlation.commandId ?? WITHHELD_COMMAND;
  const payload = parseRecord(read.text)?.payload;
  return isRecord(payload) && typeof payload.commandId === "string" ? payload.commandId : WITHHELD_COMMAND;
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
