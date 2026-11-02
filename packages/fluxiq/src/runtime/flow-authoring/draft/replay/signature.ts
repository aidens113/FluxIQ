import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step/index.ts";

export function automationStudioFlowDraftReplaySignature(steps: readonly AutomationStudioFlowDraftStep[]): string {
    return JSON.stringify(steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => [step.actionId, step.ranWith ?? step.input]));
}
