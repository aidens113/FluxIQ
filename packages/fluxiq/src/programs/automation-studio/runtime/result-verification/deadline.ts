// Compatibility exports; the bounded wait is owned by the neutral runtime.
export {
  RESULT_VERIFICATION_DEADLINE_MS as AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS,
  resultVerificationDeadlineMs as automationStudioResultVerificationDeadlineMs,
  resultVerificationWithinDeadline as automationStudioResultVerificationWithinDeadline
} from "../../../../runtime/result-verification/control/index.ts";
export type { ResultVerificationBounded as AutomationStudioResultVerificationBounded } from "../../../../runtime/result-verification/control/index.ts";
