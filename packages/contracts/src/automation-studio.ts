import type { JsonObject, JsonValue } from "./core.js";

export type AutomationStudioSchemaVersion = "0.1";
export type StateValueType = "string" | "number" | "integer" | "boolean" | "point" | "rectangle" | "entity_ref" | "entity_ref_list" | "hash" | "json" | "unknown";
export type StateVolatility = "static" | "slow" | "normal" | "rapid";
export type StateElementKind = "text" | "static_id" | "internal_id" | "selector" | "label" | "status" | "route" | "url" | "visibility" | "enabled" | "count" | "position" | "bounds" | "collection" | "json" | "unknown";
export type StateNamespaceId = "app" | "runtime" | "user" | "environment" | "recording" | "custom" | (string & {});

export type SignalProvenance = {
  extractorId: string;
  extractorVersion: string;
  inputs: string[];
  computationHash?: string;
};

export type StateValue<T = unknown> = {
  type: StateValueType;
  value: T;
  observedAt: number;
  sourceId?: string;
  confidence?: number;
  volatility?: StateVolatility;
  semanticRole?: string;
  comparable?: boolean;
  sensitive?: boolean;
  provenance?: SignalProvenance;
  metadata?: JsonObject;
};

export type StateNamespace = {
  schemaId: string;
  schemaVersion: string;
  values: Record<string, StateValue>;
  metadata?: JsonObject;
};

export type StateSnapshot = {
  timestamp: number;
  namespaces: Record<string, StateNamespace>;
  metadata?: JsonObject;
};

export type StateDelta = {
  namespace: string;
  path: string;
  previous?: StateValue;
  current?: StateValue;
  change: "added" | "removed" | "changed" | "increased" | "decreased" | "became_true" | "became_false" | "stable";
  confidence?: number;
  metadata?: JsonObject;
};

export type EnvironmentDescriptor = {
  id: string;
  label: string;
  kind: string;
  domainId?: string | null;
  capabilities?: string[];
  metadata?: JsonObject;
};

export type SourceDescriptor = {
  id: string;
  label: string;
  kind: "state" | "action" | "event" | "note" | "observation" | "derived";
  schemaId?: string;
  schemaVersion?: string;
  metadata?: JsonObject;
};

export type ActionChannelDescriptor = {
  id: string;
  label: string;
  actionTypes: string[];
  capabilities?: string[];
  metadata?: JsonObject;
};

export type ActionTarget = {
  type: string;
  id?: string;
  label?: string;
  selector?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  relativePosition?: { x: number; y: number };
  metadata?: JsonObject;
};

export type ActionResult = {
  status: "succeeded" | "failed" | "timed_out" | "cancelled" | "unknown";
  message?: string;
  evidence?: JsonObject[];
  metadata?: JsonObject;
};

export type TimelineBase = {
  id: string;
  recordingId: string;
  timestamp: number;
  monotonicOffsetMs: number;
  sequence: number;
  sourceId: string;
  confidence?: number;
  correlationId?: string;
  causationId?: string;
  metadata?: JsonObject;
};

export type ActionEntry = TimelineBase & { type: "action"; actionType: string; parameters: Record<string, unknown>; target?: ActionTarget; origin: "operator" | "runtime" | "assistant" | "external"; startedAt: number; completedAt?: number; result?: ActionResult };
export type StateDeltaEntry = TimelineBase & { type: "state_delta"; deltas: StateDelta[] };
export type StateCheckpointEntry = TimelineBase & { type: "state_checkpoint"; state: StateSnapshot };
export type ObservationEntry = TimelineBase & { type: "observation"; observationType: string; signals?: Record<string, StateValue>; payload?: JsonObject };
export type DomainEventEntry = TimelineBase & { type: "domain_event"; eventType: string; payload?: JsonObject };
export type NoteEntry = TimelineBase & { type: "note"; noteId: string };
export type MarkerEntry = TimelineBase & { type: "marker"; label: string };
export type TimelineEntry = ActionEntry | StateDeltaEntry | StateCheckpointEntry | ObservationEntry | DomainEventEntry | NoteEntry | MarkerEntry;

export type RecordingNote = {
  id: string;
  timestamp: number;
  startOffsetMs?: number;
  endOffsetMs?: number;
  text: string;
  source: "typed" | "speech_to_text" | "imported";
  scope: "instant" | "action" | "state" | "interval" | "task";
  linkedEntryIds?: string[];
  confidence?: number;
  metadata?: JsonObject;
};

export type RecordingSession = {
  schemaVersion: AutomationStudioSchemaVersion;
  recordingId: string;
  taskId?: string;
  startedAt: number;
  endedAt?: number;
  environment: EnvironmentDescriptor;
  sources: SourceDescriptor[];
  actionChannels: ActionChannelDescriptor[];
  initialState: StateSnapshot;
  timeline: TimelineEntry[];
  notes: RecordingNote[];
  metadata: JsonObject;
};

export type CreateRecordingSessionInput = {
  recordingId: string;
  taskId?: string;
  startedAt?: number;
  environment?: Partial<EnvironmentDescriptor>;
  sources?: SourceDescriptor[];
  actionChannels?: ActionChannelDescriptor[];
  initialState: StateSnapshot;
  metadata?: JsonObject;
};

export type AppendRecordingEntryInput =
  | Omit<ActionEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<ActionEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<ObservationEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<ObservationEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<DomainEventEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<DomainEventEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<MarkerEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<MarkerEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>;

export type RecordingEventJsonSchema = {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null" | "json";
  label?: string;
  description?: string;
  required?: boolean;
  enum?: JsonValue[];
  properties?: Record<string, RecordingEventJsonSchema>;
  items?: RecordingEventJsonSchema;
  metadata?: JsonObject;
};

export type RecordingDomainStatePathDefinition = {
  namespace: string;
  path: string;
  type: StateValueType;
  elementKind?: StateElementKind;
  label?: string;
  description?: string;
  entityId?: string;
  entityKind?: string;
  stableAcrossSessions?: boolean;
  volatility?: StateVolatility;
  sensitive?: boolean;
  metadata?: JsonObject;
};

export type RecordingDomainEventInput = {
  projectId?: string | null;
  recordingId: string;
  domainId: string;
  eventId?: string;
  eventType: string;
  timestamp?: number;
  sourceId?: string;
  target?: JsonObject;
  payload?: JsonObject;
  metadata?: JsonObject;
};

export type RecordingDomainReducerResult = { state?: StateSnapshot; signals?: Record<string, StateValue>; metadata?: JsonObject };
export type RecordingDomainEventReducerContext = { recording: RecordingSession; event: RecordingDomainEventInput; previousState: StateSnapshot; definition: RecordingDomainEventDefinition; domain: RecordingDomainDefinition };
export type RecordingDomainEventReducer = (context: RecordingDomainEventReducerContext) => RecordingDomainReducerResult | StateSnapshot | void | Promise<RecordingDomainReducerResult | StateSnapshot | void>;
export type RecordingDomainObservationExtractor = (context: RecordingDomainEventReducerContext) => { observationType: string; signals?: Record<string, StateValue>; payload?: JsonObject; metadata?: JsonObject } | null | undefined;
export type RecordingDomainEventDefinition = { eventType: string; label: string; description?: string; payloadSchema?: RecordingEventJsonSchema; metadataSchema?: RecordingEventJsonSchema; stateReducer?: RecordingDomainEventReducer; observationExtractor?: RecordingDomainObservationExtractor; metadata?: JsonObject };
export type RecordingDomainDefinition = { domainId: string; label: string; schemaVersion: string; description?: string; events: RecordingDomainEventDefinition[]; statePaths?: RecordingDomainStatePathDefinition[]; signals?: JsonObject[]; metadata?: JsonObject };

export type RecordingProjectRequest = { projectId?: string | null };
export type CreateRecordingRequest = RecordingProjectRequest & CreateRecordingSessionInput;
export type AppendRecordingEntryRequest = RecordingProjectRequest & { recordingId: string; entry: AppendRecordingEntryInput };
export type AppendRecordingDomainEventRequest = RecordingDomainEventInput;
export type FinalizeRecordingRequest = RecordingProjectRequest & { recordingId: string; endedAt?: number };
