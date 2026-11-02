import { automationStudioFlowDraftStepCarried, automationStudioFlowDraftStepCarriedJoin } from "./carried-step/index.ts";
import { automationStudioFlowDraftScheduledCandidateCall } from "./scheduled-candidate/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "./step/index.ts";
export function automationStudioFlowDraftStartsWhereItStands(steps: readonly AutomationStudioFlowDraftStep[]): boolean {
    const first = steps.find((step) => automationStudioFlowDraftStepIsProposed(step) && !automationStudioFlowDraftStepCarriedJoin(step));
    if (!first || !automationStudioFlowDraftStepCarried(first) || first.scheduledCandidate === undefined)
        return false;
    const call = automationStudioFlowDraftScheduledCandidateCall(first);
    return call !== undefined && call.from === undefined;
}
