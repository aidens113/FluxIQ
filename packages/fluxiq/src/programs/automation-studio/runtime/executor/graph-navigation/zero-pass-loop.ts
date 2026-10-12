import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { controlFlowNodes } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/** The loop nodes whose `body` port a run may never take: a list with no items, a loop whose condition never held. */
const LOOP_DEFINITION_IDS: ReadonlySet<string> = new Set(["builtin.control.for-each", "builtin.control.repeat", "builtin.control.loop"]);

/**
 * Per loop definition, the output ports that carry a value and never the run:
 * For Each's `item`, `index` and `count`, Repeat's `pass`. Read from the
 * definitions themselves, whose ports `defineBuiltinNode` gives a role.
 */
const VALUE_PORTS: ReadonlyMap<string, ReadonlySet<string>> = new Map(controlFlowNodes
  .filter((definition) => LOOP_DEFINITION_IDS.has(definition.id))
  .map((definition) => [definition.id, new Set(definition.outputs.filter((port) => port.role === "data").map((port) => port.id))]));

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
 *
 * **The way on is the loop's routes, never its values (t474).** The compiler
 * hands each pass's row to every body step that takes one, as an edge from the
 * For Each's `item` port (`../../flow-bootstrap/authoring/draft-routing.ts`).
 * That edge carries a value into the body; no run ever walks it. Lane D round 9
 * (`run-mv5q4j2n-25784472`, revs 5 to 15) counted it as a way on, so every body
 * step read as owed, the exemption named nothing, and seven trials whose
 * listing kept no rows were failed as unvisited steps. A port the loop's
 * definition declares a value (`VALUE_PORTS`) is not a way on; any other port,
 * one the definition does not name included, still is.
 */
export function automationStudioZeroPassLoopBodies(flow: Pick<AutomationStudioFlowDocument, "edges">, attempts: readonly AutomationStudioNodeAttemptTrace[]): string[] {
  const loops = new Map<string, { definitionId: string; ranBody: boolean }>();
  for (const attempt of attempts) {
    if (!LOOP_DEFINITION_IDS.has(attempt.definitionId)) continue;
    loops.set(attempt.nodeId, { definitionId: attempt.definitionId, ranBody: (loops.get(attempt.nodeId)?.ranBody ?? false) || attempt.route === "body" });
  }
  const bodies: string[] = [];
  for (const [loopId, { definitionId, ranBody }] of loops) {
    if (ranBody) continue;
    const out = flow.edges.filter((edge) => edge.sourceNodeId === loopId && edge.targetNodeId !== loopId);
    const body = reachedAvoiding(flow, out.filter((edge) => edge.sourcePortId === "body").map((edge) => edge.targetNodeId), loopId);
    if (!body.size) continue;
    const values = VALUE_PORTS.get(definitionId);
    const wayOn = out.filter((edge) => edge.sourcePortId !== "body" && !(edge.sourcePortId !== undefined && values?.has(edge.sourcePortId)));
    const onward = reachedAvoiding(flow, wayOn.map((edge) => edge.targetNodeId), loopId);
    for (const id of body) if (!onward.has(id)) bodies.push(id);
  }
  return bodies;
}

/** Every node reached from `starts` along edges, never entering or passing through `avoid`. */
function reachedAvoiding(flow: Pick<AutomationStudioFlowDocument, "edges">, starts: readonly string[], avoid: string): Set<string> {
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
