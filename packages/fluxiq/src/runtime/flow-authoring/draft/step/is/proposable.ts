import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftStepIsAction } from "./action.ts";

export function automationStudioFlowDraftStepIsProposable(step: AutomationStudioFlowDraftStep): boolean {
    return automationStudioFlowDraftStepIsAction(step) && (step.written === true || step.checkedCandidate !== undefined || step.effectApplied !== false);
}
