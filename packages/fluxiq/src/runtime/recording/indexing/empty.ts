import { RECORDING_STATE_INDEX_SCHEMA_VERSION, type EmptyRecordingIndexInput, type RecordingIndex, type RecordingIndexSummary } from "@fluxiq/contracts/recording";
import { sortRecordingIndex } from "./sort.ts";

export function emptyRecordingIndex(input: EmptyRecordingIndexInput): RecordingIndex {
  const now = input.updatedAt ?? Date.now();
  const name: Pick<RecordingIndexSummary, "name"> = {};
  const ended: Pick<RecordingIndexSummary, "endedAt"> = {};
  if (input.name) name.name = input.name;
  if (input.endedAt !== undefined) ended.endedAt = input.endedAt;
  const index: RecordingIndex = {
    schemaVersion: RECORDING_STATE_INDEX_SCHEMA_VERSION,
    projectId: input.projectId,
    recordingId: input.recordingId,
    summary: { ...name, startedAt: input.startedAt ?? now, ...ended, eventCount: 0, actionCount: 0, stateSnapshotCount: 0, proposalCount: 0, updatedAt: now },
    timeline: { timelineRef: input.timelineRef ?? "timeline.jsonl" },
    entries: {},
    actions: {},
    states: {},
    proposals: {}
  };
  return sortRecordingIndex(index);
}
