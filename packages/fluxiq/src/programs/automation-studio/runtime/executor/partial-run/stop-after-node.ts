// Where a partial run ends (`AutomationStudioGraphExecutionOptions.stopAfterNodeId`).
//
// A partial run tests part of a Flow: it starts where it is told and stops once
// its stop node has run. It never decides whether anything is kept -- a build or
// repair still needs one whole run from the Flow's start, judged, for that.
//
// The graph run asks this before every move it makes out of a node, and the
// answer is the same question each time: does this move leave the stop node, or
// take the run past it?
//
// - **Out of the stop node, by any way** -- its edge for the route it took, its
//   failed route, a continuation past a failure, its declared skip, or a state
//   route forward (the page already shows its effect, or matches a later
//   step). The node has run and its outcome is on the attempt, so the run ends.
//   A state route *backward* from it is followed: the page is behind the stop
//   node, and the run comes back to it.
// - **A state route past it** from any other node: the page matched a step
//   strictly after the stop node (reachable from it, with no way back), so going
//   there would run what the partial run was asked not to. A route onto the stop
//   node itself is followed, and the stop node runs.
//
// A plain edge from another node is never stopped here: whichever branch the
// Flow takes is the Flow's own, and only the page's routing can skip a node.

import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioStateRouteDirection } from "../contracts.ts";

/** One move the run is about to make, from the node it is at to the node it would go to. */
export type AutomationStudioRunMove = {
  fromNodeId: string;
  toNodeId: string;
  /** Present when state routing chose the move. A declared skip has no direction, and is read as forward. */
  stateRoute?: { direction?: AutomationStudioStateRouteDirection };
};

/** A partial run's stop rule: `stops` answers the message the run ends with, or nothing when the move is made. */
export type AutomationStudioStopAfterNode = {
  nodeId: string;
  stops(move: AutomationStudioRunMove): string | undefined;
};

/** The stop rule for `stopAfterNodeId`, or nothing for a run that goes to the end. */
export function automationStudioStopAfterNode(flow: AutomationStudioFlowDocument, stopAfterNodeId: string | undefined): AutomationStudioStopAfterNode | undefined {
  if (!stopAfterNodeId) return undefined;
  let afterStop: ReadonlySet<string> | undefined;
  const reachable = (from: string): Set<string> => {
    const seen = new Set<string>();
    const queue = flow.edges.filter((edge) => edge.sourceNodeId === from).map((edge) => edge.targetNodeId);
    while (queue.length) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      for (const edge of flow.edges) if (edge.sourceNodeId === next) queue.push(edge.targetNodeId);
    }
    return seen;
  };
  // Strictly after the stop node: reachable from it, and with no way back to it.
  const past = (nodeId: string): boolean => {
    afterStop ??= reachable(stopAfterNodeId);
    return afterStop.has(nodeId) && !reachable(nodeId).has(stopAfterNodeId);
  };
  return {
    nodeId: stopAfterNodeId,
    stops(move) {
      if (move.fromNodeId === stopAfterNodeId) {
        if (move.stateRoute?.direction === "backward") return undefined;
        return `Stopped after node ${stopAfterNodeId}, as the run was asked to.`;
      }
      if (!move.stateRoute || move.toNodeId === stopAfterNodeId || !past(move.toNodeId)) return undefined;
      return `Stopped before node ${move.toNodeId}: the run was asked to stop after node ${stopAfterNodeId}, and the page routed it past that node.`;
    }
  };
}
