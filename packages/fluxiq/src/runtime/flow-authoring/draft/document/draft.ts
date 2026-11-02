import type { AutomationStudioFlowDraftStep } from "../step/index.ts";

export type AutomationStudioFlowDraft = {
    schemaVersion: "automation-studio.flow-draft.v1";
    steps: readonly AutomationStudioFlowDraftStep[];
};
