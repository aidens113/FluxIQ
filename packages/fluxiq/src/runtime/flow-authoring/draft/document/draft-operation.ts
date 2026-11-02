import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import type { AutomationStudioFlowDraft } from "./draft.ts";

export function automationStudioFlowDraft(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraft {
    return { schemaVersion: "automation-studio.flow-draft.v1", steps: steps.map((step) => ({ ...step })) };
}
