import { describe, expect, it, vi } from "vitest";
import {
  scheduleAutomationStudioAfterPaintWork,
  scheduleAutomationStudioBackgroundWork,
  type AutomationStudioBackgroundScheduler
} from "./background-work";

function manualScheduler() {
  const callbacks: Array<() => void> = [];
  const scheduler: AutomationStudioBackgroundScheduler = (callback) => {
    let cancelled = false;
    callbacks.push(() => {
      if (!cancelled) callback();
    });
    return () => { cancelled = true; };
  };
  return { callbacks, scheduler };
}

describe("scheduleAutomationStudioBackgroundWork", () => {
  it("does not start default background work until a browser paint has completed", () => {
    const originalWindow = globalThis.window;
    const frames: FrameRequestCallback[] = [];
    const cancelled = new Set<number>();
    const fakeWindow = {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
      cancelAnimationFrame: vi.fn((handle: number) => cancelled.add(handle))
    } as unknown as Window & typeof globalThis;
    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    try {
      const task = vi.fn();
      scheduleAutomationStudioAfterPaintWork(task);
      expect(task).not.toHaveBeenCalled();

      frames[0]?.(1);
      expect(task).not.toHaveBeenCalled();

      frames[1]?.(2);
      expect(task).toHaveBeenCalledTimes(1);
      expect(cancelled.size).toBe(0);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });

  it("yields repeatedly while input is pending and reports queue diagnostics", async () => {
    const manual = manualScheduler();
    const task = vi.fn();
    const phases: string[] = [];
    let inputPending = true;
    scheduleAutomationStudioBackgroundWork(task, {
      scheduler: manual.scheduler,
      isInputPending: () => inputPending,
      onMetric: (metric) => phases.push(metric.phase)
    });

    manual.callbacks.shift()?.();
    await Promise.resolve();
    expect(task).not.toHaveBeenCalled();
    expect(phases).toEqual(["queued", "yielded"]);

    inputPending = false;
    manual.callbacks.shift()?.();
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
    expect(phases).toEqual(["queued", "yielded", "started", "finished"]);
  });

  it("cancels scheduled work through AbortSignal before it can run", async () => {
    const manual = manualScheduler();
    const controller = new AbortController();
    const task = vi.fn();
    const phases: string[] = [];
    scheduleAutomationStudioBackgroundWork(task, {
      signal: controller.signal,
      scheduler: manual.scheduler,
      onMetric: (metric) => phases.push(metric.phase)
    });

    controller.abort();
    manual.callbacks.shift()?.();
    await Promise.resolve();

    expect(task).not.toHaveBeenCalled();
    expect(phases).toEqual(["queued", "cancelled"]);
  });

  it("keeps preload queued until active work has completed", async () => {
    const manual = manualScheduler();
    const activeTask = vi.fn();
    const preloadTask = vi.fn();
    const preloadPhases: string[] = [];

    scheduleAutomationStudioBackgroundWork(preloadTask, {
      scheduler: manual.scheduler,
      priority: "preload",
      onMetric: (metric) => preloadPhases.push(metric.phase)
    });
    scheduleAutomationStudioBackgroundWork(activeTask, {
      scheduler: manual.scheduler,
      priority: "active"
    });

    manual.callbacks.shift()?.();
    await Promise.resolve();
    expect(preloadTask).not.toHaveBeenCalled();
    expect(preloadPhases).toEqual(["queued", "yielded"]);

    manual.callbacks.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(activeTask).toHaveBeenCalledTimes(1);

    manual.callbacks.shift()?.();
    await Promise.resolve();
    expect(preloadTask).toHaveBeenCalledTimes(1);
  });
});
