import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "./step/index.ts";
export function automationStudioFlowDraftFlowSignature(steps: readonly AutomationStudioFlowDraftStep[]): string {
    return JSON.stringify(steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => [
        step.actionId,
        step.ranWith ?? step.input,
        step.settings ?? null,
        step.routing ?? null,
        step.interruption === true,
        [...(step.acts ?? [])].sort()
    ]));
}
