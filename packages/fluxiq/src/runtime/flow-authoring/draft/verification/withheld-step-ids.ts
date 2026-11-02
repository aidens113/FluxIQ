import type { AutomationStudioFlowDraftReplayOutcome } from "../replay/index.ts";

export function automationStudioFlowDraftWithheldStepIds(outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]): ReadonlySet<string> {
    return new Set(outcomes.flatMap((outcome) => (outcome.withheldBy !== undefined && outcome.stepId !== undefined ? [outcome.stepId] : [])));
}
