import type { AutomationStudioFlowDraftReplayOutcome } from "./outcome.ts";

export function automationStudioFlowDraftReplayOutcomeKey(outcome: AutomationStudioFlowDraftReplayOutcome): string {
    return `${outcome.step}:${outcome.actionId}`;
}
