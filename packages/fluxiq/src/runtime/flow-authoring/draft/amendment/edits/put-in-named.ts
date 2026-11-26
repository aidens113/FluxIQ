import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftStepLeftOut } from "./left-out.ts";

/**
 * A `repeat` puts in the steps it names that the framework left out: the listing `over` walks, the step `while`
 * runs until it ends, and the span's last step `through`. The paging pattern -- read, Next page, repeat the read
 * while Next page works -- names a press the framework left out as leading nowhere after the only read
 * (`../../compose/after-result.ts`), and the repeat could not stand on it (t1037 phase 2). Each step put in becomes the
 * model's. Returns how to put every one back as it was, for a repeat that is then refused, or nothing when none was out.
 */
export function automationStudioFlowDraftEditPutInNamed(named: readonly (AutomationStudioFlowDraftStep | undefined)[]): (() => void) | undefined {
  const putIn = [...new Set(named)].filter((step): step is AutomationStudioFlowDraftStep => step !== undefined && automationStudioFlowDraftStepLeftOut(step) && automationStudioFlowDraftStepIsProposable(step));
  if (!putIn.length) return undefined;
  const before = putIn.map((step) => ({ step, disposition: step.disposition, drafted: step.drafted }));
  for (const step of putIn) {
    step.disposition = "kept";
    delete step.drafted;
  }
  return () => {
    for (const { step, disposition, drafted } of before) {
      step.disposition = disposition;
      if (drafted !== undefined) step.drafted = drafted;
    }
  };
}
