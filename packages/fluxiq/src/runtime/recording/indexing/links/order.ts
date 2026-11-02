import { readRecordingIndexItem } from "../dictionary/index.ts";
import type { RecordingEntryIndexItem, RecordingIndex, RecordingStateIndexItem } from "@fluxiq/contracts/recording";

export function compareRecordingIndexEntries(index: RecordingIndex, leftEntryId: string, rightEntryId: string): number {
  const left = readRecordingIndexItem(index.entries, leftEntryId);
  const right = readRecordingIndexItem(index.entries, rightEntryId);
  return (left?.sequence ?? Number.MAX_SAFE_INTEGER) - (right?.sequence ?? Number.MAX_SAFE_INTEGER)
    || comparableRecordingEntryTime(left) - comparableRecordingEntryTime(right)
    || leftEntryId.localeCompare(rightEntryId);
}

export function compareRecordingIndexStates(left: RecordingStateIndexItem, right: RecordingStateIndexItem): number {
  return left.timestamp - right.timestamp
    || (left.monotonicOffsetMs ?? Number.MAX_SAFE_INTEGER) - (right.monotonicOffsetMs ?? Number.MAX_SAFE_INTEGER)
    || left.entryId.localeCompare(right.entryId)
    || left.stateSnapshotId.localeCompare(right.stateSnapshotId);
}

export function comparableRecordingEntryTime(entry: RecordingEntryIndexItem | undefined): number {
  if (!entry) return Number.NaN;
  return entry.timestamp ?? entry.startedAt ?? entry.monotonicOffsetMs ?? Number.NaN;
}
