// A choice of an act made on a step after the step that does the act.
//
// **The defect this names (live run `run-murwdp4f-35f976d2`, cause C2).** The
// draft pressed the towels' "+" (a2.quantity, step 16) after their Add to cart
// (a2, step 12). Both claims stood -- the "+" sets a quantity, the Add adds --
// so the checklist showed both done and the Flow added one pack where the
// person asked for two. The act ran before its choice, so the choice did
// nothing for it.
//
// **Information, never a refusal (t195).** The verdict and the checklist say
// it beside the choice (`./standing.ts` finds it, `./check.ts` and
// `./checklist.ts` show it); a completion is not refused for it. A choice made
// after its act can still be right -- a quantity set on the cart line the add
// made -- which only the test and its judge can see, so the sentence says
// that too. Positions are the draft's own order, the numbers the model is shown.
//
// **It names the amendment that moves the choice (live run
// `run-murzln6g-11debe1d`, C3).** Told eight times to "make the choice before
// the step that does a2", the model never moved step 16: the sentence said
// what to do and not how. `reorder` with `to` (`../../flow-draft/amendment.ts`)
// moves a step to a position, and the act's own position puts the choice just
// before it.

import { automationStudioFlowDraftStepMovedTarget, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

/** A choice made on a step after its act's step: the choice's id, the two positions, and the sentence shown. */
export type AutomationStudioInstructedChoiceAfterAct = {
  /** The choice's id: `a2.quantity`. */
  id: string;
  /** The position of the step named for the choice. */
  step: number;
  /** The position of the step that does the choice's act, before it. */
  actStep: number;
  said: string;
};

/** The choice made after its act, with what the model and the judge are told, or nothing when it comes first. */
export function automationStudioInstructedChoiceAfterAct(input: { id: string; of: string; step: AutomationStudioFlowDraftStep; actStep: AutomationStudioFlowDraftStep }): AutomationStudioInstructedChoiceAfterAct | undefined {
  const step = input.step.position;
  const actStep = input.actStep.position;
  if (step <= actStep) return undefined;
  // Domain places stay opaque. A choice found elsewhere cannot safely be
  // moved before the step that may have brought its target into reach.
  // Live run musq0b1m followed that advice and paid for nine repair decisions.
  if (automationStudioFlowDraftStepMovedTarget(input.actStep, input.step)) return {
    id: input.id, step, actStep,
    said: `${input.id} is made by step ${step}, after step ${actStep} claims ${input.of}, at a different place. `
      + `Do not move step ${step} before step ${actStep}: its target may only be available after that step. `
      + `Check the claim of ${input.of} on step ${actStep}; name it on the step that actually does the act after its choices, `
      + `or keep this order if step ${step} changes what the act already did. The whole-Flow test and its judge decide.`
  };
  return {
    id: input.id,
    step,
    actStep,
    said: `${input.id} is made by step ${step}, after step ${actStep} does ${input.of}: the act runs before its choice, so the choice does nothing for it `
      + `unless step ${step} changes what the act already did (such as the line it put in a cart). Make the choice before the step that does ${input.of}: `
      + `amend_draft reorder on step ${step} with to ${actStep} moves step ${step} to position ${actStep}, just before that step. `
      + `Or do ${input.of} again after it and name that step for ${input.of}.`
  };
}
