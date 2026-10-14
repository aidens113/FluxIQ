import type { AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";

// Which briefs of one dispatch wait on which (automation-project-agents-plan,
// `Concurrent dispatch`): a brief waits on every other brief of the dispatch
// whose subflow its entry names among its predecessors. A predecessor that is
// not in this dispatch was built earlier and is not waited on. Briefs that
// wait on each other in a ring can never start; they are named so the
// dispatcher ends them at once instead of waiting forever.

export type AutomationStudioProjectDispatchDependencies = {
  /** For each brief, by position, the positions of the briefs it waits on. */
  waitsOn: number[][];
  /** Positions of briefs in a ring of waits. */
  cyclic: ReadonlySet<number>;
};

export function automationStudioProjectDispatchDependencies(briefs: readonly AutomationStudioProjectSubflowBrief[]): AutomationStudioProjectDispatchDependencies {
  const waitsOn = briefs.map((brief, index) => {
    const predecessors = new Set(brief.entry.predecessors);
    return briefs.flatMap((other, at) => (at !== index && other.subflowKey !== brief.subflowKey && predecessors.has(other.subflowKey) ? [at] : []));
  });
  return { waitsOn, cyclic: inRings(waitsOn) };
}

/** Members of every strongly connected component of more than one brief (Tarjan). */
function inRings(edges: readonly number[][]): Set<number> {
  const order = new Map<number, number>();
  const low = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  const ringed = new Set<number>();
  let counter = 0;
  const visit = (node: number): void => {
    order.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of edges[node] ?? []) {
      if (!order.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, order.get(next)!));
      }
    }
    if (low.get(node) !== order.get(node)) return;
    const component: number[] = [];
    let member: number | undefined;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1) for (const entry of component) ringed.add(entry);
  };
  for (let node = 0; node < edges.length; node += 1) if (!order.has(node)) visit(node);
  return ringed;
}
