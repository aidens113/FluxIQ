import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../core";
import { ProgramJsonStore, programDataFile } from "../../_shared/storage";
import type { ProductionRun, ProductionRunExecution, ProductionRunnerSnapshot, ProductionRunTargetType, ProductionTarget } from "../types";

export type ProductionRunDispatcher = {
  execute(run: ProductionRun): Promise<JsonObject | void> | JsonObject | void;
  stop?(run: ProductionRun): Promise<void> | void;
};

type ProductionRunnerState = {
  targets: ProductionTarget[];
  runs: ProductionRun[];
};

export class ProductionRunnerService {
  private readonly targets = new Map<string, ProductionTarget>();
  private readonly runs = new Map<string, ProductionRun>();
  private readonly store?: ProgramJsonStore<ProductionRunnerState>;
  private loaded = false;

  constructor(private readonly dispatcher: ProductionRunDispatcher = defaultDispatcher(), options: { dataDir?: string } = {}) {
    if (options.dataDir) {
      this.store = new ProgramJsonStore(programDataFile(options.dataDir, "production-runner", "state.json"), () => ({ targets: [], runs: [] }));
    }
  }

  async registerTarget(target: ProductionTarget): Promise<ProductionTarget> {
    await this.load();
    this.targets.set(targetKey(target.type, target.id, target.domainId), target);
    await this.persist();
    return target;
  }

  async startRun(params: {
    name: string;
    domainId?: string | null;
    targetType?: ProductionRunTargetType;
    targetId?: string;
    loopsTotal?: number;
    waitMs?: number;
    initialDelayMs?: number;
    metadata?: JsonObject;
    nowMs?: number;
  }): Promise<ProductionRun> {
    await this.load();
    if (params.targetType && params.targetId) {
      this.requireTarget(params.targetType, params.targetId, params.domainId);
    }
    const nowMs = params.nowMs ?? Date.now();
    const initialDelayMs = Math.max(0, params.initialDelayMs ?? 0);
    const run: ProductionRun = {
      id: randomUUID(),
      name: params.name,
      status: initialDelayMs ? "scheduled" : "running",
      loopsTotal: boundedInt(params.loopsTotal, 1, 1, 100_000),
      loopsCompleted: 0,
      waitMs: Math.max(0, params.waitMs ?? 0),
      nextRunAtMs: initialDelayMs ? nowMs + initialDelayMs : nowMs,
      startedAtMs: nowMs,
      updatedAtMs: nowMs,
      executions: []
    };
    if (params.domainId !== undefined) run.domainId = params.domainId;
    if (params.targetType) run.targetType = params.targetType;
    if (params.targetId) run.targetId = params.targetId;
    if (params.metadata) run.metadata = params.metadata;
    this.runs.set(run.id, run);
    await this.persist();
    if (!initialDelayMs) return this.advanceRun(run.id, nowMs);
    return run;
  }

  async advanceDueRuns(domainId?: string | null, nowMs = Date.now()): Promise<ProductionRun[]> {
    await this.load();
    const domain = domainId?.trim().toLowerCase();
    const due = [...this.runs.values()].filter((run) => {
      const runDomain = run.domainId?.trim().toLowerCase();
      return (!domain || runDomain === domain) && ["running", "scheduled"].includes(run.status) && (run.nextRunAtMs ?? 0) <= nowMs;
    });
    const advanced: ProductionRun[] = [];
    for (const run of due) advanced.push(await this.advanceRun(run.id, nowMs));
    return advanced;
  }

  async advanceRun(runId: string, nowMs = Date.now()): Promise<ProductionRun> {
    await this.load();
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown production run: ${runId}`);
    if (!["running", "scheduled"].includes(run.status)) return run;
    if ((run.nextRunAtMs ?? 0) > nowMs) return run;

    try {
      const result = await this.dispatcher.execute(run);
      const execution: ProductionRunExecution = {
        loop: (run.loopsCompleted ?? 0) + 1,
        atMs: Date.now(),
        ok: true
      };
      if (result) execution.result = result;
      const loopsCompleted = execution.loop;
      const loopsTotal = run.loopsTotal ?? 1;
      const completed = loopsCompleted >= loopsTotal;
      const next: ProductionRun = {
        ...run,
        status: completed ? "completed" : "scheduled",
        loopsCompleted,
        nextRunAtMs: completed ? null : Date.now() + (run.waitMs ?? 0),
        updatedAtMs: Date.now(),
        executions: [...(run.executions ?? []), execution].slice(-100)
      };
      if (completed) next.stoppedAtMs = Date.now();
      else if (run.stoppedAtMs !== undefined) next.stoppedAtMs = run.stoppedAtMs;
      this.runs.set(next.id, next);
      await this.persist();
      return next;
    } catch (error) {
      const execution: ProductionRunExecution = {
        loop: (run.loopsCompleted ?? 0) + 1,
        atMs: Date.now(),
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
      const failed: ProductionRun = {
        ...run,
        status: "failed",
        stoppedAtMs: Date.now(),
        updatedAtMs: Date.now(),
        executions: [...(run.executions ?? []), execution].slice(-100)
      };
      this.runs.set(failed.id, failed);
      await this.persist();
      return failed;
    }
  }

  async stopRun(runId: string, nowMs = Date.now()): Promise<ProductionRun> {
    await this.load();
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Unknown production run: ${runId}`);
    }
    const stopping: ProductionRun = { ...run, status: "stopping", updatedAtMs: nowMs };
    this.runs.set(runId, stopping);
    await this.dispatcher.stop?.(stopping);
    const stopped: ProductionRun = { ...stopping, status: "stopped", stoppedAtMs: nowMs, nextRunAtMs: null };
    this.runs.set(runId, stopped);
    await this.persist();
    return stopped;
  }

  async cancelRun(runId: string, nowMs = Date.now()): Promise<ProductionRun> {
    await this.load();
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown production run: ${runId}`);
    const cancelled: ProductionRun = { ...run, status: "cancelled", stoppedAtMs: nowMs, updatedAtMs: nowMs, nextRunAtMs: null };
    this.runs.set(runId, cancelled);
    await this.persist();
    return cancelled;
  }

  async snapshot(domainId?: string | null): Promise<ProductionRunnerSnapshot> {
    await this.load();
    const domain = domainId?.trim().toLowerCase();
    const runs = [...this.runs.values()].filter((run) => !domain || run.domainId?.trim().toLowerCase() === domain);
    const targets = [...this.targets.values()].filter((target) => !domain || target.domainId?.trim().toLowerCase() === domain || !target.domainId);
    return {
      targets: targets.sort((left, right) => left.name.localeCompare(right.name)),
      runs: runs.sort((left, right) => (right.startedAtMs ?? 0) - (left.startedAtMs ?? 0))
    };
  }

  private requireTarget(type: ProductionRunTargetType, id: string, domainId?: string | null): ProductionTarget {
    const target = this.targets.get(targetKey(type, id, domainId)) ?? this.targets.get(targetKey(type, id, null));
    if (!target) throw new Error(`Unknown production target: ${type}/${id}`);
    return target;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.store) return;
    const state = await this.store.read();
    for (const target of state.targets) this.targets.set(targetKey(target.type, target.id, target.domainId), target);
    for (const run of state.runs) this.runs.set(run.id, run);
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    await this.store.write({
      targets: [...this.targets.values()],
      runs: [...this.runs.values()].sort((left, right) => (right.startedAtMs ?? 0) - (left.startedAtMs ?? 0)).slice(0, 500)
    });
  }
}

function defaultDispatcher(): ProductionRunDispatcher {
  return {
    execute: (run) => ({ message: `Executed ${run.targetType ?? "run"} ${run.targetId ?? run.name}` }),
    stop: () => undefined
  };
}

function targetKey(type: ProductionRunTargetType, id: string, domainId?: string | null): string {
  return `${domainId?.trim().toLowerCase() || "global"}:${type}:${id.trim().toLowerCase()}`;
}

function boundedInt(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  const next = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(next)) return fallback;
  return Math.max(minimum, Math.min(maximum, next));
}
