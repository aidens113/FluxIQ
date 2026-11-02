import { automationStudioFlowDraftPathToStep } from "./path-to-step.ts";
import type { AutomationStudioFlowDraftStep } from "./step/index.ts";
export function automationStudioFlowDraftKeepOpeners(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
    const way = automationStudioFlowDraftPathToStep(steps, step);
    for (const opener of way)
        opener.disposition = "kept";
    return way.reverse();
}
