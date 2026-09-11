import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";

export function collectNodeInputs(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>): Record<string, JsonValue> {
  const inputs: Record<string, JsonValue> = {};
  for (const edge of flow.edges.filter((candidate) => candidate.targetNodeId === node.id)) {
    if (!edge.targetPortId || edge.targetPortId === "in") continue;
    const sourceKey = edge.sourcePortId ? `${edge.sourceNodeId}.${edge.sourcePortId}` : edge.sourceNodeId;
    if (values[sourceKey] !== undefined) inputs[edge.targetPortId] = values[sourceKey];
  }
  return { ...values, ...inputs };
}
