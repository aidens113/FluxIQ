import type { AutomationStudioFlowDraftStep } from "./step/index.ts";
export function automationStudioFlowDraftClaimAct(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, act: string): AutomationStudioFlowDraftStep[] {
    const leftBy: AutomationStudioFlowDraftStep[] = [];
    for (const other of steps) {
        if (other === step || !other.acts?.includes(act))
            continue;
        const left = other.acts.filter((claimed) => claimed !== act);
        if (left.length)
            other.acts = left;
        else
            delete other.acts;
        leftBy.push(other);
    }
    if (!step.acts?.includes(act))
        step.acts = [...(step.acts ?? []), act];
    return leftBy;
}
