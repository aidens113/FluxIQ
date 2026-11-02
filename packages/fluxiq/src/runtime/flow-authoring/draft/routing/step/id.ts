import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";

export function automationStudioFlowDraftStepId(step: AutomationStudioFlowDraftStep): string {
    return step.id ?? `p${step.position}`;
}
