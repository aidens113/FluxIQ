import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductionRunnerLive } from "../production-runner";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../program-api", () => ({ useProgramApi: () => api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const target = (type: string, id: string, value = 2) => ({
  type, id, name: `${type} ${id}`, metadata: { parameterSchema: { properties: { amount: { type: "number", default: value } } } }
});
const run = (id: string) => ({ id, name: id, targetType: "task", status: "running", loopsCompleted: 0, loopsTotal: 2 });
let payload: any;
let renderer: ReactTestRenderer;
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
async function mount() { await act(async () => { renderer = create(<ProductionRunnerLive />); }); }
const buttons = () => renderer.root.findAllByType("button");
const label = (node: any): string => node.children.map((child: any) => typeof child === "string" ? child : label(child)).join("");
const button = (name: string) => buttons().find((node) => label(node) === name)!;
const text = () => JSON.stringify(renderer.toJSON());
const amount = () => renderer.root.findAllByType("input").find((node) => node.props.inputMode === "decimal")!;

beforeEach(() => {
  payload = { targets: [target("task", "one"), target("routine", "one", 7)], runs: [run("first"), run("second")] };
  api.get.mockReset().mockImplementation(async () => ({ ok: true, payload }));
  api.post.mockReset().mockResolvedValue({ ok: true, payload: {} });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

describe("Production Runner operations", () => {
  it("locks launch immediately across duplicate activation and preserves edited parameters", async () => {
    const pending = deferred<any>();
    api.post.mockReturnValue(pending.promise);
    await mount();
    act(() => {
      const launch = button("Run task").props.onClick;
      void launch(); void launch();
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(button("Run task").props.disabled).toBe(true);
    act(() => amount().props.onChange({ target: { value: "9" } }));
    await act(async () => pending.resolve({ ok: true }));
    expect(amount().props.value).toBe("9");
    expect(button("Run task").props.disabled).toBe(false);
  });

  it("locks each workload without blocking another and exposes refused actions for retry", async () => {
    const pending = deferred<any>();
    api.post.mockImplementation((_action, body) => body.runId === "first" ? pending.promise : Promise.resolve({ ok: true }));
    await mount();
    act(() => {
      const advance = buttons().filter((node) => label(node) === "Advance")[0]!.props.onClick;
      void advance(); void advance();
      void buttons().filter((node) => label(node) === "Cancel")[0]!.props.onClick();
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(buttons().filter((node) => label(node) === "Advance")[1]!.props.disabled).not.toBe(true);
    await act(async () => buttons().filter((node) => label(node) === "Advance")[1]!.props.onClick());
    expect(api.post).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve({ ok: false, error: "Permission denied" }));
    expect(text()).toContain("Permission denied");
    expect(buttons().filter((node) => label(node) === "Advance")[0]!.props.disabled).toBe(false);
  });

  it("shows a failed launch and allows retry without losing the draft", async () => {
    api.post.mockResolvedValueOnce({ ok: false, error: "Launch refused" });
    await mount();
    act(() => amount().props.onChange({ target: { value: "8" } }));
    await act(async () => button("Run task").props.onClick());
    expect(text()).toContain("Launch refused");
    expect(amount().props.value).toBe("8");
    await act(async () => button("Run task").props.onClick());
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("uses the new type's defaults even when it shares an id and field name", async () => {
    await mount();
    act(() => amount().props.onChange({ target: { value: "99" } }));
    act(() => button("routine").props.onClick());
    expect(amount().props.value).toBe("7");
    await act(async () => button("Run routine").props.onClick());
    expect(api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ targetType: "routine", metadata: { amount: 7 } }));
  });

  it("releases launch and workload locks after an unexpected transport rejection", async () => {
    api.post.mockRejectedValue(new Error("Synthetic transport failure"));
    await mount();
    await act(async () => button("Run task").props.onClick());
    expect(text()).toContain("The workload could not be started");
    expect(button("Run task").props.disabled).toBe(false);
    await act(async () => button("Advance").props.onClick());
    expect(text()).toContain("The workload could not be updated");
    expect(button("Advance").props.disabled).toBe(false);
    api.post.mockResolvedValue({ ok: true });
    await act(async () => button("Advance").props.onClick());
    expect(text()).not.toContain("The workload could not be updated");
  });

  it("keeps the newest snapshot when an older refresh finishes later", async () => {
    await mount();
    const earlier = deferred<any>();
    const newer = deferred<any>();
    api.get.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(newer.promise);
    act(() => { void button("Refresh").props.onClick(); void button("Refresh").props.onClick(); });
    await act(async () => newer.resolve({ ok: true, payload: { ...payload, targets: [target("task", "newest", 6)] } }));
    await act(async () => earlier.resolve({ ok: true, payload: { ...payload, targets: [target("task", "older", 3)] } }));
    expect(amount().props.value).toBe("6");
    await act(async () => button("Run task").props.onClick());
    expect(api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ targetId: "newest" }));
  });

  it("clears a removed target's draft before launching the fallback target", async () => {
    await mount();
    act(() => amount().props.onChange({ target: { value: "99" } }));
    payload = { ...payload, targets: [target("task", "replacement", 4)] };
    await act(async () => button("Refresh").props.onClick());
    expect(amount().props.value).toBe("4");
    await act(async () => button("Run task").props.onClick());
    expect(api.post).toHaveBeenLastCalledWith("start", expect.objectContaining({ targetId: "replacement", metadata: { amount: 4 } }));
  });
});
