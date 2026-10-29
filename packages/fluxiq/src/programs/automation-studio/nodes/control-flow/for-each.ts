// A list loop's head: `repeat over` in a Flow script
// (`runtime/flow-bootstrap/authoring/draft-routing.ts`) walks a listing's rows
// through it, one pass per row, in the list's order.
//
// Two numbers bound it, and they mean different things. `maxIterations` is a
// safety limit: a loop that would take more passes than it fails before the
// first, because a list that long is a Flow doing something nobody meant.
// `stopAfter` is part of what the Flow does -- act on the first N rows, as
// `repeat most: N` beside `repeat over:` says -- so the loop takes at most that
// many rows and then ends on `done`, successfully, as if the list held no
// more. The safety limit counts the passes the loop will take, so a long list
// cut to a few rows does not fail it. A saved Flow without `stopAfter` walks
// every row, exactly as before it existed.
//
// **`order` sorts the rows before `stopAfter` takes the first of them (t796).**
// A listing whose node hands its rows on in the order the page shows them puts
// pinned or featured rows first, and "the three most recent" then had no way
// to be said (`run-mvtdn37t-e1e4d0a7`): the model copied a date cutoff out of
// the answer instead. Core now gives the For Each the listing's own sort
// (`runtime/flow-bootstrap/script-statements/repeat-order.ts`), and the loop orders its
// rows with the record-processing sort the saved answer is ordered with
// (`../record-process.ts`): stable, a row a key cannot read after every row it
// can, whichever the direction. The keys are the process's own shape, `{field,
// order: asc|desc, as?: auto|number|date|text}`, read from each row's fields;
// an item that is not an object reads as a row with none. A key that is not
// that shape fails the loop before its first pass rather than walk the rows in
// an order nobody wrote. Unset, null or empty, the list's own order stands.
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult } from "../contracts.ts";
import {
  AUTOMATION_STUDIO_RECORD_SORT_ORDERS,
  AUTOMATION_STUDIO_RECORD_SORT_TYPES,
  sortAutomationStudioRecordRows,
  type AutomationStudioRecordSortKey
} from "../record-process.ts";
import { defineBuiltinNode, numberValue } from "../shared/definition.ts";

/** How many items one For Each takes unless its author says otherwise. */
const DEFAULT_MAX_ITERATIONS = 100;

/** The most items one For Each may be set to take. */
const MAX_ITERATIONS_CEILING = 10_000;

/** What one `order` key may hold, and the words its direction and reading take (`../record-process.ts`). */
const ORDER_KEY_KEYS: ReadonlySet<string> = new Set(["field", "order", "as"]);
const ORDER_DIRECTIONS: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_SORT_ORDERS);
const ORDER_READINGS: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_SORT_TYPES);

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
    // Several steps of one body may each act on the row a pass is on, so the
    // row may leave on more than one edge.
    { id: "item", label: "Item", valueType: "any", multiple: true },
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
      id: "order",
      label: "Order",
      description: "Take the items in this order, before Stop after: a list of keys, each {\"field\", \"order\": asc or desc, \"as\": auto, number, date or text}, read from each item's fields. Items a key cannot read go last. Unset, the list's own order.",
      valueType: "array",
      // Core writes it from the listing's own sort (`runtime/flow-bootstrap/script-statements/repeat-order.ts`).
      allowStateBinding: false
    },
    {
      id: "stopAfter",
      label: "Stop after",
      description: "Take only the first this many items, in the list's order, then finish successfully. Unset, every item is taken. At most 10,000.",
      valueType: "number",
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

// One pass. The first pass reads the list, orders it, keeps its first
// `stopAfter` items and checks those against the limit; every later pass reads
// the place the run kept, so a list that changes while the body runs does not
// change this iteration. The item is handed on as the list holds it, by
// reference, so a captured row is still found by identity when the saved trace
// replaces it with a marker.
function forEachPass(context: AutomationNodeExecutionContext): AutomationNodeExecutionResult {
  const { iteration } = context;
  if (!iteration) return failedPass("for_each.iteration_unavailable", "blocked_by_capability_or_policy", "For Each runs only inside a Flow run, which keeps its place in the list.");
  let state = iteration.get();
  if (!state) {
    const listed = context.inputs.items;
    if (!Array.isArray(listed)) return failedPass("for_each.items_invalid", "graph_validation_or_unknown_node", "For Each needs a list in Items.");
    const keys = orderKeys(context.parameters.order);
    if (keys === null) return failedPass("for_each.order_invalid", "graph_validation_or_unknown_node", "For Each's order is a list of keys, each a field with order asc or desc and, optionally, as auto, number, date or text.");
    const ordered = keys.length ? inOrder(listed, keys, context.now?.() ?? Date.now()) : listed;
    const first = stopAfter(context);
    const items = first === undefined || ordered.length <= first ? ordered : ordered.slice(0, first);
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

/** The items in key order, a new list of the same items; one that is not an object reads as a row with no fields. */
function inOrder(items: readonly JsonValue[], keys: readonly AutomationStudioRecordSortKey[], now: number): JsonValue[] {
  const rows = items.map((item) => ({ item, values: isRow(item) ? item : {} }));
  return sortAutomationStudioRecordRows(rows, keys, now).map((row) => row.item);
}

/** The authored order's keys, `[]` for none written, or `null` for one that is not the record sort's shape. */
function orderKeys(authored: JsonValue | undefined): AutomationStudioRecordSortKey[] | null {
  if (authored === undefined || authored === null) return [];
  if (!Array.isArray(authored)) return null;
  const keys: AutomationStudioRecordSortKey[] = [];
  for (const written of authored) {
    if (!isRow(written) || !Object.keys(written).every((key) => ORDER_KEY_KEYS.has(key))) return null;
    if (typeof written.field !== "string" || written.field.trim() === "" || !ORDER_DIRECTIONS.has(written.order)) return null;
    if (written.as !== undefined && !ORDER_READINGS.has(written.as)) return null;
    keys.push({ field: written.field, order: written.order as AutomationStudioRecordSortKey["order"], ...(written.as === undefined ? {} : { as: written.as as NonNullable<AutomationStudioRecordSortKey["as"]> }) });
  }
  return keys;
}

function maxIterations(context: AutomationNodeExecutionContext): number {
  const authored = Math.floor(numberValue(context.parameters.maxIterations, DEFAULT_MAX_ITERATIONS));
  return Math.min(MAX_ITERATIONS_CEILING, Math.max(1, authored));
}

/** The number of items to take, or `undefined` to take them all: a saved Flow without the option walks every row. */
function stopAfter(context: AutomationNodeExecutionContext): number | undefined {
  const authored = context.parameters.stopAfter;
  if (authored === undefined || authored === null || authored === "") return undefined;
  const first = Math.floor(numberValue(authored, Number.NaN));
  return Number.isFinite(first) ? Math.min(MAX_ITERATIONS_CEILING, Math.max(1, first)) : undefined;
}

function isRow(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failedPass(code: string, category: AutomationStudioFailureRecord["category"], message: string): AutomationNodeExecutionResult {
  return { status: "failed", route: "failed", outputs: {}, message, failure: { category, code, retryable: false } };
}
