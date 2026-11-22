// What happens to a step a loop before it covers (`./covering-step.ts`, t975).
//
// **Taken out.** A kept step the loop covers leaves the Flow (`dropped`),
// carrying `coveredBy`, the id of the loop's last step, so the draft entry says
// why it is out (`../entry.ts`, `out`). Every such step in a row after the loop
// leaves: with the first gone, the next one directly follows the loop. An act
// claimed on it moves to the loop's last step, which does it.
//
// **A loop that goes takes its rule with it.** A step carrying `coveredBy` that
// no loop covers any longer -- the repeat was taken off, the step moved, the
// loop's last step left -- is put back in the Flow as it was.
//
// Run wherever a repeat can be written or a step moved
// (`../amendment/apply.ts`), and where a saved Flow is read back as a draft
// (`../../../llm/node-tools/draft-from-flow.ts`), so a repair takes out the
// stray step a Flow saved before this rule still carries.
import { automationStudioFlowDraftStepId } from "../routing.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftLoopCoveringStep } from "./covering-step.ts";

type Step = AutomationStudioFlowDraftStep;

/** Puts back each step taken out that no loop covers any longer, then takes out each kept step a loop covers; returns both. */
export function automationStudioFlowDraftSettleLoopCovered(steps: readonly Step[]): { takenOut: Step[]; putBack: Step[] } {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const putBack: Step[] = [];
  for (const step of ordered) {
    if (step.coveredBy === undefined || step.disposition === "kept" || automationStudioFlowDraftLoopCoveringStep(steps, step)) continue;
    step.disposition = "kept";
    delete step.coveredBy;
    putBack.push(step);
  }
  const takenOut: Step[] = [];
  for (const step of ordered) {
    if (!automationStudioFlowDraftStepIsProposed(step)) continue;
    const covering = automationStudioFlowDraftLoopCoveringStep(steps, step);
    if (!covering) continue;
    step.disposition = "dropped";
    step.coveredBy = automationStudioFlowDraftStepId(covering);
    if (step.acts?.length) covering.acts = [...new Set([...(covering.acts ?? []), ...step.acts])];
    delete step.acts;
    takenOut.push(step);
  }
  return { takenOut, putBack };
}
