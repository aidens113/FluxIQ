import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { useDocumentationWorkspace } from "../useDocumentationWorkspace";
import type { useProgramApi } from "../../program-api";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
type Workspace = ReturnType<typeof useDocumentationWorkspace>;
let current!: Workspace, view: ReactTestRenderer, owner = true;
const requested = () => "";
const isOwner = () => owner;
const snapshot = (ids = ["a"]) => ({ sources: [{ id: "s", title: "Source" }], pages: ids.map(id => ({ id, sourceId: "s", title: id, path: id })), warnings: [], generatedAtMs: 1, generatedPages: ids.length });
const page = (id = "a") => ({ id, sourceId: "s", title: id, path: id, format: "markdown", html: "<h1>Synthetic</h1>" });
function api() { return { get: vi.fn().mockResolvedValue({ ok: true, payload: snapshot() }), post: vi.fn().mockImplementation(async (endpoint, body) => ({ ok: true, payload: endpoint === "rebuild" ? snapshot() : page(body.pageId) })) }; }
function deferred() { let resolve!: (value: any) => void, reject!: (reason: unknown) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function Probe({ client }: { client: ReturnType<typeof api> }) { current = useDocumentationWorkspace({ api: client as unknown as ReturnType<typeof useProgramApi>, isOwner, requestedPage: requested }); return null; }
async function mount(client: ReturnType<typeof api>) { owner = true; await act(async () => { view = create(<Probe client={client} />); }); }
afterEach(() => { if (view) act(() => view.unmount()); owner = true; });
it("locks duplicate rebuild immediately and releases after rejection for explicit retry", async () => {
 const client = api(); await mount(client); const pending = deferred(); client.post.mockReturnValueOnce(pending.promise);
 const rebuild = current.rebuild; act(() => { void rebuild(); void rebuild(); }); expect(client.post.mock.calls.filter(c => c[0] === "rebuild")).toHaveLength(1); expect(current.rebuilding).toBe(true);
 await act(async () => pending.reject(new Error("private synthetic"))); expect(current.rebuilding).toBe(false); expect(current.status).toBe("Documentation rebuild failed. Try again.");
 await act(async () => current.rebuild()); expect(current.status).toBe("Documentation snapshot rebuilt.");
});
it("late manual snapshot cannot erase rebuilt metadata and read Retry never replays rebuild", async () => {
 const client = api(); await mount(client); const pending = deferred(); client.get.mockReturnValueOnce(pending.promise);
 act(() => { void current.refresh(); }); const signal = client.get.mock.calls.at(-1)?.[1].signal;
 client.post.mockImplementation(async (endpoint, body) => ({ ok: true, payload: endpoint === "rebuild" ? snapshot(["b"]) : page(body.pageId) }));
 await act(async () => current.rebuild()); expect(signal.aborted).toBe(true);
 await act(async () => pending.resolve({ ok: true, payload: snapshot(["obsolete"]) })); expect(current.activePageId).toBe("b"); expect(current.snapshot?.pages[0]?.id).toBe("b");
 client.get.mockRejectedValueOnce(new Error("private synthetic")); await act(async () => current.refresh()); expect(current.snapshot?.pages[0]?.id).toBe("b"); expect(current.snapshotLoading).toBe(false); expect(current.snapshotError).toContain("could not be loaded");
 await act(async () => current.refresh()); expect(client.post.mock.calls.filter(c => c[0] === "rebuild")).toHaveLength(1);
});
it("acknowledged rebuild remains visible when subsequent page read rejects", async () => {
 const client = api(); await mount(client); client.post.mockImplementation(async endpoint => { if (endpoint === "rebuild") return { ok: true, payload: snapshot() }; throw Error("private synthetic"); });
 await act(async () => current.rebuild()); expect(current.status).toBe("Documentation snapshot rebuilt."); expect(current.pageError).toBe("The document could not be loaded. Try again."); expect(current.pageLoading).toBe(false); expect(current.rebuilding).toBe(false);
});
it("old owner callbacks and completions cannot request or publish before passive cleanup", async () => {
 const client = api(); await mount(client); const pending = deferred(); client.post.mockReturnValueOnce(pending.promise); const captured = current;
 act(() => { void current.rebuild(); }); owner = false;
 await act(async () => { void captured.refresh(); void captured.rebuild(); void captured.retryPage(); expect(captured.selectPage("a")).toBe(false); pending.resolve({ ok: true, payload: snapshot(["wrong"]) }); });
 expect(client.post.mock.calls.filter(c => c[0] === "rebuild")).toHaveLength(1); expect(current.snapshot?.pages[0]?.id).toBe("a");
});
it("unmount aborts reads and obsolete callbacks cannot start new requests", async () => {
 const client = api(); const pending = deferred(); client.get.mockReturnValue(pending.promise); await mount(client); const captured = current, signal = client.get.mock.calls[0]?.[1].signal;
 act(() => view.unmount()); expect(signal.aborted).toBe(true); await act(async () => { void captured.refresh(); void captured.rebuild(); pending.reject(Error("private synthetic")); }); expect(client.get).toHaveBeenCalledTimes(1); expect(client.post).not.toHaveBeenCalled();
});
it("page selection fences earlier response and captured Retry immediately", async () => {
 const client = api(); client.get.mockResolvedValue({ ok: true, payload: snapshot(["a", "b"]) }); const pending = deferred(); client.post.mockImplementation(async (_endpoint, body) => body.pageId === "a" ? pending.promise : { ok: true, payload: page("b") });
 await mount(client); const captured = current; act(() => { expect(current.selectPage("b")).toBe(true); void captured.retryPage(); });
 await act(async () => pending.resolve({ ok: true, payload: page("a") })); expect(current.page?.id).toBe("b"); expect(client.post.mock.calls.filter(c => c[1]?.pageId === "a")).toHaveLength(1);
});
it("empty confirmed metadata clears old selection/content/loading/error", async () => {
 const client = api(); await mount(client); client.post.mockResolvedValueOnce({ ok: true, payload: snapshot([]) }); await act(async () => current.rebuild()); expect(current.activePageId).toBe(""); expect(current.page).toBeNull(); expect(current.pageLoading).toBe(false); expect(current.pageError).toBe("");
});
for (const payload of [undefined, {}, { ...snapshot(), pages: [null] }, { ...snapshot(), sources: [null] }, { ...snapshot(), warnings: [null] }, { ...snapshot(), pages: [snapshot().pages[0], snapshot().pages[0]] }]) {
 it("malformed snapshot success is recoverable failure rather than an empty index", async () => { const client = api(); client.get.mockResolvedValue({ ok: true, payload }); await mount(client); expect(current.snapshot).toBeNull(); expect(current.snapshotError).toContain("could not be loaded"); expect(current.snapshotLoading).toBe(false); });
}
for (const payload of [undefined, {}, { ...page(), html: null }, page("wrong"), { ...page(), format: {} }]) {
 it("malformed page success releases loading with fixed recovery feedback", async () => { const client = api(); client.post.mockResolvedValue({ ok: true, payload }); await mount(client); expect(current.page).toBeNull(); expect(current.pageLoading).toBe(false); expect(current.pageError).toBe("The document could not be loaded. Try again."); });
}
it("valid missing page enables explicit rebuild but keeps direct read retry", async () => { const client = api(); client.post.mockResolvedValue({ ok: true, payload: null }); await mount(client); expect(current.pageMissing).toBe(true); expect(current.pageLoading).toBe(false); });

it("unexpected aborted responses offer explicit read recovery and release mutation lock", async () => {
 const client = api(); client.get.mockResolvedValueOnce({ ok: false, aborted: true }); await mount(client); expect(current.snapshotError).toContain("could not be loaded");
 await act(async () => current.refresh()); client.post.mockResolvedValueOnce({ ok: false, aborted: true }); await act(async () => current.retryPage()); expect(current.pageError).toContain("could not be loaded"); expect(current.pageLoading).toBe(false);
 client.post.mockResolvedValueOnce({ ok: false, aborted: true }); await act(async () => current.rebuild()); expect(current.rebuilding).toBe(false); expect(current.status).toBe("Documentation rebuild failed. Try again.");
});
it("invalid rebuild response retains confirmed metadata and does not announce success", async () => {
 const client = api(); await mount(client); client.post.mockResolvedValueOnce({ ok: true }); await act(async () => current.rebuild()); expect(current.snapshot?.pages[0]?.id).toBe("a"); expect(current.page?.id).toBe("a"); expect(current.status).toBe("Documentation rebuild failed. Try again."); expect(current.rebuilding).toBe(false);
});
it("duplicate same-page retries coalesce one outstanding read", async () => {
 const client = api(); await mount(client); const pending = deferred(); client.post.mockReturnValueOnce(pending.promise); const retry = current.retryPage; act(() => { void retry(); void retry(); }); expect(client.post.mock.calls.filter(c => c[0] === "get-page")).toHaveLength(2); await act(async () => pending.resolve({ ok: true, payload: page() })); expect(current.pageLoading).toBe(false);
});
