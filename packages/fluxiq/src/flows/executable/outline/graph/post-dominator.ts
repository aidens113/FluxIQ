// Where the paths leaving a step meet again: their nearest common
// post-dominator, inside the part of the graph the caller is outlining.
//
// The region is every node reached from the starts without passing a
// boundary. A boundary (the end of the enclosing block, a node already placed,
// the step itself) and a node with no way on lead out of the region. A node
// post-dominates another when every path from that one out of the region
// passes it; the nearest one every start shares is the join. None, when the
// paths leave the region separately or never leave it.
import type { OutlinePathGraph } from "./path-graph.ts";

const EXIT = "\u0000exit";

/** The node the paths from `starts` all meet at before leaving the region, or nothing. */
export function outlineJoinOf(paths: OutlinePathGraph, starts: readonly string[], isBoundary: (id: string) => boolean): string | undefined {
  const successors = regionOf(paths, starts, isBoundary);
  // `undefined` stands for "every node": not yet known to reach the exit.
  const dominators = new Map<string, Set<string> | undefined>([...successors.keys()].map((id): [string, undefined] => [id, undefined]));
  dominators.set(EXIT, new Set([EXIT]));
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, next] of successors) {
      const met = meet(next.map((target) => dominators.get(target)));
      const updated = met === undefined ? undefined : new Set([id, ...met]);
      if (sameSet(dominators.get(id), updated)) continue;
      dominators.set(id, updated);
      changed = true;
    }
  }
  const shared = meet(starts.map((start) => dominators.get(start)));
  if (!shared) return undefined;
  let nearest: string | undefined;
  for (const id of shared) {
    if (id === EXIT) continue;
    if (nearest === undefined || (dominators.get(id)?.size ?? 0) > (dominators.get(nearest)?.size ?? 0)) nearest = id;
  }
  return nearest;
}

/** Each region node's successors, with boundaries and dead ends leading to the exit. */
function regionOf(paths: OutlinePathGraph, starts: readonly string[], isBoundary: (id: string) => boolean): Map<string, string[]> {
  const successors = new Map<string, string[]>();
  const queue = [...starts];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (successors.has(id)) continue;
    const next = isBoundary(id) ? [] : [...new Set((paths.out.get(id) ?? []).map((edge) => edge.target))];
    successors.set(id, next.length ? next : [EXIT]);
    for (const target of next) if (!successors.has(target)) queue.push(target);
  }
  return successors;
}

/** The nodes every known set holds; `undefined` (every node) when none is known. */
function meet(sets: ReadonlyArray<Set<string> | undefined>): Set<string> | undefined {
  let result: Set<string> | undefined;
  for (const set of sets) {
    if (set === undefined) continue;
    result = result === undefined ? new Set(set) : new Set([...result].filter((id) => set.has(id)));
  }
  return result;
}

function sameSet(a: Set<string> | undefined, b: Set<string> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.size === b.size && [...a].every((id) => b.has(id));
}
