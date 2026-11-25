import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftStepLeftOut } from "./left-out.ts";

/**
 * A `repeat` whose `over` names a read the framework left out puts that read in: it is the
 * listing the repeat walks. Returns how to put the step back as it was, for a repeat that is
 * then refused, or nothing when `over` is no such read.
 */
export function automationStudioFlowDraftEditPutInOver(over: AutomationStudioFlowDraftStep | undefined): (() => void) | undefined {
  if (!over || !automationStudioFlowDraftStepLeftOut(over) || over.effect !== "observe" || !automationStudioFlowDraftStepIsProposable(over)) return undefined;
  const { disposition, drafted } = over;
  over.disposition = "kept";
  delete over.drafted;
  return () => {
    over.disposition = disposition;
    if (drafted !== undefined) over.drafted = drafted;
  };
}
