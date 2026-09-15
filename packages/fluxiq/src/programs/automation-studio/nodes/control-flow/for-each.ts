import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult } from "../contracts.ts";
import { defineBuiltinNode, numberValue } from "../shared/definition.ts";

/** How many items one For Each takes unless its author says otherwise. */
const DEFAULT_MAX_ITERATIONS = 100;

/** The most items one For Each may be set to take. */
const MAX_ITERATIONS_CEILING = 10_000;

export const forEachNode = defineBuiltinNode({
  id: "builtin.control.for-each",
  label: "For Each",
  description: "Run a section once for every item in a list.",
  class: "control-flow",
  scope: "both",
  inputs: [{ id: "items", label: "Items", valueType: "array", required: true }],
  outputs: [
    { id: "body", label: "Each item", valueType: "any" },
    { id: "done", label: "Done", valueType: "any" },
    { id: "item", label: "Item", valueType: "any" },
    { id: "index", label: "Index", valueType: "number" },
    { id: "count", label: "Count", valueType: "number" }
  ],
  parameters: [
    {
      id: "maxIterations",
      label: "Maximum items",
      description: "Safety limit: a list with more items than this fails instead of running. At most 10,000.",
      valueType: "number",
      defaultValue: DEFAULT_MAX_ITERATIONS,
      constraints: { minimum: 1, maximum: MAX_ITERATIONS_CEILING, integer: true }
    },
    {
      id: "maxStepsPerIteration",
      label: "Steps per item",
      description: "How many more steps the run may take for each item. A whole run stops at 100,000 steps.",
      valueType: "number",
      defaultValue: 50,
      // The executor reads the authored value to grant the steps, before any binding could be resolved.
      allowStateBinding: false,
      constraints: { minimum: 1, integer: true }
    }
  ],
  icon: "repeat",
  execute: (context) => forEachPass(context)
});

// One pass. The first pass reads the list and checks it against the limit;
// every later pass reads the place the run kept, so a list that changes while
// the body runs does not change this iteration. The item is handed on as the
// list holds it, by reference, so a captured row is still found by identity
// when the saved trace replaces it with a marker.
function forEachPass(context: AutomationNodeExecutionContext): AutomationNodeExecutionResult {
  const { iteration } = context;
  if (!iteration) return failedPass("for_each.iteration_unavailable", "blocked_by_capability_or_policy", "For Each runs only inside a Flow run, which keeps its place in the list.");
  let state = iteration.get();
  if (!state) {
    const items = context.inputs.items;
    if (!Array.isArray(items)) return failedPass("for_each.items_invalid", "graph_validation_or_unknown_node", "For Each needs a list in Items.");
    const limit = maxIterations(context);
    if (items.length > limit) return failedPass("for_each.max_iterations_exceeded", "blocked_by_capability_or_policy", `For Each was given ${items.length} items, more than its limit of ${limit}.`);
    state = { items, index: 0 };
  }
  const count = state.items.length;
  if (state.index < count) {
    const index = state.index;
    iteration.set({ items: state.items, index: index + 1 });
    return { status: "success", route: "body", outputs: { item: state.items[index] ?? null, index, count } };
  }
  iteration.set();
  return { status: "success", route: "done", outputs: { count } };
}

function maxIterations(context: AutomationNodeExecutionContext): number {
  const authored = Math.floor(numberValue(context.parameters.maxIterations, DEFAULT_MAX_ITERATIONS));
  return Math.min(MAX_ITERATIONS_CEILING, Math.max(1, authored));
}

function failedPass(code: string, category: AutomationStudioFailureRecord["category"], message: string): AutomationNodeExecutionResult {
  return { status: "failed", route: "failed", outputs: {}, message, failure: { category, code, retryable: false } };
}
