import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftExcusedWords } from "../../excused/index.ts";
import { automationStudioFlowDraftPathToStep } from "../../path-to-step.ts";
import type { DraftPresentation } from "../../presentation/index.ts";
import { automationStudioFlowDraftStepById } from "../../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftReplayOutcomeWord } from "../../verification/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome } from "../outcome/index.ts";
import { automationStudioFlowDraftReplayOutcomeKey } from "../outcome/index.ts";
import { automationStudioFlowDraftReplayPassWords } from "../pass-words.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE } from "./run-issue-code.ts";
import type { AutomationStudioFlowDraftDryRun } from "./run.ts";

export function automationStudioFlowDraftDryRunFeedback(verdict: AutomationStudioFlowDraftDryRun, presentation: Pick<DraftPresentation, "dryRunInstruction" | "excused" | "missingPredecessors">, told: ReadonlySet<string> = new Set(), steps?: readonly AutomationStudioFlowDraftStep[]): JsonObject {
    const missing = steps ? notInFlow(verdict, steps, presentation) : undefined;
    return {
        ok: false,
        code: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
        attempt: verdict.attempt,
        reset: verdict.reset,
        steps: verdict.outcomes.map((outcome) => ({
            step: outcome.step,
            actionId: outcome.actionId,
            replayed: automationStudioFlowDraftReplayOutcomeWord(outcome),
            ...(outcome.resultCode ? { resultCode: outcome.resultCode } : {}),
            ...(outcome.withheldBy !== undefined ? { afterWithheld: outcome.withheldBy } : {}),
            ...(excusedLine(outcome, presentation)),
            ...(outcome.reanchored ? { reanchored: true } : {}),
            ...automationStudioFlowDraftReplayPassWords(outcome),
            ...(outcome.status !== "replayed" && told.has(automationStudioFlowDraftReplayOutcomeKey(outcome)) ? { again: true } : {}),
            ...(steps && outcome.status !== "replayed" ? actedOnLine(outcome, steps) : {})
        })),
        ...(missing ? { notInFlow: missing } : {}),
        instruction: presentation.dryRunInstruction()
    };
}

function actedOnLine(outcome: AutomationStudioFlowDraftReplayOutcome, steps: readonly AutomationStudioFlowDraftStep[]): {
    actedOn?: JsonObject;
} {
    const step = (outcome.stepId !== undefined ? automationStudioFlowDraftStepById(steps, outcome.stepId) : undefined) ?? steps.find((each) => each.position === outcome.step);
    const from = step?.replay?.from;
    return from ? { actedOn: from } : {};
}

function excusedLine(outcome: AutomationStudioFlowDraftReplayOutcome, presentation: Pick<DraftPresentation, "excused">): {
    excused?: string;
} {
    const words = automationStudioFlowDraftExcusedWords(outcome, presentation);
    return words ? { excused: words } : {};
}

function notInFlow(verdict: AutomationStudioFlowDraftDryRun, steps: readonly AutomationStudioFlowDraftStep[], presentation: Pick<DraftPresentation, "missingPredecessors">): string | undefined {
    const unreached = verdict.outcomes.find((outcome) => outcome.status === "unreproducible");
    const step = unreached ? steps.find((candidate) => candidate.position === unreached.step) : undefined;
    if (!step)
        return undefined;
    const way = automationStudioFlowDraftPathToStep(steps, step).map((each) => each.position).sort((a, b) => a - b);
    if (!way.length)
        return undefined;
    return presentation.missingPredecessors({ steps: way, targetStep: step.position });
}
