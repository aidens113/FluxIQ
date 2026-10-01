// "Not doable": the explicit ending, with its reason, of a build that has no
// route left to what was asked.
//
// **Only if there is absolutely no way (user, 2026-09-30).** It is reached
// only after the Flow was tested and judged and a repair then got no further
// than the judgement before it (`./phases.ts`): the model worked live on
// exactly what was missing or failing, with the checklist in front of it, and
// nothing it did advanced. A budget that ran out first is never this ending
// (`./budget-exhausted.ts`).
//
// **The reason is the evidence the model saw**: the checklist's reason for
// each act or choice still to do, what the test found when the Flow was run
// from its start, and why each round stopped -- said in plain words, with the
// person's own words for what they asked, never a code.
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE, type AutomationStudioFlowBootstrapBuildEnding } from "../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../instructed-acts/index.ts";
import type { AutomationStudioFlowBootstrapJudgement } from "./contracts.ts";
import { automationStudioFlowBootstrapNotDone, automationStudioFlowBootstrapNotDoneSaid, automationStudioFlowBootstrapStopSaid, automationStudioFlowBootstrapTestSaid } from "./not-done.ts";

/** The not-doable ending, from the last judgement and the checklist it was read by. */
export function automationStudioFlowBootstrapNotDoable(input: {
  judgement: AutomationStudioFlowBootstrapJudgement;
  checklist: readonly AutomationStudioInstructedActChecklistItem[] | undefined;
  /** Live rounds: the exploration, then each repair. */
  rounds: number;
  /** Decisions across every round. */
  decisions: number;
}): AutomationStudioFlowBootstrapBuildEnding {
  const notDone = automationStudioFlowBootstrapNotDone(input.checklist);
  const asked = (input.checklist ?? []).reduce((total, item) => total + 1 + (item.choices?.length ?? 0), 0);
  const what = notDone.length
    ? `${notDone.length} of the ${asked} things you asked could not be done: ${automationStudioFlowBootstrapNotDoneSaid(notDone)}.`
    : `the Flow could not be finished: ${automationStudioFlowBootstrapStopSaid(input.judgement.stopped)}.`;
  const repairs = input.rounds - 1;
  const tried = `I tried ${input.rounds === 1 ? "once" : `${input.rounds} times`} live -- exploring${repairs ? `, then ${repairs === 1 ? "one repair" : `${repairs} repairs`} after testing what I had` : ""} -- over ${input.decisions} decisions, and the last ${repairs ? "repair" : "attempt"} got no further than the one before it.`;
  const message = [`I could not build this Flow, and I found no way to: ${what}`, automationStudioFlowBootstrapTestSaid(input.judgement), tried]
    .filter(Boolean)
    .join(" ");
  return {
    kind: "not_doable",
    message: message.slice(0, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE),
    notDone,
    tried: { rounds: input.rounds, decisions: input.decisions, stepsInFlow: input.judgement.stepsInFlow, tested: input.judgement.tested }
  };
}
