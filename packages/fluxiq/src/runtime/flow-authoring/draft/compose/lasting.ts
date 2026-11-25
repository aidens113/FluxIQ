// Whether a step in the Flow leaves something a detour around it cannot take back.
//
// **Why.** Two of the drafting rules leave out stretches of a run that came to nothing (D16): a detour that
// came back to the state it left (`./dead-end.ts`), and the steps after the result's last read that nothing
// lasting follows (`./after-result.ts`). Both must stop at the same things, or one would drop what the other
// keeps: a step the model put in the Flow, one that changed the page it stayed on, claimed an act, flipped a
// control, was only written, or is one of the result's reads.
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** Whether `step` is in the Flow and lasting; `framework` names the framework's steps, `resultReads` the result's. */
export function automationStudioFlowDraftStepIsLasting(
  step: AutomationStudioFlowDraftStep,
  framework: ReadonlySet<AutomationStudioFlowDraftStep>,
  resultReads: ReadonlySet<AutomationStudioFlowDraftStep>
): boolean {
  if (step.disposition !== "kept") return false;
  if (!framework.has(step)) return true;
  return (step.changed?.length ?? 0) > 0 || (step.acts?.length ?? 0) > 0 || step.toggle !== undefined || step.written === true || resultReads.has(step);
}
