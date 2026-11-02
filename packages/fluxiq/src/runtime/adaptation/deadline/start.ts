import type { AutomationStudioRecoveryDeadline } from "./contract.ts";
import { AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS } from "./duration.ts";
import { AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS } from "./ceiling.ts";

/**
 * Start the clock. An out-of-range or non-finite duration is clamped rather
 * than rejected: this is called while a run is already failing, and refusing to
 * start the clock because a configured number was silly would leave the
 * recovery with no clock at all -- which is the condition this file exists to
 * remove.
 */
export function startAutomationStudioRecoveryDeadline(input: { startedAtMs: number; maxDurationMs?: number }): AutomationStudioRecoveryDeadline {
  const requested = Number.isFinite(input.maxDurationMs) ? Number(input.maxDurationMs) : AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS;
  const maxDurationMs = Math.min(Math.max(Math.trunc(requested), 1), AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS);
  const startedAtMs = Number.isFinite(input.startedAtMs) ? Math.trunc(input.startedAtMs) : 0;
  return {
    schemaVersion: "automation-studio.recovery-deadline.v1",
    startedAtMs,
    maxDurationMs,
    expiresAtMs: startedAtMs + maxDurationMs
  };
}
