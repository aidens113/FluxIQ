// Makes `parent`'s children exactly `nodes`, in order, moving only what is out
// of place. A node already where it belongs is never detached, so a focused
// answer box keeps its focus, an open disclosure stays open and a selection
// survives every render.

/** Puts `nodes` into `parent` in order and removes every other child. */
export function placeChildren(parent: HTMLElement, nodes: readonly HTMLElement[]): void {
  nodes.forEach((node, index) => {
    if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] ?? null);
  });
  while (parent.childElementCount > nodes.length) parent.lastElementChild?.remove();
}
