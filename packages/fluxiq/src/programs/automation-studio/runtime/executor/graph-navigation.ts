import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "./contracts.ts";

export function chooseAutomationStudioEdge(flow: AutomationStudioFlowDocument, sourceNodeId: string, route: string, definitionId?: string): AutomationStudioFlowEdge | null {
  const edges = flow.edges.filter((edge) => edge.sourceNodeId === sourceNodeId);
  return edges.find((edge) => edge.sourcePortId === route)
    ?? (definitionId === "builtin.control.start" && route === "success" ? edges.find((edge) => edge.sourcePortId === "next") : undefined)
    ?? edges.find((edge) => !edge.sourcePortId && route === "success")
    ?? null;
}

export function hasUnvisitedAutomationStudioNodes(flow: AutomationStudioFlowDocument, attempts: AutomationStudioNodeAttemptTrace[]): boolean {
  const visited = new Set(attempts.map((attempt) => attempt.nodeId));
  return flow.nodes.some((node) => !visited.has(node.id));
}

export function missingTargetTrace(
  startedAt: number,
  finishedAt: number,
  edge: AutomationStudioFlowEdge,
  attempts: AutomationStudioNodeAttemptTrace[],
  values: Record<string, JsonValue>,
  effects: AutomationStudioGraphExecutionTrace["effects"]
): AutomationStudioGraphExecutionTrace {
  return {
    status: "failed",
    startedAt,
    finishedAt,
    attempts,
    values,
    effects,
    message: `Edge ${edge.id} points to missing node ${edge.targetNodeId}.`
  };
}
