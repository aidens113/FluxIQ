import { automationStudioFlowDraftStepAnsweredInterruption } from "../interruption.ts";
import { automationStudioFlowDraftStepId } from "../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";

export function automationStudioFlowDraftInterruptionStepIds(steps: readonly AutomationStudioFlowDraftStep[]): ReadonlySet<string> {
    return new Set(steps.filter(automationStudioFlowDraftStepAnsweredInterruption).map(automationStudioFlowDraftStepId));
}
