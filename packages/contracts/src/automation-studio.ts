import type { AutomationStudioSchemaVersion as CanonicalAutomationStudioSchemaVersion } from "./evidence/index.ts";
import type { StateValueType as CanonicalStateValueType, StateVolatility as CanonicalStateVolatility, StateElementKind as CanonicalStateElementKind, StateNamespaceId as CanonicalStateNamespaceId, StateBounds as CanonicalStateBounds, StateBoundsKind as CanonicalStateBoundsKind, StatePath as CanonicalStatePath, EvidenceAnchor as CanonicalEvidenceAnchor, SignalProvenance as CanonicalSignalProvenance, StateValue as CanonicalStateValue, StateNamespace as CanonicalStateNamespace, StateSnapshot as CanonicalStateSnapshot, StateDelta as CanonicalStateDelta } from "./state/index.ts";
import type { EnvironmentDescriptor as CanonicalEnvironmentDescriptor, SourceDescriptor as CanonicalSourceDescriptor, ActionChannelDescriptor as CanonicalActionChannelDescriptor, TimelineBase as CanonicalTimelineBase, ActionEntry as CanonicalActionEntry, StateDeltaEntry as CanonicalStateDeltaEntry, StateCheckpointEntry as CanonicalStateCheckpointEntry, ObservationEntry as CanonicalObservationEntry, DomainEventEntry as CanonicalDomainEventEntry, NoteEntry as CanonicalNoteEntry, MarkerEntry as CanonicalMarkerEntry, TimelineEntry as CanonicalTimelineEntry, RecordingNote as CanonicalRecordingNote, RecordingSession as CanonicalRecordingSession, CreateRecordingSessionInput as CanonicalCreateRecordingSessionInput, AppendRecordingEntryInput as CanonicalAppendRecordingEntryInput, RecordingEventJsonSchema as CanonicalRecordingEventJsonSchema, RecordingDomainStatePathDefinition as CanonicalRecordingDomainStatePathDefinition, RecordingDomainEventInput as CanonicalRecordingDomainEventInput, RecordingDomainReducerResult as CanonicalRecordingDomainReducerResult, RecordingDomainEventReducerContext as CanonicalRecordingDomainEventReducerContext, RecordingDomainEventReducer as CanonicalRecordingDomainEventReducer, RecordingDomainObservationExtractor as CanonicalRecordingDomainObservationExtractor, RecordingDomainEventDefinition as CanonicalRecordingDomainEventDefinition, RecordingDomainDefinition as CanonicalRecordingDomainDefinition } from "./recording/index.ts";
import type { ActionVisualTargetSource as CanonicalActionVisualTargetSource, ActionVisualEntityTarget as CanonicalActionVisualEntityTarget, ActionResult as CanonicalActionResult, ActionTarget as CanonicalActionTarget } from "./runtime/actions/index.ts";

export type AutomationStudioSchemaVersion = CanonicalAutomationStudioSchemaVersion;
export type StateValueType = CanonicalStateValueType;
export type StateVolatility = CanonicalStateVolatility;
export type StateElementKind = CanonicalStateElementKind;
export type StateNamespaceId = CanonicalStateNamespaceId;
export type StateBounds = CanonicalStateBounds;
export type StateBoundsKind = CanonicalStateBoundsKind;
export type StatePath = CanonicalStatePath;
export type EvidenceAnchor = CanonicalEvidenceAnchor;
export type SignalProvenance = CanonicalSignalProvenance;
export type StateValue = CanonicalStateValue;
export type StateNamespace = CanonicalStateNamespace;
export type StateSnapshot = CanonicalStateSnapshot;
export type StateDelta = CanonicalStateDelta;
export type EnvironmentDescriptor = CanonicalEnvironmentDescriptor;
export type SourceDescriptor = CanonicalSourceDescriptor;
export type ActionChannelDescriptor = CanonicalActionChannelDescriptor;
export type ActionVisualTargetSource = CanonicalActionVisualTargetSource;
export type ActionVisualEntityTarget = CanonicalActionVisualEntityTarget;
export type ActionResult = CanonicalActionResult<JsonObject>;
export type TimelineBase = CanonicalTimelineBase;
export type ActionEntry = CanonicalActionEntry<ActionTarget, JsonObject>;
export type StateDeltaEntry = CanonicalStateDeltaEntry;
export type StateCheckpointEntry = CanonicalStateCheckpointEntry;
export type ObservationEntry = CanonicalObservationEntry;
export type DomainEventEntry = CanonicalDomainEventEntry;
export type NoteEntry = CanonicalNoteEntry;
export type MarkerEntry = CanonicalMarkerEntry;
export type TimelineEntry = CanonicalTimelineEntry<ActionTarget, JsonObject>;
export type RecordingNote = CanonicalRecordingNote;
export type RecordingSession = CanonicalRecordingSession<ActionTarget, JsonObject>;
export type CreateRecordingSessionInput = CanonicalCreateRecordingSessionInput<ActionTarget, JsonObject>;
export type AppendRecordingEntryInput = CanonicalAppendRecordingEntryInput<ActionTarget, JsonObject>;
export type RecordingEventJsonSchema = CanonicalRecordingEventJsonSchema;
export type RecordingDomainStatePathDefinition = CanonicalRecordingDomainStatePathDefinition;
export type RecordingDomainEventInput = CanonicalRecordingDomainEventInput;
export type RecordingDomainReducerResult = CanonicalRecordingDomainReducerResult;
export type RecordingDomainEventReducerContext = CanonicalRecordingDomainEventReducerContext<ActionTarget, JsonObject, JsonObject>;
export type RecordingDomainEventReducer = CanonicalRecordingDomainEventReducer<ActionTarget, JsonObject, JsonObject>;
export type RecordingDomainObservationExtractor = CanonicalRecordingDomainObservationExtractor<ActionTarget, JsonObject, JsonObject>;
export type RecordingDomainEventDefinition = CanonicalRecordingDomainEventDefinition<ActionTarget, JsonObject, JsonObject>;
export type RecordingDomainDefinition = CanonicalRecordingDomainDefinition<ActionTarget, JsonObject, JsonObject>;

import type { JsonObject, JsonValue } from "./core.js";

export * from "./failure/index.ts";

export * from "./actionability/index.ts";

export * from "./record-sets/index.ts";

export * from "./recording-capture/index.ts";

export type ActionTarget = CanonicalActionTarget<never> & { selector?: string };

export type RecordingProjectRequest = { projectId?: string | null };

export type CreateRecordingRequest = RecordingProjectRequest & CreateRecordingSessionInput;

export type AppendRecordingEntryRequest = RecordingProjectRequest & { recordingId: string; entry: AppendRecordingEntryInput };

export type AppendRecordingDomainEventRequest = RecordingDomainEventInput;

export type FinalizeRecordingRequest = RecordingProjectRequest & { recordingId: string; endedAt?: number };
