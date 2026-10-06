// One act, one step: claiming an act on a step takes it off any other step.
//
// **The failure this closes (live run `run-muq3ubys-4b4dbf5b`, t193 run 36).**
// A claim only ever added an act to a step. The model claimed `a3` on step 32
// and `a3.size` on step 34, was told the choice was claimed on the act's own
// step, and tried to swap them: `32 keep act a3.size`, then `34 keep act a3`.
// Each of those added a claim, so both steps then claimed both acts, and the
// instructed-acts check read step 32 for both and refused
// `choice_is_the_act_step` again -- six completions in a row, until the build's
// $0.25 ran out. The model could not correct a claim, only add to it.
//
// An act is done by one step, so the newest claim of it is the one that stands.
//
// **The step it left is answered, never dropped (live run
// `run-musp4h2f-72e8ed99`, cause 8).** a3 moved from the 3-Pack's Add to cart
// to the single pack's, and the 3-Pack press stayed in the Flow with no act: it
// was pressed again in the next test. Whether that step still belongs is the
// model's to decide -- it may do something the Flow needs besides the act -- so
// the claim answers the steps it took the act from, and the amendment's answer
// names each one left in the Flow with no act (`./amendment/apply.ts`,
// `../llm/draft-amendment-feedback.ts`).

import type { AutomationStudioFlowDraftStep } from "./step.ts";

/**
 * Records that `step` does `act`, and that no other step of `steps` does.
 * Answers the steps the act was taken off, in draft order.
 */
export function automationStudioFlowDraftClaimAct(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, act: string): AutomationStudioFlowDraftStep[] {
  const leftBy: AutomationStudioFlowDraftStep[] = [];
  for (const other of steps) {
    if (other === step || !other.acts?.includes(act)) continue;
    const left = other.acts.filter((claimed) => claimed !== act);
    if (left.length) other.acts = left;
    else delete other.acts;
    leftBy.push(other);
  }
  if (!step.acts?.includes(act)) step.acts = [...(step.acts ?? []), act];
  return leftBy;
}
