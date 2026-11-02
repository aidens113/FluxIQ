import type { DraftPresentation } from "../presentation/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome } from "../replay/index.ts";

export function automationStudioFlowDraftExcusedWords(outcome: AutomationStudioFlowDraftReplayOutcome, presentation: Pick<DraftPresentation, "excused">): string | undefined {
    if (outcome.excused === undefined || outcome.status === "replayed")
        return undefined;
    return presentation.excused({ reason: outcome.excused, status: outcome.status, ...(outcome.withheldBy === undefined ? {} : { withheldBy: outcome.withheldBy }) });
}
