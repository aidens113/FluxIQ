import type { AutomationStudioFlowDraftStep } from "../step.ts";

export function automationStudioFlowDraftStepIsAction(step: AutomationStudioFlowDraftStep): boolean {
    return step.proposes ?? step.effect === "mutate";
}
