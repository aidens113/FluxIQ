// Where the outline begins.
import { outlineNodeRole } from "../graph/index.ts";
import { outlineGivesOnlyValues } from "./value-giver.ts";
import type { OutlineWalk } from "./walk.ts";

/**
 * The nodes a run may begin at (rule 1): every Start node, or, in a graph
 * without one, every node nothing leads into that is neither a handler nor a
 * node that only gives other steps a value. The first is the outline's main
 * path; any others are entries a person must see.
 */
export function outlineEntries(walk: OutlineWalk): string[] {
  const starts = walk.graph.nodes.filter((node) => outlineNodeRole(node) === "start").map((node) => node.id);
  if (starts.length) return starts;
  return walk.graph.nodes
    .filter((node) => outlineNodeRole(node) !== "handler" && !walk.paths.in.get(node.id)?.length && !outlineGivesOnlyValues(walk, node.id))
    .map((node) => node.id);
}
