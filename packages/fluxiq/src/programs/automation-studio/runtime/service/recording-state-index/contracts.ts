import type { RecordingIndex } from "@fluxiq/contracts/recording";

export type { RecordingEntryStateLookupInput, RecordingEntryStateLookupResult } from "@fluxiq/contracts/recording";

export type RepairRecordingStateIndexResult = {
  recordingId: string;
  mode: "dry_run" | "write";
  index: RecordingIndex;
  warnings: string[];
};
