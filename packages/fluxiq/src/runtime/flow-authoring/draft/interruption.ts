import type { AutomationStudioFlowDraftStep } from "./step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "./step/index.ts";
export function automationStudioFlowDraftStepAnsweredInterruption(step: AutomationStudioFlowDraftStep): boolean {
    if (step.interruption !== true || step.acts?.length || step.routing !== undefined)
        return false;
    return automationStudioFlowDraftStepIsProposed(step);
}
