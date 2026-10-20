// Types of the client gateway trace replay (traces and offline trials, P3):
// what a replay is given, and the parity report it answers with.

import type { ClientGatewayClientHello } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayTraceEvent, ClientGatewayTraceEventKind, ClientGatewayTraceManifest, ClientGatewayTraceStore } from "../trace/index.ts";
import type { CLIENT_GATEWAY_TRACE_PARITY_CLASSES } from "./parity-classes.ts";

/** What a replay reads and how it is run. */
export type ClientGatewayTraceReplayInput = {
  store: ClientGatewayTraceStore;
  traceId: string;
  /**
   * The answer wait the original gateway was configured with
   * (`ClientGatewayServiceOptions.commandTimeoutMs`), for commands that named
   * none. Unset: read from the trace's own answer-never-came outcomes, else
   * the gateway's default.
   */
  commandTimeoutMs?: number;
  /** Event-loop turns without a new replay event before a step counts as settled. Default 3. */
  quietTurns?: number;
};

/**
 * Why a delivery point diverged. `capture_gap`: the trace lacks something the
 * replay needs. `nondeterminism`: an id or time Core minted, or the order of
 * concurrent handling. `intake_defect`: the same input, a different derivation.
 */
export type ClientGatewayTraceParityClass = (typeof CLIENT_GATEWAY_TRACE_PARITY_CLASSES)[number];

/** One delivery point that did not match. */
export type ClientGatewayTraceParityDivergence = {
  /** The original event's sequence; `null` for an event only the replay has. */
  readonly sequence: number | null;
  /** The replay's counterpart; `null` when it has none. */
  readonly replaySequence: number | null;
  readonly kind: ClientGatewayTraceEventKind | null;
  readonly messageType: string | null;
  readonly class: ClientGatewayTraceParityClass;
  /** The fields that differ (`payload.value.delivered.result`); `event` when one side has no event at all. */
  readonly fields: readonly string[];
  readonly detail: string;
};

/** Each original sequence: matched, diverged, or outside gateway parity (an input that bypassed the gateway). */
export type ClientGatewayTraceParityEntry = {
  readonly sequence: number;
  readonly kind: ClientGatewayTraceEventKind | null;
  readonly messageType: string | null;
  readonly status: "matched" | "diverged" | "outside";
  readonly replaySequence: number | null;
};

/** A field left out of the comparison, and why it cannot carry what Core derived. */
export type ClientGatewayTraceParityNormalization = {
  readonly field: string;
  readonly reason: string;
};

/**
 * Whether the trace's events say which session they belong to. `recorded`:
 * every event that belongs to a session names its reference (or none belongs
 * to one). A trace captured before the tap gave events a session reference is
 * legacy: `single_session` when the trace itself shows it held one session
 * (`checks`, each a fixed sentence), so the replay attached that session's
 * reference to its events as a declared normalization; `refused` when it
 * cannot be shown (`reason`, a fixed sentence), so every event without a
 * reference is a capture gap.
 */
export type ClientGatewayTraceSessionReferences =
  | { readonly status: "recorded" }
  | { readonly status: "single_session"; readonly checks: readonly string[] }
  | { readonly status: "refused"; readonly reason: string };

export type ClientGatewayTraceParityReport = {
  readonly traceId: string;
  /** `matched` only when every delivery point matched. */
  readonly verdict: "matched" | "diverged";
  /** How the trace's events name their sessions, and what the replay did about a legacy trace's missing references. */
  readonly sessionReferences: ClientGatewayTraceSessionReferences;
  readonly entries: readonly ClientGatewayTraceParityEntry[];
  readonly divergences: readonly ClientGatewayTraceParityDivergence[];
  readonly normalizations: readonly ClientGatewayTraceParityNormalization[];
  /** How the replay differs from live intake by construction. */
  readonly declaredDifferences: readonly string[];
  /** The replay's own capture: a derived trace, never live evidence. */
  readonly replayEvents: readonly ClientGatewayTraceEvent[];
};

/** A session the trace met, as the original recorded it. */
export type ClientGatewayTraceRecordedSession = {
  /** The trace's opaque reference to it (`ClientGatewayTraceEvent.session`). */
  readonly ref: string;
  /** Its session id as the original's messages named it, or `null` when none did. */
  readonly sessionId: string | null;
  readonly clientId: string | null;
  /** Whether the trace saw it connect, so the replay connects it at that point. */
  readonly connectedInTrace: boolean;
  /** Its capabilities when the trace says what they were; `null` when it does not. */
  readonly capabilities: readonly unknown[] | null;
  /**
   * Its public view as the trace recorded it when it first claimed the session
   * (`session.claimed`, D23), as the hello a replay attaches it with (no client
   * id, no token); `null` for a trace without that record (older traces).
   */
  readonly claimedView: ClientGatewayClientHello | null;
};

/** What the replay noted it could not feed, by original sequence, session reference or command id. */
export type ClientGatewayTraceReplayGaps = {
  readonly events: ReadonlyMap<number, string>;
  readonly sessions: ReadonlyMap<string, string>;
  readonly commands: ReadonlyMap<string, string>;
};

/** What a walk through a trace produced, for the comparison. */
export type ClientGatewayTraceReplayOutcome = {
  readonly replayEvents: readonly ClientGatewayTraceEvent[];
  /** Original event id to its alignment key. */
  readonly originalKeys: ReadonlyMap<string, string>;
  /** Replay event id to its alignment key. */
  readonly replayKeys: ReadonlyMap<string, string>;
  readonly gaps: ClientGatewayTraceReplayGaps;
  /** Original sequences whose input the replay fed as a stand-in (an unparsed message). */
  readonly standIns: ReadonlySet<number>;
  /** What went wrong in the replay itself, outside any one event. */
  readonly failures: readonly string[];
  /** Original sequences the replayed gateway refused to re-issue, and why. */
  readonly issueFailures: ReadonlyMap<number, string>;
  /** A replay session id to the recorded one it stands for. */
  readonly sessionIds: ReadonlyMap<string, string>;
  /** The manifest the replay's own recorder closed with. */
  readonly replayManifest: ClientGatewayTraceManifest;
};
