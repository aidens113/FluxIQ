import type { DocsTreeNode } from "../live-views/shared";

export type DocsVisibleRow = { node: DocsTreeNode; depth: number; parentPath?: string };
export function flattenDocumentationTree(root: DocsTreeNode, expanded: ReadonlySet<string>): DocsVisibleRow[] {
  const rows: DocsVisibleRow[] = [];
  const visit = (nodes: DocsTreeNode[], depth: number, parentPath?: string) => {
    for (const node of nodes) {
      rows.push({ node, depth, ...(parentPath ? { parentPath } : {}) });
      if (node.children.length && expanded.has(node.path)) visit(node.children, depth + 1, node.path);
    }
  };
  visit(root.children, 0); return rows;
}
