import { automationStudioFlowDraftScheduledCandidateCall } from "../../scheduled-candidate/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";

export function runnable(step: AutomationStudioFlowDraftStep): boolean {
    return automationStudioFlowDraftScheduledCandidateCall(step) !== undefined || (step.ranWith !== undefined && step.replay !== undefined);
}
