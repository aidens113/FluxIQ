import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
const PARAMETERS_KEY = "parameters";
const NODE_KEY = "node";
export function automationStudioFlowDraftSettingsRewriteRun(step: AutomationStudioFlowDraftStep, settings: JsonObject | undefined, input?: JsonObject | undefined): boolean {
    return rewritesParameters(step, settings) || (input !== undefined && (namesAnotherNode(step, input) || rewritesParameters(step, parametersOf(input))));
}
function namesAnotherNode(step: AutomationStudioFlowDraftStep, input: JsonObject): boolean {
    const node = input[NODE_KEY];
    return typeof node === "string" && node !== step.actionId && node !== step.input[NODE_KEY];
}
function rewritesParameters(step: AutomationStudioFlowDraftStep, settings: JsonObject | undefined): boolean {
    if (!settings)
        return false;
    const ranWith = [parametersOf(step.ranWith), parametersOf(step.input)].filter((value): value is JsonObject => value !== undefined);
    return Object.entries(settings).some(([key, value]) => {
        const held = ranWith.filter((parameters) => Object.hasOwn(parameters, key));
        return held.length > 0 && !held.some((parameters) => sameValue(parameters[key]!, value));
    });
}
function parametersOf(argument: JsonObject | undefined): JsonObject | undefined {
    if (!argument)
        return undefined;
    const nested = argument[PARAMETERS_KEY];
    return isObject(nested) ? nested : argument;
}
function sameValue(left: JsonValue, right: JsonValue): boolean {
    if (left === right)
        return true;
    if (Array.isArray(left) || Array.isArray(right)) {
        return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, index) => sameValue(entry, right[index]!));
    }
    if (!isObject(left) || !isObject(right))
        return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key]!, right[key]!));
}
function isObject(value: JsonValue | undefined): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
