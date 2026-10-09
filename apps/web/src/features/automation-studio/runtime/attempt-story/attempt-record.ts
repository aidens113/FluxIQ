/**
 * One record of an attempt, from either shape the panel is handed: a trace
 * attempt (`trace.attempts`) keeps it at the top level, and a run-detail action
 * record keeps the copies Core makes of some of them under `metadata`
 * (`service/summaries/conversions.ts`). Only an object is a record; anything
 * else reads as absent rather than partly trusted.
 */
export function runtimeAttemptRecord(attempt: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(attempt)) return undefined;
  const own = attempt[key];
  if (isRecord(own)) return own;
  const metadata = attempt.metadata;
  const copied = isRecord(metadata) ? metadata[key] : undefined;
  return isRecord(copied) ? copied : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
