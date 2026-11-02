import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftHoldsBinding, automationStudioFlowDraftStoredBindingKind } from "../bindings/index.ts";
const PARAMETERS_KEY = "parameters";
const BINDING_KEYS = ["$state", "$input", "$row", "$step"] as const;
export function automationStudioFlowDraftBindablePaths(step: {
    input: JsonObject;
    ranWith?: JsonObject | undefined;
}): string[] {
    const current = step.ranWith ?? step.input;
    const nested = isObject(current[PARAMETERS_KEY]);
    const shown = nested ? step.input[PARAMETERS_KEY] : step.input;
    const runnable = nested ? current[PARAMETERS_KEY] : current;
    if (!isObject(shown) || !isObject(runnable))
        return [];
    const paths: string[] = [];
    collect(shown, runnable, [], paths);
    return paths;
}
function collect(shown: JsonObject, runnable: JsonObject, prefix: string[], paths: string[]): void {
    for (const [key, value] of Object.entries(shown)) {
        if (!Object.hasOwn(runnable, key))
            continue;
        const ran = runnable[key]!;
        const path = [...prefix, key];
        if (value !== null && same(value, ran) && (!automationStudioFlowDraftHoldsBinding(value) || automationStudioFlowDraftStoredBindingKind(value) !== undefined))
            paths.push(path.join("."));
        if (isObject(value) && isObject(ran) && !BINDING_KEYS.some((binding) => Object.hasOwn(value, binding)))
            collect(value, ran, path, paths);
    }
}
function same(left: JsonValue, right: JsonValue): boolean {
    if (left === right)
        return true;
    if (Array.isArray(left) && Array.isArray(right))
        return left.length === right.length && left.every((value, index) => same(value, right[index]!));
    if (!isObject(left) || !isObject(right))
        return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && same(left[key]!, right[key]!));
}
function isObject(value: JsonValue | undefined): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
