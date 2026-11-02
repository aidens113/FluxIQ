import type { AutomationStudioFlowDraftReplayOutcome } from "./outcome.ts";

export function automationStudioFlowDraftReplayOutcomeBlocks(outcome: AutomationStudioFlowDraftReplayOutcome): boolean {
    return outcome.status !== "replayed";
}
