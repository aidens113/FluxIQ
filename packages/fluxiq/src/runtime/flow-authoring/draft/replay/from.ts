import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioFlowDraftStepCarriedJoin } from "../carried-step/index.ts";
import { automationStudioFlowDraftScheduledCandidateCall } from "../scheduled-candidate/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step/index.ts";

export function automationStudioFlowDraftReplayFrom(steps: readonly AutomationStudioFlowDraftStep[]): JsonObject | undefined {
    const first = steps.find((step) => automationStudioFlowDraftStepIsProposed(step) && !automationStudioFlowDraftStepCarriedJoin(step));
    return first?.scheduledCandidate !== undefined ? automationStudioFlowDraftScheduledCandidateCall(first)?.from : first?.replay?.from;
}
