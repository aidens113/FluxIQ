import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step/index.ts";

export function automationStudioFlowDraftPrecedingProposedStep(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep | undefined {
    const proposed = steps.filter(automationStudioFlowDraftStepIsProposed);
    const index = proposed.findIndex((candidate) => candidate === step);
    return index > 0 ? proposed[index - 1] : undefined;
}
