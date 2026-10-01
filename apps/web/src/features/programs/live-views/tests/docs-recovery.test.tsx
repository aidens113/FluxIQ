import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { DocsLive } from "../docs";
const owner = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../program-api", () => ({ useProgramApi: () => owner.api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let view: ReactTestRenderer;
const metadata = (ids = ["a"]) => ({ sources: [{ id: "s", title: "Source", rootDir: "/synthetic", scope: "framework" }], pages: ids.map(id => ({ id, sourceId: "s", title: id, path: id + ".md" })), warnings: [], generatedAtMs: 1, generatedPages: ids.length });
const content = (id = "a", html = "<h1>Original</h1>") => ({ id, sourceId: "s", title: id, path: id + ".md", format: "markdown", markdown: "", html });
const label = (n: any): string => n.children.map((c: any) => typeof c === "string" ? c : label(c)).join("");
const button = (name: string) => view.root.findAllByType("button").find(n => label(n) === name)!;
const text = () => JSON.stringify(view.toJSON());
async function mount() { await act(async () => { view = create(<DocsLive />); }); }
beforeEach(() => {
 owner.api = { get: vi.fn().mockResolvedValue({ ok: true, payload: metadata() }), post: vi.fn().mockImplementation(async endpoint => ({ ok: true, payload: endpoint === "rebuild" ? metadata() : content() })) };
 const events = new EventTarget();
 vi.stubGlobal("window", { location: { href: "https://synthetic.invalid/programs/docs" }, history: { state: null, pushState: vi.fn() }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), dispatchEvent: events.dispatchEvent.bind(events), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) });
});
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });
it("successful rebuild reloads an unchanged selected page", async () => {
 await mount(); owner.api.post.mockImplementation(async endpoint => ({ ok: true, payload: endpoint === "rebuild" ? metadata() : content("a", "<h1>Rebuilt</h1>") }));
 await act(async () => button("Rebuild").props.onClick());
 expect(owner.api.post.mock.calls.filter(c => c[0] === "get-page")).toHaveLength(2);
 expect(text()).toContain("Rebuilt");
});
it("rebuild acknowledgement remains locally visible when reloaded page fails", async () => {
 await mount(); owner.api.post.mockImplementation(async endpoint => endpoint === "rebuild" ? { ok: true, payload: metadata() } : { ok: false });
 await act(async () => button("Rebuild").props.onClick());
 expect(text()).toContain("Documentation snapshot rebuilt."); expect(button("Retry document")).toBeDefined();
 const local = view.root.findAll(n => n.props.role === "status" && label(n).includes("Documentation snapshot rebuilt."));
 expect(local).toHaveLength(1);
});
it("failed page read offers direct Retry without rebuilding", async () => {
 owner.api.post.mockResolvedValueOnce({ ok: false }); await mount();
 expect(button("Retry document")).toBeDefined();
 await act(async () => button("Retry document").props.onClick());
 expect(owner.api.post.mock.calls.map(c => c[0])).toEqual(["get-page", "get-page"]);
 expect(text()).toContain("Original");
});
it("removed selected page reconciles to first confirmed page", async () => {
 await mount(); owner.api.post.mockImplementation(async (endpoint, body) => ({ ok: true, payload: endpoint === "rebuild" ? metadata(["b"]) : content(body.pageId, "<h1>Replacement</h1>") }));
 await act(async () => button("Rebuild").props.onClick());
 expect(owner.api.post).toHaveBeenLastCalledWith("get-page", { pageId: "b" }, expect.any(Object));
 expect(text()).toContain("Replacement");
});

function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
it("domain replacement clears drafts/content and stale controls cannot issue requests or history", async () => {
 await mount(); const old = owner.api, oldRebuild = button("Rebuild").props.onClick;
 const oldSelect = view.root.find(n => Array.isArray(n.props.pages) && typeof n.props.onSelect === "function").props.onSelect;
 const oldPage = () => oldSelect("a");
 act(() => view.root.findByProps({ "aria-label": "Search documentation" }).props.onChange({ target: { value: "old draft" } }));
 const pending = deferred(); owner.api = { get: vi.fn().mockReturnValue(pending.promise), post: vi.fn().mockImplementation(async (_endpoint, body) => ({ ok: true, payload: content(body.pageId, "<h1>New owner</h1>") })) };
 await act(async () => view.update(<DocsLive />)); expect(text()).not.toContain("Original");
 act(() => { void oldRebuild(); oldPage(); }); expect(old.post.mock.calls.filter(c => c[0] === "rebuild")).toHaveLength(0); expect(window.history.pushState).not.toHaveBeenCalled();
 await act(async () => pending.resolve({ ok: true, payload: metadata(["b"]) })); expect(view.root.findByProps({ "aria-label": "Search documentation" }).props.value).toBe(""); expect(text()).toContain("New owner");
});
it("old rebuild response cannot replace a new owner's confirmed view", async () => {
 await mount(); const old = owner.api, pending = deferred(); old.post.mockReturnValueOnce(pending.promise); act(() => button("Rebuild").props.onClick());
 owner.api = { get: vi.fn().mockResolvedValue({ ok: true, payload: metadata(["b"]) }), post: vi.fn().mockResolvedValue({ ok: true, payload: content("b", "<h1>New owner</h1>") }) };
 await act(async () => view.update(<DocsLive />)); await act(async () => pending.resolve({ ok: true, payload: metadata(["old"]) })); expect(text()).toContain("New owner"); expect(text()).not.toContain("snapshot rebuilt"); expect(owner.api.post).toHaveBeenCalledTimes(1);
});
it("same-owner refresh preserves drafts, current document and explicit recovery", async () => {
 await mount(); act(() => view.root.findByProps({ "aria-label": "Search documentation" }).props.onChange({ target: { value: "draft" } }));
 const pending = deferred(); owner.api.get.mockReturnValueOnce(pending.promise);
 act(() => view.root.findByProps({ "aria-label": "Refresh documentation" }).props.onClick()); expect(text()).toContain("Original"); expect(view.root.findByProps({ "aria-label": "Search documentation" }).props.value).toBe("draft"); expect(view.root.findByProps({ "aria-label": "Refresh documentation" }).props.disabled).toBe(true);
 await act(async () => pending.resolve({ ok: false })); expect(text()).toContain("Original"); expect(button("Retry snapshot")).toBeDefined(); await act(async () => button("Retry snapshot").props.onClick()); expect(text()).toContain("Original"); expect(owner.api.post).toHaveBeenCalledTimes(1);
});
it("empty index is distinct from no matches and preserves explicit rebuild", async () => {
 owner.api.get.mockResolvedValue({ ok: true, payload: metadata([]) }); await mount(); expect(text()).toContain("No documentation indexed"); expect(text()).not.toContain("No matching pages"); expect(button("Rebuild")).toBeDefined(); expect(owner.api.post).not.toHaveBeenCalled();
});
it("html rendering retains sandbox and restrictive content policy", async () => {
 owner.api.post.mockResolvedValue({ ok: true, payload: { ...content("a", "<h1>HTML</h1><script>synthetic()</script>"), format: "html" } }); await mount(); const frame = view.root.findByType("iframe"); expect(frame.props.sandbox).toBe("allow-same-origin"); expect(frame.props.srcDoc).toContain("HTML"); expect(frame.props.srcDoc).toContain("default-src 'none'"); expect(frame.props.sandbox).not.toContain("allow-scripts");
});
