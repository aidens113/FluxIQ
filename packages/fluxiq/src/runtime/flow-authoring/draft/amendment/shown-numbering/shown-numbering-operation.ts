import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "./shown-numbering.ts";

export function automationStudioFlowDraftShownNumbering(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftShownNumbering {
    const byNumber = new Map<number, AutomationStudioFlowDraftStep>();
    for (const step of steps)
        if (!byNumber.has(step.position))
            byNumber.set(step.position, step);
    const numbers = new Map(steps.map((step) => [step, step.position] as const));
    return {
        step: (position) => position === undefined ? undefined : byNumber.get(position),
        number: (step) => numbers.get(step) ?? step.position
    };
}
