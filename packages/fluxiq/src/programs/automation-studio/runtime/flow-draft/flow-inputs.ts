// The inputs a draft's Flow takes, read off the bindings its steps carry.
//
// A Flow input is declared by the first `$input` binding that names it, and
// its test value is that binding's fallback (`./binding-forms.ts`): the value
// the build tests with and the stored Flow runs on when a run supplies none.
// There is no separate declaration to keep in step with the steps, so the
// list is derived afresh from the proposed steps whenever it is shown.
//
// One name with two test values is a conflict: a run that supplies nothing
// would use one value at one step and another at the next, so the assembler
// refuses it (`flow_draft.input_conflict`) and the draft names it.

import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftStoredBindings } from "./binding-forms.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsProposed } from "./step.ts";

/** One input the draft's Flow takes: its name, the value it is tested with, and the steps using it. */
export type AutomationStudioFlowDraftInput = { name: string; test: JsonValue; steps: number[] };

/** One input named with more than one test value: each distinct value, and every step using the name. */
export type AutomationStudioFlowDraftInputConflict = { name: string; tests: JsonValue[]; steps: number[] };

/**
 * The inputs the proposed steps declare, in the order they are first used, and
 * every name given more than one test value. A step's bindings are read from
 * what it runs with, else from what it shows.
 */
export function automationStudioFlowDraftInputs(steps: readonly AutomationStudioFlowDraftStep[]): {
  inputs: AutomationStudioFlowDraftInput[];
  conflicts: AutomationStudioFlowDraftInputConflict[];
} {
  const byName = new Map<string, { input: AutomationStudioFlowDraftInput; tests: Map<string, JsonValue> }>();
  for (const step of steps.filter(automationStudioFlowDraftStepIsProposed)) {
    const argument = step.ranWith?.parameters ?? step.input.parameters ?? step.ranWith ?? step.input;
    for (const { binding } of automationStudioFlowDraftStoredBindings(argument)) {
      if (binding.kind !== "input") continue;
      let entry = byName.get(binding.name);
      if (!entry) {
        entry = { input: { name: binding.name, test: binding.test, steps: [] }, tests: new Map() };
        byName.set(binding.name, entry);
      }
      if (!entry.input.steps.includes(step.position)) entry.input.steps.push(step.position);
      const key = canonical(binding.test);
      if (!entry.tests.has(key)) entry.tests.set(key, binding.test);
    }
  }
  const entries = [...byName.values()];
  return {
    inputs: entries.map((entry) => entry.input),
    conflicts: entries.filter((entry) => entry.tests.size > 1).map((entry) => ({ name: entry.input.name, tests: [...entry.tests.values()], steps: [...entry.input.steps] }))
  };
}

/** A value as text that is the same for two values equal but for key order. */
function canonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
}
