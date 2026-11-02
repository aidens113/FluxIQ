import type { JsonObject } from "../../../../core/index.ts";
import type { DraftPresentation } from "../presentation/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE } from "./code.ts";
import type { AutomationStudioFlowDraftUnrunnableWord } from "./unrunnable-word.ts";

export function automationStudioFlowDraftFullRunRequiredFeedback(steps: readonly {
    position: number;
    actionId: string;
    word: AutomationStudioFlowDraftUnrunnableWord;
}[], presentation: Pick<DraftPresentation, "fullRunRequired">): JsonObject {
    return {
        ok: false,
        code: AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE,
        steps: steps.map((step) => ({ step: step.position, actionId: step.actionId, replayed: step.word })),
        instruction: presentation.fullRunRequired({ nothingRan: steps.length === 0 })
    };
}
