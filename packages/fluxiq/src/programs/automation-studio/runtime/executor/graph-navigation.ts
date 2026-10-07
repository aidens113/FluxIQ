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

/**
 * Whether the run left a node of the Flow behind: what a run that ends with no
 * End node is failed for (`./graph-run.ts`), since an unreached node is a Flow
 * that stopped early.
 *
 * A node a forward state route went past counts as visited. The page was
 * already beyond it (`./state-routing/`), so the run went on at a later step and
 * the steps between had nothing left to do; they are neither unreached nor a
 * reason to fail. Live run `run-mut4fvkm-e2fc03e6` (W22, t289-E) was routed from
 * s6 straight to s9 past a sometimes-present s7 and the Merge it joins at; s9,
 * the last step, succeeded, and the run was ended `failed` for those two.
 * "Went past" is exact: on some edge path from the routed node to the node it
 * went on at, those two left out. A node off every such path -- unreached,
 * disconnected, or on a branch the run did not take -- still counts.
 */
export function hasUnvisitedAutomationStudioNodes(flow: AutomationStudioFlowDocument, attempts: AutomationStudioNodeAttemptTrace[]): boolean {
  const visited = new Set(attempts.map((attempt) => attempt.nodeId));
  for (const attempt of attempts) {
    const skipped = attempt.skipped;
    if (skipped?.reason !== "state_routed" || skipped.direction !== "forward") continue;
    for (const id of passedOver(flow, attempt.nodeId, skipped.toNodeId)) visited.add(id);
  }
  return flow.nodes.some((node) => !visited.has(node.id));
}

/** The nodes on some edge path from `from` to `to`, the two left out. */
function passedOver(flow: AutomationStudioFlowDocument, from: string, to: string): string[] {
  const after = reached(flow, from, (edge) => [edge.sourceNodeId, edge.targetNodeId]);
  const before = reached(flow, to, (edge) => [edge.targetNodeId, edge.sourceNodeId]);
  return [...after].filter((id) => id !== from && id !== to && before.has(id));
}

/** Every node reached from `start` by following edges one way, `start` included; `ends` gives an edge's [from, to]. */
function reached(flow: AutomationStudioFlowDocument, start: string, ends: (edge: AutomationStudioFlowEdge) => [string, string]): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const edge of flow.edges) {
      const [source, target] = ends(edge);
      if (source !== id || seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return seen;
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
