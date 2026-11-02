import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { runnable } from "./runnable.ts";
import { automationStudioFlowDraftStepCarriedJoin } from "./step-carried-join.ts";
import { automationStudioFlowDraftStepCarriedPassedOver } from "./step-carried-passed-over.ts";
import { automationStudioFlowDraftStepCarried } from "./step-carried.ts";

export function automationStudioFlowDraftStepNotRunInThisBuild(step: AutomationStudioFlowDraftStep): boolean {
    if (!automationStudioFlowDraftStepCarried(step) || automationStudioFlowDraftStepCarriedJoin(step))
        return false;
    if (automationStudioFlowDraftStepCarriedPassedOver(step))
        return false;
    return !runnable(step);
}
