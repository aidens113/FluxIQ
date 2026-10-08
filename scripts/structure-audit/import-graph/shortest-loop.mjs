// The shortest way back: given an edge `from -> to` inside one cycle, the
// fewest modules through which `to` leads back to `from`, staying among the
// cycle's members. This is what a message prints, so a developer sees the one
// loop their import closes rather than a component of hundreds of files.

/**
 * @param {Map<string, { target: string }[]>} edges
 * @param {Set<string>} members the cycle's modules
 * @param {string} from the importer
 * @param {string} to the module it imports, a member of the same cycle
 * @returns {string[]} the loop, starting and ending at `from`
 */
export function shortestLoop(edges, members, from, to) {
  if (from === to) return [from, from];
  const previous = new Map([[to, null]]);
  const queue = [to];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    for (const { target } of edges.get(node) ?? []) {
      if (!members.has(target) || previous.has(target)) continue;
      previous.set(target, node);
      if (target === from) {
        const path = [];
        for (let step = from; step !== null; step = previous.get(step)) path.unshift(step);
        return [from, ...path];
      }
      queue.push(target);
    }
  }
  // Unreachable for an edge inside one strongly connected component.
  return [from, to];
}
