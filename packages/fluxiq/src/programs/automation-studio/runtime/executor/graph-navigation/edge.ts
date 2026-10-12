import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge } from "../../../model/index.ts";

/** The outgoing edge for a node's settled route. */
export function chooseAutomationStudioEdge(flow: Pick<AutomationStudioFlowDocument, "edges">, sourceNodeId: string, route: string, definitionId?: string): AutomationStudioFlowEdge | null {
  const edges = flow.edges.filter((edge) => edge.sourceNodeId === sourceNodeId);
  return edges.find((edge) => edge.sourcePortId === route)
    ?? (definitionId === "builtin.control.start" && route === "success" ? edges.find((edge) => edge.sourcePortId === "next") : undefined)
    ?? edges.find((edge) => !edge.sourcePortId && route === "success")
    ?? null;
}
