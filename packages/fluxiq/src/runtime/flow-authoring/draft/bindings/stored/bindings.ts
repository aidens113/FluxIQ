import { isAutomationNodeParameterStateBinding } from "../../../../../components/automation/index.ts";
import type { JsonValue } from "../../../../../core/index.ts";
import { MAXIMUM_DEPTH } from "../maximum-depth.ts";
import { automationStudioFlowDraftStoredBindingKind } from "./binding-kind.ts";
import type { AutomationStudioFlowDraftStoredBinding } from "./binding.ts";

export function automationStudioFlowDraftStoredBindings(value: JsonValue | undefined): {
    path: string;
    binding: AutomationStudioFlowDraftStoredBinding;
}[] {
    const found: {
        path: string;
        binding: AutomationStudioFlowDraftStoredBinding;
    }[] = [];
    collectStored(value, [], found, 0);
    return found;
}

function collectStored(value: JsonValue | undefined, path: string[], found: {
    path: string;
    binding: AutomationStudioFlowDraftStoredBinding;
}[], depth: number): void {
    if (depth > MAXIMUM_DEPTH || value === null || typeof value !== "object")
        return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectStored(item, [...path, String(index)], found, depth + 1));
        return;
    }
    if (isAutomationNodeParameterStateBinding(value)) {
        const binding = automationStudioFlowDraftStoredBindingKind(value);
        if (binding)
            found.push({ path: path.join("."), binding });
        return;
    }
    for (const [key, item] of Object.entries(value))
        collectStored(item, [...path, key], found, depth + 1);
}
