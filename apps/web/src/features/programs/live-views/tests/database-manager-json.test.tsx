import React, { useLayoutEffect, type SyntheticEvent } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RecordEnvelope } from "fluxiq/database-manager";
import type { ApiResponse, useProgramApi } from "../../program-api";
import type { CurrentUser } from "../../types";
import { DatabaseManagerLive } from "../database-manager";

type Api = ReturnType<typeof useProgramApi>;
const fixture = vi.hoisted(() => ({ api: undefined as Api | undefined }));
vi.mock("../../program-api", () => ({ useProgramApi: () => fixture.api }));
vi.mock("../../shared-ui", async (original) => {
  const actual = await original<typeof import("../../shared-ui")>();
  return { ...actual, Modal: (props: Parameters<typeof actual.Modal>[0]) => <section data-modal={props.title}>{props.children}</section> };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const user: CurrentUser = { id: "synthetic-user", displayName: "Synthetic", roleId: "test", pinConfigured: false, totpEnabled: false };
const record = (id = "a", kind = "public.rows", data: RecordEnvelope["data"] = { value: `synthetic-${id}` }): RecordEnvelope => ({ id, kind, data, scope: {}, createdAtMs: 1, updatedAtMs: 2 });
const row = record();
let detail: RecordEnvelope;
let renderer: ReactTestRenderer | undefined;
let get: ReturnType<typeof vi.fn<(endpoint: string) => Promise<ApiResponse<unknown>>>>;
let post: ReturnType<typeof vi.fn<(endpoint: string, payload: Record<string, unknown>) => Promise<ApiResponse<unknown>>>>;
const originalStringify = JSON.stringify;
const spyStringify = () => vi.spyOn(JSON, "stringify");
let stringify: ReturnType<typeof spyStringify>;
const page = (rows = [row]) => ({ records: rows, total: rows.length, limit: 50, offset: 0 });
const metadata = (kind = "public.rows") => ({ stores: [{ kind, scope: {}, recordCount: 2 }], databases: ["global"], migrations: [], migrationRuns: [] });
function apiAdapter(): Api {
  return { get: async <T,>(endpoint: string) => await get(endpoint) as ApiResponse<T>, post: async <T,>(endpoint: string, payload: Record<string, unknown>) => await post(endpoint, payload) as ApiResponse<T> };
}
function label(node: ReactTestInstance): string { return node.children.map((child) => typeof child === "string" ? child : label(child)).join(""); }
const button = (name: string) => renderer!.root.findAllByType("button").find((node) => label(node) === name)!;
const named = (name: string) => renderer!.root.findAll((node) => node.props["aria-label"] === name)[0]!;
const raw = () => renderer!.root.findAllByType("details").find((node) => node.props.className === "db-raw-record");
const rawText = () => raw()?.findAllByType("pre")[0]?.children.join("");
const prettyCalls = (data: RecordEnvelope["data"]) => stringify.mock.calls.filter((call) => call[0] === data && call[1] === null && call[2] === 2).length;
type Toggle = (event: SyntheticEvent<HTMLDetailsElement>) => void;
function toggle(handler: Toggle | undefined, open: boolean) { expect(handler).toBeTypeOf("function"); act(() => handler!({ currentTarget: { open } } as SyntheticEvent<HTMLDetailsElement>)); }
const currentToggle = () => raw()?.props.onToggle as Toggle | undefined;
async function inspect(id = "a") { await act(async () => button(id).props.onClick()); }
async function mount(actor = user) { await act(async () => { renderer = create(<DatabaseManagerLive currentUser={actor} />); }); }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { await Promise.resolve(); }); }
function deferred() { let resolve!: (value: ApiResponse<RecordEnvelope | null>) => void; return { promise: new Promise<ApiResponse<RecordEnvelope | null>>((done) => { resolve = done; }), resolve }; }
async function authorize() {
  act(() => renderer!.root.findAllByType("button").find((node) => node.props.className?.includes("db-table-node"))!.props.onClick());
  const modal = renderer!.root.findAllByType("section").find((node) => node.props["data-modal"]);
  act(() => modal!.findByType("input").props.onChange({ target: { value: "synthetic password" } }));
  await act(async () => button("Authorize for 5 Minutes").props.onClick());
}
function CommitProbe({ actor, probe }: { actor: CurrentUser; probe?: () => void }) { useLayoutEffect(() => { probe?.(); }, [probe]); return <DatabaseManagerLive currentUser={actor} />; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000); vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval, dispatchEvent: vi.fn() });
  detail = record();
  get = vi.fn(async () => ({ ok: true, payload: metadata() }));
  post = vi.fn(async (endpoint) => ({ ok: true, payload: endpoint === "get-record" ? detail : endpoint === "authorize-store" ? { grantId: `grant-${Date.now()}`, expiresAtMs: Date.now() + 1000 } : page() }));
  fixture.api = apiAdapter(); stringify = spyStringify();
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("does no full pretty formatting while collapsed through clock and unrelated presentation updates", async () => {
  await mount(); await inspect();
  expect(rawText()).toBeUndefined(); expect(prettyCalls(detail.data)).toBe(0);
  await advance(3000);
  act(() => renderer!.root.findAllByType("input").find((node) => node.props.placeholder === "Filter visible columns")!.props.onChange({ target: { value: "value" } }));
  await act(async () => renderer!.update(<DatabaseManagerLive currentUser={{ ...user, displayName: "Updated" }} />));
  expect(prettyCalls(detail.data)).toBe(0); expect(rawText()).toBeUndefined();
});
it("formats once while expanded, discards on close, and preserves the complete unbounded synthetic tail", async () => {
  let deep: RecordEnvelope["data"] = { leaf: "deep-leaf" };
  for (let index = 0; index < 12; index++) deep = { nested: deep };
  detail = record("a", "public.rows", { list: Array.from({ length: 605 }, (_, index) => index), deep, tail: "full-tail" });
  const expected = originalStringify(detail.data, null, 2);
  await mount(); await inspect(); toggle(currentToggle(), true);
  expect(raw()!.props.open).toBe(true); expect(rawText()).toBe(expected); expect(prettyCalls(detail.data)).toBe(1);
  expect(rawText()).toContain("604"); expect(rawText()).toContain("deep-leaf"); expect(rawText()).toContain("full-tail");
  await advance(3000);
  act(() => renderer!.root.findAllByType("input").find((node) => node.props.placeholder === "Filter visible columns")!.props.onChange({ target: { value: "tail" } }));
  expect(prettyCalls(detail.data)).toBe(1);
  toggle(currentToggle(), false); expect(rawText()).toBeUndefined(); expect(prettyCalls(detail.data)).toBe(1);
  toggle(currentToggle(), true); expect(prettyCalls(detail.data)).toBe(2); expect(rawText()).toBe(expected);
});
it("retires expanded A during pending B and rejects retained A toggles on confirmed B", async () => {
  post.mockImplementation(async (endpoint, payload) => ({ ok: true, payload: endpoint === "get-record" ? record(String(payload.id)) : page([row, record("b")]) }));
  await mount(); await inspect(); toggle(currentToggle(), true); const oldToggle = currentToggle();
  const pending = deferred(); post.mockImplementationOnce(() => pending.promise);
  await inspect("b"); expect(raw()).toBeUndefined();
  const b = record("b"); await act(async () => pending.resolve({ ok: true, payload: b }));
  expect(raw()!.props.open).toBe(false); expect(prettyCalls(b.data)).toBe(0);
  toggle(oldToggle, true); expect(raw()!.props.open).toBe(false);
  toggle(currentToggle(), true); expect(prettyCalls(b.data)).toBe(1);
});
it("retains expansion on rows refresh but closes a newly confirmed envelope with the same ID", async () => {
  await mount(); await inspect(); toggle(currentToggle(), true); const oldToggle = currentToggle();
  await act(async () => named("Refresh rows").props.onClick());
  expect(raw()!.props.open).toBe(true); expect(prettyCalls(detail.data)).toBe(1);
  const next = record("a", "public.rows", { value: "new-instance" }); detail = next;
  await inspect(); expect(raw()!.props.open).toBe(false); expect(prettyCalls(next.data)).toBe(0);
  toggle(oldToggle, true); expect(raw()!.props.open).toBe(false);
  toggle(currentToggle(), true); expect(prettyCalls(next.data)).toBe(1);
});
it.each(["api", "actor"])("masks raw expansion during %s owner replacement and refuses first-A callbacks after A-B-A", async (owner) => {
  await act(async () => { renderer = create(<CommitProbe actor={user} />); }); await inspect(); toggle(currentToggle(), true);
  const oldToggle = currentToggle(), firstApi = fixture.api; const before = post.mock.calls.length;
  if (owner === "api") fixture.api = apiAdapter();
  let duringCommit: string | undefined;
  await act(async () => renderer!.update(<CommitProbe actor={owner === "actor" ? { ...user, id: "actor-b" } : user} probe={() => { duringCommit = rawText(); oldToggle!({ currentTarget: { open: true } } as SyntheticEvent<HTMLDetailsElement>); }} />));
  expect(duringCommit).toBeUndefined(); expect(post.mock.calls.length).toBe(before + 1);
  if (owner === "api") fixture.api = firstApi;
  await act(async () => renderer!.update(<CommitProbe actor={user} />)); await inspect();
  toggle(oldToggle, true); expect(raw()!.props.open).toBe(false); expect(rawText()).toBeUndefined();
});
it("drops expired sensitive JSON and rejects the old grant toggle after a fresh authorization", async () => {
  get.mockResolvedValue({ ok: true, payload: metadata("secret.keys") }); detail = record("a", "secret.keys");
  post.mockImplementation(async (endpoint) => ({ ok: true, payload: endpoint === "get-record" ? detail : endpoint === "authorize-store" ? { grantId: `grant-${Date.now()}`, expiresAtMs: Date.now() + 1000 } : page([record("a", "secret.keys")]) }));
  await mount(); await authorize(); await inspect(); toggle(currentToggle(), true); const oldToggle = currentToggle();
  await advance(1001); expect(raw()).toBeUndefined();
  toggle(oldToggle, true); expect(raw()).toBeUndefined();
  await authorize(); detail = record("a", "secret.keys", { value: "fresh-grant-detail" }); await inspect();
  toggle(oldToggle, true); expect(raw()!.props.open).toBe(false); expect(prettyCalls(detail.data)).toBe(0);
  toggle(currentToggle(), true); expect(prettyCalls(detail.data)).toBe(1);
});
it("refuses opening with an expired grant before any expiry render or timer cleanup", async () => {
  get.mockResolvedValue({ ok: true, payload: metadata("secret.keys") }); detail = record("a", "secret.keys");
  post.mockImplementation(async (endpoint) => ({ ok: true, payload: endpoint === "get-record" ? detail : endpoint === "authorize-store" ? { grantId: "grant", expiresAtMs: Date.now() + 1000 } : page([record("a", "secret.keys")]) }));
  await mount(); await authorize(); await inspect(); const captured = currentToggle();
  vi.setSystemTime(Date.now() + 1001); toggle(captured, true);
  expect(raw()!.props.open).toBe(false); expect(rawText()).toBeUndefined(); expect(prettyCalls(detail.data)).toBe(0);
});
it.each(["list", "detail"])("retires sensitive expansion after %s authorization refusal", async (channel) => {
  get.mockResolvedValue({ ok: true, payload: metadata("secret.keys") }); detail = record("a", "secret.keys");
  post.mockImplementation(async (endpoint) => ({ ok: true, payload: endpoint === "get-record" ? detail : endpoint === "authorize-store" ? { grantId: "grant", expiresAtMs: Date.now() + 300_000 } : page([record("a", "secret.keys")]) }));
  await mount(); await authorize(); await inspect(); toggle(currentToggle(), true); const oldToggle = currentToggle();
  post.mockResolvedValueOnce({ ok: false, status: 403, requiresRecheck: true });
  if (channel === "list") await act(async () => named("Refresh rows").props.onClick()); else await inspect();
  expect(raw()).toBeUndefined(); toggle(oldToggle, true); expect(raw()).toBeUndefined();
});
it("masks pending searches and removed metadata targets without reviving a retained toggle", async () => {
  await mount(); await inspect(); toggle(currentToggle(), true); const oldToggle = currentToggle();
  act(() => named("Search rows").props.onChange({ target: { value: "new" } })); expect(raw()).toBeUndefined();
  await advance(250); await inspect(); toggle(oldToggle, true); expect(raw()!.props.open).toBe(false);
  toggle(currentToggle(), true); const searchToggle = currentToggle();
  get.mockResolvedValue({ ok: true, payload: { ...metadata(), stores: [] } });
  await act(async () => named("Refresh database metadata").props.onClick());
  expect(raw()).toBeUndefined(); toggle(searchToggle, true); expect(raw()).toBeUndefined();
});
it.each(["store", "database"])("retires expansion across a %s query change", async (target) => {
  get.mockResolvedValue({ ok: true, payload: { ...metadata(), stores: [...metadata().stores, { kind: "public.other", scope: {}, recordCount: 1 }], databases: ["global", "domain-b"] } });
  post.mockImplementation(async (endpoint, payload) => {
    const next = { ...record("a", String(payload.kind)), scope: payload.scope as RecordEnvelope["scope"] };
    return { ok: true, payload: endpoint === "get-record" ? next : page([next]) };
  });
  await mount(); await inspect(); toggle(currentToggle(), true); const captured = currentToggle();
  await act(async () => {
    if (target === "database") button("domain-b").props.onClick();
    else renderer!.root.findAllByType("button").find((node) => node.props.className?.includes("db-table-node") && label(node).includes("public.other"))!.props.onClick();
  });
  expect(raw()).toBeUndefined(); await inspect(); toggle(captured, true);
  expect(raw()!.props.open).toBe(false); expect(rawText()).toBeUndefined();
});
it.each(["missing", "malformed", "rejected"])("keeps %s detail and its retry replacement closed", async (failure) => {
  await mount(); await inspect(); toggle(currentToggle(), true); const oldToggle = currentToggle();
  if (failure === "rejected") post.mockRejectedValueOnce(new Error("synthetic rejection"));
  else post.mockResolvedValueOnce({ ok: true, payload: failure === "missing" ? null : {} });
  await inspect(); expect(raw()).toBeUndefined();
  if (failure === "missing") await inspect(); else await act(async () => button("Retry detail").props.onClick());
  toggle(oldToggle, true); expect(raw()!.props.open).toBe(false);
});
it("rejects a retained toggle after unmount without dispatching another request", async () => {
  await mount(); await inspect(); toggle(currentToggle(), true); const oldToggle = currentToggle(), before = post.mock.calls.length;
  act(() => renderer!.unmount()); renderer = undefined; toggle(oldToggle, true); expect(post).toHaveBeenCalledTimes(before);
});
