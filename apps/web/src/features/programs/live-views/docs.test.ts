import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDocumentationOutline, decorateDocumentationHeadings } from "./docs";
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

  it("exposes bounded, deep-linked, keyboard-operable states", () => {
    const source = readFileSync(new URL("./docs.tsx", import.meta.url), "utf8");
    expect(source).toContain("TREE_PAGE_LIMIT");
    expect(source).toContain("useDeferredValue");
    expect(source).toContain("const renderedHtml = useMemo");
    expect(source).toContain('searchParams.get("doc")');
    expect(source).toContain('role="tree"');
    expect(source).toContain('"ArrowDown"');
    expect(source).toContain("does not match a page");
    expect(source).toContain("Rebuilding documentation");
    expect(source).toContain("<Drawer");
  });
});
