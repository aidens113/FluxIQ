// Every module one module's evaluation loads, directly or through others.

/**
 * @param {Map<string, { target: string }[]>} edges
 * @param {string} start
 * @returns {Set<string>} the modules `start` reaches, not counting itself unless a path leads back to it
 */
export function reachableModules(edges, start) {
  const reached = new Set();
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    for (const { target } of edges.get(queue[head]) ?? []) {
      if (reached.has(target)) continue;
      reached.add(target);
      queue.push(target);
    }
  }
  return reached;
}
