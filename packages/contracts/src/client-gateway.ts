import type { JsonObject, JsonValue } from "./core.js";
import type { AutomationStudioFailureRecord } from "./failure/index.js";

export const CLIENT_GATEWAY_PROTOCOL_VERSION = "0.1";

export type ClientGatewayClientType =
  | "extension"
  | "desktop-recorder"
  | "cli"
  | "worker"
  | "custom";

export type ClientGatewaySessionStatus =
  | "connected"
  | "pairing_required"
  | "ready"
  | "disconnected";

export type ClientGatewayCapability = {
  id: string;
  label?: string;
  kind: "recording" | "snapshot" | "action" | "state" | "runtime" | "custom";
  actionTypes?: string[];
  metadata?: JsonObject;
};

export type ClientGatewayClientHello = {
  clientId?: string;
  clientType: ClientGatewayClientType;
  name?: string;
  version?: string;
  token?: string;
  capabilities?: ClientGatewayCapability[];
  metadata?: JsonObject;
};

export type ClientGatewayStateUpdate = {
  activeContextId?: string;
  contexts?: JsonObject[];
  state?: JsonObject;
  recording?: boolean;
  metadata?: JsonObject;
};

export type ClientGatewayRecordingEvent = {
  eventId?: string;
  recordingId?: string;
  domainId?: string;
  eventType: string;
  timestamp?: number;
  sourceId?: string;
  target?: JsonObject;
  payload?: JsonObject;
  metadata?: JsonObject;
};

export type ClientGatewayStartRecordingRequest = {
  projectId?: string | null;
  recordingId: string;
  taskId?: string;
  startedAt?: number;
  domainId?: string | null;
  initialState?: JsonObject;
  environment?: JsonObject;
  sources?: JsonObject[];
  actionChannels?: JsonObject[];
  metadata?: JsonObject;
};

export type ClientGatewayStopRecordingRequest = {
  projectId?: string | null;
  recordingId: string;
  endedAt?: number;
};

export type ClientGatewayAppendRecordingEntryRequest = {
  projectId?: string | null;
  recordingId: string;
  entry: JsonObject;
};

export type ClientGatewaySnapshot = {
  snapshotId?: string;
  timestamp?: number;
  kind: "state" | "structured" | "image" | "binary" | "custom";
  state?: JsonObject;
  payload?: JsonObject;
  metadata?: JsonObject;
};

export type ClientGatewayActionCommand = {
  actionType: string;
  parameters?: JsonObject;
  target?: JsonObject;
  timeoutMs?: number;
  metadata?: JsonObject;
};

/**
 * What an action ended as, once Core has read it. `unknown` is an act that may
 * have landed with its answer missing; a missing answer is never a failure that
 * did nothing.
 */
export type ClientGatewayActionResultStatus = "succeeded" | "failed" | "timed_out" | "cancelled" | "unknown";

/**
 * The statuses a client may report for an action, in order of the wire:
 * Core's own five, plus `interrupted` -- the client lost the command in flight
 * (its background worker stopped, or its channel to the page closed) and does
 * not know whether the act happened.
 *
 * Core reads `interrupted` the way it reads the wire status a client sent
 * before it existed (state-aware recovery plan, C8 and B3): a committing act is
 * `unknown`, its outcome uncertain (`effect: "ambiguous"`), and every other act
 * is `failed` having done nothing (`effect: "unacted"`). Which acts commit is
 * the domain's fact, so Core takes it from the result's `failure.effect`: only
 * a record stating `unacted` makes it a failure, and a result that states
 * nothing is held uncertain. A client built earlier sends `unknown` or `failed`
 * with `payload.status: "interrupted"`, which Core still accepts and records as
 * interrupted.
 */
export const CLIENT_GATEWAY_REPORTED_ACTION_STATUSES = Object.freeze(["succeeded", "failed", "timed_out", "cancelled", "unknown", "interrupted"] as const);
export type ClientGatewayReportedActionStatus = (typeof CLIENT_GATEWAY_REPORTED_ACTION_STATUSES)[number];

/**
 * An action result as Core hands it to the caller that dispatched the command.
 * A client's `interrupted` has already been read into `unknown` or `failed`
 * (see `ClientGatewayReportedActionResult`), so no caller meets it.
 */
export type ClientGatewayActionResult = {
  commandId: string;
  status: ClientGatewayActionResultStatus;
  startedAt?: number;
  completedAt?: number;
  message?: string;
  target?: JsonObject;
  payload?: JsonObject;
  error?: string;
  /** A target wait that cleared without a person, in whole milliseconds; independent of action status. */
  clearedWait?: { waitedMs: number };
  /** Structured failure the client reports; the runtime keeps it only when `parseAutomationStudioFailureRecord` accepts it. */
  failure?: AutomationStudioFailureRecord;
  metadata?: JsonObject;
};

/** An action result as a client sends it: Core's result, whose status may also be `interrupted`. */
export type ClientGatewayReportedActionResult = Omit<ClientGatewayActionResult, "status"> & { status: ClientGatewayReportedActionStatus };

/**
 * What became of one command, as the client that was sent it answers
 * `server.reconcile_command` (state-aware recovery plan, C8 and B3). The client
 * answers from what it kept and never by acting:
 *
 * - `landed`: the command finished there; `result` is the result it kept, the
 *   one whose delivery was lost;
 * - `not_seen`: the client has no record of that id, so the act never reached
 *   it and making it again is not a second act. A client that answers this
 *   refuses the id from then on, so a copy still on its way cannot act later;
 * - `running`: the command is still being carried out;
 * - `unknown`: the client cannot say -- for example its record was cleared by a
 *   restart before a result was kept. Core never makes the act again on it.
 */
export const CLIENT_GATEWAY_RECONCILE_STATES = Object.freeze(["landed", "not_seen", "running", "unknown"] as const);
export type ClientGatewayReconcileState = (typeof CLIENT_GATEWAY_RECONCILE_STATES)[number];

/**
 * The capability metadata field a client sets to `true` to say it answers
 * `server.reconcile_command`. Core asks only a session that declared it, on
 * any capability; a session that did not is never asked, and a lost reply to
 * it keeps the outcome it had (`timed_out`).
 */
export const CLIENT_GATEWAY_RECONCILE_ANSWER_METADATA_KEY = "answersReconcile";

/** Core asking a client what became of a command it sent: answered, never executed. */
export type ClientGatewayReconcileRequest = { commandId: string };

/** A client's answer to `server.reconcile_command`. `result` is present only on `landed`. */
export type ClientGatewayReconcileAnswer = {
  commandId: string;
  state: ClientGatewayReconcileState;
  result?: ClientGatewayReportedActionResult;
};

/**
 * The capability a client advertises to receive `server.activity`. Core sends
 * the activity stream only to ready sessions that declared it.
 */
export const CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID = "fluxiq.activity";

/**
 * What FluxIQ is doing now. Each value is set only by a real Core event.
 *
 * `paused` is a run held at a step boundary because it was paused, usually
 * because the person took the page (Take over): nothing is dispatched to the
 * page until it is resumed or stopped. Core sends it once when the run holds,
 * with `step` naming the node the run will execute first, and once more as
 * `running` when the run is let go to continue. A held run that is stopped
 * ends through the ordinary final event instead.
 */
export type ClientGatewayActivityPhase =
  | "thinking"
  | "exploring"
  | "building"
  | "running"
  | "paused"
  | "extracting"
  | "verifying"
  | "repairing"
  | "waiting_permission"
  | "done"
  | "failed";

/**
 * How a wait on the person ended, on the `ask` row that says so:
 *
 * - `answered`: the person answered (a robot check's Continue, a choice, words);
 * - `allowed`: the person granted a permission ask;
 * - `waited_out`: a check that clears by itself cleared while Core waited;
 * - `declined`: the person refused, or pressed Stop at a robot check;
 * - `timed_out`: nobody answered in time;
 * - `cancelled`: the work stopped before anyone answered -- it was cancelled
 *   or failed while it waited, or the question could no longer be read.
 */
export const CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS = Object.freeze(["waited_out", "answered", "allowed", "declined", "timed_out", "cancelled"] as const);
export type ClientGatewayActivityResolution = (typeof CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS)[number];

/**
 * What kind of recovery a `step` row's `recovery` reports (state-aware
 * recovery plan, C11):
 *
 * - `handler`: a lifecycle handler ran (On Start, On Before, On Retry, On Fail,
 *   On Before Next);
 * - `entry`: a frame began at an alternative entry rather than its Start node;
 * - `route`: the run moved to a checkpoint, or state routing moved it to the
 *   node the page is at;
 * - `alternative`: a known alternative path or recovery Subflow was tried;
 * - `interference`: the client closed a layer the page put over itself (a
 *   notice, a promotion, a consent banner) by its dismiss control while the
 *   step ran. Its `subject` is Core's own words by layer kind, never the
 *   control's words or other page text.
 *
 * Additive: a client that does not know a kind reads the row as a plain step.
 */
export const CLIENT_GATEWAY_ACTIVITY_RECOVERY_KINDS = Object.freeze(["handler", "entry", "route", "alternative", "interference"] as const);
export type ClientGatewayActivityRecoveryKind = (typeof CLIENT_GATEWAY_ACTIVITY_RECOVERY_KINDS)[number];

/** How a recovery ended: it moved the run on, it failed, or a guard or budget refused it before it ran. */
export const CLIENT_GATEWAY_ACTIVITY_RECOVERY_OUTCOMES = Object.freeze(["succeeded", "failed", "refused"] as const);
export type ClientGatewayActivityRecoveryOutcome = (typeof CLIENT_GATEWAY_ACTIVITY_RECOVERY_OUTCOMES)[number];

/** The lifecycle boundaries a handler fires at (C3), as a `handler` recovery names them. */
export const CLIENT_GATEWAY_ACTIVITY_RECOVERY_EVENTS = Object.freeze(["start", "before", "retry", "fail", "before_next"] as const);
export type ClientGatewayActivityRecoveryEvent = (typeof CLIENT_GATEWAY_ACTIVITY_RECOVERY_EVENTS)[number];

/**
 * The recovery a `step` row reports, so a client renders its card from closed
 * fields rather than parsing Core's sentence. `subject` is the plain words the
 * card shows ("Dismiss the sign-in popup"): an authored label or Core's own
 * words, never page data. `event` is set on a `handler` recovery; `targetId`
 * is the checkpoint, entry, node or Subflow it led to, when there is one.
 */
export type ClientGatewayActivityRecovery = {
  kind: ClientGatewayActivityRecoveryKind;
  subject: string;
  outcome: ClientGatewayActivityRecoveryOutcome;
  event?: ClientGatewayActivityRecoveryEvent;
  targetId?: string;
};

/**
 * Why a run step was skipped rather than run, on the `step` row that says so:
 *
 * - `already_done`: the run already completed the step's lasting act for the
 *   same row, so it was not done again (the executor's completed-act ledger);
 * - `optional_absent`: a sometimes-present step whose target was not shown;
 * - `state_routed`: the page was elsewhere, so state routing passed the step
 *   over and the run went on at the step the page is at.
 *
 * Additive: a client that does not know a reason reads the row as a plain step.
 */
export const CLIENT_GATEWAY_ACTIVITY_SKIP_REASONS = Object.freeze(["already_done", "optional_absent", "state_routed"] as const);
export type ClientGatewayActivitySkipReason = (typeof CLIENT_GATEWAY_ACTIVITY_SKIP_REASONS)[number];

/**
 * The skip a `step` row reports, so a client draws its card from a closed
 * field rather than from the row's shape or Core's sentence. `subject` is the
 * plain words naming what was skipped: the list row's label ("Lin Zhao") or the
 * step's authored label, never other page data.
 */
export type ClientGatewayActivitySkip = {
  reason: ClientGatewayActivitySkipReason;
  subject?: string;
};

/**
 * One activity event: the current status of one unit of work (a build or a
 * run) plus an optional detail row for the chat stream. Bounded, and
 * content-free beyond what the person's own panel already shows: labels and
 * titles are Core's own sentences, the actions a step's own input names, tool
 * and node ids, and authored step labels; never raw evidence a tool gathered,
 * tokens or secrets. A `thought` row's `text` is the model's own stated reason
 * for that step (what it does next, on what, and why) or its diagnosis or
 * verdict, whitespace-collapsed, with token-shaped runs hidden, and bounded
 * (240 characters for a decision's reason). Core truncates `label` to 160
 * characters, `detail.title` to 160, `detail.recovery.subject` and
 * `detail.skipped.subject` to 160 and
 * `detail.text` to 1,000.
 *
 * A wait on the person is one `ask` row pair for one card. The wait opens as
 * `phase: "waiting_permission"`, `detail: { kind: "ask", ref: <askId>,
 * status: "started" }`. When it is settled, Core sends one more `ask` row for
 * the same unit of work with the same `ref` and `title`, the phase the work
 * returns to, `status` `succeeded` (answered, allowed, waited out) or `failed`
 * (declined, timed out, cancelled), `resolution`, and `text`, a sentence such
 * as "You pressed Continue.". A client marks the card from that row alone and
 * never infers the answer from later events. Every wait Core announced gets
 * that row, including one whose work stopped first (`cancelled`); a wait Core
 * never announced is never resolved. A run parked durably is still waiting
 * until it is resumed.
 */
export type ClientGatewayActivity = {
  /** Stable id of the unit of work this event belongs to. */
  activityId: string;
  /** Strictly increasing per Core process, so a client can drop stale events. */
  sequence: number;
  subject: { kind: "build" | "run"; id: string; projectId: string; flowId?: string };
  phase: ClientGatewayActivityPhase;
  /** Core's one-line status sentence, e.g. "Running step 2 of 5". */
  label: string;
  step?: {
    index: number;
    count: number;
    nodeId?: string;
    label?: string;
    /**
     * On a step a list loop's pass runs: that pass's row as a person reads it
     * ("Jonas Weber"), so a card can say "Confirm · Jonas Weber". Optional; a
     * client that does not know it ignores it.
     */
    row?: string;
  };
  /** A row for the chat stream; absent for a pure status change. */
  detail?: {
    kind: "thought" | "tool" | "step" | "check" | "ask" | "note";
    title: string;
    text?: string;
    status?: "started" | "succeeded" | "failed";
    /** Tool or node id the row describes, when there is one; an `ask` row's ask id. */
    ref?: string;
    /**
     * On the `ask` row that settles a wait: how it ended. Optional, so a client
     * that does not know it reads the row by `status` alone.
     */
    resolution?: ClientGatewayActivityResolution;
    /**
     * On a `step` row only: the recovery the row reports (a handler that ran,
     * an alternative entry, a route, an alternative path, a layer the client
     * closed). Optional and
     * additive; a client that does not know it reads the row as a plain step.
     */
    recovery?: ClientGatewayActivityRecovery;
    /**
     * On a `step` row only: the step was skipped rather than run, and why.
     * Optional and additive; a client that does not know it reads the row as a
     * plain step that succeeded.
     */
    skipped?: ClientGatewayActivitySkip;
  };
  /** The conversation this work speaks through, when it has one. */
  conversationId?: string;
  /**
   * The person's own words for what this work was asked to do: a build's
   * instruction, on the event that says the build has it. A chat shows it as
   * the person's message where its thread does not already hold it, so what
   * was asked is on screen however the build was started. Absent on every
   * other event.
   */
  request?: string;
  /** True on the last event of the unit of work (`done` or `failed`). */
  final?: boolean;
  /**
   * True only on the final event of work a person or caller cancelled (Stop
   * on a run or a build), set from the cancellation itself and never from the
   * label. Absent on every other event, so a client says "stopped" rather than
   * "failed" by reading this field, not Core's words.
   */
  stopped?: true;
  /** ISO timestamp. */
  at: string;
};

export type ClientGatewayPairingChallenge = {
  pairingCode: string;
  referenceCode?: string;
  projectId?: string | null;
  userId?: string;
  requestedAt?: number;
  requestedBySessionId?: string;
  requestedByClientId?: string;
  requestedByClientName?: string;
  expiresAt: number;
  consumedAt?: number;
  sessionId?: string;
};

export type ClientGatewaySession = {
  sessionId: string;
  clientId: string;
  clientType: ClientGatewayClientType;
  name: string;
  version?: string;
  status: ClientGatewaySessionStatus;
  connectedAt: number;
  lastSeenAt: number;
  pairedAt?: number;
  disconnectedAt?: number;
  trustedClientId?: string;
  operatorUserId?: string;
  projectId?: string | null;
  activeRecordingId?: string | null;
  capabilities: ClientGatewayCapability[];
  stateUpdate?: ClientGatewayStateUpdate;
  metadata?: JsonObject;
};

export type ClientGatewayTrustedClient = {
  trustedClientId: string;
  clientId: string;
  clientType: ClientGatewayClientType;
  name: string;
  tokenHash: string;
  approvedByUserId: string;
  /**
   * The domain the client declared (`client.hello` `metadata.domainId`) when
   * the person approved it, or null for none. A later connection declaring
   * another domain is not resumed and must be approved again. Absent on trust
   * minted before the domain was bound, which therefore needs a new approval.
   */
  domainId?: string | null;
  approvedAt: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  expiresAt: number;
  revokedAt?: number;
  revocationReason?: string;
};

export type ClientGatewayTrustedClientView = Omit<ClientGatewayTrustedClient, "tokenHash"> & {
  status: "active" | "expired" | "revoked";
};

export type ClientGatewayAuditEntry = {
  id: string;
  timestamp: number;
  sessionId?: string;
  type: string;
  message: string;
  metadata?: JsonObject;
};

export type ClientGatewayEnvelope<TType extends string = string, TPayload = unknown> = {
  id: string;
  type: TType;
  protocolVersion: string;
  timestamp: number;
  sessionId?: string;
  clientId?: string;
  correlationId?: string;
  payload: TPayload;
};

export type ClientGatewayClientMessage =
  | ClientGatewayEnvelope<"client.hello", ClientGatewayClientHello>
  // Deprecated compatibility path. New clients wait for web-panel approval.
  | ClientGatewayEnvelope<"client.pairing_submit", { pairingCode: string }>
  | ClientGatewayEnvelope<"client.capabilities", { capabilities: ClientGatewayCapability[] }>
  | ClientGatewayEnvelope<"client.state_update", ClientGatewayStateUpdate>
  | ClientGatewayEnvelope<"client.start_recording", ClientGatewayStartRecordingRequest>
  | ClientGatewayEnvelope<"client.stop_recording", ClientGatewayStopRecordingRequest>
  | ClientGatewayEnvelope<"client.recording_entry", ClientGatewayAppendRecordingEntryRequest>
  | ClientGatewayEnvelope<"client.recording_event", ClientGatewayRecordingEvent>
  | ClientGatewayEnvelope<"client.snapshot", ClientGatewaySnapshot>
  | ClientGatewayEnvelope<"client.action_result", ClientGatewayReportedActionResult>
  | ClientGatewayEnvelope<"client.reconcile_result", ClientGatewayReconcileAnswer>
  | ClientGatewayEnvelope<"client.error", { message: string; code?: string; metadata?: JsonObject }>;

export type ClientGatewayServerMessage =
  | ClientGatewayEnvelope<"server.pairing_required", { referenceCode?: string; reason: string }>
  | ClientGatewayEnvelope<"server.session_ready", { sessionId: string; token: string; projectId?: string | null }>
  | ClientGatewayEnvelope<"server.start_recording", { recordingId: string; projectId?: string | null; taskId?: string; domainId?: string }>
  | ClientGatewayEnvelope<"server.stop_recording", { recordingId?: string }>
  | ClientGatewayEnvelope<"server.capture_snapshot", { kind?: string; metadata?: JsonObject }>
  | ClientGatewayEnvelope<"server.execute_action", ClientGatewayActionCommand & { commandId: string }>
  | ClientGatewayEnvelope<"server.reconcile_command", ClientGatewayReconcileRequest>
  | ClientGatewayEnvelope<"server.set_active_tab", { tabId: string }>
  | ClientGatewayEnvelope<"server.activity", ClientGatewayActivity>
  | ClientGatewayEnvelope<"server.ping", { nonce: string }>
  | ClientGatewayEnvelope<"server.disconnect", { reason: string }>
  | ClientGatewayEnvelope<"server.error", { message: string; code?: string; metadata?: JsonObject }>;

export type ClientGatewaySnapshotView = {
  enabled: boolean;
  publicUrl?: string;
  sessions: ClientGatewaySession[];
  pairings: ClientGatewayPairingChallenge[];
  trustedClients: ClientGatewayTrustedClientView[];
  auditLog: ClientGatewayAuditEntry[];
};

export type ClientGatewaySocket = {
  send(message: string): void | Promise<void>;
  close?(code?: number, reason?: string): void | Promise<void>;
};

export type ClientGatewayEvent =
  | { type: "session.ready"; session: ClientGatewaySession }
  | { type: "session.disconnected"; session: ClientGatewaySession }
  | { type: "client.state_update"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.state_update", ClientGatewayStateUpdate> }
  | { type: "client.start_recording"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.start_recording", ClientGatewayStartRecordingRequest> }
  | { type: "client.stop_recording"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.stop_recording", ClientGatewayStopRecordingRequest> }
  | { type: "client.recording_entry"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.recording_entry", ClientGatewayAppendRecordingEntryRequest> }
  | { type: "client.recording_event"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.recording_event", ClientGatewayRecordingEvent> }
  | { type: "client.snapshot"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.snapshot", ClientGatewaySnapshot> }
  | { type: "client.action_result"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.action_result", ClientGatewayActionResult> }
  | { type: "client.error"; session: ClientGatewaySession; message: ClientGatewayEnvelope<"client.error", { message: string; code?: string; metadata?: JsonObject }> };

export type ClientGatewayEventHandler = (event: ClientGatewayEvent) => void | Promise<void>;

export type ClientGatewayActionResponse = {
  commandId: string;
  message: ClientGatewayServerMessage;
  result: Promise<ClientGatewayActionResult>;
};

export type ClientGatewayUnknownPayload = JsonObject | JsonValue[] | string | number | boolean | null;
