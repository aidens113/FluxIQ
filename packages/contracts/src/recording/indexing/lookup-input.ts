export type RecordingEntryStateLookupInput = {
  projectId: string;
  recordingId: string;
  entryId?: string;
  actionId?: string;
  stateSnapshotId?: string;
  includeState?: boolean;
};
