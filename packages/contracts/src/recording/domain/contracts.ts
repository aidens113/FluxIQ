import type { JsonObject, JsonValue } from "../../core.js";
import type { StateDelta, StateElementKind, StateSnapshot, StateValue, StateValueType, StateVolatility } from "../../state/contracts/index.js";
import type { EvidenceReference } from "../../evidence/index.js";
import type { SignalDefinition } from "../../state/signals/index.js";
import type { RecordingSession } from "../session/index.js";

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

export type RecordingDomainEventValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type RecordingDomainEventValidationResult = {
  ok: boolean;
  issues: RecordingDomainEventValidationIssue[];
};

export type RecordingDomainReducerResult = {
  state?: StateSnapshot;
  signals?: Record<string, StateValue>;
  metadata?: JsonObject;
};

export type RecordingDomainEventReducerContext<TTarget = unknown, TEvidence = EvidenceReference, TSignal = SignalDefinition> = {
  recording: RecordingSession<TTarget, TEvidence>;
  event: RecordingDomainEventInput;
  previousState: StateSnapshot;
  definition: RecordingDomainEventDefinition<TTarget, TEvidence, TSignal>;
  domain: RecordingDomainDefinition<TTarget, TEvidence, TSignal>;
};

export type RecordingDomainEventReducer<TTarget = unknown, TEvidence = EvidenceReference, TSignal = SignalDefinition> = (
  context: RecordingDomainEventReducerContext<TTarget, TEvidence, TSignal>
) => RecordingDomainReducerResult | StateSnapshot | void | Promise<RecordingDomainReducerResult | StateSnapshot | void>;

export type RecordingDomainObservationExtractor<TTarget = unknown, TEvidence = EvidenceReference, TSignal = SignalDefinition> = (
  context: RecordingDomainEventReducerContext<TTarget, TEvidence, TSignal>
) => { observationType: string; signals?: Record<string, StateValue>; payload?: JsonObject; metadata?: JsonObject } | null | undefined;

export type RecordingDomainEventDefinition<TTarget = unknown, TEvidence = EvidenceReference, TSignal = SignalDefinition> = {
  eventType: string;
  label: string;
  description?: string;
  payloadSchema?: RecordingEventJsonSchema;
  metadataSchema?: RecordingEventJsonSchema;
  stateReducer?: RecordingDomainEventReducer<TTarget, TEvidence, TSignal>;
  observationExtractor?: RecordingDomainObservationExtractor<TTarget, TEvidence, TSignal>;
  metadata?: JsonObject;
};

export type RecordingDomainDefinition<TTarget = unknown, TEvidence = EvidenceReference, TSignal = SignalDefinition> = {
  domainId: string;
  label: string;
  schemaVersion: string;
  description?: string;
  events: RecordingDomainEventDefinition<TTarget, TEvidence, TSignal>[];
  statePaths?: RecordingDomainStatePathDefinition[];
  signals?: TSignal[];
  metadata?: JsonObject;
};

export type RecordingDomainEventProcessingResult<TTarget = unknown, TEvidence = EvidenceReference, TSignal = SignalDefinition> = {
  accepted: boolean;
  recording: RecordingSession<TTarget, TEvidence>;
  entryId?: string;
  domain?: RecordingDomainDefinition<TTarget, TEvidence, TSignal>;
  definition?: RecordingDomainEventDefinition<TTarget, TEvidence, TSignal>;
  stateDeltas: StateDelta[];
  state?: StateSnapshot;
  issues: RecordingDomainEventValidationIssue[];
};
