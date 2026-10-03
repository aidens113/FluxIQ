/** A Merge joins paths; a person never sees it as a step of their Flow. */
const MERGE_DEFINITION_ID = "builtin.control.merge";

/**
 * The number each step of a Flow carries in "Step N of M", and M.
 *
 * A step's number is its place in the Flow, never how many passes the run has
 * made: a retry of a step, a state route back to it, or a partial run that
 * starts part-way all say the number the step has in the Flow (D2,
 * `run-murwd8le-79e735a8`: a retry of "Get coupons" took step 12 of 14, and
 * every step after it read one too high).
 *
 * The place is read from the graph, not from the list order, which says
 * nothing (a Flow's nodes come back sorted by id): a depth-first walk from
 * `startNodeId` along the edges, in reverse post-order, so every step comes
 * after every step with an edge into it, both sides of a fork come before the
 * Merge that joins them, and an edge back to an earlier step (a loop) changes
 * no number. Nodes the walk does not reach follow in list order.
 *
 * A Merge ("Join paths") is not counted: it does nothing a person could see,
 * so it has no number (`numberOf` is undefined) and is not in `count`.
 */
export function automationStudioActivityStepNumbers(flow: {
  nodes: readonly { id: string; definitionId: string }[];
  edges: readonly { sourceNodeId: string; targetNodeId: string }[];
}, startNodeId: string | undefined): { count: number; numberOf: (nodeId: string) => number | undefined } {
  const known = new Set(flow.nodes.map((node) => node.id));
  const next = new Map<string, string[]>();
  for (const edge of flow.edges) {
    if (!known.has(edge.sourceNodeId) || !known.has(edge.targetNodeId)) continue;
    next.set(edge.sourceNodeId, [...(next.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  const walk = (root: string): void => {
    // Iterative, so a long Flow cannot overflow the stack.
    const finished: string[] = [];
    const stack: { id: string; at: number }[] = [{ id: root, at: 0 }];
    visited.add(root);
    while (stack.length) {
      const top = stack.at(-1)!;
      const targets = next.get(top.id) ?? [];
      const target = targets[top.at];
      top.at += 1;
      if (target === undefined) {
        finished.push(top.id);
        stack.pop();
      } else if (!visited.has(target)) {
        visited.add(target);
        stack.push({ id: target, at: 0 });
      }
    }
    order.push(...finished.reverse());
  };
  if (startNodeId !== undefined && known.has(startNodeId)) walk(startNodeId);
  for (const node of flow.nodes) if (!visited.has(node.id)) walk(node.id);

  const merges = new Set(flow.nodes.filter((node) => node.definitionId === MERGE_DEFINITION_ID).map((node) => node.id));
  const numbers = new Map<string, number>();
  for (const id of order) if (!merges.has(id)) numbers.set(id, numbers.size + 1);
  return { count: numbers.size, numberOf: (nodeId) => numbers.get(nodeId) };
}
