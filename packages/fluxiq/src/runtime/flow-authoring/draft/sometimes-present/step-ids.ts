import { automationStudioFlowDraftExemptStepIds } from "../excused/index.ts";
import type { AutomationStudioFlowDraftDryRun } from "../replay/index.ts";
import { automationStudioFlowDraftReplayOutcomeBlocks } from "../replay/index.ts";
import { automationStudioFlowDraftStepById } from "../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";

export function automationStudioFlowDraftSometimesPresentStepIds(input: {
    steps: readonly AutomationStudioFlowDraftStep[];
    verdict: AutomationStudioFlowDraftDryRun;
}): ReadonlySet<string> {
    const found = new Set<string>();
    if (input.verdict.reset !== "ok")
        return found;
    const excused = automationStudioFlowDraftExemptStepIds(input.steps, input.verdict.outcomes);
    let laterPassed = true;
    let laterReplayed = false;
    for (const outcome of [...input.verdict.outcomes].reverse()) {
        const id = outcome.stepId;
        if (!automationStudioFlowDraftReplayOutcomeBlocks(outcome)) {
            laterReplayed = true;
            continue;
        }
        if (id !== undefined && excused.has(id))
            continue;
        const step = id === undefined ? undefined : automationStudioFlowDraftStepById(input.steps, id);
        const missing = outcome.status === "unreproducible" && outcome.mode === undefined;
        if (laterPassed && laterReplayed && missing && id !== undefined && step && !step.acts?.length && step.routing === undefined) {
            found.add(id);
            continue;
        }
        laterPassed = false;
    }
    return found;
}
