import type { AutomationStudioRecoveryDeadline } from "./contract.ts";

/** Milliseconds left, never negative. Zero means the recovery is out of time. */
export function automationStudioRecoveryDeadlineRemainingMs(deadline: AutomationStudioRecoveryDeadline, nowMs: number): number {
  return Math.max(0, deadline.expiresAtMs - nowMs);
}
