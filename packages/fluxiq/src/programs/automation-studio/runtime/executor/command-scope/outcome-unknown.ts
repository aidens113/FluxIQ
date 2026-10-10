import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";

/**
 * The failure a required-mode attempt carries when its command answered without
 * a committed receipt: whatever the dispatcher said, the ledger holds the
 * command's outcome `unknown`, so the act may have landed and the run, latched,
 * can neither press it again nor go on (`../step-loop/uncertain-stop.ts`).
 */
export const AUTOMATION_STUDIO_REQUIRED_OUTCOME_UNKNOWN: AutomationStudioFailureRecord = Object.freeze({
  category: "ambiguous_or_unknown",
  code: "executor.required_outcome_unknown",
  retryable: false,
  stage: "execution",
  effect: "ambiguous"
});

/**
 * The failure a required-mode attempt carries when its command provably never
 * left -- nothing was claimed for it in the ledger, which claims before any send
 * -- and its dispatcher gave no record: the act did not happen, the command is
 * withdrawn, and a new attempt may issue it again.
 */
export const AUTOMATION_STUDIO_REQUIRED_COMMAND_NOT_SENT: AutomationStudioFailureRecord = Object.freeze({
  category: "action_failed",
  code: "executor.required_command_not_sent",
  retryable: true,
  stage: "dispatch",
  effect: "unacted"
});
