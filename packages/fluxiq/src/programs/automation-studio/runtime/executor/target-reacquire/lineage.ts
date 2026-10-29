// Where a step's target came from (t786, design D1): derived from the graph
// each time it is asked, never stored on the node, so an edited Flow can never
// carry a stale lineage. Pure; no host call.
//
// `row`: the step is handed a For Each pass's row -- an `item` edge from the
// loop, or a binding onto `item` (or `<loop>.item`) inside the loop's body --
// and the loop's `items` come from another node's output. Nested loops: the
// innermost loop that hands the step its row wins.
//
// `output`: one of the step's parameters is bound to another node's output
// (`$node.<key>.<output>`, or the output's run path `<node>.<output>`). With
// several, the first element-target parameter (`element`, `target`) wins, else
// the first binding: one source per step.
//
// Whether the source may be re-run is not decided here: a source that mutates
// still has lineage, and the re-acquire records `unavailable` for it.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../nodes/index.ts";
import { automationStudioActivityLoops } from "../../activity/loop/index.ts";
import { automationStudioReacquireStatePath } from "./binding-path.ts";
import type { AutomationStudioTargetLineage } from "./contracts.ts";

const FOR_EACH = "builtin.control.for-each";
const ROW = "item";
const ITEMS = "items";
/** How deep a step's parameters are searched for a binding, as deep as the resolver reads one. */
const MAXIMUM_DEPTH = 16;
/** Parameter names that hold the element a step acts on. */
const TARGET_PARAMETERS: ReadonlySet<string> = new Set(["element", "target"]);

type Binding = { parameterPath: string; statePath: string };
type NodeOutput = { nodeId: string; rest: string };

/** The step's lineage in `flow`, or nothing when its target came from no other step. */
export function automationStudioTargetLineage(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode): AutomationStudioTargetLineage | undefined {
  const nodesById = new Map(flow.nodes.map((candidate) => [candidate.id, candidate]));
  const bindings: Binding[] = [];
  collectBindings(flow, node.parameterValues ?? {}, [], 0, bindings);
  const row = rowLineage(flow, node, bindings, nodesById);
  if (row) return row;
  const outputs = bindings
    .map((binding) => ({ binding, output: nodeOutput(binding.statePath, nodesById, node.id) }))
    .filter((entry): entry is { binding: Binding; output: NodeOutput } => entry.output !== undefined && nodesById.get(entry.output.nodeId)?.definitionId !== FOR_EACH);
  const chosen = outputs.find((entry) => entry.binding.parameterPath.split(".").some((segment) => TARGET_PARAMETERS.has(segment))) ?? outputs[0];
  if (!chosen) return undefined;
  return { kind: "output", sourceNodeId: chosen.output.nodeId, outputKey: chosen.output.rest.split(".")[0]!, parameterPath: chosen.binding.parameterPath };
}

/** The row lineage: the innermost For Each handing the step its row, and the node its `items` came from. */
function rowLineage(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  bindings: readonly Binding[],
  nodesById: ReadonlyMap<string, AutomationStudioFlowNode>
): AutomationStudioTargetLineage | undefined {
  const loops = automationStudioActivityLoops(flow, FOR_EACH);
  const handing = new Set<string>();
  for (const edge of flow.edges) {
    if (edge.targetNodeId === node.id && edge.sourcePortId === ROW && nodesById.get(edge.sourceNodeId)?.definitionId === FOR_EACH) handing.add(edge.sourceNodeId);
  }
  for (const binding of bindings) {
    if (binding.statePath === ROW || binding.statePath.startsWith(`${ROW}.`)) {
      for (const loop of loops) if (loop.members.has(node.id)) handing.add(loop.repeatId);
      continue;
    }
    const output = nodeOutput(binding.statePath, nodesById, node.id);
    if (output && nodesById.get(output.nodeId)?.definitionId === FOR_EACH && output.rest.split(".")[0] === ROW) handing.add(output.nodeId);
  }
  if (!handing.size) return undefined;
  // The innermost loop's body is inside every loop around it, so it has the fewest members.
  const size = (loopId: string): number => loops.find((loop) => loop.repeatId === loopId)?.members.size ?? Number.POSITIVE_INFINITY;
  const loopNodeId = [...handing].sort((left, right) => size(left) - size(right))[0]!;
  const source = itemsSource(flow, nodesById.get(loopNodeId)!, nodesById);
  return source ? { kind: "row", sourceNodeId: source.nodeId, outputKey: source.rest.split(".")[0]!, loopNodeId } : undefined;
}

/** The node output a For Each's `items` come from: a wired edge into `items`, else a binding its `items` parameter holds. */
function itemsSource(flow: AutomationStudioFlowDocument, loop: AutomationStudioFlowNode, nodesById: ReadonlyMap<string, AutomationStudioFlowNode>): NodeOutput | undefined {
  const wired = flow.edges.find((edge) => edge.targetNodeId === loop.id && edge.targetPortId === ITEMS && edge.sourcePortId && edge.sourceNodeId !== loop.id && nodesById.has(edge.sourceNodeId));
  if (wired?.sourcePortId) return { nodeId: wired.sourceNodeId, rest: wired.sourcePortId };
  const path = automationStudioReacquireStatePath(flow, loop.parameterValues?.[ITEMS]);
  return path === undefined ? undefined : nodeOutput(path, nodesById, loop.id);
}

/** The node a run path names and the output path under it: the longest node id the path starts with. */
function nodeOutput(path: string, nodesById: ReadonlyMap<string, AutomationStudioFlowNode>, readerId: string): NodeOutput | undefined {
  const segments = path.split(".");
  for (let length = segments.length - 1; length >= 1; length -= 1) {
    const nodeId = segments.slice(0, length).join(".");
    if (nodeId !== readerId && nodesById.has(nodeId)) return { nodeId, rest: segments.slice(length).join(".") };
  }
  return undefined;
}

/** Every state binding below `value`, with the dotted parameter path that holds it and the run path it reads. */
function collectBindings(flow: AutomationStudioFlowDocument, value: JsonValue, at: readonly string[], depth: number, found: Binding[]): void {
  if (isAutomationNodeParameterStateBinding(value)) {
    const statePath = automationStudioReacquireStatePath(flow, value);
    if (statePath) found.push({ parameterPath: at.join("."), statePath });
    return;
  }
  if (!value || typeof value !== "object" || depth >= MAXIMUM_DEPTH) return;
  const entries: [string, JsonValue][] = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
  for (const [key, item] of entries) collectBindings(flow, item, [...at, key], depth + 1, found);
}
