import { RecordingCandidateValidationError } from "./error.ts";

export function recordingCandidateTimeout(outputId: string, value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw RecordingCandidateValidationError.timeout(outputId);
  return value;
}
