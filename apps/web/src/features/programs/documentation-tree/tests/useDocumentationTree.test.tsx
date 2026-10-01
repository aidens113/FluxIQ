import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildDocumentationTree, type DocsTreeNode } from "../../live-views/shared";
import { useDocumentationTree } from "../useDocumentationTree";
let model!: ReturnType<typeof useDocumentationTree>; let view: ReactTestRenderer | undefined;
const tree = (count = 100) => buildDocumentationTree(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, sourceId: "s", title: `Page ${i}`, path: `s/group/page-${String(i).padStart(3, "0")}.md` })));
function Probe({ root, selected, scroll = 0 }: { root: DocsTreeNode; selected?: string; scroll?: number }) { model = useDocumentationTree(root, selected, scroll, 420); return null; }
async function mount(root = tree(), selected = "p0", scroll = 0) { await act(async () => { view = create(<Probe root={root} selected={selected} scroll={scroll} />); }); }
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { if (view) await act(async () => view!.unmount()); view = undefined; vi.unstubAllGlobals(); });
it("focus stays independent while selected page remains unchanged", async () => {
  await mount(); const other = model.rows.find(row => row.node.page?.id === "p1")!.node.path; await act(async () => model.setFocusedPath(other)); expect(model.entryPath).toBe(other);
  await act(async () => view!.update(<Probe root={tree()} selected="p0" />)); expect(model.entryPath).toBe(other);
});
it("explicit collapse survives equivalent roots and temporary filter absence", async () => {
  await mount(); await act(async () => model.toggle("s/group")); expect(model.expanded.has("s/group")).toBe(false);
  await act(async () => view!.update(<Probe root={tree()} selected="p0" />)); expect(model.expanded.has("s/group")).toBe(false);
  await act(async () => view!.update(<Probe root={{ name: "docs", path: "", children: [] }} selected="p0" />));
  await act(async () => view!.update(<Probe root={tree()} selected="p0" />)); expect(model.expanded.has("s/group")).toBe(false);
});
it("removed focused child reconciles to its nearest visible parent", async () => {
  await mount(); const child = model.rows.find(row => row.node.page?.id === "p1")!.node.path; await act(async () => model.setFocusedPath(child)); await act(async () => model.toggle("s/group")); expect(model.entryPath).toBe("s/group");
});
it("deep shrink clamps window and pins at most one roving entry", async () => {
  await mount(tree(), "p99", 99999); expect(model.mountedIndices.length).toBeLessThan(30); expect(model.mountedIndices).toContain(model.positions.byPath.get(model.entryPath));
  await act(async () => view!.update(<Probe root={tree(2)} selected="p99" scroll={99999} />)); expect(model.boundedScroll).toBe(0); expect(model.mountedIndices).toEqual([0, 1, 2, 3]);
});
it("one-pass sibling positions describe complete tree rather than virtual slice", async () => {
  await mount(tree(1250)); const last = model.rows.at(-1)!; expect(model.positions.ordinal.get(last.node.path)).toBe(1250); expect(model.positions.siblingCounts.get("s/group")).toBe(1250); expect(model.mountedIndices.length).toBeLessThan(30);
});
it("new selection reveals ancestors once but passive changes preserve later collapse", async () => {
  await mount(); await act(async () => model.toggle("s/group")); await act(async () => view!.update(<Probe root={tree()} selected="p99" />)); expect(model.expanded.has("s/group")).toBe(true); expect(model.rows.find(row => row.node.path === model.entryPath)?.node.page?.id).toBe("p99");
  await act(async () => model.toggle("s/group")); await act(async () => view!.update(<Probe root={tree()} selected="p99" />)); expect(model.expanded.has("s/group")).toBe(false);
});
