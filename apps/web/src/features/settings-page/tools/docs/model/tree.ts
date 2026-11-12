import type { DocumentationPage } from "fluxiq/docs";
import { docRouteKey } from "./paths";

export type DocsTreeNode = {
  name: string;
  path: string;
  children: DocsTreeNode[];
  page?: DocumentationPage;
};

export function buildDocumentationTree(pages: DocumentationPage[]): DocsTreeNode {
  const root: DocsTreeNode = { name: "docs", path: "", children: [] };
  for (const page of [...pages].sort((left, right) => docRouteKey(left).localeCompare(docRouteKey(right)))) {
    const route = docRouteKey(page);
    const parts = route.split("/").filter(Boolean);
    const fileName = parts.pop() ?? page.title ?? "index";
    let current = root;
    for (const part of parts) {
      const path = current.path ? `${current.path}/${part}` : part;
      let child = current.children.find((node) => node.path === path && !node.page);
      if (!child) {
        child = { name: titleFromRouteSegment(part), path, children: [] };
        current.children.push(child);
      }
      current = child;
    }
    current.children.push({
      name: titleFromRouteSegment(fileName),
      path: `file:${route}:${page.id}`,
      children: [],
      page
    });
  }
  sortDocsTree(root);
  return root;
}

export function sortDocsTree(node: DocsTreeNode): void {
  node.children.sort((left, right) => {
    if (Boolean(left.page) !== Boolean(right.page)) return left.page ? 1 : -1;
    return left.name.localeCompare(right.name);
  });
  for (const child of node.children) sortDocsTree(child);
}

export function shouldCollapseDocsFolder(node: DocsTreeNode): boolean {
  const path = node.path.toLowerCase();
  const name = node.name.toLowerCase();
  if (!path) return false;
  if (path.startsWith("runtime-docs/reference/typedoc/assets")) return true;
  if (path.startsWith("runtime-docs/reference/typedoc/classes")) return true;
  if (path.startsWith("runtime-docs/reference/typedoc/types")) return true;
  if (["classes", "types", "functions", "variables", "assets"].includes(name) && path.startsWith("runtime-docs/")) return true;
  return node.children.length > 30 && path.startsWith("runtime-docs/");
}

export function titleFromRouteSegment(value: string): string {
  if (/^README$/i.test(value.replace(/\.(md|mdx|html|json)$/i, ""))) return "README";
  return value
    .replace(/\.(md|mdx|html|json)$/i, "")
    .replace(/^index$/i, "Index")
    .split(/[-_.\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
