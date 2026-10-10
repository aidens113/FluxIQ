import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge } from "../../model/index.ts";
import { AUTOMATION_STUDIO_HANDLER_DEFINITION_ID, AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID } from "../../nodes/control-flow/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "./contracts.ts";

export function chooseAutomationStudioEdge(flow: Pick<AutomationStudioFlowDocument, "edges">, sourceNodeId: string, route: string, definitionId?: string): AutomationStudioFlowEdge | null {
  const edges = flow.edges.filter((edge) => edge.sourceNodeId === sourceNodeId);
  return edges.find((edge) => edge.sourcePortId === route)
    ?? (definitionId === "builtin.control.start" && route === "success" ? edges.find((edge) => edge.sourcePortId === "next") : undefined)
    ?? edges.find((edge) => !edge.sourcePortId && route === "success")
    ?? null;
}

/** The node definition that finishes a run where it is reached. */
const END_DEFINITION_ID = "builtin.control.end";

/**
 * Whether reaching a node of this definition finishes the run there: an End
 * node, or a Handler End, which finishes a handler's body run (state-aware
 * recovery plan, C5). A Handler End is reached only inside a body, which the
 * lifecycle dispatcher runs from the Handler's `body` port; what the run does
 * next is the dispatcher's decision, read off the Handler End's outputs.
 */
export function automationStudioNodeEndsRun(definitionId: string): boolean {
  return definitionId === END_DEFINITION_ID || definitionId === AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID;
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
 *
 * Handlers are not steps (state-aware recovery plan, C4): a Handler node and
 * the nodes only its `body` leads to are never unvisited, because no run walks
 * into them. A handler's body run, the one whose last attempt is its Handler
 * End, has left nothing behind: the rest of the graph is not its to visit.
 */
export function hasUnvisitedAutomationStudioNodes(flow: AutomationStudioFlowDocument, attempts: AutomationStudioNodeAttemptTrace[]): boolean {
  if (attempts[attempts.length - 1]?.definitionId === AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID) return false;
  const visited = new Set([...attempts.map((attempt) => attempt.nodeId), ...handlerOnlyNodes(flow)]);
  for (const attempt of attempts) {
    const skipped = attempt.skipped;
    if (skipped?.reason !== "state_routed" || skipped.direction !== "forward") continue;
    for (const id of passedOver(flow, attempt.nodeId, skipped.toNodeId)) visited.add(id);
  }
  return flow.nodes.some((node) => !visited.has(node.id));
}

/**
 * Every Handler node, and every node reached only through a Handler's `body`:
 * reached from a body's first node, and not from any parentless node that is
 * not a Handler (where a run may begin).
 */
function handlerOnlyNodes(flow: AutomationStudioFlowDocument): string[] {
  const handlers = new Set(flow.nodes.filter((node) => node.definitionId === AUTOMATION_STUDIO_HANDLER_DEFINITION_ID).map((node) => node.id));
  if (!handlers.size) return [];
  const body = new Set<string>();
  for (const edge of flow.edges) {
    if (handlers.has(edge.sourceNodeId) && edge.sourcePortId === "body") for (const id of reached(flow, edge.targetNodeId, forward)) body.add(id);
  }
  const entered = new Set(flow.edges.filter((edge) => edge.sourceNodeId !== edge.targetNodeId).map((edge) => edge.targetNodeId));
  const main = new Set<string>();
  for (const node of flow.nodes) {
    if (handlers.has(node.id) || entered.has(node.id)) continue;
    for (const id of reached(flow, node.id, forward)) main.add(id);
  }
  return [...handlers, ...[...body].filter((id) => !main.has(id))];
}

function forward(edge: AutomationStudioFlowEdge): [string, string] {
  return [edge.sourceNodeId, edge.targetNodeId];
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
