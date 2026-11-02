import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftDeclaresLasting } from "../declares-lasting.ts";
import type { AutomationStudioFlowDraftReplayMode } from "../replay/index.ts";

export function automationStudioFlowDraftStepReplayMode(step: AutomationStudioFlowDraftStep, lastingActs?: ReadonlySet<string>): AutomationStudioFlowDraftReplayMode {
    if (step.effect !== "mutate")
        return "replay";
    const declared = step.ranWith && "consequences" in step.ranWith ? step.ranWith.consequences : step.input.consequences;
    if (automationStudioFlowDraftDeclaresLasting(declared))
        return "verify";
    return lastingActs?.size && step.acts?.some((act) => lastingActs.has(act)) ? "verify" : "replay";
}
