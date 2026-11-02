import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftStepReplayMode } from "./replay-mode.ts";

export function automationStudioFlowDraftStepActDone(step: AutomationStudioFlowDraftStep, lastingActs?: ReadonlySet<string>): boolean {
    return step.priorExecution?.lasting === true || (step.effectApplied === true && step.proposes !== false && automationStudioFlowDraftStepReplayMode(step, lastingActs) === "verify");
}
