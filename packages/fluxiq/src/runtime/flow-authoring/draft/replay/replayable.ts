import { automationStudioFlowDraftStepCarriedJoin, automationStudioFlowDraftStepCarriedPassedOver } from "../carried-step/index.ts";
import { automationStudioFlowDraftScheduledCandidateCall } from "../scheduled-candidate/index.ts";
import { automationStudioFlowDraftStartsWhereItStands } from "../starts-where-it-stands.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step/index.ts";
import { automationStudioFlowDraftReplayFrom } from "./from.ts";

export function automationStudioFlowDraftReplayable(steps: readonly AutomationStudioFlowDraftStep[]): boolean {
    const proposed = steps.filter((step) => automationStudioFlowDraftStepIsProposed(step) && !automationStudioFlowDraftStepCarriedJoin(step));
    if (!proposed.length)
        return false;
    if (!proposed.every((step) => automationStudioFlowDraftStepCarriedPassedOver(step) || (step.scheduledCandidate !== undefined ? automationStudioFlowDraftScheduledCandidateCall(step) !== undefined : step.ranWith !== undefined && step.replay !== undefined)))
        return false;
    return automationStudioFlowDraftReplayFrom(steps) !== undefined || automationStudioFlowDraftStartsWhereItStands(steps);
}
