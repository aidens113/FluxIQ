import type { StateSnapshot } from "../../../model/index.ts";
import type { RecordingIndex as RecordingStateIndex } from "../../../storage/index.ts";

// What a caller asks of the recording state index, and what it gets back.

export type RecordingEntryStateLookupInput = {
  projectId: string;
  recordingId: string;
  entryId?: string;
  actionId?: string;
  stateSnapshotId?: string;
  includeState?: boolean;
};

export type RecordingEntryStateLookupResult = {
  recordingId: string;
  requested: {
    entryId?: string;
    actionId?: string;
    stateSnapshotId?: string;
  };
  resolved: {
    stateSnapshotId: string;
    entryId: string;
    stateRef: string;
    screenshotRef?: string;
  } | null;
  state?: StateSnapshot;
  reason?: string;
};

export type RepairRecordingStateIndexResult = {
  recordingId: string;
  mode: "dry_run" | "write";
  index: RecordingStateIndex;
  warnings: string[];
};
