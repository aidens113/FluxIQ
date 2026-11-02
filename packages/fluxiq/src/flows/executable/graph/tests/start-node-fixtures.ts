import type { AutomationStudioFlowDocument, AutomationStudioFlowNode, AutomationStudioFlowEdge } from "../index.ts";

export const ACTION = "builtin.policy.action";
export const START = "builtin.control.start";
export const END = "builtin.control.end";

export function recordedId(entry: number): string {
  return `recorded.candidate.entry.${entry}.4f1c2d3e-0000-4000-8000-${String(entry).padStart(12, "0")}`;
}

export function inIdOrder<T extends { id: string }>(nodes: readonly T[]): T[] {
  return [...nodes].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export function actionNode(id: string): AutomationStudioFlowNode {
  return { id, definitionId: ACTION, parameterValues: { outputId: "click", parameters: {} } };
}

export function startNode(id: string): AutomationStudioFlowNode {
  return { id, definitionId: START };
}

export function successEdge(sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}->${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "ready" };
}

export function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowEdge[]): AutomationStudioFlowDocument {
  return { flowId: "flow.start-node", ownerId: "routine.start-node", nodes, edges };
}

export function recordedChain(entries: readonly number[]): { flow: AutomationStudioFlowDocument; chain: string[] } {
  const chain = entries.map(recordedId);
  return { chain, flow: flowOf(inIdOrder(chain.map(actionNode)), chain.slice(1).map((id, index) => successEdge(chain[index]!, id))) };
}

export const twelveFrom = (first: number): number[] => Array.from({ length: 12 }, (_, index) => first + index);

const HANDLER = "builtin.control.handler";
const HANDLER_END = "builtin.control.handler-end";
export const handlerParts = (id: string) => ({
    nodes: [{ id, definitionId: HANDLER, parameterValues: { event: "fail", scope: { kind: "subflow" } } }, actionNode(`${id}.dismiss`), { id: `${id}.end`, definitionId: HANDLER_END, parameterValues: { disposition: "unhandled" } }],
    edges: [{ id: `${id}.body`, sourceNodeId: id, sourcePortId: "body", targetNodeId: `${id}.dismiss` }, successEdge(`${id}.dismiss`, `${id}.end`)]
  });
