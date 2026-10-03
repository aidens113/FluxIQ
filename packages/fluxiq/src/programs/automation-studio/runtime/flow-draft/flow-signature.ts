// What a Flow version *is*, for the test that runs it whole and the judge of
// that test.
//
// **The rule (user, 2026-10-02).** A Flow is finished only after a run of the
// whole Flow from its start was judged to do what was asked, on the Flow as it
// finally stands; any edit to the Flow after that run needs another full run.
// So a test, and a verdict on it, has to say which Flow it was about, and two
// drafts are the same Flow exactly when this signature says so.
//
// **Why not the replay signature.** `automationStudioFlowDraftReplaySignature`
// (`./dry-run.ts`) is what a replay *sends*: each step's action and argument.
// It leaves routing out, and that let a draft whose failing step was marked
// optional after a refused replay read as the draft that replay ran, so the
// gate passed it on the old replay's outcomes judged again under the new
// routing -- a Flow that had never run as written was accepted as tested.
// Routing and settings are what the Flow is *written* from (`./routing.ts`,
// the assembler): an edit to either is an edit to the Flow. The replay
// signature stays as it is for what it answers -- whether the model is still
// re-sending the same steps (progress and no-progress).
//
// What is not in it is what changes without the Flow changing: the call and
// iteration a step was decided in, what the last replay answered, how to put
// the target back, and the order the model listed a step's acts in.

import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "./step.ts";

/**
 * The Flow a draft stands for, as one comparable string: per proposed step, in
 * order, `[actionId, ranWith ?? input, settings, routing, interruption, acts]`.
 */
export function automationStudioFlowDraftFlowSignature(steps: readonly AutomationStudioFlowDraftStep[]): string {
  return JSON.stringify(steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => [
    step.actionId,
    step.ranWith ?? step.input,
    step.settings ?? null,
    step.routing ?? null,
    step.interruption === true,
    [...(step.acts ?? [])].sort()
  ]));
}
