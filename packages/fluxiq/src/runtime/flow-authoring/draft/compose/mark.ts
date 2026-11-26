// Writes the framework's word on a step: in the Flow, or left out and why.
//
// **Why.** `drafted` and `disposition` must always agree (`../step.ts`): `in` is `kept`, any reason is
// `taken`. Writing them in one place keeps the two from drifting, which the drafting function reads
// back to know which steps are still its own (D16).
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepDrafted } from "../step.ts";

/** Sets `drafted` and the disposition that goes with it on `step`. */
export function automationStudioFlowDraftMark(step: AutomationStudioFlowDraftStep, drafted: AutomationStudioFlowDraftStepDrafted): void {
  step.drafted = drafted;
  step.disposition = drafted === "in" ? "kept" : "taken";
}
