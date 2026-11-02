import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step/index.ts";
import type { AutomationStudioFlowDraft } from "./draft.ts";

export function automationStudioFlowDraftProposedSteps(draft: AutomationStudioFlowDraft): readonly AutomationStudioFlowDraftStep[] {
    return draft.steps.filter(automationStudioFlowDraftStepIsProposed);
}
