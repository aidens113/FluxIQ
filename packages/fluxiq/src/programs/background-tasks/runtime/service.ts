import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../core";
import type { BackgroundTaskDefinition, BackgroundTaskRun, BackgroundTasksSnapshot } from "../types";

export type BackgroundTaskHandler = (payload?: JsonObject) => Promise<JsonObject | void> | JsonObject | void;

export class BackgroundTasksService {
  private readonly tasks = new Map<string, BackgroundTaskDefinition>();
  private readonly handlers = new Map<string, BackgroundTaskHandler>();
  private readonly runs = new Map<string, BackgroundTaskRun>();

  register(task: BackgroundTaskDefinition, handler?: BackgroundTaskHandler): this {
    if (this.tasks.has(task.id)) {
      throw new Error(`Duplicate background task: ${task.id}`);
    }
    this.tasks.set(task.id, task);
    if (handler) {
      this.handlers.set(task.id, handler);
    }
    return this;
  }

  setEnabled(taskId: string, enabled: boolean): BackgroundTaskDefinition {
    const task = this.requireTask(taskId);
    const next = { ...task, enabled };
    this.tasks.set(taskId, next);
    return next;
  }

  async run(taskId: string, payload?: JsonObject, nowMs = Date.now()): Promise<BackgroundTaskRun> {
    const task = this.requireTask(taskId);
    if (!task.enabled) {
      throw new Error(`Background task is disabled: ${taskId}`);
    }
    const run: BackgroundTaskRun = {
      id: randomUUID(),
      taskId,
      status: "running",
      queuedAtMs: nowMs,
      startedAtMs: nowMs
    };
    if (payload) {
      run.payload = payload;
    }
    this.runs.set(run.id, run);

    try {
      const result = await this.handlers.get(taskId)?.(payload);
      const finished: BackgroundTaskRun = {
        ...run,
        status: "succeeded",
        finishedAtMs: Date.now()
      };
      if (result) {
        finished.payload = result;
      }
      this.runs.set(finished.id, finished);
      return finished;
    } catch (error) {
      const failed: BackgroundTaskRun = {
        ...run,
        status: "failed",
        finishedAtMs: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      };
      this.runs.set(failed.id, failed);
      return failed;
    }
  }

  snapshot(): BackgroundTasksSnapshot {
    return {
      tasks: [...this.tasks.values()].sort((left, right) => left.name.localeCompare(right.name)),
      runs: [...this.runs.values()].sort((left, right) => right.queuedAtMs - left.queuedAtMs)
    };
  }

  private requireTask(taskId: string): BackgroundTaskDefinition {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Unknown background task: ${taskId}`);
    }
    return task;
  }
}
