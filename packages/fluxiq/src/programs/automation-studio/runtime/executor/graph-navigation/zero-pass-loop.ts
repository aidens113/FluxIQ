import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/** The loop nodes whose `body` port a run may never take: a list with no items, a loop whose condition never held. */
const LOOP_DEFINITION_IDS: ReadonlySet<string> = new Set(["builtin.control.for-each", "builtin.control.repeat", "builtin.control.loop"]);

/**
 * The nodes only the body of a loop that ran no passes leads to (t466).
 *
 * A For Each over a list its conditions kept no rows of routes straight to
 * `done`: that is a loop that ran zero passes, a valid ending, not a Flow that
 * stopped early. Live run `run-mv5jnc5m-a47c3e59` (lane D round 8, revs 3 and
 * 5) kept 0 of 8 requests under two conditions that were both required; the
 * body (Confirm, a wait) was never reached and the run was failed
 * `executor.graph.unvisited_nodes`, which the model was told was a wiring fault.
 *
 * A loop counts here only when it was reached and no attempt of it in this run
 * took its `body`. Its body is every node reached from the `body` port without
 * passing back through the loop, less every node its other routes (`done`,
 * `failed`) also lead to: a step the loop's way on reaches is still owed.
 */
export function automationStudioZeroPassLoopBodies(flow: AutomationStudioFlowDocument, attempts: readonly AutomationStudioNodeAttemptTrace[]): string[] {
  const loops = new Map<string, boolean>();
  for (const attempt of attempts) {
    if (!LOOP_DEFINITION_IDS.has(attempt.definitionId)) continue;
    loops.set(attempt.nodeId, (loops.get(attempt.nodeId) ?? false) || attempt.route === "body");
  }
  const bodies: string[] = [];
  for (const [loopId, ranBody] of loops) {
    if (ranBody) continue;
    const out = flow.edges.filter((edge) => edge.sourceNodeId === loopId && edge.targetNodeId !== loopId);
    const body = reachedAvoiding(flow, out.filter((edge) => edge.sourcePortId === "body").map((edge) => edge.targetNodeId), loopId);
    if (!body.size) continue;
    const onward = reachedAvoiding(flow, out.filter((edge) => edge.sourcePortId !== "body").map((edge) => edge.targetNodeId), loopId);
    for (const id of body) if (!onward.has(id)) bodies.push(id);
  }
  return bodies;
}

/** Every node reached from `starts` along edges, never entering or passing through `avoid`. */
function reachedAvoiding(flow: AutomationStudioFlowDocument, starts: readonly string[], avoid: string): Set<string> {
  const seen = new Set(starts.filter((id) => id !== avoid));
  const queue = [...seen];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const edge of flow.edges) {
      if (edge.sourceNodeId !== id || edge.targetNodeId === avoid || seen.has(edge.targetNodeId)) continue;
      seen.add(edge.targetNodeId);
      queue.push(edge.targetNodeId);
    }
  }
  return seen;
}
