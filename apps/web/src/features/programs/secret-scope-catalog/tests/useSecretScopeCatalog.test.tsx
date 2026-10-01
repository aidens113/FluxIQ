import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useSecretScopeCatalog } from "../useSecretScopeCatalog";
import type { useProgramApi } from "../../program-api";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let view: ReactTestRenderer, current!: ReturnType<typeof useSecretScopeCatalog>, owner = true;
const isOwner = () => owner;
const api = () => ({ get: vi.fn().mockResolvedValue({ ok: true, payload: { projects: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } }), post: vi.fn().mockResolvedValue({ ok: true, payload: { flows: [{ flowId: "flow", name: "Flow" }] } }) });
function Probe({ client, active = true, epoch = "one" }: { client: ReturnType<typeof api>; active?: boolean; epoch?: string }) { current = useSecretScopeCatalog({ api: client as unknown as ReturnType<typeof useProgramApi>, active, epoch, isOwner }); return null; }
async function mount(client: ReturnType<typeof api>, active = true) { await act(async () => { view = create(<Probe client={client} active={active} />); }); }
function deferred() { let resolve!: (v: any) => void, reject!: (reason: unknown) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { owner = true; vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ domains: [{ id: "d", title: "Domain" }] }) })); });
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });
it("catalog reads remain lazy until editor opens", async () => { const client = api(); await mount(client, false); expect(fetch).not.toHaveBeenCalled(); expect(client.get).not.toHaveBeenCalled(); await act(async () => view.update(<Probe client={client} />)); expect(current.domains).toEqual([{ id: "d", label: "Domain" }]); expect(client.get).toHaveBeenCalledTimes(1); });
it("monotonic A/B/A epoch ignores old response and old finally", async () => {
 const client = api(), requests = [deferred(), deferred(), deferred()]; let index = 0; client.post.mockImplementation(() => requests[index++]!.promise); await mount(client);
 act(() => { void current.loadProject("a"); }); const oldSignal = client.post.mock.calls[0]?.[2].signal; act(() => { void current.loadProject("b"); }); act(() => { void current.loadProject("a"); }); expect(oldSignal.aborted).toBe(true);
 await act(async () => requests[0]!.resolve({ ok: true, payload: { flows: [{ flowId: "old", name: "Old" }] } })); expect(current.loading).toBe(true); expect(current.flows).toEqual([]);
 await act(async () => requests[2]!.resolve({ ok: true, payload: { flows: [{ flowId: "new", name: "New" }] } })); await act(async () => requests[1]!.resolve({ ok: true, payload: { flows: [] } })); expect(current.flows).toEqual([{ id: "new", label: "New" }]); expect(current.loading).toBe(false);
});
it("editor replacement refuses captured callbacks and old completion", async () => {
 const client = api(), pending = deferred(); await mount(client); client.post.mockReturnValueOnce(pending.promise); const captured = current; act(() => { void current.loadProject("a"); });
 await act(async () => view.update(<Probe client={client} epoch="two" />)); await act(async () => { void captured.loadProject("b"); void captured.retryCatalog(); pending.resolve({ ok: true, payload: { flows: [{ flowId: "old", name: "Old" }] } }); }); expect(current.projectId).toBe(""); expect(current.flows).toEqual([]); expect(client.post).toHaveBeenCalledTimes(1);
});
it("closing editor aborts project request; resuming same wizard preserves project intent", async () => {
 const client = api(), pending = deferred(); await mount(client); client.post.mockReturnValueOnce(pending.promise); act(() => { void current.loadProject("a"); }); const signal = client.post.mock.calls[0]?.[2].signal;
 await act(async () => view.update(<Probe client={client} active={false} />)); expect(signal.aborted).toBe(true); expect(current.projectId).toBe("a"); expect(current.loading).toBe(false);
 await act(async () => pending.resolve({ ok: true, payload: { flows: [{ flowId: "old", name: "Old" }] } })); await act(async () => view.update(<Probe client={client} />)); expect(current.projectId).toBe("a"); expect(current.flows).toEqual([{ id: "flow", label: "Flow" }]);
});
it("project rejection retains selected project and offers read-only retry", async () => {
 const client = api(); await mount(client); client.post.mockRejectedValueOnce(Error("synthetic private")); await act(async () => current.loadProject("a")); expect(current.projectId).toBe("a"); expect(current.error).toBe("Project flows could not be loaded. Try again."); expect(current.loading).toBe(false); await act(async () => current.retryProject()); expect(current.flows).toEqual([{ id: "flow", label: "Flow" }]); expect(client.post.mock.calls.every(c => c[0] === "list-flow-summaries")).toBe(true);
});
it("HTTP refusal does not parse private directory body or claim empty success", async () => {
 const json = vi.fn().mockResolvedValue({ domains: [] }); vi.mocked(fetch).mockResolvedValue({ ok: false, json } as unknown as Response); const client = api(); await mount(client); expect(json).not.toHaveBeenCalled(); expect(current.error).toBe("Scope choices could not be loaded. Try again."); expect(current.loading).toBe(false);
 vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ domains: [] }) } as unknown as Response); await act(async () => current.retryCatalog()); expect(current.error).toBe(""); expect(current.projects).toHaveLength(2);
});
for (const domains of [undefined, {}, [null], [{ id: {}, title: "Bad" }], [{ id: "a", title: {} }]]) {
 it("invalid directory rows show fixed retry error", async () => { vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ domains }) } as unknown as Response); await mount(api()); expect(current.catalogError).toContain("could not be loaded"); expect(current.loading).toBe(false); });
}
for (const projects of [undefined, {}, [null], [{ id: "a", name: {} }]]) {
 it("invalid project rows show fixed retry error", async () => { const client = api(); client.get.mockResolvedValue({ ok: true, payload: { projects } } as any); await mount(client); expect(current.catalogError).toContain("could not be loaded"); expect(current.loading).toBe(false); });
}
for (const flows of [undefined, {}, [null], [{ flowId: "a", name: {} }]]) {
 it("invalid flow rows release loading without false success", async () => { const client = api(); await mount(client); client.post.mockResolvedValue({ ok: true, payload: { flows } } as any); await act(async () => current.loadProject("a")); expect(current.projectError).toContain("could not be loaded"); expect(current.loading).toBe(false); });
}
it("unmount aborts reads and captured callbacks cannot request", async () => { const client = api(), pending = deferred(); client.get.mockReturnValue(pending.promise); await mount(client); const captured = current, signal = client.get.mock.calls[0]?.[1].signal; act(() => view.unmount()); expect(signal.aborted).toBe(true); await act(async () => { void captured.retryCatalog(); void captured.loadProject("a"); pending.resolve({ ok: true, payload: { projects: [] } }); }); expect(client.get).toHaveBeenCalledTimes(1); expect(client.post).not.toHaveBeenCalled(); });
