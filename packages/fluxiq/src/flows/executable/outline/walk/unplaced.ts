import type { OutlineWalk } from "./walk.ts";

/** The next node not yet placed to outline from: one nothing still unplaced leads into, else the first unplaced. */
export function outlineNextUnplaced(walk: OutlineWalk): string | undefined {
  const unplaced = walk.graph.nodes.filter((node) => !walk.visited.has(node.id));
  const root = unplaced.find((node) => !(walk.paths.in.get(node.id) ?? []).some((edge) => !walk.visited.has(edge.edge.sourceNodeId)));
  return (root ?? unplaced[0])?.id;
}
