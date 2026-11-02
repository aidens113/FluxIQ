import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftStoredBindings } from "../bindings/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step/index.ts";
import type { AutomationStudioFlowDraftInputConflict } from "./input-conflict.ts";
import type { AutomationStudioFlowDraftInput } from "./input.ts";

export function automationStudioFlowDraftInputs(steps: readonly AutomationStudioFlowDraftStep[]): {
    inputs: AutomationStudioFlowDraftInput[];
    conflicts: AutomationStudioFlowDraftInputConflict[];
} {
    const byName = new Map<string, {
        input: AutomationStudioFlowDraftInput;
        tests: Map<string, JsonValue>;
    }>();
    for (const step of steps.filter(automationStudioFlowDraftStepIsProposed)) {
        const argument = step.ranWith?.parameters ?? step.input.parameters ?? step.ranWith ?? step.input;
        for (const { binding } of automationStudioFlowDraftStoredBindings(argument)) {
            if (binding.kind !== "input")
                continue;
            let entry = byName.get(binding.name);
            if (!entry) {
                entry = { input: { name: binding.name, test: binding.test, steps: [] }, tests: new Map() };
                byName.set(binding.name, entry);
            }
            if (!entry.input.steps.includes(step.position))
                entry.input.steps.push(step.position);
            const key = canonical(binding.test);
            if (!entry.tests.has(key))
                entry.tests.set(key, binding.test);
        }
    }
    const entries = [...byName.values()];
    return {
        inputs: entries.map((entry) => entry.input),
        conflicts: entries.filter((entry) => entry.tests.size > 1).map((entry) => ({ name: entry.input.name, tests: [...entry.tests.values()], steps: [...entry.input.steps] }))
    };
}

function canonical(value: JsonValue): string {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
}
