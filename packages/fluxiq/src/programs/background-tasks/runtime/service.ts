import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import type { RecordEnvelope, Repository } from "../../database-manager/index.ts";
import type { BackgroundTaskDefinition, BackgroundTaskRun, BackgroundTasksSnapshot } from "../types.ts";

export type BackgroundTaskHandler = (payload?: JsonObject) => Promise<JsonObject | void> | JsonObject | void;

type BackgroundTasksState = {
  tasks: BackgroundTaskDefinition[];
  runs: BackgroundTaskRun[];
  scheduler?: {
    running: boolean;
  };
};

export class BackgroundTasksService {
  private readonly tasks = new Map<string, BackgroundTaskDefinition>();
  private readonly handlers = new Map<string, BackgroundTaskHandler>();
  private readonly runs = new Map<string, BackgroundTaskRun>();
  private readonly repository: Repository | undefined;
  private loaded = false;
  private timer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private persistInFlight: Promise<void> | null = null;
  private readonly pollIntervalMs: number;
  private readonly stateWriteIntervalMs: number;
  private schedulerRunning = true;
  private schedulerStartedAtMs: number | undefined;

  constructor(options: { repository?: Repository; pollIntervalMs?: number; stateWriteIntervalMs?: number } = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.stateWriteIntervalMs = options.stateWriteIntervalMs ?? 10_000;
    this.repository = options.repository;
  }

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

  async setEnabled(taskId: string, enabled: boolean): Promise<BackgroundTaskDefinition> {
    await this.load();
    const task = this.requireTask(taskId);
    const next: BackgroundTaskDefinition = {
      ...task,
      enabled
    };
    if (enabled && task.intervalMs && (!task.nextRunAtMs || task.nextRunAtMs < Date.now())) {
      next.nextRunAtMs = Date.now() + task.intervalMs;
    }
    this.tasks.set(taskId, next);
    this.schedulePersist();
    return next;
  }

  async saveSchedule(params: {
    taskId: string;
    enabled?: boolean;
    intervalMs?: number;
    schedule?: string;
    metadata?: JsonObject;
    nowMs?: number;
  }): Promise<BackgroundTaskDefinition> {
    await this.load();
    const task = this.requireTask(params.taskId);
    const intervalMs = params.intervalMs ?? task.intervalMs;
    const next: BackgroundTaskDefinition = {
      ...task,
      enabled: params.enabled ?? task.enabled,
      nextRunAtMs: intervalMs ? task.nextRunAtMs ?? (params.nowMs ?? Date.now()) + intervalMs : null
    };
    if (intervalMs !== undefined) next.intervalMs = intervalMs;
    if (params.schedule !== undefined) next.schedule = params.schedule;
    if (params.metadata !== undefined) next.metadata = params.metadata;
    this.tasks.set(next.id, next);
    this.schedulePersist();
    return next;
  }

  async run(taskId: string, payload?: JsonObject, nowMs = Date.now()): Promise<BackgroundTaskRun> {
    await this.load();
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
    this.schedulePersist();

    try {
      const result = await this.handlers.get(taskId)?.(payload);
      const finishedAtMs = Date.now();
      const finished: BackgroundTaskRun = {
        ...run,
        status: "succeeded",
        finishedAtMs
      };
      if (result) {
        finished.payload = result;
      }
      this.runs.set(finished.id, finished);
      this.tasks.set(taskId, {
        ...task,
        lastRunAtMs: finishedAtMs,
        nextRunAtMs: task.intervalMs ? finishedAtMs + task.intervalMs : task.nextRunAtMs ?? null
      });
      this.schedulePersist();
      return finished;
    } catch (error) {
      const finishedAtMs = Date.now();
      const failed: BackgroundTaskRun = {
        ...run,
        status: "failed",
        finishedAtMs,
        error: error instanceof Error ? error.message : String(error)
      };
      this.runs.set(failed.id, failed);
      this.tasks.set(taskId, {
        ...task,
        lastRunAtMs: finishedAtMs,
        nextRunAtMs: task.intervalMs ? finishedAtMs + task.intervalMs : task.nextRunAtMs ?? null
      });
      this.schedulePersist();
      return failed;
    }
  }

  async start(): Promise<BackgroundTasksSnapshot> {
    await this.load();
    this.schedulerRunning = true;
    this.startTimer();
    this.schedulePersist();
    return this.snapshot();
  }

  async stop(): Promise<BackgroundTasksSnapshot> {
    await this.load();
    this.schedulerRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.schedulePersist();
    return this.snapshot();
  }

  async runDueTasks(nowMs = Date.now()): Promise<BackgroundTaskRun[]> {
    await this.load();
    if (!this.schedulerRunning) return [];
    const due = [...this.tasks.values()].filter((task) => task.enabled && task.intervalMs && task.nextRunAtMs && task.nextRunAtMs <= nowMs);
    const runs: BackgroundTaskRun[] = [];
    for (const task of due) {
      runs.push(await this.run(task.id, undefined, nowMs));
    }
    return runs;
  }

  async snapshot(): Promise<BackgroundTasksSnapshot> {
    await this.load();
    if (this.schedulerRunning) this.startTimer();
    const scheduler: BackgroundTasksSnapshot["scheduler"] = {
      running: this.schedulerRunning && Boolean(this.timer),
      pollIntervalMs: this.pollIntervalMs
    };
    if (this.schedulerStartedAtMs !== undefined) scheduler.startedAtMs = this.schedulerStartedAtMs;
    return {
      tasks: [...this.tasks.values()].sort((left, right) => left.name.localeCompare(right.name)),
      runs: [...this.runs.values()].sort((left, right) => right.queuedAtMs - left.queuedAtMs),
      scheduler
    };
  }

  async detail(taskId: string, limit = 200): Promise<{ task: BackgroundTaskDefinition; runs: BackgroundTaskRun[] }> {
    await this.load();
    const task = this.requireTask(taskId);
    return {
      task,
      runs: [...this.runs.values()]
        .filter((run) => run.taskId === taskId)
        .sort((left, right) => right.queuedAtMs - left.queuedAtMs)
        .slice(0, Math.max(1, Math.min(1000, limit)))
    };
  }

  private requireTask(taskId: string): BackgroundTaskDefinition {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Unknown background task: ${taskId}`);
    }
    return task;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.repository) return;
    const state = await this.readStoredState();
    const storedTaskIds = new Set(state.tasks.map((task) => task.id));
    const shouldPersistRegisteredTasks = [...this.tasks.keys()].some((taskId) => !storedTaskIds.has(taskId));
    this.schedulerRunning = state.scheduler?.running ?? true;
    for (const task of state.tasks) {
      const registered = this.tasks.get(task.id);
      this.tasks.set(task.id, { ...registered, ...task });
    }
    for (const run of state.runs) this.runs.set(run.id, run);
    if (this.schedulerRunning) this.startTimer();
    if (shouldPersistRegisteredTasks || !state.scheduler) {
      await this.persist();
    }
  }

  async flushPendingWrites(): Promise<void> {
    await this.flushPersist();
  }

  private schedulePersist(): void {
    if (!this.repository) return;
    if (this.stateWriteIntervalMs <= 0) {
      void this.flushPersist();
      return;
    }
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      void this.flushPersist().catch(() => undefined);
    }, this.stateWriteIntervalMs);
    this.persistTimer.unref?.();
  }

  private async persist(): Promise<void> {
    await this.flushPersist();
  }

  private async flushPersist(): Promise<void> {
    if (!this.repository) return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.persistInFlight) {
      await this.persistInFlight;
    }
    const now = Date.now();
    const tasks = [...this.tasks.values()];
    const runs = [...this.runs.values()].sort((left, right) => right.queuedAtMs - left.queuedAtMs).slice(0, 500);
    const schedulerRunning = this.schedulerRunning;
    this.persistInFlight = (async () => {
      await this.repository!.put(record("scheduler", "scheduler", { recordType: "scheduler", running: schedulerRunning }, now));
      for (const task of tasks) {
        await this.repository!.put(record(`task:${task.id}`, "task", { recordType: "task", task: task as unknown as JsonObject }, now));
      }
      for (const run of runs) {
        await this.repository!.put(record(`run:${run.id}`, "run", { recordType: "run", run: run as unknown as JsonObject }, now));
      }
    })().finally(() => {
      this.persistInFlight = null;
    });
    await this.persistInFlight;
  }

  private startTimer(): void {
    if (this.timer) return;
    this.schedulerStartedAtMs = Date.now();
    this.timer = setInterval(() => {
      void this.runDueTasks();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  private async readStoredState(): Promise<BackgroundTasksState> {
    if (!this.repository) return { tasks: [], runs: [], scheduler: { running: true } };
    const records = await this.repository.list({});
    const state: BackgroundTasksState = { tasks: [], runs: [], scheduler: { running: true } };
    for (const item of records) {
      if (item.data.recordType === "scheduler") {
        state.scheduler = { running: item.data.running !== false };
      } else if (item.data.recordType === "task" && item.data.task && typeof item.data.task === "object" && !Array.isArray(item.data.task)) {
        state.tasks.push(item.data.task as unknown as BackgroundTaskDefinition);
      } else if (item.data.recordType === "run" && item.data.run && typeof item.data.run === "object" && !Array.isArray(item.data.run)) {
        state.runs.push(item.data.run as unknown as BackgroundTaskRun);
      }
    }
    return state;
  }
}

function record(id: string, stateKind: string, data: JsonObject, nowMs: number): RecordEnvelope {
  return {
    id,
    kind: "background.tasks",
    scope: {},
    data: {
      stateKind,
      ...data
    },
    createdAtMs: nowMs,
    updatedAtMs: nowMs
  };
}
