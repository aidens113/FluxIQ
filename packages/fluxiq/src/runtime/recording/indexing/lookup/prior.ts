import { readRecordingIndexItem } from "../dictionary/index.ts";
import type { RecordingEntryIndexItem, RecordingIndex, RecordingStateIndexItem } from "@fluxiq/contracts/recording";
import { firstRecordingIndexFiniteNumber } from "../entries/index.ts";

export function latestStateAtOrBeforeEntry(index: RecordingIndex, entry: RecordingEntryIndexItem): RecordingStateIndexItem | undefined {
  const targetTime = firstRecordingIndexFiniteNumber(entry.startedAt, entry.timestamp, entry.completedAt, entry.monotonicOffsetMs);
  const targetSequence = entry.sequence;
  const states = Object.values(index.states).filter((state) => {
    const stateEntry = readRecordingIndexItem(index.entries, state.entryId);
    if (targetTime !== undefined) {
      const stateTime = firstRecordingIndexFiniteNumber(state.timestamp, stateEntry?.timestamp, stateEntry?.startedAt, state.monotonicOffsetMs, stateEntry?.monotonicOffsetMs);
      if (stateTime !== undefined) return stateTime <= targetTime;
    }
    return targetSequence !== undefined && stateEntry?.sequence !== undefined && stateEntry.sequence <= targetSequence;
  });
  return states.sort((left, right) => {
    const leftEntry = readRecordingIndexItem(index.entries, left.entryId);
    const rightEntry = readRecordingIndexItem(index.entries, right.entryId);
    const leftTime = firstRecordingIndexFiniteNumber(left.timestamp, leftEntry?.timestamp, leftEntry?.startedAt, left.monotonicOffsetMs, leftEntry?.monotonicOffsetMs) ?? Number.NEGATIVE_INFINITY;
    const rightTime = firstRecordingIndexFiniteNumber(right.timestamp, rightEntry?.timestamp, rightEntry?.startedAt, right.monotonicOffsetMs, rightEntry?.monotonicOffsetMs) ?? Number.NEGATIVE_INFINITY;
    if (leftTime !== rightTime) return rightTime - leftTime;
    const leftSequence = leftEntry?.sequence ?? Number.NEGATIVE_INFINITY;
    const rightSequence = rightEntry?.sequence ?? Number.NEGATIVE_INFINITY;
    if (leftSequence !== rightSequence) return rightSequence - leftSequence;
    return right.stateSnapshotId.localeCompare(left.stateSnapshotId);
  })[0];
}
