export type AppendRecordingMarker = (recordingId: string, linkedEntryId?: string, monotonicOffsetMs?: number, label?: string, authorizationPin?: string) => Promise<void>;

export function normalizeRecordingMarkerLabel(value: string): string {
  return value.trim();
}

export function appendRecordingMarker(
  write: AppendRecordingMarker,
  input: { recordingId: string; linkedEntryId?: string; monotonicOffsetMs?: number; label: string; authorizationPin: string }
) {
  return write(input.recordingId, input.linkedEntryId, input.monotonicOffsetMs, normalizeRecordingMarkerLabel(input.label), input.authorizationPin);
}