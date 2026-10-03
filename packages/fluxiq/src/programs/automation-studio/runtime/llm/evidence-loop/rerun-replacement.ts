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
//
// **Where the model authors its draft, the rerun takes the replaced step's
// place** (audit A1, cause 5a). A rerun is the same step corrected, so it goes
// where that step stood, is in the Flow exactly when that step was, does the
// acts that step did when it changes something, runs the way that step ran, and every statement that
// named that step names it instead. Appended at the end with the old step
// merely dropped, a rerun under an authored draft would fall out of the Flow
// (it was never added), land after the steps that need it, and orphan any
// `repeat` naming the old step: `run-muog33va-96469cb2` was refused
// `repeat_span_unknown` nine times for exactly that. A build replayed under the
// older transcript rule keeps the old behaviour, which is what it recorded.
import {
  applyAutomationStudioFlowDraftAmendments,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStepIsProposable,
  type AutomationStudioFlowDraftStep,
  type AutomationStudioFlowDraftStepRouting
} from "../../flow-draft/index.ts";

/**
 * Withdraw `replaced` when the newest step -- the rerun, just appended -- is
 * one the Flow could contain. A rerun that did not take effect leaves the
 * original where it was, so the Flow still has the step that worked.
 * `takesItsPlace` is whether the model authors the draft (see the header).
 */
export function automationStudioLlmEvidenceRerunReplaced(
  steps: AutomationStudioFlowDraftStep[],
  replaced: AutomationStudioFlowDraftStep | undefined,
  options: { takesItsPlace?: boolean } = {}
): void {
  const rerun = steps[steps.length - 1];
  if (!replaced || !rerun || rerun === replaced || !automationStudioFlowDraftStepIsProposable(rerun)) return;
  const wasInFlow = replaced.disposition === "kept";
  applyAutomationStudioFlowDraftAmendments(steps, [{ step: replaced.position, change: "drop" }]);
  if (!options.takesItsPlace) return;
  if (wasInFlow) rerun.disposition = "kept";
  // Only a step that changes something does an act (`../../flow-draft/amendment.ts`,
  // `act_on_a_read`). An act a read carried -- live run 36 named a1 on a rerun
  // listing -- is not passed on to the next rerun of that listing, where it
  // made the completion check judge the listing as the act 24 times running.
  if (replaced.acts) {
    if (rerun.effect === "mutate") rerun.acts = [...replaced.acts];
    delete replaced.acts;
  }
  if (replaced.routing) {
    rerun.routing = replaced.routing;
    delete replaced.routing;
  }
  // The node the replaced step stood for, and what state routing recorded on
  // it: a step carried from an earlier Flow must run in the build before the
  // Flow is tested whole (t244), and the rerun that runs it is a new step. It
  // keeps that node's id when the Flow is written
  // (`../node-tools/draft-from-flow.ts`), and the node's signatures where its
  // own run recorded none.
  rerun.standsFor = replaced.standsFor ?? automationStudioFlowDraftStepId(replaced);
  if (replaced.routeSignatures && !rerun.routeSignatures) rerun.routeSignatures = replaced.routeSignatures;
  delete replaced.standsFor;
  const from = automationStudioFlowDraftStepId(replaced);
  const to = automationStudioFlowDraftStepId(rerun);
  for (const step of steps) if (step.routing) step.routing = renamed(step.routing, from, to);
  // Just before the withdrawn step, which stays listed as the receipt of what was replaced.
  steps.splice(steps.indexOf(rerun), 1);
  steps.splice(steps.indexOf(replaced), 0, rerun);
  steps.forEach((step, index) => { step.position = index + 1; });
}

/** A routing statement with every reference to one step moved to another. */
function renamed(routing: AutomationStudioFlowDraftStepRouting, from: string, to: string): AutomationStudioFlowDraftStepRouting {
  const swap = (id: string): string => (id === from ? to : id);
  if (routing.kind === "only_if") return { ...routing, check: swap(routing.check) };
  if (routing.kind === "on_failed") return { ...routing, to: swap(routing.to) };
  if (routing.kind === "repeat") return { ...routing, through: swap(routing.through), over: swap(routing.over) };
  return routing;
}
