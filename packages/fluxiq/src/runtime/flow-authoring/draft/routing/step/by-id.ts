import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftStepId } from "./id.ts";

export function automationStudioFlowDraftStepById(steps: readonly AutomationStudioFlowDraftStep[], id: string): AutomationStudioFlowDraftStep | undefined {
    return steps.find((step) => automationStudioFlowDraftStepId(step) === id);
}
