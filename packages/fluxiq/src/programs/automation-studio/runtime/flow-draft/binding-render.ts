// A stored binding shown back to the model in the form it wrote it.
//
// The draft keeps a step's bindings as the executor's state bindings
// (`./binding-forms.ts`), and the model writes them as `{"$row": ...}` and
// `{"$input": ..., "test": ...}`. Showing the stored shape would teach it a
// second vocabulary for the same thing, and the next step it wrote would mix
// the two; so every value the draft shows it passes through here. A state
// binding of any other kind is shown as it is.

import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftStoredBindingKind } from "./binding-forms.ts";

/** How deep a value is rendered: as far as a binding is ever stored. */
const MAXIMUM_DEPTH = 16;

/** The value with every stored row field and Flow input shown as the form the model writes. */
export function automationStudioFlowDraftRenderBindings<Value extends JsonValue>(value: Value): Value {
  return render(value, 0) as Value;
}

function render(value: JsonValue, depth: number): JsonValue {
  if (depth > MAXIMUM_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => render(item, depth + 1));
  const binding = automationStudioFlowDraftStoredBindingKind(value);
  if (binding?.kind === "row") return { $row: binding.field };
  if (binding?.kind === "input") return { $input: binding.name, test: binding.test };
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, render(item, depth + 1)]));
}
