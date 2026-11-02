export type RecordingEntryIndexItem = {
  entryId: string;
  type: string;
  timestamp?: number;
  startedAt?: number;
  completedAt?: number;
  monotonicOffsetMs?: number;
  sequence?: number;
  stateSnapshotId?: string;
  actionId?: string;
  objectRefs?: string[];
};
