import type { RecordingIndexSchemaVersion } from "./schema.js";
import type { RecordingIndexSummary } from "./summary.js";
import type { RecordingTimelineIndex } from "./timeline.js";
import type { RecordingActionIndexItem, RecordingEntryIndexItem, RecordingProposalIndexItem, RecordingStateIndexItem } from "./items/index.js";

export type RecordingIndex = {
  schemaVersion: RecordingIndexSchemaVersion;
  projectId: string;
  recordingId: string;
  summary: RecordingIndexSummary;
  timeline: RecordingTimelineIndex;
  entries: Record<string, RecordingEntryIndexItem>;
  actions: Record<string, RecordingActionIndexItem>;
  states: Record<string, RecordingStateIndexItem>;
  proposals: Record<string, RecordingProposalIndexItem>;
};
