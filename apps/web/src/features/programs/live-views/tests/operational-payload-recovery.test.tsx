import { Component, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComputeControlLive } from "../compute-control";
import { BackgroundTasksLive } from "../background-tasks";
import { ProductionRunnerLive } from "../production-runner";
const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, notify: vi.fn() }));
vi.mock("../../program-api", () => ({ useProgramApi: () => fixture.api }));
vi.mock("../../components/feedback/notifyGlobalAlert", () => ({ notifyGlobalAlert: fixture.notify }));
class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <p>Unexpected render failure</p> : this.props.children; } }
let view: ReactTestRenderer | undefined;
const compute = () => ({ nodes: [{ id: "node", label: "Node", status: "online", domainIds: [], capabilities: [], lastHeartbeatMs: 1000 }], commands: [], leases: [] });
const task = { id: "task", name: "Task", enabled: true, queue: "queue" };
const background = () => ({ tasks: [task], scheduler: { running: true } });
const run = { id: "run", taskId: "task", status: "succeeded", queuedAtMs: 0 };
const history = () => ({ runs: [run], total: 1, limit: 50, offset: 0 });
const production = () => ({ targets: [{ id: "target", name: "Target", type: "task" }], runs: [{ id: "work", name: "Work", status: "running", targetType: "task" }] });
const text = () => JSON.stringify(view!.toJSON());
const label = (node: { children: unknown[] }): string => node.children.map(child => typeof child === "string" ? child : child && typeof child === "object" && "children" in child ? label(child as { children: unknown[] }) : "").join("");
const button = (name: string) => view!.root.findAllByType("button").find(node => label(node) === name)!;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" })); vi.useFakeTimers(); vi.setSystemTime(1000); fixture.api = { get: vi.fn(), post: vi.fn().mockResolvedValue({ ok: true, payload: history() }) }; fixture.notify.mockReset(); });
afterEach(async () => { if (view) await act(async () => view!.unmount()); view = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount(panel: "compute" | "background" | "production", payload: unknown) { fixture.api.get.mockResolvedValue({ ok: true, payload }); await act(async () => { view = create(<RenderBoundary>{panel === "compute" ? <ComputeControlLive /> : panel === "background" ? <BackgroundTasksLive /> : <ProductionRunnerLive />}</RenderBoundary>); }); }

it.each([
  ["compute", { ...compute(), nodes: [null] }], ["compute", { ...compute(), nodes: [{ ...compute().nodes[0], capabilities: {} }] }],
  ["compute", { ...compute(), commands: [{ id: "cmd", targetComputeId: "node", kind: 7, createdAtMs: 0 }] }], ["compute", { ...compute(), leases: [null] }],
  ["background", { ...background(), tasks: [null] }], ["background", { ...background(), scheduler: {} }],
  ["production", { ...production(), targets: [null] }], ["production", { ...production(), runs: [null] }],
  ["production", { ...production(), runs: [{ ...production().runs[0], executions: [null] }] }]
] as const)("malformed %s success becomes unavailable rather than crashing: %j", async (panel, payload) => {
  await mount(panel, payload); expect(text()).toContain("unavailable"); expect(text()).not.toContain("Unexpected render failure"); expect(fixture.api.post).not.toHaveBeenCalled();
});
it.each(["compute", "background", "production"] as const)("malformed %s refresh retains confirmed content and direct Retry recovers", async panel => {
  const valid = panel === "compute" ? compute() : panel === "background" ? background() : production(); await mount(panel, valid);
  fixture.api.get.mockResolvedValue({ ok: true, payload: panel === "compute" ? { ...compute(), nodes: [null] } : panel === "background" ? { ...background(), tasks: [null] } : { ...production(), runs: [null] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); }); expect(text()).not.toContain("Unexpected render failure"); expect(text()).toContain(panel === "compute" ? "Node" : panel === "background" ? "Task" : "Target");
  expect(text()).toContain("Operational refresh failed");
  const beforeRetry = fixture.api.get.mock.calls.length;
  fixture.api.get.mockResolvedValue({ ok: true, payload: valid });
  await act(async () => button("Retry operational refresh").props.onClick());
  expect(fixture.api.get.mock.calls).toHaveLength(beforeRetry + 1);
  expect(text()).not.toContain("Operational refresh failed");
  expect(text()).not.toContain("Displayed snapshot is stale");
  expect(text()).not.toContain("Unexpected render failure");
});
it("malformed Background history retains its confirmed run page", async () => {
  await mount("background", background()); fixture.api.post.mockResolvedValue({ ok: true, payload: { ...history(), runs: [null] } }); await act(async () => { await vi.advanceTimersByTimeAsync(10_000); }); expect(text()).toContain("Succeeded"); expect(text()).not.toContain("Unexpected render failure");
});
it("accepted malformed Background run detail never crashes or replays the task", async () => {
  await mount("background", background()); fixture.api.post.mockImplementation(async endpoint => endpoint === "run" ? { ok: true, payload: { id: 17 } } : { ok: true, payload: history() });
  await act(async () => button("Run Now").props.onClick()); expect(text()).not.toContain("Unexpected render failure"); expect(fixture.notify.mock.calls.some(call => String(call[0]?.message).includes("accepted") && String(call[0]?.message).includes("detail"))).toBe(true); expect(fixture.api.post.mock.calls.filter(call => call[0] === "run")).toHaveLength(1);
});
