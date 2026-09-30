import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";

/**
 * What a node sees when its parameters are resolved and its attempt is traced:
 * every value the run holds, with the values its edges bring on top under their
 * port names.
 */
export function collectNodeInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>): Record<string, JsonValue> {
  return { ...values, ...collectWiredNodeInputs(flow, node, values) };
}

/**
 * Only the values an edge brings to one of the node's ports.
 *
 * What a native implementation is handed. The merged view above also carries
 * every output under its bare port name (`graph-run.ts` keeps both), so a node
 * after a For Each that declares an `item` input received the loop's last row
 * although no edge gave it one -- and a web step that scopes its target to
 * `item` would have acted on that row (lane t195, worker t195-w4's probe).
 */
export function collectWiredNodeInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>): Record<string, JsonValue> {
  const inputs: Record<string, JsonValue> = {};
  for (const edge of flow.edges.filter((candidate) => candidate.targetNodeId === node.id)) {
    if (!edge.targetPortId || edge.targetPortId === "in") continue;
    const sourceKey = edge.sourcePortId ? `${edge.sourceNodeId}.${edge.sourcePortId}` : edge.sourceNodeId;
    if (values[sourceKey] !== undefined) inputs[edge.targetPortId] = values[sourceKey];
  }
  return inputs;
}
