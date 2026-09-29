// When the step a `rerun` replaces leaves the draft: once the rerun has worked,
// and never before.
//
// It used to be withdrawn first and run second, so a rerun that failed, threw
// or never ran left the draft with neither: the step that had worked was gone
// and the one meant to replace it had not happened. Where that step was the
// navigation to the start location -- the one the domain makes every build run
// first -- the Flow could no longer reach its first page, and completion was
// refused `bootstrap.cannot_reach_start_location` for a step the build had run
// (both bigbox builds, `run-mulx76vv-a882551e` and `run-mum0ke7z-940cbd27`).
import { applyAutomationStudioFlowDraftAmendments, automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

/**
 * Withdraw `replaced` when the newest step -- the rerun, just appended -- is
 * one the Flow could contain. A rerun that did not take effect leaves the
 * original where it was, kept, so the Flow still has the step that worked.
 */
export function automationStudioLlmEvidenceRerunReplaced(
  steps: AutomationStudioFlowDraftStep[],
  replaced: AutomationStudioFlowDraftStep | undefined
): void {
  const rerun = steps[steps.length - 1];
  if (!replaced || !rerun || rerun === replaced || !automationStudioFlowDraftStepIsProposable(rerun)) return;
  applyAutomationStudioFlowDraftAmendments(steps, [{ step: replaced.position, change: "drop" }]);
}
