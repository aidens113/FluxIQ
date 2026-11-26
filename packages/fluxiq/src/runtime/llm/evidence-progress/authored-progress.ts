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
//
// **Only the model's own word on a step counts** (t1037). Where the framework drafts the Flow, a step that works is
// in it the moment it runs: every new press on a page that never moves joined it, so each read as progress and the
// no-progress guard never saw a build pressing control after control for nothing, nor one going back and forth
// between two pages (`run-munwmfrs-b81bbc65`'s shape). What the framework drafted in (`drafted`) is the call's own
// landing, which its page, rows and acts already measure; a step counts when the model's edit put it in (keep,
// result, a repeat that names it), and acts done count as before. A step that leaves and comes back, or a Flow
// that holds no more steps than it once did, is still not new.
import type { AutomationStudioFlowDraftStep } from "../../flow-authoring/draft/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../flow-authoring/draft/index.ts";

export type AutomationStudioLlmEvidenceAuthoredProgress = {
  /**
   * Whether the draft has advanced since this was last asked: a step the
   * model's word put in the Flow that never was before, while the Flow holds
   * more such steps than ever, or fewer acts undone than ever. Records the new
   * marks either way.
   */
  advanced(): boolean;
};

export function automationStudioLlmEvidenceAuthoredProgress(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** The acts not done yet, by id; absent where no checklist is shown. */
  actsMissing?: ((steps: readonly AutomationStudioFlowDraftStep[]) => readonly string[]) | undefined;
}): AutomationStudioLlmEvidenceAuthoredProgress {
  // Every step ever in the Flow, whoever put it there: a step the framework drafted in and the model later keeps is
  // not new. Only a step the model's word put in counts as the draft advancing.
  const ruled = (step: AutomationStudioFlowDraftStep): boolean => step.drafted === undefined;
  const everInFlow = new Set<AutomationStudioFlowDraftStep>(input.steps.filter(automationStudioFlowDraftStepIsProposed));
  let mostInFlow = input.steps.filter((step) => automationStudioFlowDraftStepIsProposed(step) && ruled(step)).length;
  let fewestMissing = input.actsMissing ? input.actsMissing(input.steps).length : 0;
  return {
    advanced() {
      let advanced = false;
      const inFlow = input.steps.filter(automationStudioFlowDraftStepIsProposed);
      const ruledInFlow = inFlow.filter(ruled).length;
      for (const step of inFlow) {
        if (everInFlow.has(step)) continue;
        everInFlow.add(step);
        if (ruled(step) && ruledInFlow > mostInFlow) advanced = true;
      }
      mostInFlow = Math.max(mostInFlow, ruledInFlow);
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
