export type RecordingIndexSummary = {
  name?: string;
  startedAt: number;
  endedAt?: number;
  eventCount: number;
  actionCount: number;
  stateSnapshotCount: number;
  proposalCount: number;
  updatedAt: number;
};
