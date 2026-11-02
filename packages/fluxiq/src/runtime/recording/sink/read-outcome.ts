import type { RecordingSession } from "@fluxiq/contracts/recording";

export type RecordingReadOutcome<TTarget, TEvidence> =
  | { kind: "recording"; recording: RecordingSession<TTarget, TEvidence> }
  | { kind: "unavailable"; cause: unknown };
