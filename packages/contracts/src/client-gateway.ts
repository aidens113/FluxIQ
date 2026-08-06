import type { JsonObject, JsonValue } from "./core.js";

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
  metadata?: JsonObject;
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
