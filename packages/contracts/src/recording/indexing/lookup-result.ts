import type { StateSnapshot } from "../../state/index.js";

export type RecordingEntryStateLookupResult = {
  recordingId: string;
  requested: { entryId?: string; actionId?: string; stateSnapshotId?: string };
  resolved: { stateSnapshotId: string; entryId: string; stateRef: string; screenshotRef?: string } | null;
  state?: StateSnapshot;
  reason?: string;
};
