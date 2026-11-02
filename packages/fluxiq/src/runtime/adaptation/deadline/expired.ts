import type { AutomationStudioRecoveryDeadline } from "./contract.ts";
import { automationStudioRecoveryDeadlineRemainingMs } from "./remaining.ts";

export function automationStudioRecoveryDeadlineExpired(deadline: AutomationStudioRecoveryDeadline, nowMs: number): boolean {
  return automationStudioRecoveryDeadlineRemainingMs(deadline, nowMs) === 0;
}
