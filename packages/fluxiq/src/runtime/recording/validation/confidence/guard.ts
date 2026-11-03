/** Confidence is optional evidence data, bounded independently of any domain. */
export function isRecordingConfidence(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}
