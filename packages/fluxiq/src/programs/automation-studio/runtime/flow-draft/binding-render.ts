// A stored binding shown back to the model in the form it wrote it.
//
// The draft keeps a step's bindings as the executor's state bindings
// (`./binding-forms.ts`), and the model writes them as `{"$row": ...}`,
// `{"$input": ..., "test": ...}` and `{"$step": n, "output": ...}`. Showing the
// stored shape would teach it a second vocabulary for the same thing, and the
// next step it wrote would mix the two; so every value the draft shows it
// passes through here. A state binding of any other kind is shown as it is.
//
// An earlier step's output is stored under that step's id, and shown as the
// position the step holds in `steps` now: after a reorder, the new one, and
// `null` once the step is gone from the draft. Without `steps` there is no
// position to show, and the binding is shown as stored.

import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftStoredBindingKind } from "./binding-forms.ts";
import { automationStudioFlowDraftStepId } from "./routing.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";

/** How deep a value is rendered: as far as a binding is ever stored. */
const MAXIMUM_DEPTH = 16;

/** The value with every stored binding shown as the form the model writes. */
export function automationStudioFlowDraftRenderBindings<Value extends JsonValue>(value: Value, steps?: readonly AutomationStudioFlowDraftStep[]): Value {
  const positions = steps ? new Map(steps.map((step) => [automationStudioFlowDraftStepId(step), step.position] as const)) : undefined;
  return render(value, 0, positions) as Value;
}

function render(value: JsonValue, depth: number, positions: ReadonlyMap<string, number> | undefined): JsonValue {
  if (depth > MAXIMUM_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => render(item, depth + 1, positions));
  const binding = automationStudioFlowDraftStoredBindingKind(value);
  if (binding?.kind === "row") return { $row: binding.field };
  if (binding?.kind === "input") return { $input: binding.name, test: binding.test };
  if (binding?.kind === "step") {
    if (!positions) return value;
    return { $step: positions.get(binding.step) ?? null, output: binding.output, ...(binding.path === undefined ? {} : { path: binding.path }) };
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, render(item, depth + 1, positions)]));
}
