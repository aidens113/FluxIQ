import type { JsonObject } from "../../core.js";
import type { EvidenceReference } from "../../evidence/index.js";
import type { StateSnapshot } from "../../state/contracts/index.js";
import type { RecordingSession } from "../session/index.js";
import type { TimelineEntry } from "../timeline/index.js";
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
  /**
   * High-frequency visual/state captures are retained in the raw recording, but
   * normalized timelines should usually keep only action-adjacent checkpoints so
   * mining and proposal generation stay proportional to recorded behavior.
   */
  compactStateCheckpoints?: boolean;
  stateCheckpointContextWindowMs?: number;
  collapseDuplicateStateDeltas?: boolean;
  preserveRawEntryIds?: boolean;
  metadata?: JsonObject;
};

export type NormalizedTimeline<TTarget = unknown, TEvidence = EvidenceReference> = {
  schemaVersion: "0.1";
  normalizedTimelineId: string;
  recordingId: string;
  taskId?: string;
  sourceRecording: EvidenceReference;
  initialState: StateSnapshot;
  timeline: TimelineEntry<TTarget, TEvidence>[];
  issues: NormalizationIssue[];
  generatedAt: number;
  metadata?: JsonObject;
};

export type TimelineNormalizer<TTarget = unknown, TEvidence = EvidenceReference> = {
  normalize(recording: RecordingSession<TTarget, TEvidence>, options?: NormalizationOptions): Promise<NormalizedTimeline<TTarget, TEvidence>> | NormalizedTimeline<TTarget, TEvidence>;
};
