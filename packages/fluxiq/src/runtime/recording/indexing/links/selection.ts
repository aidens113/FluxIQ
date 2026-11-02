import { readRecordingIndexItem } from "../dictionary/index.ts";
import type { RecordingIndex, RecordingStateIndexItem, RecordingStateLinkWarning } from "@fluxiq/contracts/recording";
import { comparableRecordingEntryTime, compareRecordingIndexStates } from "./order.ts";

export function selectRecordingActionState(index: RecordingIndex, actionEntryId: string, states: RecordingStateIndexItem[], warnings: RecordingStateLinkWarning[]): RecordingStateIndexItem | undefined {
  const actionEntry = readRecordingIndexItem(index.entries, actionEntryId);
  if (!actionEntry) return undefined;
  const actionTime = comparableRecordingEntryTime(actionEntry);
  const candidates = states.map((state) => {
    const stateTime = comparableRecordingEntryTime(readRecordingIndexItem(index.entries, state.entryId));
    const delta = stateTime - actionTime;
    return { state, stateTime, distance: Math.abs(delta), prior: delta <= 0 };
  }).filter((candidate) => Number.isFinite(candidate.stateTime) && Number.isFinite(candidate.distance))
    .sort((left, right) => {
      if (left.distance !== right.distance) return left.distance - right.distance;
      if (left.prior !== right.prior) return left.prior ? -1 : 1;
      return compareRecordingIndexStates(left.state, right.state);
    });
  const selected = candidates[0]?.state;
  if (selected && candidates[1] && candidates[0]!.stateTime === candidates[1].stateTime && candidates[0]!.distance === candidates[1].distance) {
    warnings.push({ code: "ambiguous_state_timestamp", entryId: actionEntryId, message: `Action entry ${actionEntryId} matched multiple state snapshots at the same timestamp; chose ${selected.stateSnapshotId}.` });
  }
  return selected;
}
