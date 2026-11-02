import type { JsonObject } from "../../../../../core/index.ts";
import type { Step } from "./step.ts";

export type AutomationStudioFlowDraftWithdrawal = {
    step: Step;
    named: number;
    disposition: Step["disposition"];
    settings: JsonObject | undefined;
};
