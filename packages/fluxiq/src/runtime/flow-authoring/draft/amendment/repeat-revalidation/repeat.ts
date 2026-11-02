import type { AutomationStudioFlowDraftStepRouting } from "../../routing/index.ts";

export type Repeat = Extract<AutomationStudioFlowDraftStepRouting, {
    kind: "repeat";
}>;
