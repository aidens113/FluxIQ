import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { BackgroundTasksLive } from "../background-tasks";
const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../../program-api", () => ({ useProgramApi: () => fixture.api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let visibility: EventTarget & { visibilityState: string };
let tasks: any[], runs: any[];
const task = (id: string) => ({ id, name: id, queue: "queue", enabled: true, intervalMs: 60_000, nextRunAtMs: Date.now() + 60_000 });
const run = (id: string, status = "running") => ({ id, taskId: "Alpha", status, queuedAtMs: Date.now(), startedAtMs: Date.now() });
const page = () => ({ runs, total: runs.length, limit: 50, offset: 0 });
const text = () => JSON.stringify(renderer!.toJSON());
const label = (item: any): string => item.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer!.root.findAllByType("button").find((item) => label(item) === name)!;
const named = (type: "button" | "select" | "input", name: string) => renderer!.root.findAllByType(type).find((item) => item.props["aria-label"] === name)!;
const mount = async () => { await act(async () => { renderer = create(<BackgroundTasksLive />); }); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function deferred() { let resolve!: (value: any) => void; return { promise: new Promise<any>((done) => { resolve = done; }), resolve: (value: any) => resolve(value) }; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  visibility = Object.assign(new EventTarget(), { visibilityState: "visible" }); vi.stubGlobal("document", visibility);
  tasks = [task("Alpha"), task("Beta")]; runs = [run("first")];
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload: { tasks, scheduler: { running: true } } })), post: vi.fn(async (endpoint: string) => ({ ok: true, payload: endpoint === "detail" ? page() : run("accepted") })) };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
it("polls only snapshot and selected bounded history once per completion period", async () => {
  await mount(); await advance(20_000);
  expect(fixture.api.get).toHaveBeenCalledTimes(3); expect(fixture.api.post).toHaveBeenCalledTimes(3);
  for (const call of fixture.api.post.mock.calls as any[]) expect(call).toEqual(["detail", { taskId: "Alpha", limit: 50, offset: 0, status: "all" }, { signal: expect.any(AbortSignal) }]);
});
it("performs no detail read with no visible task and renews the server schedule", async () => {
  tasks = []; await mount(); await advance(10_000); expect(fixture.api.post).not.toHaveBeenCalled();
  tasks = [task("Alpha")]; await advance(10_000); expect(fixture.api.post).toHaveBeenCalledTimes(1);
  tasks = [{ ...tasks[0], nextRunAtMs: Date.now() + 300_000 }]; await advance(10_000);
  expect(text()).not.toContain("Due now"); expect(text()).toContain("sampled");
});
it("renews same-id selected detail and retains stale history through a failed refresh", async () => {
  await mount(); act(() => renderer!.root.findAllByType("button").find((item) => item.props.className === "run-row-button")!.props.onClick());
  runs = [{ ...run("first", "succeeded"), finishedAtMs: Date.now() + 10_000 }]; await advance(10_000);
  expect(text()).toContain("Run Detail"); expect(text()).toContain("succeeded");
  fixture.api.post.mockResolvedValue({ ok: false, payload: null, error: "private response" } as any); await advance(10_000);
  expect(text()).toContain("Run Detail"); expect(text()).toContain("stale"); expect(text()).not.toContain("private response");
  fixture.api.post.mockResolvedValue({ ok: true, payload: { ...page(), runs: [], total: 0 } }); await advance(20_000);
  expect(text()).not.toContain("Run Detail");
});
it("masks old history on filter changes and ignores late response and captured pagination", async () => {
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: { ...page(), total: 100 } }); await mount();
  const oldNext = named("button", "Next run page").props.onClick;
  const pending = deferred(); fixture.api.post.mockReturnValueOnce(pending.promise as any);
  await act(async () => { named("select", "Filter runs by status").props.onChange({ target: { value: "failed" } }); });
  expect(renderer!.root.findByType("tbody").findAllByType("tr")).toHaveLength(0); act(() => oldNext());
  expect(fixture.api.post.mock.calls.at(-1)?.[0]).toBe("detail");
  await act(async () => { named("select", "Filter runs by status").props.onChange({ target: { value: "succeeded" } }); });
  await act(async () => { pending.resolve({ ok: true, payload: { ...page(), runs: [run("old filter")] } }); });
  expect(text()).not.toContain("old filter");
  expect((fixture.api.post.mock.calls.at(-1) as any[])[1].offset).toBe(0);
});
it("clamps a deeply out-of-range page directly to the final valid page", async () => {
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: { ...page(), total: 500 } }); await mount();
  fixture.api.post.mockResolvedValueOnce({ ok: true, payload: { runs: [], total: 1, limit: 50, offset: 450 } });
  await act(async () => named("button", "Next run page").props.onClick());
  expect((fixture.api.post.mock.calls.at(-1) as any[])[1].offset).toBe(0);
});
it("pauses snapshot/history reads hidden and resumes each once", async () => {
  await mount(); act(() => { visibility.visibilityState = "hidden"; visibility.dispatchEvent(new Event("visibilitychange")); });
  await advance(60_000); expect(fixture.api.get).toHaveBeenCalledTimes(1); expect(fixture.api.post).toHaveBeenCalledTimes(1);
  await act(async () => { visibility.visibilityState = "visible"; visibility.dispatchEvent(new Event("visibilitychange")); });
  expect(fixture.api.get).toHaveBeenCalledTimes(2); expect(fixture.api.post).toHaveBeenCalledTimes(2);
});
it("locks synchronous duplicate writes and ignores old-owner handlers and completions", async () => {
  await mount(); const oldApi = fixture.api; const oldRun = button("Run Now").props.onClick;
  const pending = deferred(); oldApi.post.mockReturnValueOnce(pending.promise as any);
  act(() => { void oldRun(); void oldRun(); }); expect(oldApi.post).toHaveBeenCalledTimes(2);
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload: { tasks: [task("New owner")], scheduler: { running: true } } })), post: vi.fn(async () => ({ ok: true, payload: { runs: [], total: 0, limit: 50, offset: 0 } })) };
  await act(async () => renderer!.update(<BackgroundTasksLive />));
  await act(async () => { void oldRun(); pending.resolve({ ok: true, payload: run("old mutation") }); });
  expect(oldApi.post).toHaveBeenCalledTimes(2); expect(text()).not.toContain("old mutation"); expect(text()).not.toContain("Task run accepted");
});
it("ignores old task history and captured task actions after search changes the visible task", async () => {
  await mount(); const oldRun = button("Run Now").props.onClick;
  const pending = deferred(); fixture.api.post.mockReturnValueOnce(pending.promise);
  await advance(10_000);
  await act(async () => named("input", "Search tasks").props.onChange({ target: { value: "Beta" } }));
  expect(renderer!.root.findByType("table").props["aria-label"]).toBe("Beta run history");
  await act(async () => { void oldRun(); pending.resolve({ ok: true, payload: { ...page(), runs: [run("old Alpha history")] } }); });
  expect(text()).not.toContain("old Alpha history");
  expect(fixture.api.post.mock.calls.every((call) => call[0] === "detail")).toBe(true);
  expect((fixture.api.post.mock.calls.at(-1) as any[])[1].taskId).toBe("Beta");
});
it("permission denial stops both automatic readers and manual retries recover independently", async () => {
  await mount(); fixture.api.get.mockResolvedValue({ ok: false, status: 403 }); fixture.api.post.mockResolvedValue({ ok: false, status: 403 });
  await advance(10_000); await advance(100_000);
  expect(fixture.api.get).toHaveBeenCalledTimes(2); expect(fixture.api.post).toHaveBeenCalledTimes(2); expect(text()).toContain("permission");
  fixture.api.get.mockResolvedValue({ ok: true, payload: { tasks, scheduler: { running: true } } });
  fixture.api.post.mockResolvedValue({ ok: true, payload: page() });
  await act(async () => named("button", "Refresh tasks").props.onClick());
  const historyFeedback = renderer!.root.findAllByType("section").find((item) => item.props["aria-label"] === "Run history freshness")!;
  await act(async () => historyFeedback.findByType("button").props.onClick());
  expect(fixture.api.get).toHaveBeenCalledTimes(3); expect(fixture.api.post).toHaveBeenCalledTimes(3); expect(text()).not.toContain("permission");
});
it("releases a rejected write lock without converting the failed action into automatic retries", async () => {
  await mount(); fixture.api.post.mockRejectedValueOnce(new Error("Synthetic rejection"));
  await act(async () => button("Run Now").props.onClick()); expect(button("Run Now").props.disabled).toBe(false);
  await advance(10_000); expect(fixture.api.post.mock.calls.filter((call) => call[0] === "run")).toHaveLength(1);
});
