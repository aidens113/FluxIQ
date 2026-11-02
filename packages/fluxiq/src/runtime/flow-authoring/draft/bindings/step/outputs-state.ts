import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT } from "./output-root.ts";

export function automationStudioFlowDraftStepOutputsState(outputs: Iterable<readonly [
    string,
    JsonObject
]>): Record<string, JsonValue> {
    const state: Record<string, JsonValue> = {};
    for (const [stepId, produced] of outputs)
        state[`${AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT}.${stepId}`] = produced;
    return state;
}
