import { afterEach, describe, expect, it, vi } from "vitest";
import { runAutomationGraphWorkerTask, runAutomationGraphWorkerTaskInline, scheduleAutomationGraphIdleTask } from "./worker-tasks";

afterEach(() => {
  vi.useRealTimers();
});

describe("automation graph worker tasks", () => {
  it("computes selection bounds and revision signatures off the component path", async () => {
    const bounds = await runAutomationGraphWorkerTask({ kind: "selection-bounds", selectedNodeIds: ["b"], nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }, { id: "b", position: { x: 100, y: 50 }, measured: { width: 300, height: 120 }, data: {} }] as any }, { useWorker: false });
    expect(bounds).toEqual({ kind: "selection-bounds", bounds: { x: 100, y: 50, width: 300, height: 120 } });
    expect(runAutomationGraphWorkerTaskInline({ kind: "revision-signature", flowId: "flow", revision: 4, pendingOperationCount: 2, pendingOperationBytes: 128 })).toEqual({ kind: "revision-signature", signature: "flow:4:2:128" });
  });

  it("serializes and shape-validates graph documents through bounded tasks", async () => {
    const graph = { nodes: [{ id: "a", position: { x: 0, y: 0 }, data: {} }], edges: [{ id: "a.missing", source: "a", target: "missing" }] } as any;
    const serialized = await runAutomationGraphWorkerTask({ kind: "serialize-graph", graph }, { useWorker: false });
    expect(serialized.kind).toBe("serialize-graph");
    if (serialized.kind === "serialize-graph") expect(serialized.bytes).toBeGreaterThan(10);
    expect(runAutomationGraphWorkerTaskInline({ kind: "validate-shape", graph })).toEqual({ kind: "validate-shape", problems: [{ id: "dangling:a.missing", message: "Connection references an unloaded or missing node." }] });
  });

  it("idle-schedules and cancels graph tasks instead of running them in the current interaction", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const cancel = scheduleAutomationGraphIdleTask(callback, { delayMs: 100 });

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    cancel();
    vi.advanceTimersByTime(10);
    expect(callback).not.toHaveBeenCalled();

    scheduleAutomationGraphIdleTask(callback, { delayMs: 25 });
    vi.advanceTimersByTime(25);
    vi.advanceTimersByTime(0);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
