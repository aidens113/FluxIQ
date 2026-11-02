import { isAutomationNodeParameterStateBinding } from "../../../../components/automation/index.ts";
import type { JsonValue, JsonObject } from "../../../../core/index.ts";
import { automationStudioFlowDraftIsBindingForm } from "./is/index.ts";
import { MAXIMUM_DEPTH } from "./maximum-depth.ts";

export function holds(value: JsonValue | undefined, depth: number): boolean {
    if (depth > MAXIMUM_DEPTH || value === null || typeof value !== "object")
        return false;
    if (Array.isArray(value))
        return value.some((item) => holds(item, depth + 1));
    if (automationStudioFlowDraftIsBindingForm(value) || isAutomationNodeParameterStateBinding(value))
        return true;
    return Object.values(value as JsonObject).some((item) => holds(item, depth + 1));
}
