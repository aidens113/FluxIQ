import type { JsonValue } from "../../../core/index.ts";
import { automationStudioFlowDraftStoredBindingKind } from "./bindings/index.ts";
import { automationStudioFlowDraftStepId } from "./routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step/index.ts";
const MAXIMUM_DEPTH = 16;
export function automationStudioFlowDraftRenderBindings<Value extends JsonValue>(value: Value, steps?: readonly AutomationStudioFlowDraftStep[]): Value {
    const positions = steps ? new Map(steps.map((step) => [automationStudioFlowDraftStepId(step), step.position] as const)) : undefined;
    return render(value, 0, positions) as Value;
}
function render(value: JsonValue, depth: number, positions: ReadonlyMap<string, number> | undefined): JsonValue {
    if (depth > MAXIMUM_DEPTH || value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map((item) => render(item, depth + 1, positions));
    const binding = automationStudioFlowDraftStoredBindingKind(value);
    if (binding?.kind === "row")
        return { $row: binding.field };
    if (binding?.kind === "input")
        return { $input: binding.name, test: binding.test };
    if (binding?.kind === "step") {
        if (!positions)
            return value;
        return { $step: positions.get(binding.step) ?? null, output: binding.output, ...(binding.path === undefined ? {} : { path: binding.path }) };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, render(item, depth + 1, positions)]));
}
