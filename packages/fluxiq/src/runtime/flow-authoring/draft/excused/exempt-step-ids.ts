import type { AutomationStudioFlowDraftReplayOutcome } from "../replay/index.ts";
import { automationStudioFlowDraftConditionalStepIds } from "../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftWithheldStepIds } from "../verification/index.ts";

export function automationStudioFlowDraftExemptStepIds(steps: readonly AutomationStudioFlowDraftStep[], outcomes: readonly AutomationStudioFlowDraftReplayOutcome[]): Set<string> {
    const checks = outcomes.flatMap((outcome) => (outcome.excused === "check" && outcome.stepId !== undefined ? [outcome.stepId] : []));
    return new Set([...automationStudioFlowDraftConditionalStepIds(steps), ...automationStudioFlowDraftWithheldStepIds(outcomes), ...checks]);
}
