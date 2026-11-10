// Nodes that only give a step its value -- a constant a branch tests, a
// comparison it reads -- are part of that step, not steps of their own.
import type { OutlineStep } from "../types/index.ts";
import { outlineFlatSteps } from "./flat-steps.ts";
import { outlineGivesOnlyValues } from "./value-giver.ts";
import type { OutlineWalk } from "./walk.ts";

/** Attaches every unplaced value-giving node to the step of the first placed node it gives a value to. */
export function outlineAttachFeeders(walk: OutlineWalk, roots: readonly OutlineStep[]): void {
  const owner = new Map<string, OutlineStep>();
  for (const step of outlineFlatSteps(roots)) for (const id of step.nodeIds) owner.set(id, step);
  for (let changed = true; changed;) {
    changed = false;
    for (const node of walk.graph.nodes) {
      if (walk.visited.has(node.id) || !outlineGivesOnlyValues(walk, node.id)) continue;
      const consumer = walk.paths.values.find((edge) => edge.sourceNodeId === node.id && owner.has(edge.targetNodeId));
      const step = consumer ? owner.get(consumer.targetNodeId) : undefined;
      if (!step) continue;
      walk.visited.add(node.id);
      step.nodeIds.push(node.id);
      owner.set(node.id, step);
      changed = true;
    }
  }
}
