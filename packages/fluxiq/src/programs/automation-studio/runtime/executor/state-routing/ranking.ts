import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioStateRouteDirection } from "../contracts.ts";

/** A node whose recorded pre-state matched the page, and how closely. */
export type AutomationStudioStateRouteMatch = { node: AutomationStudioFlowNode; closeness: number };

/** A match placed against the step that could not run. `distance` is in edges; `Infinity` when the two are not connected. */
export type AutomationStudioRankedStateRoute = AutomationStudioStateRouteMatch & { direction: AutomationStudioStateRouteDirection; distance: number };

/**
 * The matches in the order a run prefers them:
 *
 * 1. the highest `closeness`;
 * 2. a node reachable forward from the failing node (the page is already past
 *    the step) before one reachable only backward (the page went back);
 * 3. the nearest by edge distance;
 * 4. document order.
 *
 * A node reachable neither way reads as backward, at no finite distance.
 */
export function automationStudioRankStateRoutes(
  flow: AutomationStudioFlowDocument,
  fromNodeId: string,
  matches: readonly AutomationStudioStateRouteMatch[]
): AutomationStudioRankedStateRoute[] {
  const ahead = edgeDistances(flow, fromNodeId, "forward");
  const behind = edgeDistances(flow, fromNodeId, "backward");
  const order = new Map(flow.nodes.map((node, index) => [node.id, index]));
  const ranked = matches.map((match): AutomationStudioRankedStateRoute => {
    const forward = ahead.get(match.node.id);
    return forward === undefined
      ? { ...match, direction: "backward", distance: behind.get(match.node.id) ?? Number.POSITIVE_INFINITY }
      : { ...match, direction: "forward", distance: forward };
  });
  return ranked.sort((left, right) =>
    right.closeness - left.closeness
    || directionRank(left.direction) - directionRank(right.direction)
    || compareDistance(left.distance, right.distance)
    || (order.get(left.node.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.node.id) ?? Number.MAX_SAFE_INTEGER));
}

function directionRank(direction: AutomationStudioStateRouteDirection): number {
  return direction === "forward" ? 0 : 1;
}

/** Two distances compared without `Infinity - Infinity`, which is not a number. */
function compareDistance(left: number, right: number): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

/** Edge distance from `fromNodeId` to every node reachable from it, following edges forward or against them. */
function edgeDistances(flow: AutomationStudioFlowDocument, fromNodeId: string, way: AutomationStudioStateRouteDirection): Map<string, number> {
  const next = new Map<string, string[]>();
  for (const edge of flow.edges) {
    const [from, to] = way === "forward" ? [edge.sourceNodeId, edge.targetNodeId] : [edge.targetNodeId, edge.sourceNodeId];
    next.set(from, [...(next.get(from) ?? []), to]);
  }
  const distances = new Map<string, number>();
  let frontier = [fromNodeId];
  for (let distance = 1; frontier.length; distance += 1) {
    const reached: string[] = [];
    for (const nodeId of frontier) {
      for (const target of next.get(nodeId) ?? []) {
        if (target === fromNodeId || distances.has(target)) continue;
        distances.set(target, distance);
        reached.push(target);
      }
    }
    frontier = reached;
  }
  return distances;
}
