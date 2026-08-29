export type AppendRecordingNote = (recordingId: string, linkedEntryId?: string, text?: string, authorizationPin?: string) => Promise<void>;

export function normalizeRecordingNote(value: string): string {
  return value.trim();
}

export function appendRecordingNote(
  write: AppendRecordingNote,
  input: { recordingId: string; linkedEntryId?: string; text: string; authorizationPin: string }
) {
  return write(input.recordingId, input.linkedEntryId, normalizeRecordingNote(input.text), input.authorizationPin);
}