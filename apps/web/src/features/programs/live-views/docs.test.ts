import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDocumentationOutline, decorateDocumentationHeadings, flattenDocumentationTree } from "./docs";
import { buildDocumentationTree } from "./shared";

describe("DocsLive contract", () => {
  it("builds stable unique outline targets", () => {
    const html = "<h1>Start Here</h1><p>x</p><h2>Setup</h2><h2>Setup</h2>";
    expect(buildDocumentationOutline(html)).toEqual([
      { id: "start-here", label: "Start Here", level: 1 },
      { id: "setup", label: "Setup", level: 2 },
      { id: "setup-2", label: "Setup", level: 2 }
    ]);
    expect(decorateDocumentationHeadings(html)).toContain('<h2 id="setup-2">');
  });

  it("keeps a deterministic source-aware tree", () => {
    const tree = buildDocumentationTree([
      { id: "b", sourceId: "two", title: "Beta", path: "b.md", routePath: "/two/b" },
      { id: "a", sourceId: "one", title: "Alpha", path: "a.md", routePath: "/one/a" }
    ]);
    expect(tree.children.map((node) => node.name)).toEqual(["One", "Two"]);
  });

  it("virtualizes the complete source-aware tree and keeps history navigation", () => {
    const source = readFileSync(new URL("./docs.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("TREE_PAGE_LIMIT");
    expect(source).toContain("VirtualDocsTree");
    expect(source).toContain("rows.slice(start, end)");
    expect(source).toContain("useDeferredValue");
    expect(source).toContain("const renderedHtml = useMemo");
    expect(source).toContain('searchParams.get("doc")');
    expect(source).toContain("window.history.pushState");
    expect(source).toContain('window.addEventListener("popstate"');
    expect(source).toContain('role="tree"');
    expect(source).toContain('"ArrowDown"');
    expect(source).toContain("does not match a page");
    expect(source).toContain("Rebuilding documentation");
    expect(source).toContain("<Drawer");
  });

  it("flattens only expanded branches without dropping indexed pages", () => {
    const tree = buildDocumentationTree(Array.from({ length: 1_250 }, (_, index) => ({ id: `page-${index}`, sourceId: "source", title: `Page ${index}`, path: `group/page-${index}.md`, routePath: `/source/group/page-${index}` })));
    const collapsed = flattenDocumentationTree(tree, new Set());
    expect(collapsed).toHaveLength(1);
    const source = collapsed[0]!;
    const sourceRows = flattenDocumentationTree(tree, new Set([source.node.path]));
    const group = sourceRows.find((row) => row.node.name === "Group")!;
    const expanded = flattenDocumentationTree(tree, new Set([source.node.path, group.node.path]));
    expect(expanded.filter((row) => row.node.page)).toHaveLength(1_250);
  });
});
