import type { AutomationStudioFlowDraftStepRouting } from "../step/index.ts";

export type AutomationStudioFlowDraftRepeatOverRouting = Extract<AutomationStudioFlowDraftStepRouting, {
    over: string;
}>;
