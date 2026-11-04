// Shared types of the trace state rule: what the domain port answers, one
// exploration's recording as states, and what a walk of a Flow's commands over
// it says. Domain-neutral: an answer stays opaque here, read only through the
// port, and a position is an opaque string the port gives. No model and no site.

import type { ClientGatewayTraceOperation, ClientGatewayTraceRecordedPayload } from "../trace-matcher/index.ts";
import type { CLIENT_GATEWAY_TRACE_STATE_GAP_CODES } from "./gap-codes.ts";

export type ClientGatewayTraceStateGapCode = (typeof CLIENT_GATEWAY_TRACE_STATE_GAP_CODES)[number];

/** What a call does to the state: looks at it, moves the page, or acts on it. */
export type ClientGatewayTraceStateCallKind = "read" | "page_move" | "act";

/** How a call came out: `succeeded` starts a new state when the call moves or acts; `no_effect` and `failed` never do. */
export type ClientGatewayTraceStateCallOutcome = "succeeded" | "no_effect" | "failed";

/** An answer as the domain reads it. */
export type ClientGatewayTraceStateAnswerReading = {
  readonly outcome: ClientGatewayTraceStateCallOutcome;
  /** Where the answer says the page is, as an opaque string; `null` when it does not say. */
  readonly position: string | null;
  /** The answer's rows, each as a canonical identity; `null` when it carries none. */
  readonly rows: readonly string[] | null;
  /** Whether the call gave up waiting: a longer wait might have answered otherwise (rule 7). */
  readonly timedOut: boolean;
};

/** One normalisation a domain's canonical key applies, named so a report can say what was made equal and why. */
export type ClientGatewayTraceStateNormalisation = {
  readonly id: string;
  readonly why: string;
};

/**
 * The domain's half of the rule. Core never reads a target, a selector or a URL.
 *
 * - `labelCall`: read, page move or act, from the domain's own classification;
 * - `pageMoveForm`: `absolute` names where it goes, and may be made from anywhere;
 *   `relative` moves from where the page is, so its place is part of its identity;
 * - `canonicalKey`: equal keys are the same call, as JSON text of what is compared.
 *   Every difference it removes is in `normalisations`; row identity and the call's
 *   values are never removed;
 * - `siblingKey`: the canonical key apart from row identity. Two acts with equal
 *   sibling keys and different canonical keys act on two rows of one list;
 * - `waitMs`: the wait the command gave, when it names one;
 * - `isOneTimeLayerAct`: whether a recorded act closed a layer in front of the page,
 *   judged from the read before it. Such an act may be gone the next time (rule 6);
 * - `handleScope`: a fresh reader of one run's calls in order, which rewrites what a run
 *   mints for itself (which tab, which frame, the instant it reads dates at) to where it
 *   stands in that run, so two runs' calls compare and a genuinely new handle still
 *   differs. `clock` is the time the recording spans: an instant inside it is the
 *   recording's own, and one outside it stays in the key. With no clock every instant
 *   is the run's own. Declared among `normalisations`. Calls go through it before
 *   `canonicalKey`;
 * - `unansweredCall`: what a read or a page move the recording cannot answer is told so
 *   the run can go on and report what else it cannot answer, or `null` when it cannot go
 *   on. It says nothing was read and nothing moved. It is never recorded data, and any
 *   such answer leaves the verdict `inconclusive`. An act has none: a run never hears
 *   that an act landed when it did not;
 * - `computeRead`: a read the recording holds no answer for, computed from recorded
 *   reads of the state it stands in, or `null` when the page would be needed. It is also
 *   asked when `recordedAnswerFits` says a same-input answer does not stand as it is.
 */
export type ClientGatewayTraceStateDomain = {
  readonly normalisations: readonly ClientGatewayTraceStateNormalisation[];
  labelCall(operation: ClientGatewayTraceOperation): ClientGatewayTraceStateCallKind;
  pageMoveForm(operation: ClientGatewayTraceOperation): "absolute" | "relative";
  canonicalKey(operation: ClientGatewayTraceOperation): string;
  siblingKey(operation: ClientGatewayTraceOperation): string;
  waitMs(operation: ClientGatewayTraceOperation): number | null;
  readAnswer(answer: ClientGatewayTraceRecordedPayload | null): ClientGatewayTraceStateAnswerReading;
  isOneTimeLayerAct(operation: ClientGatewayTraceOperation, readBefore: ClientGatewayTraceRecordedPayload | null): boolean;
  handleScope(clock?: ClientGatewayTraceStateClockSpan): (operation: ClientGatewayTraceOperation) => ClientGatewayTraceOperation;
  unansweredCall(operation: ClientGatewayTraceOperation): ClientGatewayTraceRecordedPayload | null;
  computeRead(operation: ClientGatewayTraceOperation, recorded: readonly ClientGatewayTraceStateRecordedRead[]): ClientGatewayTraceStateComputedRead | null;
  recordedAnswerFits(operation: ClientGatewayTraceOperation, answer: ClientGatewayTraceRecordedPayload | null): boolean;
};

/** The time a recording spans, on the wall clock it was recorded under: what a simulated run's clock reads. */
export type ClientGatewayTraceStateClockSpan = { readonly fromMs: number; readonly toMs: number };

/** A recorded read offered to `computeRead`, with its place in the recording. */
export type ClientGatewayTraceStateRecordedRead = {
  readonly entry: number;
  readonly operation: ClientGatewayTraceOperation;
  readonly answer: ClientGatewayTraceRecordedPayload;
};

/** A read's answer computed from recorded reads: the recorded read it came from, the answer in its place, and its rows by identity. */
export type ClientGatewayTraceStateComputedRead = {
  readonly from: number;
  readonly answer: ClientGatewayTraceRecordedPayload;
  readonly rows: readonly string[];
};

/** One command of a trace with its answer, in delivery order. */
export type ClientGatewayTraceStateRecordedCall = {
  /** Its place among the trace's commands, from 0. */
  readonly ordinal: number;
  readonly sequence: number;
  readonly operation: ClientGatewayTraceOperation;
  /** The caller's own name for the call (`metadata.callId`), which says whether the model or Core's bookkeeping sent it. */
  readonly callId: string | null;
  /** The `client.action_result`'s payload; `null` when the trace holds none that can be read. */
  readonly answer: ClientGatewayTraceRecordedPayload | null;
  /** From the command to its answer, on the trace's clock. */
  readonly latencyMs: number | null;
  /** Whether a field of the command or its answer was withheld at capture. */
  readonly redacted: boolean;
};

/** A recorded call placed in the recording's states. */
export type ClientGatewayTraceStateEntry = {
  readonly index: number;
  readonly call: ClientGatewayTraceStateRecordedCall;
  readonly kind: ClientGatewayTraceStateCallKind;
  readonly key: string;
  readonly siblingKey: string;
  readonly form: "absolute" | "relative" | null;
  readonly reading: ClientGatewayTraceStateAnswerReading;
  /** Where the page was when the call was made: its position and how far relative moves had gone from there. */
  readonly node: string;
  /** Where the page was once the call had settled; `node` unless a successful move or act changed it. */
  readonly nodeAfter: string;
  /** The recorded acts that had succeeded before this call, by entry index. */
  readonly actsBefore: ReadonlySet<number>;
  /** For an act: whether it closed a one-time layer (rule 6). */
  readonly oneTimeLayer: boolean;
};

/** Why a successful recorded act need not be repeated by a Flow: a reducer's receipt for it, or (only when asked for) that it closed a one-time layer. */
export type ClientGatewayTraceStateReceipt = "changed_nothing" | "undone" | "did_not_succeed" | "one_time_layer";

export type ClientGatewayTraceStateRecording = {
  readonly entries: readonly ClientGatewayTraceStateEntry[];
  /** Where the recording began. */
  readonly startNode: string;
  /** Where its last settled call left the page. */
  readonly endNode: string;
  /** The entry whose rows are the recording's result, when any read returned rows: the last that did. */
  readonly resultEntry: number | null;
  /** The recording's result: every row the reads with that entry's input returned, across the pages it read. */
  readonly resultRows: readonly string[];
  /** The node that result was read at, else `endNode`. */
  readonly resultNode: string;
  /** Receipts for the recorded acts that have them, by entry index. */
  readonly receipts: ReadonlyMap<number, ClientGatewayTraceStateReceipt>;
};

export type ClientGatewayTraceStateAnsweredRule =
  | "read_same_state"
  | "read_computed"
  | "page_move"
  | "page_move_recorded_failure"
  | "act"
  | "act_recorded_failure";

/** A gap's nearest recorded call: where to look and what differed, by path. */
export type ClientGatewayTraceStateNearest = {
  readonly entry: number;
  readonly fields: readonly string[];
};

export type ClientGatewayTraceStateAnswer =
  | {
      readonly status: "answered";
      readonly rule: ClientGatewayTraceStateAnsweredRule;
      readonly entry: number;
      /** A recorded dismissal: answered, and marked as maybe gone the next time (rule 6). */
      readonly mayBeGoneNextTime: boolean;
      /** Under `tolerate`: recorded acts in the answering state that this run never did and that have no receipt. */
      readonly skippedActs: number;
      /** The answer computed from recorded rows, in place of the entry's recorded one; `null` when the recorded answer stands. */
      readonly computed: ClientGatewayTraceStateComputedRead | null;
    }
  | {
      readonly status: "gap";
      readonly code: ClientGatewayTraceStateGapCode;
      /** The recorded call this command equals, in a state the rule refused. A report can ask what answering would have said. */
      readonly refusedEntry: number | null;
      readonly nearest: ClientGatewayTraceStateNearest | null;
    };

/**
 * What a walk does with an act the recording holds in the same position after
 * acts this run skipped. `gap`: the study's rule, a read or move there shows what
 * this run did not cause. `tolerate`: answered, with the count on the answer.
 */
export type ClientGatewayTraceStateSkippedActs = "gap" | "tolerate";

export type ClientGatewayTraceStateWalkOptions = {
  readonly skippedActs: ClientGatewayTraceStateSkippedActs;
  /** The recording's own time, handed to the domain's `handleScope`; without it every instant a run names is that run's own. */
  readonly clock?: ClientGatewayTraceStateClockSpan | undefined;
};

export type ClientGatewayTraceStateEndCheck = {
  /** Recorded acts this run used. */
  readonly used: readonly number[];
  /** Successful recorded acts it did not use and that hold a receipt. */
  readonly receipted: readonly number[];
  /** Successful recorded acts it did not use and that hold none: `recorded_act_skipped`. */
  readonly skipped: readonly number[];
  /** Whether the run ended where the recording's result was read, or where the recording itself ended. */
  readonly reachedEnd: boolean;
  /** The rows this run was answered with, by identity, in order of first answer. */
  readonly rows: readonly string[];
  /** Whether it went on after a computed read changed the rows the recording went on from: what followed is not vouched for. */
  readonly afterChangedRows: boolean;
};

export type ClientGatewayTraceStateVerdictValue = "pass" | "fail" | "inconclusive";

/** One of the three assertions a pass needs, and whether a gap left it unknown. */
export type ClientGatewayTraceStateAssertion = {
  readonly id: "recording.same_rows" | "recording.acts_covered" | "recording.reached_end";
  readonly outcome: "satisfied" | "violated" | "unverified";
};

export type ClientGatewayTraceStateVerdict = {
  readonly verdict: ClientGatewayTraceStateVerdictValue;
  readonly assertions: readonly ClientGatewayTraceStateAssertion[];
  /** Why it was not a pass: gap codes, or the assertions it violated. */
  readonly reasons: readonly string[];
};
