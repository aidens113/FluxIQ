// Whether the draft the model authors has advanced toward the acts, which is
// what progress means where the model authors its draft (audit A1, cause 2).
//
// A landed action used to be progress whatever it did, so a build that went
// back and forth between pages ran to the 64-decision backstop
// (`./no-progress.ts`). What the build is for is a Flow that does the acts, so
// the draft advancing is progress: a step entering the Flow for the first time,
// or fewer acts left undone than ever before.
//
// **High-water marks, not "something changed".** Counting any edit that landed
// would let a model launder a repeated request by toggling one step out and
// back in between asks -- a live build alternated a repeat with an edit for
// sixteen calls (`../../flow-draft/tests/accrual.test.ts`). A step already in
// the Flow once, put back, is not new; an act done, undone and done again is
// not newly done.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";

export type AutomationStudioLlmEvidenceAuthoredProgress = {
  /**
   * Whether the draft has advanced since this was last asked: a step in the
   * Flow now that never was before, or fewer acts undone than ever. Records
   * the new marks either way.
   */
  advanced(): boolean;
};

export function automationStudioLlmEvidenceAuthoredProgress(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** The acts not done yet, by id; absent where no checklist is shown. */
  actsMissing?: ((steps: readonly AutomationStudioFlowDraftStep[]) => readonly string[]) | undefined;
}): AutomationStudioLlmEvidenceAuthoredProgress {
  const everInFlow = new Set<AutomationStudioFlowDraftStep>(input.steps.filter(automationStudioFlowDraftStepIsProposed));
  let fewestMissing = input.actsMissing ? input.actsMissing(input.steps).length : 0;
  return {
    advanced() {
      let advanced = false;
      for (const step of input.steps) {
        if (!automationStudioFlowDraftStepIsProposed(step) || everInFlow.has(step)) continue;
        everInFlow.add(step);
        advanced = true;
      }
      if (input.actsMissing) {
        const missing = input.actsMissing(input.steps).length;
        if (missing < fewestMissing) {
          fewestMissing = missing;
          advanced = true;
        }
      }
      return advanced;
    }
  };
}
