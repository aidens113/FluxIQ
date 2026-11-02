import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftStepIsProposable } from "./proposable.ts";

export function automationStudioFlowDraftStepIsProposed(step: AutomationStudioFlowDraftStep): boolean {
    return step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step);
}
