import type { JsonObject } from "../../../core";
import type { EvidenceReference, RecordingSession, StateSnapshot, TimelineEntry } from "../model";

export type NormalizationIssueSeverity = "error" | "warning" | "info";

export type NormalizationIssue = {
  severity: NormalizationIssueSeverity;
  code: string;
  message: string;
  entryId?: string;
  path?: string;
  metadata?: JsonObject;
};

export type CheckpointPolicy = {
  intervalMs?: number;
  afterMajorActions?: boolean;
  maxDeltasBetweenCheckpoints?: number;
  onNamespaceSchemaChange?: boolean;
};

export type NormalizationOptions = {
  checkpointPolicy?: CheckpointPolicy;
  collapseDuplicateStateDeltas?: boolean;
  preserveRawEntryIds?: boolean;
  metadata?: JsonObject;
};

export type NormalizedTimeline = {
  schemaVersion: "0.1";
  normalizedTimelineId: string;
  recordingId: string;
  taskId?: string;
  sourceRecording: EvidenceReference;
  initialState: StateSnapshot;
  timeline: TimelineEntry[];
  issues: NormalizationIssue[];
  generatedAt: number;
  metadata?: JsonObject;
};

export type TimelineNormalizer = {
  normalize(recording: RecordingSession, options?: NormalizationOptions): Promise<NormalizedTimeline> | NormalizedTimeline;
};
