import { readRecordingIndexItem } from "../dictionary/index.ts";
import type { RecordingEntryStateLookupInput, RecordingIndex, RecordingStateIndexItem } from "@fluxiq/contracts/recording";
import { latestStateAtOrBeforeEntry } from "./prior.ts";

export function resolveRecordingStateIndexItem(index: RecordingIndex, input: RecordingEntryStateLookupInput): { state?: RecordingStateIndexItem; reason: string } {
  if (input.stateSnapshotId) {
    const state = readRecordingIndexItem(index.states, input.stateSnapshotId);
    return state ? { state, reason: "" } : { reason: `State snapshot ${input.stateSnapshotId} is not indexed for recording ${input.recordingId}.` };
  }
  if (input.actionId) {
    const action = readRecordingIndexItem(index.actions, input.actionId);
    if (!action) return { reason: `Action ${input.actionId} is not indexed for recording ${input.recordingId}.` };
    if (!action.stateAtActionId) return { reason: `Action ${input.actionId} has no linked state snapshot.` };
    const state = readRecordingIndexItem(index.states, action.stateAtActionId);
    return state ? { state, reason: "" } : { reason: `Action ${input.actionId} points to missing state snapshot ${action.stateAtActionId}.` };
  }
  if (input.entryId) {
    const entry = readRecordingIndexItem(index.entries, input.entryId);
    if (!entry) return { reason: `Entry ${input.entryId} is not indexed for recording ${input.recordingId}.` };
    if (entry.stateSnapshotId) {
      const state = readRecordingIndexItem(index.states, entry.stateSnapshotId);
      return state ? { state, reason: "" } : { reason: `Entry ${input.entryId} points to missing state snapshot ${entry.stateSnapshotId}.` };
    }
    if (entry.actionId) {
      const action = readRecordingIndexItem(index.actions, entry.actionId);
      const state = action?.stateAtActionId ? readRecordingIndexItem(index.states, action.stateAtActionId) : undefined;
      if (state) return { state, reason: "" };
    }
    const priorState = latestStateAtOrBeforeEntry(index, entry);
    return priorState ? { state: priorState, reason: "" } : { reason: `Entry ${input.entryId} has no linked state snapshot.` };
  }
  return { reason: "State lookup requires stateSnapshotId, actionId, or entryId." };
}
