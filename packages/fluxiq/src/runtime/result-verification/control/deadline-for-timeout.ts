import { RESULT_VERIFICATION_DEADLINE_MS } from "./deadline-ms.ts";
import { RESULT_VERIFICATION_ASKS_PER_CHECK } from "./asks-per-check.ts";

export function resultVerificationDeadlineMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return RESULT_VERIFICATION_DEADLINE_MS;
  const calls = 2 * RESULT_VERIFICATION_ASKS_PER_CHECK;
  return Math.max(RESULT_VERIFICATION_DEADLINE_MS, calls * timeoutMs + 30_000);
}
