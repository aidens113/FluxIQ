import { automationStudioFlowDraftStepById } from "../../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";

export function automationStudioFlowDraftReplacingStep(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep | undefined {
    let current = step;
    for (let hops = 0; current.replacedBy !== undefined && hops < steps.length; hops += 1) {
        const next = automationStudioFlowDraftStepById(steps, current.replacedBy);
        if (!next)
            return undefined;
        current = next;
    }
    return current === step || current.replacedBy !== undefined ? undefined : current;
}
