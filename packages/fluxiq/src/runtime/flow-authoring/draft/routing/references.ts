import { automationStudioFlowDraftRepeatIsWhile } from "./repeat/index.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./step/index.ts";

export function automationStudioFlowDraftRoutingReferences(routing: AutomationStudioFlowDraftStepRouting): string[] {
    if (routing.kind === "only_if")
        return [routing.check];
    if (routing.kind === "on_failed")
        return [routing.to];
    if (automationStudioFlowDraftRepeatIsWhile(routing))
        return [routing.through, routing.while];
    if (routing.kind === "repeat")
        return [routing.through, routing.over];
    return [];
}
