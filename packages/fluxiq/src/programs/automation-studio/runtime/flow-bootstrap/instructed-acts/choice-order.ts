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
export function automationStudioInstructedChoiceAfterAct(input: { id: string; of: string; step: number; actStep: number }): AutomationStudioInstructedChoiceAfterAct | undefined {
  if (input.step <= input.actStep) return undefined;
  return {
    id: input.id,
    step: input.step,
    actStep: input.actStep,
    said: `${input.id} is made by step ${input.step}, after step ${input.actStep} does ${input.of}: the act runs before its choice, so the choice does nothing for it `
      + `unless step ${input.step} changes what the act already did (such as the line it put in a cart). Make the choice before the step that does ${input.of}: `
      + `amend_draft reorder on step ${input.step} with to ${input.actStep} moves step ${input.step} to position ${input.actStep}, just before that step. `
      + `Or do ${input.of} again after it and name that step for ${input.of}.`
  };
}
