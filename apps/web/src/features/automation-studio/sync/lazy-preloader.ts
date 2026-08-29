"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  automationStudioLazyPreloadPlan,
  type AutomationStudioLazyPreloadPlan,
  type AutomationStudioLazyPreloadPlanInput,
  type AutomationStudioLazyPreloadTask
} from "../data-request-policy";
import type { ApiResponse, JsonObject } from "../../programs/program-api";

type AutomationStudioPreloadApi = {
  post<T = unknown>(endpoint: string, payload: JsonObject, options?: { signal?: AbortSignal }): Promise<ApiResponse<T>>;
};

export type AutomationStudioLazyPreloadRunnerOptions = {
  maxTaskCount?: number;
  maxConcurrency?: 1 | 2;
  scheduler?: AutomationStudioPreloadScheduler;
  onMetric?: (metric: AutomationStudioPreloadMetric) => void;
  now?: () => number;
};

export type AutomationStudioPreloadMetric = {
  phase: "queued" | "task-started" | "task-finished" | "cancelled" | "drained";
  projectId: string;
  generation: number;
  endpoint?: string;
  taskId?: string;
  queuedTasks?: number;
  completedTasks?: number;
  aborted?: boolean;
  ok?: boolean;
  elapsedMs?: number;
};

export type AutomationStudioPreloadScheduler = (callback: () => void, timeoutMs: number) => () => void;

type ActivePreloadRun = {
  generation: number;
  plan: AutomationStudioLazyPreloadPlan;
  tasks: AutomationStudioLazyPreloadTask[];
  controller: AbortController;
  cancelScheduled: (() => void) | null;
  cursor: number;
  inFlight: number;
  completed: number;
  cancelled: boolean;
};

const DEFAULT_MAX_TASK_COUNT = 24;

export class AutomationStudioLazyPreloadRunner {
  private active: ActivePreloadRun | null = null;
  private generation = 0;

  constructor(
    private readonly api: AutomationStudioPreloadApi,
    private readonly options: AutomationStudioLazyPreloadRunnerOptions = {}
  ) {}

  start(input: AutomationStudioLazyPreloadPlanInput): void {
    this.cancel();
    const plan = automationStudioLazyPreloadPlan(input);
    const maxTaskCount = Math.max(0, Math.min(this.options.maxTaskCount ?? DEFAULT_MAX_TASK_COUNT, DEFAULT_MAX_TASK_COUNT));
    const tasks = plan.tasks.slice(0, maxTaskCount);
    const generation = ++this.generation;
    if (!tasks.length) return;

    const active: ActivePreloadRun = {
      generation,
      plan,
      tasks,
      controller: new AbortController(),
      cancelScheduled: null,
      cursor: 0,
      inFlight: 0,
      completed: 0,
      cancelled: false
    };
    this.active = active;
    this.emit({ phase: "queued", projectId: plan.projectId, generation, queuedTasks: tasks.length, completedTasks: 0 });
    this.schedule(active);
  }

  cancel(): void {
    const active = this.active;
    if (!active) return;
    active.cancelled = true;
    active.cancelScheduled?.();
    active.cancelScheduled = null;
    active.controller.abort();
    this.active = null;
    this.emit({
      phase: "cancelled",
      projectId: active.plan.projectId,
      generation: active.generation,
      queuedTasks: active.tasks.length,
      completedTasks: active.completed,
      aborted: true
    });
  }

  private schedule(active: ActivePreloadRun): void {
    if (active.cancelled || active.controller.signal.aborted) return;
    active.cancelScheduled?.();
    active.cancelScheduled = (this.options.scheduler ?? scheduleAutomationStudioPreloadWork)(() => this.pump(active), active.plan.idleTimeoutMs);
  }

  private pump(active: ActivePreloadRun): void {
    if (this.active !== active || active.cancelled || active.controller.signal.aborted) return;
    active.cancelScheduled = null;
    const startedAt = this.now();
    const maxConcurrency = Math.max(1, Math.min(this.options.maxConcurrency ?? active.plan.maxConcurrency, active.plan.maxConcurrency, 2));
    let started = false;

    while (active.cursor < active.tasks.length && active.inFlight < maxConcurrency && this.now() - startedAt <= active.plan.sliceBudgetMs) {
      const task = active.tasks[active.cursor++];
      if (!task) break;
      started = true;
      active.inFlight += 1;
      void this.runTask(active, task);
    }

    if (!started && active.cursor < active.tasks.length) this.schedule(active);
    else if (active.cursor >= active.tasks.length && active.inFlight === 0) this.drain(active);
  }

  private async runTask(active: ActivePreloadRun, task: AutomationStudioLazyPreloadTask): Promise<void> {
    const startedAt = this.now();
    this.emit({ phase: "task-started", projectId: active.plan.projectId, generation: active.generation, endpoint: task.request.endpoint, taskId: task.id });
    let ok = false;
    let aborted = false;
    try {
      const result = await this.api.post(task.request.endpoint, task.request.payload, { signal: active.controller.signal });
      ok = result.ok === true;
      aborted = result.aborted === true || active.controller.signal.aborted;
    } catch (error) {
      aborted = active.controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    } finally {
      active.inFlight = Math.max(0, active.inFlight - 1);
      active.completed += 1;
      this.emit({
        phase: "task-finished",
        projectId: active.plan.projectId,
        generation: active.generation,
        endpoint: task.request.endpoint,
        taskId: task.id,
        queuedTasks: active.tasks.length,
        completedTasks: active.completed,
        aborted,
        ok,
        elapsedMs: this.now() - startedAt
      });
      if (this.active !== active || active.cancelled || active.controller.signal.aborted) return;
      if (active.cursor < active.tasks.length) this.schedule(active);
      else if (active.inFlight === 0) this.drain(active);
    }
  }

  private drain(active: ActivePreloadRun): void {
    if (this.active !== active) return;
    this.active = null;
    this.emit({
      phase: "drained",
      projectId: active.plan.projectId,
      generation: active.generation,
      queuedTasks: active.tasks.length,
      completedTasks: active.completed
    });
  }

  private emit(metric: AutomationStudioPreloadMetric): void {
    this.options.onMetric?.(metric);
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<AutomationStudioPreloadMetric>("automation-studio:preload-metric", { detail: metric }));
  }

  private now(): number {
    return this.options.now?.() ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
  }
}

export type AutomationStudioLazyPreloaderInput = Omit<AutomationStudioLazyPreloadPlanInput, "projectId"> & {
  projectId?: string | null;
};

export function useAutomationStudioLazyPreloader(
  api: AutomationStudioPreloadApi,
  input: AutomationStudioLazyPreloaderInput,
  options: AutomationStudioLazyPreloadRunnerOptions = {}
): void {
  const runner = useMemo(() => new AutomationStudioLazyPreloadRunner(api, options), [api, options.maxTaskCount, options.maxConcurrency, options.scheduler, options.onMetric, options.now]);
  const signature = automationStudioLazyPreloadInputSignature(input);
  const latestInput = useRef(input);
  latestInput.current = input;

  useEffect(() => {
    const projectId = input.projectId?.trim();
    if (!projectId) {
      runner.cancel();
      return () => runner.cancel();
    }
    runner.start({ ...latestInput.current, projectId });
    return () => runner.cancel();
  }, [runner, signature]);
}

export function automationStudioLazyPreloadInputSignature(input: AutomationStudioLazyPreloaderInput): string {
  return stablePreloadStringify({
    projectId: input.projectId ?? null,
    activeFlowId: input.activeFlowId ?? null,
    activeSubflowId: input.activeSubflowId ?? null,
    activeRunId: input.activeRunId ?? null,
    activeViewId: input.activeViewId ?? null,
    openViewIds: [...new Set(input.openViewIds ?? [])].sort(),
    graphViewportBounds: input.graphViewportBounds ?? null,
    maxTier: input.maxTier ?? null
  });
}

export function scheduleAutomationStudioPreloadWork(callback: () => void, timeoutMs: number): () => void {
  if (typeof window !== "undefined") {
    const idleWindow = window as Window & {
      requestIdleCallback?: (handler: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => callback(), { timeout: timeoutMs });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
  }
  const handle = setTimeout(callback, Math.min(Math.max(timeoutMs, 1), 250));
  return () => clearTimeout(handle);
}

function stablePreloadStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stablePreloadStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stablePreloadStringify(record[key])}`).join(",")}}`;
}
