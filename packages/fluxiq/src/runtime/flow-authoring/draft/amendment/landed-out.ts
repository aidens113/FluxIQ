// A step that did something lasting, and is not in the Flow.
//
// **The failure (paid run `run-mw3itjcy-ce4429f7`, step 67).** A model dropped the steps of two
// of its three saves from the draft. The drop was answered as any drop is, and nothing said what
// it meant: the saves still stood on the site and on the task's record, and the Flow saved from
// that draft no longer did them. The strand check asks only whether a kept step keeps its way to
// its page, so it may put a navigation back and let the act beside it go.
//
// **Applied and told, never refused.** The model may be right: a step that saved the wrong thing
// should not be in the Flow, and refusing the drop would hold a wrong act in it. A draft edit is
// not lasting and `keep` undoes it, while a refusal would count toward ending the round, however
// often a model that insists repeats itself. So the step leaves, it is marked where the model reads
// the draft on every decision (`../entry.ts`), and nothing else changes: the act record stays as
// it is, since nothing un-happens, and whether it was the right act is the judge's to say.

import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step.ts";
import { automationStudioFlowDraftStepActDone } from "../verify-only.ts";

/**
 * Whether `step` took a lasting effect and is out of the Flow: it declared one or names an act,
 * and worked. A step Core took out as half of a pair that changed nothing has left no effect
 * (`../reversal.ts`), and one the act record refused was never run (`proposes: false`).
 */
export function automationStudioFlowDraftStepLandedOut(step: AutomationStudioFlowDraftStep): boolean {
  if (automationStudioFlowDraftStepIsProposed(step) || step.cancels !== undefined) return false;
  if (automationStudioFlowDraftStepActDone(step)) return true;
  return step.effect === "mutate" && step.effectApplied === true && step.proposes !== false && step.acts !== undefined && step.acts.length > 0;
}
