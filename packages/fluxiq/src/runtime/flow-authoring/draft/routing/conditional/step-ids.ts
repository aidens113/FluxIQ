import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftConditionalStepReasons } from "./step-reasons.ts";

export function automationStudioFlowDraftConditionalStepIds(steps: readonly AutomationStudioFlowDraftStep[]): ReadonlySet<string> {
    return new Set(automationStudioFlowDraftConditionalStepReasons(steps).keys());
}
