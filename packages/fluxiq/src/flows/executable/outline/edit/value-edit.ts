// Changing what a step is given or what it is called: a value, a value read
// from one of the Flow's inputs, or the step's words.
//
// A value's `path` is inside what the step is given, read the way a saved
// part's card reads it (`runtime/project-parts/card/steps.ts`): a recorded
// step's payload (`parameters`), otherwise the node's own parameters. The node
// keeps every other value; `set_node_parameters` replaces the whole object, so
// the patch carries all of it.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationNodeStateBinding, isAutomationNodeParameterStateBinding } from "../../../../components/automation/index.ts";
import type { OutlineEdit, OutlineEditResult } from "../types/index.ts";
import type { OutlineEditContext } from "./edit-context.ts";
import { outlineStepPlace } from "./step-place.ts";

/** The most characters a step's words may have: a card's name. */
const MOST_WORDS = 200;

/** The patch for a value, input binding or words edit. */
export function outlineValueEdit(context: OutlineEditContext, edit: Extract<OutlineEdit, { kind: "set-value" | "bind-input" | "set-words" }>): OutlineEditResult {
  const place = outlineStepPlace(context, edit.step);
  if (!place) return { ok: false, reason: `There is no step ${edit.step}.` };
  const node = place.node;
  if (!node) return { ok: false, reason: `Step ${edit.step} has nothing of its own to change.` };
  if (edit.kind === "set-words") {
    const words = edit.words.replace(/\s+/gu, " ").trim();
    if (!words) return { ok: false, reason: "A step needs some words." };
    if (words.length > MOST_WORDS) return { ok: false, reason: `Keep a step's words under ${MOST_WORDS} characters.` };
    return { ok: true, operations: [{ op: "set_node_label", nodeId: node.id, label: words }], message: `Changed the words of step ${edit.step}` };
  }
  if (!edit.path.length || edit.path.some((segment) => !segment.trim())) return { ok: false, reason: "Say which value of the step to change." };
  const values = structuredClone(node.parameterValues ?? {});
  const recorded = node.definitionId === "builtin.policy.action";
  if (recorded && isAutomationNodeParameterStateBinding(values.parameters)) return { ok: false, reason: `Step ${edit.step} takes all its values from elsewhere. Change them in the graph.` };
  const given: JsonObject = recorded ? objectAt(values, "parameters") : values;
  let value: JsonValue = edit.kind === "set-value" ? edit.value : null;
  if (edit.kind === "bind-input") {
    const input = context.outline.interface.needs.find((port) => port.id === edit.input);
    if (!input) return { ok: false, reason: `This Flow has no input called “${edit.input}”.` };
    const current = valueAt(given, edit.path);
    const binding = automationNodeStateBinding(input.id, current === undefined || isAutomationNodeParameterStateBinding(current) ? undefined : current);
    value = { $state: { ...binding.$state } };
  }
  setAt(given, edit.path, value);
  const message = edit.kind === "bind-input" ? `Step ${edit.step} now uses {${edit.input}}` : `Changed a value of step ${edit.step}`;
  return { ok: true, operations: [{ op: "set_node_parameters", nodeId: node.id, values }], message };
}

/** The object under `key`, made when it is missing or not an object. */
function objectAt(parent: JsonObject, key: string): JsonObject {
  const existing = parent[key];
  if (existing && typeof existing === "object" && !Array.isArray(existing)) return existing;
  const made: JsonObject = {};
  parent[key] = made;
  return made;
}

function valueAt(root: JsonObject, path: readonly string[]): JsonValue | undefined {
  let at: JsonValue | undefined = root;
  for (const segment of path) {
    if (!at || typeof at !== "object") return undefined;
    at = Array.isArray(at) ? at[Number(segment)] : at[segment];
  }
  return at;
}

/** Sets the value at `path`, making each missing step of it an object; a list is indexed by number. */
function setAt(root: JsonObject, path: readonly string[], value: JsonValue): void {
  let at: JsonObject | JsonValue[] = root;
  for (const [index, segment] of path.entries()) {
    const last = index === path.length - 1;
    if (Array.isArray(at)) {
      const position = Number(segment);
      if (last) at[position] = value;
      else at = containerAt(at, position);
    } else if (last) at[segment] = value;
    else at = containerAt(at, segment);
  }
}

function containerAt(parent: JsonObject | JsonValue[], key: string | number): JsonObject | JsonValue[] {
  const existing = Array.isArray(parent) ? parent[key as number] : parent[key as string];
  if (existing && typeof existing === "object") return existing;
  const made: JsonObject = {};
  if (Array.isArray(parent)) parent[key as number] = made;
  else parent[key as string] = made;
  return made;
}
