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

export type ClientGatewayActionResult = {
  commandId: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled" | "unknown";
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

/**
 * The capability a client advertises to receive `server.activity`. Core sends
 * the activity stream only to ready sessions that declared it.
 */
export const CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID = "fluxiq.activity";

/** What FluxIQ is doing now. Each value is set only by a real Core event. */
export type ClientGatewayActivityPhase =
  | "thinking"
  | "exploring"
  | "building"
  | "running"
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
 * One activity event: the current status of one unit of work (a build or a
 * run) plus an optional detail row for the chat stream. Bounded, and
 * content-free beyond what the person's own panel already shows: labels and
 * titles are Core's own sentences, the actions a step's own input names, tool
 * and node ids, and authored step labels; never raw evidence a tool gathered,
 * tokens or secrets. A `thought` row's `text` is the model's own stated reason
 * for that step (what it does next, on what, and why) or its diagnosis or
 * verdict, whitespace-collapsed, with token-shaped runs hidden, and bounded
 * (240 characters for a decision's reason). Core truncates `label` to 160
 * characters, `detail.title` to 160 and `detail.text` to 1,000.
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
  step?: { index: number; count: number; nodeId?: string; label?: string };
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
  | ClientGatewayEnvelope<"client.action_result", ClientGatewayActionResult>
  | ClientGatewayEnvelope<"client.error", { message: string; code?: string; metadata?: JsonObject }>;

export type ClientGatewayServerMessage =
  | ClientGatewayEnvelope<"server.pairing_required", { referenceCode?: string; reason: string }>
  | ClientGatewayEnvelope<"server.session_ready", { sessionId: string; token: string; projectId?: string | null }>
  | ClientGatewayEnvelope<"server.start_recording", { recordingId: string; projectId?: string | null; taskId?: string; domainId?: string }>
  | ClientGatewayEnvelope<"server.stop_recording", { recordingId?: string }>
  | ClientGatewayEnvelope<"server.capture_snapshot", { kind?: string; metadata?: JsonObject }>
  | ClientGatewayEnvelope<"server.execute_action", ClientGatewayActionCommand & { commandId: string }>
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
