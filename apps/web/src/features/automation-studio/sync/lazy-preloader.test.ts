import { describe, expect, it, vi } from "vitest";
import {
  AutomationStudioLazyPreloadRunner,
  automationStudioLazyPreloadInputSignature,
  scheduleAutomationStudioPreloadWork,
  type AutomationStudioPreloadScheduler
} from "./lazy-preloader";

function createManualScheduler() {
  const callbacks: Array<() => void> = [];
  const scheduler: AutomationStudioPreloadScheduler = (callback) => {
    let cancelled = false;
    callbacks.push(() => {
      if (!cancelled) callback();
    });
    return () => { cancelled = true; };
  };
  return {
    scheduler,
    pendingCount: () => callbacks.length,
    flushOne: () => callbacks.shift()?.(),
    flushAll: () => {
      while (callbacks.length) callbacks.shift()?.();
    }
  };
}

async function flushAsyncTasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AutomationStudioLazyPreloadRunner", () => {
  it("defers all API work until idle scheduling runs", async () => {
    const manual = createManualScheduler();
    const api = { post: vi.fn(async (_endpoint: string, _payload: Record<string, unknown>, _options?: { signal?: AbortSignal }) => ({ ok: true })) };
    const runner = new AutomationStudioLazyPreloadRunner(api, { scheduler: manual.scheduler, maxTaskCount: 2 });

    runner.start({ projectId: "project-a", activeFlowId: "flow-a", openViewIds: ["adaptations"] });

    expect(api.post).not.toHaveBeenCalled();
    expect(manual.pendingCount()).toBe(1);
    manual.flushOne();
    await flushAsyncTasks();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0]?.[0]).toBe("get-project-hierarchy");
  });

  it("caps task count and runs preloads sequentially by default", async () => {
    const manual = createManualScheduler();
    const api = { post: vi.fn(async (_endpoint: string, _payload: Record<string, unknown>, _options?: { signal?: AbortSignal }) => ({ ok: true })) };
    const metrics: string[] = [];
    const runner = new AutomationStudioLazyPreloadRunner(api, {
      scheduler: manual.scheduler,
      maxTaskCount: 3,
      onMetric: (metric) => metrics.push(metric.phase)
    });

    runner.start({ projectId: "project-a", activeFlowId: "flow-a", activeRunId: "run-a", openViewIds: ["adaptations", "flow-settings"] });

    for (let index = 0; index < 10; index += 1) {
      manual.flushOne();
      await flushAsyncTasks();
    }

    expect(api.post).toHaveBeenCalledTimes(3);
    expect(metrics).toContain("queued");
    expect(metrics).toContain("drained");
  });

  it("aborts active work and cancels queued idle callbacks when a new plan starts", async () => {
    const manual = createManualScheduler();
    const signals: AbortSignal[] = [];
    const api = {
      post: vi.fn(async (_endpoint: string, _payload: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
        if (options?.signal) signals.push(options.signal);
        return { ok: true };
      })
    };
    const runner = new AutomationStudioLazyPreloadRunner(api, { scheduler: manual.scheduler, maxTaskCount: 4 });

    runner.start({ projectId: "project-a", activeFlowId: "flow-a" });
    manual.flushOne();
    expect(api.post).toHaveBeenCalledTimes(1);

    runner.start({ projectId: "project-b", activeFlowId: "flow-b" });
    expect(signals[0]?.aborted).toBe(true);
    manual.flushAll();
    await flushAsyncTasks();
    expect(api.post.mock.calls.some((call) => call[1]?.projectId === "project-b")).toBe(true);
  });

  it("yields between queued preload tasks so background warming cannot starve UI work", async () => {
    const manual = createManualScheduler();
    const api = { post: vi.fn(async (_endpoint: string, _payload: Record<string, unknown>, _options?: { signal?: AbortSignal }) => ({ ok: true })) };
    const runner = new AutomationStudioLazyPreloadRunner(api, { scheduler: manual.scheduler, maxTaskCount: 4 });

    runner.start({ projectId: "project-a", activeFlowId: "flow-a", activeRunId: "run-a", activeViewId: "runtime-debug", openViewIds: ["adaptations", "flow-settings"] });

    expect(manual.pendingCount()).toBe(1);
    manual.flushOne();
    await flushAsyncTasks();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(manual.pendingCount()).toBe(1);

    manual.flushOne();
    await flushAsyncTasks();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(manual.pendingCount()).toBe(1);
  });

  it("uses a stable signature for equivalent open view sets", () => {
    expect(automationStudioLazyPreloadInputSignature({ projectId: "p", openViewIds: ["runtime-debug", "flow-settings"] }))
      .toBe(automationStudioLazyPreloadInputSignature({ projectId: "p", openViewIds: ["flow-settings", "runtime-debug", "runtime-debug"] }));
  });

  it("falls back to a short setTimeout scheduler when idle callbacks are unavailable", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const cancel = scheduleAutomationStudioPreloadWork(callback, 1_500);
    vi.advanceTimersByTime(249);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    cancel();
    vi.useRealTimers();
  });
});
