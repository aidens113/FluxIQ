import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";

/** Only this cycle's consumers can change its decisions; a later export cannot mask a stall. */
export function automationStudioRuntimeRepeatComponent(flow: AutomationStudioFlowDocument, nodeId: string): readonly AutomationStudioFlowNode[] | undefined {
  if (flow.nodes.length > 512 || flow.edges.length > 2_048) return undefined;
  const forward = reached(flow, nodeId, false);
  const backward = reached(flow, nodeId, true);
  const component = flow.nodes.filter(node => forward.has(node.id) && backward.has(node.id)).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return component.length > 1 || flow.edges.some(edge => edge.sourceNodeId === nodeId && edge.targetNodeId === nodeId) ? component : undefined;
}

function reached(flow: AutomationStudioFlowDocument, start: string, reverse: boolean): Set<string> {
  const result = new Set([start]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    for (const edge of flow.edges) {
      const from = reverse ? edge.targetNodeId : edge.sourceNodeId;
      const to = reverse ? edge.sourceNodeId : edge.targetNodeId;
      if (from === queue[index] && !result.has(to)) {
        result.add(to);
        queue.push(to);
      }
    }
  }
  return result;
}
