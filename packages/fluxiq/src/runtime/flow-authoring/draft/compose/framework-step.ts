// Whether a draft step is the framework's to decide, or the model's word.
//
// **Why.** The framework drafts the Flow from the calls that worked (D16; user, 2026-11-25), and the
// model edits it. The two must not fight over one step, so each step says whose it is: a step the
// framework wrote a word on (`drafted`), or one the loop just appended and nothing has ruled on
// (`taken`), is the framework's, and every other step -- kept, dropped or exploratory by the model's
// own edit, or carried from a saved Flow -- is the model's and is never touched by the draft.
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** Whether the framework decides this step's place in the Flow. */
export function automationStudioFlowDraftIsFrameworkStep(step: AutomationStudioFlowDraftStep): boolean {
  return step.drafted !== undefined || step.disposition === "taken";
}
