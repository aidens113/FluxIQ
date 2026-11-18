/** Safe saved-key status. Authentication and missing configuration are separate. */
export type ModelKeyAvailability =
  | { state: "available" }
  | { state: "unavailable"; code: "legacy_recovery_required" | "host_protection_unavailable" | "ciphertext_invalid" };

/** Reject unknown statuses rather than presenting an inaccessible key as ready. */
export function readModelKeyAvailability(value: unknown): ModelKeyAvailability | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.state === "available" && record.code === undefined) return { state: "available" };
  if (record.state !== "unavailable") return null;
  const code = record.code;
  if (code !== "legacy_recovery_required" && code !== "host_protection_unavailable" && code !== "ciphertext_invalid") return null;
  return { state: "unavailable", code };
}
