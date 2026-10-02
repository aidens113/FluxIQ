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

import type { AutomationStudioFlowDraftStep } from "./step.ts";

/** Records that `step` does `act`, and that no other step of `steps` does. */
export function automationStudioFlowDraftClaimAct(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, act: string): void {
  for (const other of steps) {
    if (other === step || !other.acts?.includes(act)) continue;
    const left = other.acts.filter((claimed) => claimed !== act);
    if (left.length) other.acts = left;
    else delete other.acts;
  }
  if (!step.acts?.includes(act)) step.acts = [...(step.acts ?? []), act];
}
