// Takes out the presses a later press of the same control undid, for the framework's own steps.
//
// **Why.** The pairing rule is `../reversal.ts`; it works on the steps in the Flow and takes both halves
// out, or a lone reversal. It does not know whose steps they are, and the model has the last word on its
// own (D16). So it runs on the working copy and what it did to a model step is put back. Where one half
// of a pair is the model's, the framework's half is put back too: a pair is undone together or not at
// all, and a lone framework press left out of a pair it never completed would flip the control the wrong
// way. Each framework step it took out is `undone`, keeping the `cancels` it set.
import { automationStudioFlowDraftDropReversals } from "../reversal.ts";
import { automationStudioFlowDraftStepId } from "../routing.ts";
import { automationStudioFlowDraftMark } from "./mark.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** Applies the reversal rule to `working`; `framework` names the framework's steps. */
export function automationStudioFlowDraftComposeUndone(working: AutomationStudioFlowDraftStep[], framework: ReadonlySet<AutomationStudioFlowDraftStep>): void {
  const before = new Map(working.map((step) => [step, { disposition: step.disposition, cancels: step.cancels, acts: step.acts }]));
  const out = automationStudioFlowDraftDropReversals(working);
  const modelIds = new Set(out.filter((step) => !framework.has(step)).map((step) => automationStudioFlowDraftStepId(step)));
  for (const step of out) {
    const was = before.get(step)!;
    const partnerIsModels = step.cancels !== undefined && modelIds.has(step.cancels);
    if (framework.has(step) && !partnerIsModels) {
      automationStudioFlowDraftMark(step, "undone");
      continue;
    }
    step.disposition = was.disposition;
    if (was.cancels === undefined) delete step.cancels;
    else step.cancels = was.cancels;
    if (was.acts === undefined) delete step.acts;
    else step.acts = was.acts;
  }
}
