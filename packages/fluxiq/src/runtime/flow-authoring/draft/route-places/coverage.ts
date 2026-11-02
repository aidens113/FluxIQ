import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step/index.ts";
export function automationStudioFlowDraftRouteCoverage(steps: readonly AutomationStudioFlowDraftStep[], places: number): {
    missing: string[];
    outOfOrder: string[];
} {
    const kept = steps.filter(automationStudioFlowDraftStepIsProposed);
    const first = Array.from({ length: places }, (_, index) => kept.findIndex((step) => step.places?.includes(`r${index + 1}`) === true));
    const missing = first.flatMap((at, index) => at < 0 ? [`r${index + 1}`] : []);
    const outOfOrder: string[] = [];
    let latest = -1;
    first.forEach((at, index) => {
        if (at < 0)
            return;
        if (at < latest)
            outOfOrder.push(`r${index + 1}`);
        else
            latest = at;
    });
    return { missing, outOfOrder };
}
