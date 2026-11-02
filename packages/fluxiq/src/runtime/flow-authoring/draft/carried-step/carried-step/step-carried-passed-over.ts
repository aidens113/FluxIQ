import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { runnable } from "./runnable.ts";
import { automationStudioFlowDraftStepCarriedJoin } from "./step-carried-join.ts";
import { automationStudioFlowDraftStepCarried } from "./step-carried.ts";

export function automationStudioFlowDraftStepCarriedPassedOver(step: AutomationStudioFlowDraftStep): boolean {
    if (!automationStudioFlowDraftStepCarried(step) || automationStudioFlowDraftStepCarriedJoin(step))
        return false;
    if (step.routing?.kind !== "optional" && step.interruption !== true)
        return false;
    return !runnable(step);
}
