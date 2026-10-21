// Types of the client gateway trace matcher (traces and offline trials, P4b):
// what it is built from, the operations it reads out of a trace, what it feeds,
// and the report a trial reads its result from.

import type { ClientGatewayClientHello } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayService } from "../service.ts";
import type { ClientGatewayTraceEvent, ClientGatewayTraceManifest, ClientGatewayTraceStore } from "../trace/index.ts";
import type { CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS } from "./gap-reasons.ts";

export type ClientGatewayTraceMatcherGapReason = (typeof CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS)[number];

/** The trial's clock. Time moves only when the matcher asks it to, by a recorded latency or delta. */
export type ClientGatewayTraceMatcherClock = {
  advance(ms: number): Promise<void>;
};

/** The gateway the matcher's session is attached to and feeds. */
export type ClientGatewayTraceMatcherGateway = Pick<ClientGatewayService, "attachScopedSession" | "receiveRaw" | "receiveTraceArtifact">;

export type ClientGatewayTraceMatcherInput = {
  store: ClientGatewayTraceStore;
  traceId: string;
  gateway: ClientGatewayTraceMatcherGateway;
  clock: ClientGatewayTraceMatcherClock;
  /** The contract versions this reader speaks; each must equal the version the trace recorded. */
  contractVersions: Readonly<Record<string, string>>;
  /** The trace's reference to the session the matcher stands in for. Default: the one session the recorded operations went to. */
  sessionRef?: string;
};

/** An external call, as the matcher compares it (`./operation/fields.ts`). */
export type ClientGatewayTraceOperation = {
  readonly actionType: string;
  readonly compared: { readonly actionType: string; readonly target: unknown; readonly parameters: unknown };
  /** The canonical JSON of `compared`: equal keys are equal operations. */
  readonly key: string;
};

/** A recorded `server.execute_action`: the operation, where the trace delivered it, and the command id it went out with. */
export type ClientGatewayTraceRecordedOperation = ClientGatewayTraceOperation & {
  readonly sequence: number;
  readonly logicalMs: number;
  readonly commandId: string;
  readonly session: string | undefined;
  /** Whether a field of the recorded message was withheld at capture. */
  readonly redacted: boolean;
};

/**
 * One recorded event the matcher hands the gateway once its point is reached:
 * an inbound message, an uploaded artifact, or the point where Core's own answer
 * wait ran out for a command (`deadline`: nothing is fed, the clock is moved
 * past it). `atMs` is the logical time the clock is moved to before it.
 */
export type ClientGatewayTraceMatcherDelivery = {
  readonly kind: "input" | "artifact" | "deadline";
  readonly event: ClientGatewayTraceEvent;
  readonly atMs: number;
};

/** What the trace delivers before the first recorded operation, and after each one up to the next. */
export type ClientGatewayTraceMatcherDeliveries = {
  readonly opening: readonly ClientGatewayTraceMatcherDelivery[];
  readonly segments: readonly (readonly ClientGatewayTraceMatcherDelivery[])[];
};

/** Why a trace cannot be matched against at all. */
export type ClientGatewayTraceMatcherRefusal = {
  readonly reason: ClientGatewayTraceMatcherGapReason;
  readonly detail: string;
};

/** A trace read and judged for matching: refused, or its operations and deliveries for one session. */
export type ClientGatewayTraceMatcherAdmission = {
  readonly manifest: ClientGatewayTraceManifest | null;
  readonly refusal: ClientGatewayTraceMatcherRefusal | null;
  readonly sessionRef: string | null;
  /** The session's public view as the trace recorded it when it first claimed the session; `null` without that record. */
  readonly claimedView: ClientGatewayClientHello | null;
  readonly operations: readonly ClientGatewayTraceRecordedOperation[];
  readonly deliveries: ClientGatewayTraceMatcherDeliveries;
};

/**
 * The public view the matcher's session is attached with, and where it came
 * from: `recorded`, the view the trace took when it first claimed the session
 * (`session.claimed`); `supplied`, a view the caller handed in for a trace
 * that recorded none (in a build, the live session's public view for the same
 * client). A supplied view never stands in for a recorded one.
 */
export type ClientGatewayTraceMatcherSessionView = {
  readonly source: "recorded" | "supplied";
  readonly view: ClientGatewayClientHello;
};

/** The outcome of comparing one command with the trace at the cursor. */
export type ClientGatewayTraceOperationMatch =
  | { readonly status: "matched"; readonly recorded: ClientGatewayTraceRecordedOperation }
  | {
      readonly status: "gap";
      readonly reason: ClientGatewayTraceMatcherGapReason;
      readonly cause: "mismatch" | "past_recorded_end";
      readonly fields: readonly string[];
      readonly recordedSequence: number | null;
    };

/** A command answered from the trace. `ordinal`: its place among the commands the matcher was sent, from 1. */
export type ClientGatewayTraceMatchedOperation = {
  readonly ordinal: number;
  readonly commandId: string;
  readonly recordedCommandId: string;
  readonly recordedSequence: number;
  readonly actionType: string;
};

/**
 * An evidence gap: a command answered with one, or a recorded event or artifact
 * that could not be read or fed. `fields` names what differed from the
 * recorded operation it was compared with, by path, never by value.
 * `cause`: the trace was refused, the command differed from the next recorded
 * operation, it came past the recorded end, it came after an earlier gap, the
 * trace's answer to it could not be read back, or (`failed_delivery`) a
 * recorded event delivered after it could not be read or fed: then the
 * ordinal, command id and action type are the matched command's (0, "" and ""
 * before the first), and `recordedSequence` is the event's.
 */
export type ClientGatewayTraceMatcherGap = {
  readonly ordinal: number;
  readonly commandId: string;
  readonly actionType: string;
  readonly reason: ClientGatewayTraceMatcherGapReason;
  readonly cause: "refused_trace" | "mismatch" | "past_recorded_end" | "after_gap" | "unreadable_answer" | "failed_delivery";
  readonly fields: readonly string[];
  readonly recordedSequence: number | null;
};

/** What a trial reads from the matcher for its result. */
export type ClientGatewayTraceMatcherReport = {
  readonly traceId: string;
  /** The live episode the trace recorded; `null` when the store holds no manifest. */
  readonly sourceEpisodeId: string | null;
  readonly refusal: ClientGatewayTraceMatcherRefusal | null;
  readonly recordedOperations: number;
  readonly matchedOperations: readonly ClientGatewayTraceMatchedOperation[];
  readonly gaps: readonly ClientGatewayTraceMatcherGap[];
  /** The recorded sequences handed to the gateway, in the order they were handed. */
  readonly deliveredSequences: readonly number[];
  /**
   * Notes of what the gateway would not take of what it was handed (as it may
   * not have for the original), and the messages of matcher failures (each
   * also a gap). A recorded event or artifact that could not be read or fed is
   * a gap, never only a note here.
   */
  readonly refusedDeliveries: readonly string[];
  /** Types of server messages the matcher was sent and does not answer (anything but an action command or a reconcile question). */
  readonly unansweredMessageTypes: readonly string[];
};
