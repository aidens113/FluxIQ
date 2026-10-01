import { Profiler, useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { useOnboardingReadings } from "../useOnboardingReadings";
import type { OnboardingSources, OnboardingReadings } from "../types";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const gateway = { sessions: [], webRuntime: { clientGatewayListening: true } };
const source = (overrides: Partial<OnboardingSources> = {}): OnboardingSources => ({ loadGatewaySnapshot: vi.fn(async () => ({ ok: true, payload: gateway } as any)), loadSecretKeys: vi.fn(async () => ({ ok: true, payload: { keys: [] } })), ...overrides });
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>((done) => { resolve = done; }); return { promise, resolve }; }
let renderer: ReactTestRenderer | undefined;
let latest: ReturnType<typeof useOnboardingReadings>;
function Harness(props: { sources: OnboardingSources; pollMs?: number; complete?: (value: OnboardingReadings) => boolean }) { latest = useOnboardingReadings(props.sources, { pollMs: props.pollMs ?? 0, isComplete: props.complete ?? (() => false) }); return <pre>{JSON.stringify(latest.readings)}</pre>; }
async function mount(sources: OnboardingSources, extra: Record<string, any> = {}) { await act(async () => { renderer = create(<Harness sources={sources} {...extra} />); }); }
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
it("masks a previous source owner on the first replacement commit", async () => {
  const old = source(); const pending = deferred(); const next = source({ loadGatewaySnapshot: () => pending.promise, loadSecretKeys: () => pending.promise }); const commits: string[] = [];
  const tree = (sources: OnboardingSources) => <Profiler id="readings" onRender={() => commits.push(JSON.stringify(latest.readings))}><Harness sources={sources} /></Profiler>;
  await act(async () => { renderer = create(tree(old)); }); commits.length = 0;
  await act(async () => renderer!.update(tree(next)));
  expect(JSON.parse(commits[0]!)).toEqual({ gateway: { status: "loading" }, keys: { status: "loading" } });
});
it("publishes a gateway result while the independent keys read is pending", async () => { const keys = deferred(); await mount(source({ loadSecretKeys: () => keys.promise })); expect(latest.readings.gateway.status).toBe("loaded"); expect(latest.readings.keys.status).toBe("loading"); });
it("rejects a successful missing keys list rather than declaring it empty", async () => { await mount(source({ loadSecretKeys: async () => ({ ok: true, payload: {} }) })); expect(latest.readings.keys.status).toBe("failed"); });
it("uses fixed exception feedback without rendering rejected exception text", async () => { await mount(source({ loadGatewaySnapshot: async () => { throw new Error("private injected detail"); } })); expect(latest.readings.gateway).toEqual({ status: "failed", error: "The FluxIQ runtime could not be reached." }); });
it("coalesces manual checks while either current source is pending", async () => { const pending = deferred(); const sources = source({ loadSecretKeys: vi.fn(() => pending.promise) }); await mount(sources); await act(async () => { latest.refresh(); latest.refresh(); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1); expect(sources.loadSecretKeys).toHaveBeenCalledTimes(1); });
it.each([null, {}, [], { keys: null }, { keys: [null] }, { keys: [{ name: "key", kind: "llm", scope: "global", enabled: "true" }] }, { keys: [{ name: "key", kind: "llm", scope: "global", enabled: true, provider: 1 }] }])("keeps malformed key payload %j unavailable", async (payload) => { await mount(source({ loadSecretKeys: async () => ({ ok: true, payload }) as any })); expect(latest.readings.keys.status).toBe("failed"); });
it.each([null, { sessions: "connected" }, { sessions: [null] }, { sessions: [{}] }, { pairings: null }, { pairings: [{ expiresAt: "invalid" }] }, { webRuntime: null }, { webRuntime: { clientGatewayListening: "true" } }, { webRuntime: { clientGatewayError: {} } }])("keeps malformed gateway payload %j unavailable", async (payload) => { await mount(source({ loadGatewaySnapshot: async () => ({ ok: true, payload }) as any })); expect(latest.readings.gateway.status).toBe("failed"); });
it("accepts empty and partial legacy summaries and numeric pairing timestamps", async () => { await mount(source({ loadGatewaySnapshot: async () => ({ ok: true, payload: { ...gateway, pairings: [{ expiresAt: "123", consumedAt: 0 }] } }) as any })); expect(latest.readings.gateway.status).toBe("loaded"); expect(latest.readings.keys).toEqual({ status: "loaded", value: [] }); });
it.each(["gateway", "keys"] as const)("catches synchronous %s source errors", async (which) => { const fail = () => { throw new Error("private injected detail"); }; await mount(source(which === "gateway" ? { loadGatewaySnapshot: fail } : { loadSecretKeys: fail })); expect(latest.readings[which].status).toBe("failed"); expect(JSON.stringify(latest.readings)).not.toContain("private injected detail"); });
it("preserves actual endpoint refusal and permits manual retry with pollMs zero", async () => { const loadGatewaySnapshot = vi.fn().mockResolvedValueOnce({ ok: false, error: "connect ECONNREFUSED" }).mockResolvedValue({ ok: true, payload: gateway }); await mount(source({ loadGatewaySnapshot })); expect(latest.readings.gateway).toEqual({ status: "failed", error: "connect ECONNREFUSED" }); await act(async () => latest.refresh()); expect(latest.readings.gateway.status).toBe("loaded"); expect(loadGatewaySnapshot).toHaveBeenCalledTimes(2); });
it("rejects replaced owner completion and retained refresh even through A/B/A", async () => {
  const a = deferred(); const b = deferred(); const sourceA = source({ loadGatewaySnapshot: vi.fn().mockReturnValueOnce(a.promise).mockResolvedValue({ ok: true, payload: gateway }) }); const sourceB = source({ loadGatewaySnapshot: () => b.promise });
  await mount(sourceA); const oldRefresh = latest.refresh;
  await act(async () => renderer!.update(<Harness sources={sourceB} />)); const refreshB = latest.refresh;
  await act(async () => renderer!.update(<Harness sources={sourceA} />));
  await act(async () => { a.resolve({ ok: true, payload: { sessions: "bad" } }); b.resolve({ ok: false, error: "obsolete" }); oldRefresh(); refreshB(); });
  expect(latest.readings.gateway).toEqual({ status: "loaded", value: gateway }); expect(sourceA.loadGatewaySnapshot).toHaveBeenCalledTimes(2);
});
it("rejects refresh in an unmount layout commit and late pending completion", async () => {
  const pending = deferred(); const sources = source({ loadGatewaySnapshot: vi.fn(() => pending.promise) }); let retained = () => {};
  function Parent({ show }: { show: boolean }) { useLayoutEffect(() => { if (!show) retained(); }, [show]); return show ? <Harness sources={sources} /> : null; }
  await act(async () => { renderer = create(<Parent show />); }); retained = latest.refresh;
  await act(async () => renderer!.update(<Parent show={false} />));
  await act(async () => { pending.resolve({ ok: true, payload: gateway }); retained(); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
});
it("waits for slow current reads before scheduling another cycle", async () => {
  vi.useFakeTimers(); const pending = deferred(); const sources = source({ loadSecretKeys: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ ok: true, payload: { keys: [] } }) }); await mount(sources, { pollMs: 100 });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1); expect(latest.readings.gateway.status).toBe("loaded");
  await act(async () => pending.resolve({ ok: true, payload: { keys: [] } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(99); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(2);
});
it("stops complete automatic checks while preserving explicit refresh", async () => {
  vi.useFakeTimers(); const sources = source(); const complete = (value: OnboardingReadings) => value.gateway.status === "loaded" && value.keys.status === "loaded"; await mount(sources, { pollMs: 100, complete });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => latest.refresh()); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
it("changes the automatic interval without replacing pending sources", async () => {
  vi.useFakeTimers(); const pending = deferred(); const sources = source({ loadSecretKeys: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ ok: true, payload: { keys: [] } }) }); await mount(sources, { pollMs: 100 });
  await act(async () => renderer!.update(<Harness sources={sources} pollMs={200} />)); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ ok: true, payload: { keys: [] } })); await act(async () => { await vi.advanceTimersByTimeAsync(199); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(2);
  await act(async () => renderer!.update(<Harness sources={sources} pollMs={0} />)); expect(vi.getTimerCount()).toBe(0);
});
it("pauses hidden checks and coalesces unfinished visible resume", async () => {
  vi.useFakeTimers(); const listeners = new Set<() => void>(); const doc = { visibilityState: "visible", addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }; vi.stubGlobal("document", doc);
  const pending = deferred(); const sources = source({ loadSecretKeys: vi.fn().mockResolvedValueOnce({ ok: true, payload: { keys: [] } }).mockReturnValueOnce(pending.promise).mockResolvedValue({ ok: true, payload: { keys: [] } }) }); await mount(sources, { pollMs: 100 });
  await act(async () => { doc.visibilityState = "hidden"; listeners.forEach((fn) => fn()); await vi.advanceTimersByTimeAsync(500); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => { doc.visibilityState = "visible"; listeners.forEach((fn) => fn()); listeners.forEach((fn) => fn()); latest.refresh(); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve({ ok: true, payload: { keys: [] } })); expect(vi.getTimerCount()).toBe(1);
  await act(async () => renderer!.unmount()); renderer = undefined; expect(listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
it("does not automatically resume a complete or pollMs zero checklist", async () => {
  vi.useFakeTimers(); const listeners = new Set<() => void>(); const doc = { visibilityState: "hidden", addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }; vi.stubGlobal("document", doc);
  const sources = source(); await mount(sources, { pollMs: 100, complete: () => true }); await act(async () => { doc.visibilityState = "visible"; listeners.forEach((fn) => fn()); }); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
  await act(async () => renderer!.update(<Harness sources={sources} pollMs={0} />)); await act(async () => listeners.forEach((fn) => fn())); expect(sources.loadGatewaySnapshot).toHaveBeenCalledTimes(1);
});
