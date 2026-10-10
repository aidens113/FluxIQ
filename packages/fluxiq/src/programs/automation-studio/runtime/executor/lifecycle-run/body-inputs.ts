// What a handler's body is handed as its run inputs (state-aware recovery
// plan, C5; t411).
//
// A body used to be handed every value of the run it interrupted, about 1 MB
// of node outputs in a list-reading Flow. A run withholds every run input
// from its saved trace, whatever reads it, and rewriting a body's trace
// against a megabyte of inputs took 3.7-4.5 s per handler run (t408). A body
// can read only two things of the run around it: the frame's inputs, which a
// `{ input }` condition and an `input` binding read, and the run values its
// own nodes name -- a `$state` binding in a parameter, or a `{ value }`
// operand of a fact condition. So it is handed those and nothing else.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID } from "../../../nodes/control-flow/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../nodes/index.ts";
import { automationStudioNodeOutputReferences } from "../node-inputs.ts";

/** How deep a node's parameters and metadata are read for the names they bind; parameter resolution reads no deeper. */
const MAX_DEPTH = 32;

/**
 * The body's run inputs: `frameInputs`, then each value of `values` a node of
 * the body names. The body is the nodes reached from `bodyNodeId` in `graph`
 * up to its Handler End. A name is a value key, or a dotted path that starts
 * with one (`rows.0.name` reads `rows`), as state paths are resolved
 * (`../../../nodes/parameter-bindings.ts`).
 */
export function automationStudioHandlerBodyInputs(input: {
  graph: AutomationStudioFlowDocument;
  bodyNodeId: string;
  frameInputs: JsonObject;
  values: Readonly<Record<string, JsonValue>>;
}): Record<string, JsonValue> {
  const inputs: Record<string, JsonValue> = { ...input.frameInputs };
  for (const name of boundNames(input.graph, input.bodyNodeId)) {
    const segments = name.split(".");
    for (let length = segments.length; length >= 1; length -= 1) {
      const key = segments.slice(0, length).join(".");
      if (Object.prototype.hasOwnProperty.call(input.values, key)) inputs[key] = input.values[key]!;
    }
  }
  return inputs;
}

/** Every run value name the body's nodes bind, with node-output references named by node id. */
function boundNames(graph: AutomationStudioFlowDocument, bodyNodeId: string): Set<string> {
  const names = new Set<string>();
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const queue = [bodyNodeId];
  while (queue.length) {
    const node = nodes.get(queue.shift()!);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    collect(automationStudioNodeOutputReferences(graph, node.parameterValues ?? {}), names, 0);
    collect((node.metadata ?? {}) as JsonValue, names, 0);
    if (node.definitionId === AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID) continue;
    for (const edge of graph.edges) if (edge.sourceNodeId === node.id) queue.push(edge.targetNodeId);
  }
  return names;
}

function collect(value: JsonValue, names: Set<string>, depth: number): void {
  if (!value || typeof value !== "object" || depth > MAX_DEPTH) return;
  if (isAutomationNodeParameterStateBinding(value)) {
    names.add(value.$state.path);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, names, depth + 1);
    return;
  }
  // A fact condition's `{ value: name }` operand reads a named run value (`../lifecycle/fact-condition.ts`).
  const operand = typeof value.fact === "string" ? value.value : undefined;
  if (operand && typeof operand === "object" && !Array.isArray(operand) && typeof operand.value === "string") names.add(operand.value);
  for (const item of Object.values(value)) collect(item, names, depth + 1);
}
