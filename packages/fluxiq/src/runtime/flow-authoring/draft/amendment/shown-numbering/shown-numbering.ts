import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";

export type AutomationStudioFlowDraftShownNumbering = {
    step(position: number | undefined): AutomationStudioFlowDraftStep | undefined;
    number(step: AutomationStudioFlowDraftStep): number;
};
