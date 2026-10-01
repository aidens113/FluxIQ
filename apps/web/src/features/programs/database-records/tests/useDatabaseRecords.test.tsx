import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useDatabaseRecords } from "../useDatabaseRecords";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
type Options = Parameters<typeof useDatabaseRecords>[0];
let options: Options;
let view: ReturnType<typeof useDatabaseRecords>;
let renderer: ReactTestRenderer | undefined;
const api = { get: vi.fn(), post: vi.fn() };
const record = (id = "one", kind = "public.rows", domainId?: string) => ({ id, kind, scope: domainId ? { domainId } : {}, data: { value: id } });
const page = (offset = 0, total = 100) => ({ records: [record()], total, limit: 50, offset });
function Harness({ settings = options }: { settings?: Options }) { view = useDatabaseRecords(settings); return null; }
function deferred() { let resolve!: (value: any) => void; let reject!: (error: unknown) => void; return { promise: new Promise<any>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: any) => resolve(value), reject: (error: unknown) => reject(error) }; }
const mount = async () => { await act(async () => { renderer = create(<Harness />); }); };
const update = async () => { await act(async () => { renderer!.update(<Harness settings={options} />); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  options = { api: api as unknown as Options["api"], owner: api, query: { kind: "public.rows", database: "global", search: "", sort: "updated", direction: "desc" }, authority: null, ready: true, authorized: () => true };
  api.get.mockReset().mockResolvedValue({ ok: true, payload: { stores: [{ kind: "public.rows" }], databases: ["global"] } });
  api.post.mockReset().mockImplementation(async (endpoint, payload) => ({ ok: true, payload: endpoint === "get-record" ? record(payload.id) : page(payload.offset) }));
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); });

it("catches metadata rejection, refuses malformed metadata and retries without private error text", async () => {
  api.get.mockRejectedValueOnce(new Error("private synthetic exception")); await mount();
  expect(view.metadataLoading).toBe(false); expect(view.metadataError).not.toContain("private"); expect(view.metadata).toBe(null);
  api.get.mockResolvedValueOnce({ ok: true, payload: { stores: {}, databases: [] } });
  await act(async () => view.refreshMetadata()); expect(view.metadata).toBe(null);
  await act(async () => view.refreshMetadata()); expect(view.page?.records[0]?.id).toBe("one");
});
it("releases rejected row loading, validates envelopes and recovers", async () => {
  api.post.mockRejectedValueOnce(new Error("private rows")); await mount(); expect(view.loading).toBe(false); expect(view.rowsError).toContain("Rows could not be loaded");
  for (const payload of [{}, { records: [null], total: 1, limit: 50, offset: 0 }, { ...page(), limit: 0 }, { ...page(), records: [record("one", "other.kind")] }]) {
    api.post.mockResolvedValueOnce({ ok: true, payload }); await act(async () => view.refreshRows()); expect(view.page).toBe(null); expect(view.loading).toBe(false);
  }
  await act(async () => view.refreshRows()); expect(view.page?.offset).toBe(0);
});
it("keeps confirmed paging through navigation failure and retries the same requested offset", async () => {
  await mount(); const oldNext = view.navigate; api.post.mockRejectedValueOnce(new Error("failed next page"));
  await act(async () => view.navigate(50)); expect(view.page?.offset).toBe(0); expect(view.requestedOffset).toBe(50); expect(view.loading).toBe(false);
  await act(async () => view.refreshRows()); expect(view.page?.offset).toBe(50);
  const before = api.post.mock.calls.length; act(() => oldNext(50)); expect(api.post).toHaveBeenCalledTimes(before);
  expect(api.post.mock.calls.slice(-2).map((call) => call[1].offset)).toEqual([50, 50]);
});
it("clamps total shrink directly once and never confirms an out-of-range page", async () => {
  await mount(); api.post.mockResolvedValueOnce({ ok: true, payload: { records: [], total: 1, limit: 50, offset: 450 } });
  await act(async () => view.navigate(450)); expect(view.page?.offset).toBe(0);
  expect(api.post.mock.calls.slice(-2).map((call) => call[1].offset)).toEqual([450, 0]);
});
it("handles rejected/malformed/missing detail separately and ignores stale retries", async () => {
  await mount(); api.post.mockRejectedValueOnce(new Error("private detail")); await act(async () => view.inspectRecord("one"));
  expect(view.detailLoading).toBe(false); expect(view.detailError).not.toContain("private"); const oldRetry = view.retryDetail;
  api.post.mockResolvedValueOnce({ ok: true, payload: record("wrong") }); await act(async () => view.retryDetail()); expect(view.selectedRecord).toBe(null); expect(view.detailError).not.toBe("");
  api.post.mockResolvedValueOnce({ ok: true, payload: null }); await act(async () => view.retryDetail()); expect(view.detailMissing).toBe(true);
  options = { ...options, query: { ...options.query, search: "new query" } }; await update();
  const before = api.post.mock.calls.length; await act(async () => oldRetry()); expect(api.post).toHaveBeenCalledTimes(before); expect(view.detailMissing).toBe(false);
});
it("expires authority atomically, aborts late list/detail and blocks captured reads", async () => {
  options = { ...options, authority: {}, grantId: "synthetic grant", expiresAtMs: Date.now() + 1000 };
  await mount(); const detail = deferred(), rows = deferred(); api.post.mockReturnValueOnce(detail.promise).mockReturnValueOnce(rows.promise);
  const oldInspect = view.inspectRecord, oldRefresh = view.refreshRows;
  await act(async () => { void oldInspect("one"); }); await act(async () => { void oldRefresh(); });
  const signals = api.post.mock.calls.slice(-2).map((call) => call[2].signal as AbortSignal);
  await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
  expect(signals.every((signal) => signal.aborted)).toBe(true); expect(view.page).toBe(null); expect(view.selectedRecord).toBe(null);
  await act(async () => { detail.resolve({ ok: true, payload: record() }); rows.resolve({ ok: true, payload: page() }); });
  const before = api.post.mock.calls.length; await act(async () => { await oldInspect("one"); await oldRefresh(); });
  expect(api.post).toHaveBeenCalledTimes(before); expect(view.page).toBe(null); expect(view.selectedRecord).toBe(null);
});
it("revokes sensitive presentation on refused authority without storing or issuing grants", async () => {
  options = { ...options, authority: {}, grantId: "synthetic grant", expiresAtMs: Date.now() + 1000 }; await mount();
  api.post.mockResolvedValueOnce({ ok: false, status: 403 }); await act(async () => view.refreshRows());
  expect(view.authorizationLost).toBe(true); expect(view.page).toBe(null); expect(view.selectedRecord).toBe(null);
  expect(api.post.mock.calls.every((call) => ["list-records", "get-record"].includes(call[0]))).toBe(true);
});
it("masks changed query before cleanup and rejects late response plus captured refresh/detail", async () => {
  await mount(); const pending = deferred(); api.post.mockReturnValueOnce(pending.promise);
  await act(async () => { void view.refreshRows(); }); const oldRefresh = view.refreshRows, oldInspect = view.inspectRecord;
  options = { ...options, query: { ...options.query, search: "changed" } }; await update();
  await act(async () => pending.resolve({ ok: true, payload: { ...page(), records: [record("old response")] } }));
  const before = api.post.mock.calls.length; await act(async () => { await oldRefresh(); await oldInspect("one"); });
  expect(api.post).toHaveBeenCalledTimes(before); expect(view.page?.records[0]?.id).toBe("one");
});
it("fences owner/unmount callbacks and cancels reads before their initial microtask", async () => {
  act(() => { renderer = create(<Harness />); }); act(() => renderer!.unmount()); renderer = undefined;
  await act(async () => { await Promise.resolve(); }); expect(api.get).not.toHaveBeenCalled();
  await mount(); const oldMetadata = view.refreshMetadata, oldRows = view.refreshRows;
  options = { ...options, owner: {} }; await update(); const before = api.get.mock.calls.length;
  await act(async () => { await oldMetadata(); await oldRows(); }); expect(api.get).toHaveBeenCalledTimes(before);
});
