import React, { useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { DatabaseManagerLive } from "../database-manager";
const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, onCommit: null as (() => void) | null }));
vi.mock("../../program-api", () => ({ useProgramApi: () => fixture.api }));
vi.mock("../../shared-ui", async (original) => {
  const actual = await original<typeof import("../../shared-ui")>();
  return { ...actual, Modal: (props: any) => <section data-modal={props.title} data-close={props.onClose}>{props.children}</section>, VisualAlert: (props: Parameters<typeof actual.VisualAlert>[0]) => <CommitAlert><actual.VisualAlert {...props} /></CommitAlert>, StatusText: () => null };
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const user = { id: "synthetic-user", pinConfigured: false, totpEnabled: false } as any;
let renderer: ReactTestRenderer | undefined;
const record = (id = "record", kind = "public.rows") => ({ id, kind, scope: {}, data: { value: "synthetic row" }, createdAtMs: 1, updatedAtMs: 2 });
const page = (records = [record()], total = records.length, offset = 0) => ({ records, total, limit: 50, offset });
const text = () => JSON.stringify(renderer!.toJSON());
const label = (item: any): string => item.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer!.root.findAllByType("button").find((item) => label(item) === name)!;
const modal = () => renderer!.root.findAllByType("section").find((item) => item.props["data-modal"]);
const named = (name: string) => renderer!.root.findAll((item) => item.props["aria-label"] === name)[0]!;
const mount = async () => { await act(async () => { renderer = create(<DatabaseManagerLive currentUser={user} />); }); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function deferred() { let resolve!: (value: any) => void; return { promise: new Promise<any>((done) => { resolve = done; }), resolve: (value: any) => resolve(value) }; }
function CommitProbe({ probe }: { probe?: () => void }) { useLayoutEffect(() => { probe?.(); }, [probe]); return <DatabaseManagerLive currentUser={user} />; }
function CommitAlert({ children }: { children: React.ReactNode }) { useLayoutEffect(() => { fixture.onCommit?.(); }); return <>{children}</>; }
async function authorize() {
  act(() => { renderer!.root.findAllByType("button").find((item) => item.props.className?.includes("db-table-node"))!.props.onClick(); });
  act(() => { modal()!.findByType("input").props.onChange({ target: { value: "synthetic password" } }); });
  await act(async () => button("Authorize for 5 Minutes").props.onClick());
}
beforeEach(() => {
  fixture.onCommit = null;
  vi.useFakeTimers(); vi.setSystemTime(1_000_000); vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval });
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload: { stores: [{ kind: "public.rows" }], databases: ["global"] } })), post: vi.fn(async (endpoint: string) => ({ ok: true, payload: endpoint === "get-record" ? record() : page() })) };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
it("discards pending sensitive detail after grant expiry and refuses captured expired clicks", async () => {
  fixture.api.get.mockResolvedValue({ ok: true, payload: { stores: [{ kind: "secret.keys" }], databases: ["global"] } });
  fixture.api.post.mockImplementation(async (endpoint: string) => ({ ok: true, payload: endpoint === "authorize-store" ? { grantId: "synthetic grant", expiresAtMs: Date.now() + 1000 } : page([record("secret-row", "secret.keys")]) }));
  await mount(); await authorize(); const captured = button("secret-row").props.onClick; const pending = deferred(); fixture.api.post.mockReturnValueOnce(pending.promise);
  await act(async () => { void captured(); }); await advance(1001);
  await act(async () => pending.resolve({ ok: true, payload: { ...record("secret-row", "secret.keys"), data: { value: "expired synthetic detail" } } }));
  expect(text()).not.toContain("expired synthetic detail"); expect(text()).toContain("Sensitive store locked");
  const before = fixture.api.post.mock.calls.length; await act(async () => { void captured(); }); expect(fixture.api.post).toHaveBeenCalledTimes(before);
});
it("does not let an obsolete dialog dismiss close a newer authorization epoch", async () => {
  fixture.api.get.mockResolvedValue({ ok: true, payload: { stores: [{ kind: "secret.keys" }], databases: ["global"] } });
  await mount(); act(() => renderer!.root.findAllByType("button").find((item) => item.props.className?.includes("db-table-node"))!.props.onClick());
  const oldClose = modal()!.props["data-close"]; act(() => oldClose());
  act(() => button("Authorize View").props.onClick()); act(() => oldClose()); expect(modal()).toBeDefined();
});
it("refuses malformed list pages with fixed local retry instead of crashing or claiming empty success", async () => {
  fixture.api.post.mockResolvedValue({ ok: true, payload: {} }); await mount();
  expect(text()).toContain("Rows could not be loaded"); expect(text()).not.toContain("This store has no rows");
  fixture.api.post.mockResolvedValue({ ok: true, payload: page() }); await act(async () => button("Retry rows").props.onClick()); expect(text()).toContain("synthetic row");
});
it("does not reveal a late expired list when a fresh grant is issued before its replacement page arrives", async () => {
  fixture.api.get.mockResolvedValue({ ok: true, payload: { stores: [{ kind: "secret.keys" }], databases: ["global"] } });
  let listCalls = 0; const oldPage = deferred(), replacement = deferred();
  fixture.api.post.mockImplementation((endpoint: string) => endpoint === "authorize-store" ? Promise.resolve({ ok: true, payload: { grantId: `synthetic-${Date.now()}`, expiresAtMs: Date.now() + 1000 } }) : (++listCalls === 1 ? oldPage.promise : replacement.promise));
  await mount(); await authorize(); await advance(1001);
  await act(async () => oldPage.resolve({ ok: true, payload: page([record("expired-list", "secret.keys")]) }));
  await authorize(); expect(text()).not.toContain("expired-list");
  await act(async () => replacement.resolve({ ok: true, payload: page([record("fresh-list", "secret.keys")]) })); expect(text()).toContain("fresh-list");
});
it("holds confirmed page and rows through a failed navigation and retries the requested page", async () => {
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: page([record()], 100) }); await mount();
  fixture.api.post.mockRejectedValueOnce(new Error("private next-page error"));
  await act(async () => named("Next page").props.onClick());
  expect(text()).toContain("synthetic row"); expect(text()).toContain("Showing confirmed page"); expect(text()).not.toContain("private next-page error");
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: page([record("next")], 100, 50) });
  await act(async () => button("Retry rows").props.onClick()); expect(button("next")).toBeDefined();
  expect(fixture.api.post.mock.calls.slice(-2).map((call) => call[1].offset)).toEqual([50, 50]);
});
it("masks obsolete search rows immediately before debounce and rejects captured detail", async () => {
  await mount(); const oldInspect = button("record").props.onClick;
  act(() => named("Search rows").props.onChange({ target: { value: "changed" } }));
  expect(text()).not.toContain("synthetic row"); expect(text()).toContain("Waiting for the current search");
  const before = fixture.api.post.mock.calls.length; await act(async () => { void oldInspect(); }); expect(fixture.api.post).toHaveBeenCalledTimes(before);
  await advance(250); expect(fixture.api.post.mock.calls.at(-1)?.[1].search).toBe("changed");
});
it("masks foreign records during API replacement and rejects old read/store callbacks before passive cleanup", async () => {
  await act(async () => { renderer = create(<CommitProbe />); });
  const oldApi = fixture.api; const oldInspect = button("record").props.onClick; const oldRefresh = named("Refresh rows").props.onClick;
  const oldStore = renderer!.root.findAllByType("button").find((item) => item.props.className?.includes("db-table-node"))!.props.onClick;
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload: { stores: [{ kind: "public.rows" }], databases: ["global"] } })), post: vi.fn(async () => ({ ok: true, payload: page([record("new-owner")]) })) };
  let initialRender = "";
  await act(async () => renderer!.update(<CommitProbe probe={() => { initialRender = text(); void oldInspect(); void oldRefresh(); oldStore(); }} />));
  expect(initialRender).not.toContain("synthetic row"); expect(oldApi.post).toHaveBeenCalledTimes(1); expect(button("new-owner")).toBeDefined();
});
it("shows independent rejected detail recovery and distinguishes a missing record", async () => {
  await mount(); fixture.api.post.mockRejectedValueOnce(new Error("private detail error"));
  await act(async () => button("record").props.onClick()); expect(text()).toContain("Record detail unavailable"); expect(text()).not.toContain("private detail error");
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: null }); await act(async () => button("Retry detail").props.onClick());
  expect(text()).toContain("Record not found"); expect(text()).not.toContain("Record detail unavailable");
});
it("masks a removed sensitive target and rejects retained authorization/open/dismiss during commit before reconciliation", async () => {
  fixture.api.get.mockResolvedValueOnce({ ok: true, payload: { stores: [{ kind: "secret.keys" }], databases: ["global"] } });
  await mount(); act(() => renderer!.root.findAllByType("button").find((item) => item.props.className?.includes("db-table-node"))!.props.onClick());
  act(() => modal()!.findByType("input").props.onChange({ target: { value: "synthetic obsolete password" } }));
  const oldAuthorize = button("Authorize for 5 Minutes").props.onClick, oldOpen = button("Authorize View").props.onClick, oldDismiss = modal()!.props["data-close"];
  let checked = false, dialogDuringCommit = false;
  fixture.onCommit = () => {
    if (checked || !text().includes("public.rows")) return;
    checked = true; dialogDuringCommit = Boolean(modal()); void oldAuthorize(); oldOpen(); oldDismiss();
  };
  await act(async () => named("Refresh database metadata").props.onClick());
  fixture.onCommit = null;
  expect(checked).toBe(true); expect(dialogDuringCommit).toBe(false);
  expect(fixture.api.post.mock.calls.filter((call) => call[0] === "authorize-store")).toHaveLength(0);
  expect(modal()).toBeUndefined();
});
