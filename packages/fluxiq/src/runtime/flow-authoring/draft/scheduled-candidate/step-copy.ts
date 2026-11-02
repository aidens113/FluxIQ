import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftCopyScheduledCandidate } from "./candidate/index.ts";
export function automationStudioFlowDraftStepCopy(step: AutomationStudioFlowDraftStep, reshape?: (copy: AutomationStudioFlowDraftStep) => void): AutomationStudioFlowDraftStep {
    const copy = structuredClone(step);
    reshape?.(copy);
    if (step.scheduledCandidate !== undefined) {
        copy.scheduledCandidate = step.scheduledCandidate;
        automationStudioFlowDraftCopyScheduledCandidate(step, copy);
    }
    return copy;
}
