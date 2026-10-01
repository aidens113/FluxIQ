import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocsLive } from "../../live-views/docs";
import { buildDocumentationTree } from "../../live-views/shared";
import { VirtualDocumentationTree } from "../VirtualDocumentationTree";
const owner = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../program-api", () => ({ useProgramApi: () => owner.api }));
let view: ReactTestRenderer | undefined;
const pages = Array.from({ length: 100 }, (_, index) => ({ id: `p${index}`, sourceId: "s", title: `Page ${index}`, path: `s/group/page-${String(index).padStart(3, "0")}.md` }));
const metadata = () => ({ sources: [{ id: "s", title: "Source", rootDir: "/synthetic", scope: "framework" }], pages: [...pages], warnings: [], generatedAtMs: 1, generatedPages: pages.length });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const events = new EventTarget();
  vi.stubGlobal("window", { location: { href: "https://synthetic.invalid/programs/docs" }, history: { state: null, pushState: vi.fn() }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), dispatchEvent: events.dispatchEvent.bind(events), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) });
  owner.api = { get: vi.fn().mockResolvedValue({ ok: true, payload: metadata() }), post: vi.fn().mockImplementation(async (_endpoint, body) => ({ ok: true, payload: { ...pages.find(page => page.id === body.pageId), format: "markdown", markdown: "", html: "<h1>Synthetic</h1>" } })) };
});
afterEach(async () => { if (view) await act(async () => view!.unmount()); view = undefined; vi.unstubAllGlobals(); });
async function mount() { await act(async () => { view = create(<DocsLive />); }); }
const rows = () => view!.root.findAll(node => node.props.role === "treeitem");
it("keyboard exploration keeps its own roving stop without selecting", async () => {
  await mount(); const row = rows().find(node => node.props["data-doc-path"].includes("p1"))!;
  await act(async () => row.props.onFocus());
  expect(rows().find(node => node.props["data-doc-path"] === row.props["data-doc-path"])!.props.tabIndex).toBe(0);
  expect(owner.api.post).toHaveBeenCalledTimes(1);
});
it("collapsed folder survives equivalent metadata refresh", async () => {
  await mount(); await act(async () => rows().find(node => node.props["data-doc-path"] === "s/group")!.props.onClick());
  owner.api.get.mockResolvedValue({ ok: true, payload: metadata() });
  await act(async () => view!.root.findByProps({ "aria-label": "Refresh documentation" }).props.onClick());
  expect(rows().find(node => node.props["data-doc-path"] === "s/group")!.props["aria-expanded"]).toBe(false);
});
it("off-window selection retains one mounted tab entry within virtualization budget", async () => {
  window.location.href += "?doc=p99"; await mount();
  expect(rows().filter(node => node.props.tabIndex === 0)).toHaveLength(1); expect(rows().length).toBeLessThan(30);
});

async function syntheticTree() {
  const callbacks: FrameRequestCallback[] = []; const doc = { visibilityState: "visible", hasFocus: vi.fn(() => true), activeElement: null as unknown };
  const nodes = new Map<string, { dataset: { docPath: string }; ownerDocument: unknown; readonly isConnected: boolean; closest: ReturnType<typeof vi.fn>; getClientRects: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }>();
  function node(path: string) {
    if (!nodes.has(path)) nodes.set(path, { dataset: { docPath: path }, ownerDocument: doc, get isConnected() { return Boolean(view && rows().some(row => row.props["data-doc-path"] === path)); }, closest: vi.fn(() => null), getClientRects: vi.fn(() => [{}]), focus: vi.fn(() => { doc.activeElement = nodes.get(path); rows().find(row => row.props["data-doc-path"] === path)?.props.onFocus(); }) });
    return nodes.get(path)!;
  }
  const viewport = { clientHeight: 420, scrollTop: 0, querySelector: vi.fn((selector: string) => { const path = selector.slice('[data-doc-path="'.length, -2); return rows().some(row => row.props["data-doc-path"] === path) ? node(path) : null; }) };
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; })); vi.stubGlobal("cancelAnimationFrame", vi.fn()); vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const root = buildDocumentationTree(pages); const select = vi.fn();
  await act(async () => { view = create(<VirtualDocumentationTree root={root} activePageId="p0" onSelect={select} />, { createNodeMock: element => (element.props as { role?: string }).role === "tree" ? viewport : null }); });
  function key(path: string, value = "ArrowDown", extra: Record<string, unknown> = {}) { const target = node(path); doc.activeElement = target; const preventDefault = vi.fn(); rows().find(row => row.props["data-doc-path"] === path)!.props.onKeyDown({ key: value, currentTarget: target, preventDefault, nativeEvent: {}, ...extra }); return preventDefault; }
  return { callbacks, doc, node, viewport, root, select, key };
}
it("latest queued keyboard intent alone can focus and activation remains separate", async () => {
  const state = await syntheticTree(); const source = rows().find(row => row.props["aria-selected"])!.props["data-doc-path"];
  await act(async () => { state.key(source, "ArrowDown"); state.key(source, "End"); });
  await act(async () => { state.callbacks[0]!(0); state.callbacks[1]!(0); });
  expect([...Array.from({ length: 100 }, (_, i) => `p${i}`)].some(id => rows().some(row => row.props["data-doc-path"].endsWith(`:${id}`) && row.props.tabIndex === 0))).toBe(true);
  const focused = rows().find(row => row.props.tabIndex === 0)!; expect(focused.props["data-doc-path"]).toContain("p99"); expect(state.node(focused.props["data-doc-path"]).focus).toHaveBeenCalledTimes(1); expect(state.select).not.toHaveBeenCalled();
  await act(async () => focused.props.onClick()); expect(state.select).toHaveBeenCalledWith("p99");
});
it.each(["other-control", "hidden-document", "unfocused-document", "hidden-source", "zero-size-source", "root-replaced", "selection-changed", "unmounted"])("deferred focus refuses %s", async kind => {
  const state = await syntheticTree(); const source = rows().find(row => row.props["aria-selected"])!.props["data-doc-path"];
  await act(async () => { state.key(source); });
  if (kind === "other-control") state.doc.activeElement = {};
  if (kind === "hidden-document") state.doc.visibilityState = "hidden";
  if (kind === "unfocused-document") state.doc.hasFocus.mockReturnValue(false);
  if (kind === "hidden-source") state.node(source).closest.mockReturnValue({} as never);
  if (kind === "zero-size-source") state.node(source).getClientRects.mockReturnValue([]);
  if (kind === "root-replaced") await act(async () => view!.update(<VirtualDocumentationTree root={buildDocumentationTree(pages)} activePageId="p0" onSelect={state.select} />));
  if (kind === "selection-changed") await act(async () => view!.update(<VirtualDocumentationTree root={state.root} activePageId="p99" onSelect={state.select} />));
  if (kind === "unmounted") { await act(async () => view!.unmount()); view = undefined; }
  await act(async () => state.callbacks[0]!(0)); expect(state.viewport.querySelector).not.toHaveBeenCalled();
});
it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { nativeEvent: { isComposing: true } }])("modifiers/IME remain native: %j", async extra => {
  const state = await syntheticTree(); const source = rows()[0]!.props["data-doc-path"]; let prevented!: ReturnType<typeof vi.fn>; await act(async () => { prevented = state.key(source, "ArrowDown", extra); }); expect(prevented).not.toHaveBeenCalled(); expect(state.callbacks).toHaveLength(0);
});
it("passive selection/scroll/root updates never invoke DOM focus", async () => {
  const state = await syntheticTree(); await act(async () => view!.root.findByProps({ role: "tree" }).props.onScroll({ currentTarget: { scrollTop: 1800 } }));
  await act(async () => view!.update(<VirtualDocumentationTree root={buildDocumentationTree(pages)} activePageId="p99" onSelect={state.select} />)); expect(state.callbacks).toHaveLength(0); expect(rows().filter(row => row.props.tabIndex === 0)).toHaveLength(1); expect(rows().length).toBeLessThan(30);
});
it("pinned off-window source can navigate Home without losing source ownership", async () => {
  const state = await syntheticTree(); await act(async () => view!.update(<VirtualDocumentationTree root={state.root} activePageId="p99" onSelect={state.select} />)); const source = rows().find(row => row.props.tabIndex === 0)!.props["data-doc-path"];
  await act(async () => { state.key(source, "Home"); }); await act(async () => state.callbacks[0]!(0)); expect(state.node("s").focus).toHaveBeenCalledTimes(1); expect(rows().filter(row => row.props.tabIndex === 0)).toHaveLength(1); expect(rows().length).toBeLessThan(30);
});
it("blur and refocus cannot revive a superseded queued request", async () => {
  const state = await syntheticTree(); const source = rows().find(row => row.props["aria-selected"])!.props["data-doc-path"];
  await act(async () => { state.key(source); rows().find(row => row.props["data-doc-path"] === source)!.props.onBlur(); rows().find(row => row.props["data-doc-path"] === source)!.props.onFocus(); });
  await act(async () => state.callbacks[0]!(0)); expect(state.viewport.querySelector).not.toHaveBeenCalled();
});
it("retained old-root activation cannot select a current equivalent row", async () => {
  const state = await syntheticTree(); const activate = rows().find(row => row.props["aria-selected"])!.props.onClick;
  await act(async () => view!.update(<VirtualDocumentationTree root={buildDocumentationTree(pages)} activePageId="p0" onSelect={state.select} />)); await act(async () => activate()); expect(state.select).not.toHaveBeenCalled();
});
