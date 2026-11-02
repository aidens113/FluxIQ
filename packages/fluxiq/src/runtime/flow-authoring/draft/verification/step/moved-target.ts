import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";

export function automationStudioFlowDraftStepMovedTarget(step: AutomationStudioFlowDraftStep, next: AutomationStudioFlowDraftStep | undefined): boolean {
    const here = step.replay?.from;
    const there = next?.replay?.from;
    if (here === undefined || there === undefined)
        return false;
    return JSON.stringify(here) !== JSON.stringify(there);
}
