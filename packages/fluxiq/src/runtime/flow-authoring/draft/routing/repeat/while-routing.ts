import type { AutomationStudioFlowDraftStepRouting } from "../step/index.ts";

export type AutomationStudioFlowDraftRepeatWhileRouting = Extract<AutomationStudioFlowDraftStepRouting, {
    while: string;
}>;
