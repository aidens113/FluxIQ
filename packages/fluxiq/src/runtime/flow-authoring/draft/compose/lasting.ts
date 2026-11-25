// Whether a step in the Flow leaves something a detour around it cannot take back.
//
// **Why.** Two of the drafting rules leave out stretches of a run that came to nothing (D16): a detour that
// came back to the state it left (`./dead-end.ts`), and the steps after the result's last read that nothing
// lasting follows (`./after-result.ts`). Both must stop at the same things, or one would drop what the other
// keeps: a step the model put in the Flow, one that changed the page it stayed on, claimed an act, flipped a
// control, was only written, declared a lasting effect, or is one of the result's reads.
//
// **A declared lasting effect is lasting** (t1037, phase 2). A call that declares consequences -- a renewal, a
// confirmation, a purchase -- did something the page may not show as a change on the page it stayed on: the
// framework took such a press after a list's read for a press that led nowhere, though it was the act asked for.
// The declaration is the one the dry run already reads to check such a step rather than do it again
// (`../verify-only.ts`), so the two agree on what lasts.
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftDeclaresLasting } from "../verify-only.ts";

/** Whether `step` is in the Flow and lasting; `framework` names the framework's steps, `resultReads` the result's. */
export function automationStudioFlowDraftStepIsLasting(
  step: AutomationStudioFlowDraftStep,
  framework: ReadonlySet<AutomationStudioFlowDraftStep>,
  resultReads: ReadonlySet<AutomationStudioFlowDraftStep>
): boolean {
  if (step.disposition !== "kept") return false;
  if (!framework.has(step)) return true;
  return (step.changed?.length ?? 0) > 0 || (step.acts?.length ?? 0) > 0 || step.toggle !== undefined || step.written === true || resultReads.has(step) || declaresLasting(step);
}

/** Whether the step's call declared a lasting effect, as the dry run reads it (`../verify-only.ts`). */
function declaresLasting(step: AutomationStudioFlowDraftStep): boolean {
  return step.effect === "mutate" && automationStudioFlowDraftDeclaresLasting(step.ranWith && "consequences" in step.ranWith ? step.ranWith.consequences : step.input.consequences);
}
