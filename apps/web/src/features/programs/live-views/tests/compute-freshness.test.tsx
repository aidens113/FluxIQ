import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ComputeControlLive } from "../compute-control";
const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../program-api", () => ({ useProgramApi: () => api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let visibility: EventTarget & { visibilityState: string };
const snapshot = () => ({ nodes: [{ id: "a", label: "Alpha", status: "online", lastHeartbeatMs: Date.now(), capabilities: [], domainIds: [] }], commands: [], leases: [] });
const text = () => JSON.stringify(renderer!.toJSON());
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  visibility = Object.assign(new EventTarget(), { visibilityState: "visible" }); vi.stubGlobal("document", visibility);
  api.get.mockReset().mockImplementation(async () => ({ ok: true, status: 200, payload: snapshot() }));
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
it("reads renewed server heartbeats beyond the offline threshold without changing health thresholds", async () => {
  await act(async () => { renderer = create(<ComputeControlLive />); });
  await advance(310_000);
  expect(api.get).toHaveBeenCalledTimes(32);
  const badges = renderer!.root.findAll((item) => item.type === "span" && String(item.props.className).includes("status-badge"));
  expect(badges.map((item) => item.props.title)).toEqual(["healthy", "healthy"]);
  expect(api.get.mock.calls.every((call) => call[0] === "snapshot" && call[1].signal instanceof AbortSignal)).toBe(true);
});
it("retains selected sampled state on failure and confirms new data after manual retry", async () => {
  await act(async () => { renderer = create(<ComputeControlLive />); });
  api.get.mockResolvedValue({ ok: false, status: 500, payload: null, error: "secret response" });
  await advance(10_000); expect(text()).toContain("Alpha"); expect(text()).toContain("sampled"); expect(text()).not.toContain("secret response");
  api.get.mockImplementation(async () => ({ ok: true, status: 200, payload: { ...snapshot(), nodes: [] } }));
  await act(async () => { await renderer!.root.findAllByType("button").find((item) => item.props["aria-label"] === "Refresh compute nodes")!.props.onClick(); });
  expect(text()).toContain("No node selected"); expect(text()).not.toContain("Alpha");
});
it("shows paused sampled health and refreshes once when visibility resumes", async () => {
  await act(async () => { renderer = create(<ComputeControlLive />); });
  act(() => { visibility.visibilityState = "hidden"; visibility.dispatchEvent(new Event("visibilitychange")); });
  await advance(310_000); expect(api.get).toHaveBeenCalledTimes(1); expect(text()).toContain("paused"); expect(text()).toContain("sampled");
  await act(async () => { visibility.visibilityState = "visible"; visibility.dispatchEvent(new Event("visibilitychange")); });
  expect(api.get).toHaveBeenCalledTimes(2); expect(text()).toContain("healthy");
});
it("preserves filtered selection/activity through failed polling and reconciles a later confirmed removal", async () => {
  const alpha = snapshot().nodes[0]!;
  const beta = { ...alpha, id: "b", label: "Beta" };
  api.get.mockResolvedValue({ ok: true, payload: { nodes: [alpha, beta], commands: [{ id: "command", targetComputeId: "b", kind: "beta activity", status: "queued", createdAtMs: Date.now() }], leases: [] } });
  await act(async () => { renderer = create(<ComputeControlLive />); });
  act(() => { renderer!.root.findByType("input").props.onChange({ target: { value: "Beta" } }); });
  expect(renderer!.root.findByType("h2").children).toEqual(["Beta"]);
  api.get.mockResolvedValue({ ok: false, status: 500 }); await advance(10_000);
  expect(renderer!.root.findByType("h2").children).toEqual(["Beta"]); expect(text()).toContain("beta activity");
  api.get.mockResolvedValue({ ok: true, payload: { nodes: [alpha], commands: [], leases: [] } });
  await act(async () => { await renderer!.root.findAllByType("button").find((item) => item.props["aria-label"] === "Refresh compute nodes")!.props.onClick(); });
  expect(text()).toContain("No node selected"); expect(text()).not.toContain("beta activity");
});
