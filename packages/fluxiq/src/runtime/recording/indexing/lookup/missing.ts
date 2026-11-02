import type { RecordingEntryStateLookupInput, RecordingEntryStateLookupResult } from "@fluxiq/contracts/recording";

export function missingRecordingStateLookup(input: RecordingEntryStateLookupInput, reason: string): RecordingEntryStateLookupResult {
  const requested: RecordingEntryStateLookupResult["requested"] = {};
  if (input.entryId !== undefined) requested.entryId = input.entryId;
  if (input.actionId !== undefined) requested.actionId = input.actionId;
  if (input.stateSnapshotId !== undefined) requested.stateSnapshotId = input.stateSnapshotId;
  return { recordingId: input.recordingId, requested, resolved: null, reason };
}
