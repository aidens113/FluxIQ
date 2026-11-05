import type { LibraryTreeNode } from "./tree-types.ts";

/** The listed subflows in a row's subtree, itself included, each once. */
export function distinctBelow(node: LibraryTreeNode): string[] {
  const ids = new Set<string>();
  const walk = (item: LibraryTreeNode): void => {
    if (item.card !== undefined) ids.add(item.partId);
    item.children.forEach(walk);
  };
  walk(node);
  return [...ids];
}
