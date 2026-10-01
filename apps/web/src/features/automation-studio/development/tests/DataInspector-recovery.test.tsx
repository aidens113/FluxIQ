import React, { useLayoutEffect } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AutomationStudioDataInspector } from "../DataInspector";
import type { AutomationStudioDevelopmentSnapshot } from "../telemetry";

type Props = Parameters<typeof AutomationStudioDataInspector>[0];
type Result = { ok: boolean; payload?: unknown; error?: string };
const fixture = vi.hoisted(() => ({ snapshot: undefined as AutomationStudioDevelopmentSnapshot | undefined }));
vi.mock("../telemetry", () => ({ useAutomationStudioDevelopmentSnapshot: () => fixture.snapshot }));
vi.mock("../../../programs/shared-ui", async (original) => {
  const actual = await original<typeof import("../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: Parameters<typeof actual.Modal>[0]) => <section data-modal={props.title} data-close={props.onClose}>{props.children}</section> };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let renderer: ReactTestRenderer | undefined;
let props: Props;
let get: ReturnType<typeof vi.fn<(endpoint: string) => Promise<Result>>>;
let post: ReturnType<typeof vi.fn<(endpoint: string, payload: Record<string, unknown>) => Promise<Result>>>;
let close: ReturnType<typeof vi.fn>;
let syntheticWindow: EventTarget;
const sample = (endpoint = "synthetic-a") => ({ kind: "endpoint", recordedAt: 1, elapsedMs: 2, ok: true, endpoint });
const label = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer!.root.findAllByType("button").find((node) => label(node).includes(name))!;
const text = () => JSON.stringify(renderer!.toJSON());
const modal = () => renderer!.root.findAllByType("section").find((node) => node.props["data-modal"] === "Data Flow Inspector")!;
function adapter(): Props["api"] { return { get: async <T,>(endpoint: string) => await get(endpoint) as { ok: boolean; payload?: T; error?: string }, post: async <T,>(endpoint: string, payload: Record<string, unknown>) => await post(endpoint, payload) as { ok: boolean; payload?: T; error?: string } }; }
function deferred() { let resolve!: (value: Result) => void; let reject!: (error: unknown) => void; return { promise: new Promise<Result>((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; }
async function mount() { await act(async () => { renderer = create(<AutomationStudioDataInspector {...props} />); }); }
async function click(name: string) { await act(async () => button(name).props.onClick()); }
function Probe({ value, probe }: { value: Props; probe?: () => void }) { useLayoutEffect(() => { probe?.(); }, [probe]); return <AutomationStudioDataInspector {...value} />; }
beforeEach(() => {
  syntheticWindow = new EventTarget(); vi.stubGlobal("window", syntheticWindow);
  fixture.snapshot = { activeRequests: [], apiMetrics: [], renderMetrics: [], longTasks: [], cache: { entryCount: 0, estimatedBytes: 0, scopes: {} }, graph: null, counters: { counts: { "studio-shell-render": 0, "view-render": 0, "request-lifecycle": 0, "hierarchy-save-request": 0, "draft-write": 0 }, byName: {}, events: [] }, subscriptions: [], workerQueues: [] };
  get = vi.fn(async () => ({ ok: true, payload: { metrics: [] } })); post = vi.fn(async () => ({ ok: true })); close = vi.fn();
  props = { api: adapter(), activeProjectId: "project-a", cacheStats: () => ({ entryCount: 7, estimatedBytes: 1024, scopes: { summary: 7 } }), onClose: close };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("distinguishes held initial server metrics from confirmed empty without posting or polling", async () => {
  const held = deferred(); get.mockReturnValueOnce(held.promise); await mount();
  expect(text()).toContain("Loading server metrics"); expect(text()).not.toContain("No endpoint samples"); expect(button("Refresh server").props.disabled).toBe(true); expect(post).not.toHaveBeenCalled();
  await act(async () => held.resolve({ ok: true, payload: { metrics: [] } }));
  expect(text()).toContain("No endpoint samples"); expect(button("Refresh server").props.disabled).toBe(false); expect(get).toHaveBeenCalledTimes(1);
});
it.each(["rejected", "refused"])("releases an initial %s read with local feedback and an explicit read-only retry", async (failure) => {
  if (failure === "rejected") get.mockRejectedValueOnce(new Error("synthetic private rejection")); else get.mockResolvedValueOnce({ ok: false, error: "synthetic private refusal" });
  await mount(); expect(text()).toContain("Server metrics could not be loaded"); expect(text()).not.toContain("synthetic private"); expect(text()).not.toContain("No endpoint samples"); expect(button("Refresh server").props.disabled).toBe(false);
  await click("Refresh server"); expect(text()).toContain("No endpoint samples"); expect(get).toHaveBeenCalledTimes(2); expect(post).not.toHaveBeenCalled();
});
it("keeps confirmed samples and selected view through a pending then rejected refresh", async () => {
  get.mockResolvedValueOnce({ ok: true, payload: { metrics: [sample()] } }); await mount(); await click("Requests");
  const held = deferred(); get.mockReturnValueOnce(held.promise); await click("Refresh server");
  expect(text()).toContain("synthetic-a"); expect(text()).toContain("Loading server metrics");
  await act(async () => held.reject(new Error("synthetic private rejection")));
  expect(text()).toContain("synthetic-a"); expect(text()).toContain("last confirmed"); expect(text()).toContain("Recent client responses");
  await click("Refresh server"); expect(text()).not.toContain("synthetic-a"); expect(text()).toContain("No endpoint samples");
});
it("keeps last-confirmed-zero feedback truthful during refresh failure", async () => {
  await mount(); get.mockRejectedValueOnce(new Error("synthetic rejection")); await click("Refresh server");
  expect(text()).toContain("No endpoint samples in the last confirmed read"); expect(text()).toContain("Server metrics could not be loaded");
});
it("locks duplicate reads and cross-operation captured clears before React commits", async () => {
  await mount(); const read = button("Refresh server").props.onClick, clear = button("Clear UI cache").props.onClick, held = deferred(); get.mockReturnValueOnce(held.promise);
  act(() => { read(); read(); clear(); }); expect(get).toHaveBeenCalledTimes(2); expect(post).not.toHaveBeenCalled();
  await act(async () => held.resolve({ ok: true })); expect(button("Refresh server").props.disabled).toBe(false);
});
it("locks duplicate clears and reads, acknowledges only the captured project without resetting cache counts", async () => {
  await mount(); const read = button("Refresh server").props.onClick, clear = button("Clear UI cache").props.onClick, held = deferred(); post.mockReturnValueOnce(held.promise);
  act(() => { clear(); clear(); read(); }); expect(post).toHaveBeenCalledTimes(1); expect(get).toHaveBeenCalledTimes(1); expect(post).toHaveBeenCalledWith("delete-project-ui-cache", { projectId: "project-a" });
  expect(text()).toContain("UI cache clear request is pending");
  await act(async () => held.resolve({ ok: true })); expect(text()).toContain("UI cache clear was acknowledged"); expect(text()).toContain("7 entries");
});
it.each(["rejected", "refused", "malformed"])("keeps an explicit %s clear uncertain and never automatically replays it", async (failure) => {
  await mount(); if (failure === "rejected") post.mockRejectedValueOnce(new Error("synthetic private rejection")); else post.mockResolvedValueOnce(failure === "refused" ? { ok: false, error: "synthetic private refusal" } : {} as Result);
  await click("Clear UI cache"); expect(text()).toContain("UI cache clear was not confirmed. It may have completed"); expect(text()).not.toContain("synthetic private"); expect(button("Clear UI cache").props.disabled).toBe(false);
  expect(post).toHaveBeenCalledTimes(1); expect(get).toHaveBeenCalledTimes(1);
  await click("Refresh server"); expect(post).toHaveBeenCalledTimes(1); expect(text()).toContain("UI cache clear was not confirmed");
  await click("Clear UI cache"); expect(post).toHaveBeenCalledTimes(2); expect(text()).toContain("UI cache clear was acknowledged");
});
it("preserves read failure independently of a later acknowledged clear", async () => {
  get.mockRejectedValueOnce(new Error("synthetic read rejection")); await mount(); await click("Clear UI cache");
  expect(text()).toContain("Server metrics could not be loaded"); expect(text()).toContain("UI cache clear was acknowledged"); expect(text()).not.toContain("No endpoint samples");
});
it.each(["api", "project"])("masks foreign data and retires callbacks in the %s replacement commit and A-B-A", async (owner) => {
  get.mockResolvedValueOnce({ ok: true, payload: { metrics: [sample("first-a")] } }); await act(async () => { renderer = create(<Probe value={props} />); });
  const oldRead = button("Refresh server").props.onClick, oldClear = button("Clear UI cache").props.onClick, oldClose = modal().props["data-close"], original = props;
  const held = deferred(); get.mockReturnValueOnce(held.promise);
  props = owner === "api" ? { ...props, api: adapter() } : { ...props, activeProjectId: "project-b" };
  let committed = ""; await act(async () => renderer!.update(<Probe value={props} probe={() => { committed = text(); oldRead(); oldClear(); oldClose(); }} />));
  expect(committed).not.toContain("first-a"); expect(get).toHaveBeenCalledTimes(2); expect(post).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  await act(async () => { renderer!.update(<Probe value={original} />); });
  act(() => { oldRead(); oldClear(); oldClose(); }); expect(get).toHaveBeenCalledTimes(3); expect(post).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  await act(async () => held.resolve({ ok: true, payload: { metrics: [sample("late-b")] } })); expect(text()).not.toContain("late-b");
});
it.each(["read", "clear"])("keeps replacement work busy when an obsolete %s settles", async (operation) => {
  await mount(); const old = deferred(), next = deferred(); if (operation === "read") { get.mockReturnValueOnce(old.promise); await click("Refresh server"); } else { post.mockReturnValueOnce(old.promise); await click("Clear UI cache"); }
  get.mockReturnValueOnce(next.promise); props = { ...props, activeProjectId: "project-b" }; await act(async () => renderer!.update(<AutomationStudioDataInspector {...props} />));
  await act(async () => old.resolve({ ok: true, payload: { metrics: [sample("obsolete")] } }));
  expect(button("Refresh server").props.disabled).toBe(true); expect(text()).not.toContain("obsolete"); expect(text()).not.toContain("UI cache clear was acknowledged"); expect(post).toHaveBeenCalledTimes(operation === "clear" ? 1 : 0);
  await act(async () => next.resolve({ ok: true, payload: { metrics: [] } })); expect(button("Refresh server").props.disabled).toBe(false);
});
it("keeps ordinary callback/telemetry rerenders current without extra reads or resetting the selected view", async () => {
  await mount(); await click("SQL"); const currentClose = modal().props["data-close"], updatedClose = vi.fn();
  fixture.snapshot = { ...fixture.snapshot!, cache: { entryCount: 9, estimatedBytes: 9, scopes: {} } };
  props = { ...props, onClose: updatedClose, cacheStats: () => ({ entryCount: 12, estimatedBytes: 12, scopes: {} }) };
  await act(async () => renderer!.update(<AutomationStudioDataInspector {...props} />));
  expect(text()).toContain("Recent SQL operations"); expect(get).toHaveBeenCalledTimes(1); act(() => currentClose()); expect(updatedClose).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
});
it("uses equivalent absent projects without remounting and refuses a cache clear without a project", async () => {
  props = { ...props, activeProjectId: null }; await mount(); const initialClose = modal().props["data-close"];
  props = { api: props.api, cacheStats: props.cacheStats, onClose: props.onClose }; await act(async () => renderer!.update(<AutomationStudioDataInspector {...props} />));
  expect(get).toHaveBeenCalledTimes(1); expect(button("Clear UI cache")).toBeUndefined(); act(() => initialClose()); expect(close).toHaveBeenCalledTimes(1); expect(post).not.toHaveBeenCalled();
});
it("retires mounted callbacks and subscriptions after unmount while pending work can settle", async () => {
  const remove = vi.spyOn(syntheticWindow, "removeEventListener"); await mount(); const read = button("Refresh server").props.onClick, clear = button("Clear UI cache").props.onClick, dismiss = modal().props["data-close"], held = deferred(); post.mockReturnValueOnce(held.promise); await click("Clear UI cache");
  act(() => renderer!.unmount()); renderer = undefined; read(); clear(); dismiss(); await act(async () => held.reject(new Error("synthetic late rejection")));
  expect(get).toHaveBeenCalledTimes(1); expect(post).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled(); expect(remove).toHaveBeenCalledWith("automation-studio:preload-metric", expect.any(Function));
});
it.each([undefined, null, {}, { metrics: null }, { metrics: [] }, { metrics: [{ kind: "future.kind" }] }])("preserves empty/null/unknown-kind read compatibility (%j)", async (payload) => {
  get.mockResolvedValueOnce({ ok: true, ...(payload === undefined ? {} : { payload }) }); await mount(); expect(text()).toContain("No endpoint samples"); expect(text()).not.toContain("Server metrics could not be loaded");
});
it.each(["invalid payload", { metrics: "invalid" }, { metrics: [null] }, { metrics: [{ kind: "endpoint", ok: true }] }, { metrics: [{ ...sample(), elapsedMs: Infinity }] }, { metrics: [{ ...sample(), responseBytes: "bad" }] }, { metrics: [{ ...sample(), endpoint: {} }] }])("refuses malformed rendered metrics without crashing or claiming empty (%j)", async (payload) => {
  get.mockResolvedValueOnce({ ok: true, payload }); await mount(); expect(text()).toContain("Server metrics could not be loaded"); expect(text()).not.toContain("No endpoint samples"); expect(button("Refresh server").props.disabled).toBe(false);
});
it("accepts omitted unused timestamps and nullable fallback fields without a wire-contract change", async () => {
  get.mockResolvedValueOnce({ ok: true, payload: { metrics: [{ kind: "endpoint", elapsedMs: 1, ok: true, endpoint: null, responseBytes: null, sqlDurationMs: null }, { kind: "sql", elapsedMs: 2, ok: false, repositoryKind: null }] } });
  await mount(); expect(text()).not.toContain("Server metrics could not be loaded"); await click("SQL"); expect(text()).toContain("unknown / database");
});
