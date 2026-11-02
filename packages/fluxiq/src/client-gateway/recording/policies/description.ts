export type RecordingDescriptionOutcome =
  | { ok: true; description?: string }
  | { ok: false; code: string; message: string };
