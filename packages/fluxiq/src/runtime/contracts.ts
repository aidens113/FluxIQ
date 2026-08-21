import type { JsonObject } from "../core/index.ts";

export type FluxIQRuntimeTransportKind =
  | "direct"
  | "websocket"
  | "native"
  | "worker"
  | "remote"
  | "custom";

export type FluxIQRuntimeCapabilityKind =
  | "recording"
  | "snapshot"
  | "action"
  | "state"
  | "flow"
  | "native-node"
  | "runtime"
  | "custom";

export type FluxIQRuntimeCapability = {
  id: string;
  label?: string;
  kind: FluxIQRuntimeCapabilityKind;
  domainId?: string | null;
  actionTypes?: string[];
  inputIds?: string[];
  outputIds?: string[];
  metadata?: JsonObject;
};

export type FluxIQRuntimeClientStatus =
  | "available"
  | "pairing_required"
  | "ready"
  | "busy"
  | "offline";

export type FluxIQRuntimeClient = {
  clientId: string;
  sessionId?: string;
  label: string;
  transport: FluxIQRuntimeTransportKind;
  status: FluxIQRuntimeClientStatus;
  domainId?: string | null;
  capabilities: FluxIQRuntimeCapability[];
  connectedAt?: number;
  lastSeenAt?: number;
  metadata?: JsonObject;
};

export type FluxIQRuntimeCommandKind =
  | "execute_action"
  | "capture_snapshot"
  | "read_state"
  | "run_flow"
  | "custom";

export type FluxIQRuntimeCommand = {
  commandId?: string;
  kind: FluxIQRuntimeCommandKind;
  domainId?: string | null;
  capabilityId?: string;
  actionType?: string;
  inputId?: string;
  outputId?: string;
  parameters?: JsonObject;
  target?: JsonObject;
  timeoutMs?: number;
  metadata?: JsonObject;
};

export type FluxIQRuntimeCommandStatus =
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "rejected"
  | "unknown";

export type FluxIQRuntimeCommandResult = {
  commandId: string;
  status: FluxIQRuntimeCommandStatus;
  startedAt?: number;
  completedAt?: number;
  message?: string;
  payload?: JsonObject;
  target?: JsonObject;
  error?: string;
  metadata?: JsonObject;
};

export type FluxIQRuntimeRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";

export type FluxIQRuntimeRun = {
  schemaVersion: "0.1";
  runId: string;
  projectId?: string | null;
  domainId?: string | null;
  targetKind: "flow" | "node" | "command" | "recording" | "custom";
  targetId: string;
  status: FluxIQRuntimeRunStatus;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  selectedClientId?: string;
  selectedSessionId?: string;
  transport?: FluxIQRuntimeTransportKind;
  commandIds: string[];
  traceRef?: string;
  metadata?: JsonObject;
};

export type FluxIQRuntimeCommandAttempt = {
  attemptId: string;
  commandId: string;
  runId?: string;
  command: FluxIQRuntimeCommand & { commandId: string };
  status: "dispatched" | FluxIQRuntimeCommandStatus;
  transport?: FluxIQRuntimeTransportKind;
  adapterId?: string;
  clientId?: string;
  sessionId?: string;
  dispatchedAt: number;
  settledAt?: number;
  result?: FluxIQRuntimeCommandResult;
  message?: string;
};

export type FluxIQRuntimeExecutionContext = {
  runId?: string;
  signal?: AbortSignal;
  now?: () => number;
};

export type FluxIQRuntimeDispatchContext = FluxIQRuntimeExecutionContext & {
  preferredClientId?: string;
  preferredSessionId?: string;
};

export type FluxIQRuntimeAdapter = {
  adapterId: string;
  label: string;
  transport: Exclude<FluxIQRuntimeTransportKind, "websocket" | "remote">;
  domainId?: string | null;
  capabilities(): Promise<FluxIQRuntimeCapability[]> | FluxIQRuntimeCapability[];
  canExecute?(command: FluxIQRuntimeCommand): Promise<boolean> | boolean;
  execute(
    command: FluxIQRuntimeCommand,
    context: FluxIQRuntimeExecutionContext
  ): Promise<FluxIQRuntimeCommandResult> | FluxIQRuntimeCommandResult;
  captureSnapshot?(
    command: FluxIQRuntimeCommand,
    context: FluxIQRuntimeExecutionContext
  ): Promise<FluxIQRuntimeCommandResult> | FluxIQRuntimeCommandResult;
  readState?(
    command: FluxIQRuntimeCommand,
    context: FluxIQRuntimeExecutionContext
  ): Promise<FluxIQRuntimeCommandResult> | FluxIQRuntimeCommandResult;
};

export type FluxIQRuntimeTransport = {
  transportId: string;
  label: string;
  kind: Exclude<FluxIQRuntimeTransportKind, "direct" | "native">;
  clients(): FluxIQRuntimeClient[];
  dispatch(
    command: FluxIQRuntimeCommand,
    context: FluxIQRuntimeDispatchContext
  ): Promise<FluxIQRuntimeCommandResult>;
  onEvent(handler: FluxIQRuntimeEventHandler): () => void;
};

export type FluxIQRuntimeEvent =
  | { type: "client.connected"; client: FluxIQRuntimeClient }
  | { type: "client.ready"; client: FluxIQRuntimeClient }
  | { type: "client.disconnected"; client: FluxIQRuntimeClient }
  | { type: "run.queued"; run: FluxIQRuntimeRun }
  | { type: "run.started"; run: FluxIQRuntimeRun }
  | { type: "run.finished"; run: FluxIQRuntimeRun }
  | { type: "command.dispatched"; runId?: string; command: FluxIQRuntimeCommand }
  | { type: "command.result"; runId?: string; result: FluxIQRuntimeCommandResult }
  | { type: "state.update"; client: FluxIQRuntimeClient; payload: JsonObject }
  | { type: "snapshot"; client: FluxIQRuntimeClient; payload: JsonObject }
  | { type: "recording.event"; client: FluxIQRuntimeClient; payload: JsonObject }
  | { type: "runtime.error"; message: string; metadata?: JsonObject };

export type FluxIQRuntimeEventHandler = (
  event: FluxIQRuntimeEvent,
) => void | Promise<void>;

export type FluxIQRuntimeSnapshot = {
  runtimeId: string;
  clients: FluxIQRuntimeClient[];
  adapters: Array<{
    adapterId: string;
    label: string;
    transport: FluxIQRuntimeAdapter["transport"];
    domainId?: string | null;
    capabilities: FluxIQRuntimeCapability[];
  }>;
  transports: Array<{
    transportId: string;
    label: string;
    kind: FluxIQRuntimeTransport["kind"];
    clients: FluxIQRuntimeClient[];
  }>;
  capabilities: FluxIQRuntimeCapability[];
  runs: FluxIQRuntimeRun[];
  commandAttempts: FluxIQRuntimeCommandAttempt[];
};
