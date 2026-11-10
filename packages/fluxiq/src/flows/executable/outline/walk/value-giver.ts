import type { OutlineWalk } from "./walk.ts";

/** A node on no path that hands its values to other nodes: a value a step reads, not a step of its own. */
export function outlineGivesOnlyValues(walk: OutlineWalk, nodeId: string): boolean {
  return !walk.paths.out.get(nodeId)?.length && !walk.paths.in.get(nodeId)?.length && walk.paths.values.some((edge) => edge.sourceNodeId === nodeId);
}
