import React, { useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProductionRunnerLive } from "../production-runner";
const fixture = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, notify: vi.fn() }));
vi.mock("../../program-api", () => ({ useProgramApi: () => fixture.api }));
vi.mock("../../components/feedback/notifyGlobalAlert", () => ({ notifyGlobalAlert: fixture.notify }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let visibility: EventTarget & { visibilityState: string };
let payload: any;
const target = (id = "one", amount = 2) => ({ id, type: "task", name: id, metadata: { parameterSchema: { properties: { amount: { type: "number", default: amount } } } } });
const run = (status = "running") => ({ id: "first", name: "first", targetType: "task", status, loopsCompleted: status === "completed" ? 2 : 0, loopsTotal: 2 });
const text = () => JSON.stringify(renderer!.toJSON());
const label = (item: any): string => item.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => renderer!.root.findAllByType("button").find((item) => label(item) === name)!;
const amount = () => renderer!.root.findAllByType("input").find((item) => item.props.inputMode === "decimal")!;
const mount = async () => { await act(async () => { renderer = create(<ProductionRunnerLive />); }); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function deferred() { let resolve!: (value: any) => void; return { promise: new Promise<any>((done) => { resolve = done; }), resolve: (value: any) => resolve(value) }; }
function CommitProbe({ probe }: { probe?: () => void }) { useLayoutEffect(() => { probe?.(); }, [probe]); return <ProductionRunnerLive />; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  visibility = Object.assign(new EventTarget(), { visibilityState: "visible" }); vi.stubGlobal("document", visibility);
  payload = { targets: [target()], runs: [run()] };
  fixture.notify.mockReset();
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload })), post: vi.fn(async () => ({ ok: true })) };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
it("observes external progress while preserving edited drafts and performing no mutation", async () => {
  await mount(); act(() => { amount().props.onChange({ target: { value: "9" } }); button("Details").props.onClick(); });
  payload = { ...payload, runs: [{ ...run("completed"), executions: [{ loop: 2, atMs: Date.now(), ok: true, result: "external completion" }] }] };
  await advance(10_000); expect(text()).toContain("Selected Run"); expect(text()).toContain("completed"); expect(amount().props.value).toBe("9");
  act(() => button("Logs").props.onClick()); expect(text()).toContain("external completion"); expect(fixture.api.post).not.toHaveBeenCalled();
  payload = { ...payload, runs: [] }; await advance(10_000); expect(text()).not.toContain("Selected Run"); expect(amount().props.value).toBe("9");
});
it("retains drafts on snapshot failure, backs off and recovers without raw error content", async () => {
  await mount(); act(() => amount().props.onChange({ target: { value: "8" } }));
  fixture.api.get.mockResolvedValue({ ok: false, status: 500, error: "private error" }); await advance(10_000);
  expect(amount().props.value).toBe("8"); expect(text()).toContain("stale"); expect(text()).not.toContain("private error");
  await advance(19_999); expect(fixture.api.get).toHaveBeenCalledTimes(2);
  fixture.api.get.mockResolvedValue({ ok: true, payload }); await advance(1); expect(fixture.api.get).toHaveBeenCalledTimes(3); expect(amount().props.value).toBe("8");
});
it("pauses hidden reads and resumes exactly once", async () => {
  await mount(); act(() => { visibility.visibilityState = "hidden"; visibility.dispatchEvent(new Event("visibilitychange")); });
  await advance(100_000); expect(fixture.api.get).toHaveBeenCalledTimes(1); expect(text()).toContain("paused");
  await act(async () => { visibility.visibilityState = "visible"; visibility.dispatchEvent(new Event("visibilitychange")); });
  expect(fixture.api.get).toHaveBeenCalledTimes(2); expect(fixture.api.post).not.toHaveBeenCalled();
});
it("masks owner drafts and ignores late reads plus captured old mutations", async () => {
  await mount(); const oldApi = fixture.api; const oldLaunch = button("Run task").props.onClick; const oldAdvance = button("Advance").props.onClick; const oldCancel = button("Cancel").props.onClick;
  act(() => amount().props.onChange({ target: { value: "99" } }));
  const pending = deferred(); oldApi.get.mockReturnValueOnce(pending.promise); await act(async () => button("Refresh").props.onClick());
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload: { targets: [target("replacement", 6)], runs: [run()] } })), post: vi.fn(async () => ({ ok: true })) };
  await act(async () => renderer!.update(<ProductionRunnerLive />)); expect(amount().props.value).toBe("6");
  await act(async () => { void oldLaunch(); void oldAdvance(); void oldCancel(); pending.resolve({ ok: true, payload: { targets: [target("old", 3)], runs: [] } }); });
  expect(oldApi.post).not.toHaveBeenCalled(); expect(fixture.api.post).not.toHaveBeenCalled(); expect(amount().props.value).toBe("6"); expect(text()).not.toContain('"old"');
});
it("rejects captured launch and run handlers after their target/run is removed", async () => {
  await mount(); const launch = button("Run task").props.onClick; const advanceRun = button("Advance").props.onClick;
  payload = { targets: [target("new", 4)], runs: [] }; await advance(10_000);
  await act(async () => { void launch(); void advanceRun(); }); expect(fixture.api.post).not.toHaveBeenCalled(); expect(amount().props.value).toBe("4");
});
it("old-owner completion cannot release a new owner's same-id run lock or publish its error", async () => {
  await mount(); const oldPending = deferred(); fixture.api.post.mockReturnValueOnce(oldPending.promise);
  act(() => button("Advance").props.onClick());
  const newPending = deferred(); fixture.api = { get: vi.fn(async () => ({ ok: true, payload })), post: vi.fn(() => newPending.promise) };
  await act(async () => renderer!.update(<ProductionRunnerLive />)); act(() => button("Advance").props.onClick());
  expect(button("Advance").props.disabled).toBe(true);
  await act(async () => { oldPending.resolve({ ok: false, error: "old owner refusal" }); });
  expect(button("Advance").props.disabled).toBe(true); expect(text()).not.toContain("old owner refusal");
  act(() => button("Cancel").props.onClick()); expect(fixture.api.post).toHaveBeenCalledTimes(1);
  await act(async () => { newPending.resolve({ ok: true }); }); expect(button("Advance").props.disabled).toBe(false);
});
it("coalesces a pre-write read without replaying a successful launch and confirms later normally", async () => {
  await mount(); const pending = deferred(); fixture.api.get.mockReturnValueOnce(pending.promise);
  await act(async () => button("Refresh").props.onClick());
  act(() => { void button("Run task").props.onClick(); }); await act(async () => { await Promise.resolve(); });
  expect(fixture.api.post).toHaveBeenCalledTimes(1); expect(fixture.api.get).toHaveBeenCalledTimes(2);
  expect(fixture.notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Snapshot confirmation is separate") }));
  await act(async () => { pending.resolve({ ok: true, payload }); }); await advance(10_000);
  expect(fixture.api.get).toHaveBeenCalledTimes(3); expect(fixture.api.post).toHaveBeenCalledTimes(1);
});
it("guards captured old mutations and refresh during owner replacement before passive cleanup", async () => {
  await act(async () => { renderer = create(<CommitProbe />); });
  const oldApi = fixture.api; const oldLaunch = button("Run task").props.onClick; const oldRefresh = button("Refresh").props.onClick;
  fixture.api = { get: vi.fn(async () => ({ ok: true, payload })), post: vi.fn(async () => ({ ok: true })) };
  await act(async () => renderer!.update(<CommitProbe probe={() => { void oldLaunch(); void oldRefresh(); }} />));
  expect(oldApi.get).toHaveBeenCalledTimes(1); expect(oldApi.post).not.toHaveBeenCalled(); expect(fixture.api.get).toHaveBeenCalledTimes(1);
});
for (const failure of ["refused", "rejected"] as const) it(`does not put a pending ${failure} launch's error into another target's panel`, async () => {
  payload.targets.push(failure === "refused" ? target("two", 4) : { ...target("one", 4), type: "routine" }); await mount();
  const pending = deferred(); let reject!: (reason: Error) => void;
  fixture.api.post.mockReturnValueOnce(failure === "refused" ? pending.promise : new Promise((_resolve, fail) => { reject = fail; }));
  act(() => { void button("Run task").props.onClick(); });
  if (failure === "refused") {
    const targetSelect = renderer!.root.findAllByType("select").find((item) => item.props.value === "one")!;
    act(() => { targetSelect.props.onChange({ target: { value: "two" } }); });
  } else act(() => button("routine").props.onClick());
  act(() => { amount().props.onChange({ target: { value: "19" } }); });
  await act(async () => {
    if (failure === "refused") pending.resolve({ ok: false, error: "Target A refused" });
    else reject(new Error("Synthetic A rejection"));
  });
  expect(text()).not.toContain("Workload not started"); expect(text()).not.toContain("Target A refused");
  const launchLabel = failure === "refused" ? "Run task" : "Run routine";
  expect(amount().props.value).toBe("19"); expect(button(launchLabel).props.disabled).toBe(false);
  await act(async () => button(launchLabel).props.onClick());
  expect(fixture.api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ targetId: failure === "refused" ? "two" : "one", targetType: failure === "refused" ? "task" : "routine", metadata: { amount: 19 } }));
});
