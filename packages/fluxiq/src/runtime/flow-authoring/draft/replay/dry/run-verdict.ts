import { automationStudioFlowDraftReplayOutcomeBlocks } from "../outcome/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome } from "../outcome/index.ts";
import type { AutomationStudioFlowDraftDryRun } from "./run.ts";

export function automationStudioFlowDraftDryRunVerdict(input: {
    attempt: number;
    reset: "ok" | "failed";
    outcomes: readonly AutomationStudioFlowDraftReplayOutcome[];
    conditional?: ReadonlySet<string>;
}): AutomationStudioFlowDraftDryRun {
    const outcomes = input.outcomes.map((outcome) => ({ ...outcome }));
    const conditional = input.conditional ?? new Set<string>();
    const excused = (outcome: AutomationStudioFlowDraftReplayOutcome): boolean => outcome.stepId !== undefined && conditional.has(outcome.stepId)
        && (outcome.passes === undefined || outcome.withheldBy !== undefined);
    const blocking = outcomes.filter((outcome) => !excused(outcome) && automationStudioFlowDraftReplayOutcomeBlocks(outcome));
    return {
        attempt: input.attempt,
        reset: input.reset,
        outcomes,
        providerCalls: 0,
        ok: input.reset === "ok" && !blocking.length
    };
}
