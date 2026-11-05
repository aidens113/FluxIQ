import { createElement } from "../../../dom/index.ts";
import type { LibraryTreeNode } from "../tree/index.ts";
import { treeRow } from "./tree-row.ts";
import type { LibraryViewContext } from "./view-context.ts";

/** A list of rows, each with what it calls nested beneath it. */
export function treeList(nodes: readonly LibraryTreeNode[], open: (node: LibraryTreeNode) => void, context: LibraryViewContext, nested = false): HTMLElement {
  const list = createElement("ul", { className: nested ? "library-tree library-tree-nested" : "library-tree" });
  for (const node of nodes) {
    const item = createElement("li", { className: "library-item" }, [treeRow(node, open, context)]);
    if (node.children.length > 0) item.append(treeList(node.children, open, context, true));
    list.append(item);
  }
  return list;
}
