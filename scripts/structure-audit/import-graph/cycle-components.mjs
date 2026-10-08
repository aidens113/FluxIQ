// The module cycles of a graph, as its strongly connected components: every
// set of two or more modules each of which reaches every other, plus any
// module that imports itself. Tarjan's algorithm, written iteratively because
// a repository's import chains run deeper than a recursive walk's stack.

/**
 * @param {Map<string, { target: string }[]>} edges every node's outgoing edges; a target that is not a key has none
 * @returns {string[][]} each cycle's members, sorted; the cycles sorted by their first member
 */
export function cycleComponents(edges) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;

  const targetsOf = (node) => (edges.get(node) ?? []).map((edge) => edge.target);

  for (const root of edges.keys()) {
    if (index.has(root)) continue;
    const work = [{ node: root, targets: targetsOf(root), next: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter += 1;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work.at(-1);
      if (frame.next < frame.targets.length) {
        const target = frame.targets[frame.next];
        frame.next += 1;
        if (!index.has(target)) {
          index.set(target, counter);
          low.set(target, counter);
          counter += 1;
          stack.push(target);
          onStack.add(target);
          work.push({ node: target, targets: targetsOf(target), next: 0 });
        } else if (onStack.has(target)) {
          low.set(frame.node, Math.min(low.get(frame.node), index.get(target)));
        }
        continue;
      }

      work.pop();
      if (work.length > 0) {
        const parent = work.at(-1).node;
        low.set(parent, Math.min(low.get(parent), low.get(frame.node)));
      }
      if (low.get(frame.node) !== index.get(frame.node)) continue;

      const members = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        members.push(member);
      } while (member !== frame.node);
      const selfImport = members.length === 1 && targetsOf(frame.node).includes(frame.node);
      if (members.length > 1 || selfImport) components.push(members.sort());
    }
  }

  return components.sort((a, b) => a[0].localeCompare(b[0]));
}
