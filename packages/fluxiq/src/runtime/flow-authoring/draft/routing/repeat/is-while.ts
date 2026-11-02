import type { AutomationStudioFlowDraftStepRouting } from "../step/index.ts";
import type { AutomationStudioFlowDraftRepeatWhileRouting } from "./while-routing.ts";

export function automationStudioFlowDraftRepeatIsWhile(routing: AutomationStudioFlowDraftStepRouting | undefined): routing is AutomationStudioFlowDraftRepeatWhileRouting {
    return routing?.kind === "repeat" && typeof routing.while === "string";
}
