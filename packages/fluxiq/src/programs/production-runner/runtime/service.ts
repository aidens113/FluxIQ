import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../core";
import type { ProductionRun, ProductionRunnerSnapshot, ProductionRunTargetType } from "../types";

export type ProductionRunDispatcher = {
  start(run: ProductionRun): Promise<void> | void;
  stop(run: ProductionRun): Promise<void> | void;
};

export class ProductionRunnerService {
  private readonly runs = new Map<string, ProductionRun>();

  constructor(private readonly dispatcher?: ProductionRunDispatcher) {}

  async startRun(params: {
    name: string;
    domainId?: string | null;
    targetType?: ProductionRunTargetType;
    targetId?: string;
    metadata?: JsonObject;
    nowMs?: number;
  }): Promise<ProductionRun> {
    const run: ProductionRun = {
      id: randomUUID(),
      name: params.name,
      status: "starting",
      startedAtMs: params.nowMs ?? Date.now()
    };
    if (params.domainId !== undefined) run.domainId = params.domainId;
    if (params.targetType) run.targetType = params.targetType;
    if (params.targetId) run.targetId = params.targetId;
    if (params.metadata) run.metadata = params.metadata;
    this.runs.set(run.id, run);
    try {
      await this.dispatcher?.start(run);
      const running: ProductionRun = { ...run, status: "running" };
      this.runs.set(run.id, running);
      return running;
    } catch (error) {
      const failed: ProductionRun = {
        ...run,
        status: "failed",
        stoppedAtMs: Date.now(),
        metadata: { ...(run.metadata ?? {}), error: error instanceof Error ? error.message : String(error) }
      };
      this.runs.set(run.id, failed);
      return failed;
    }
  }

  async stopRun(runId: string, nowMs = Date.now()): Promise<ProductionRun> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Unknown production run: ${runId}`);
    }
    const stopping: ProductionRun = { ...run, status: "stopping" };
    this.runs.set(runId, stopping);
    await this.dispatcher?.stop(stopping);
    const stopped: ProductionRun = { ...stopping, status: "stopped", stoppedAtMs: nowMs };
    this.runs.set(runId, stopped);
    return stopped;
  }

  snapshot(domainId?: string | null): ProductionRunnerSnapshot {
    const domain = domainId?.trim().toLowerCase();
    const runs = [...this.runs.values()].filter((run) => !domain || run.domainId === domain);
    return {
      runs: runs.sort((left, right) => (right.startedAtMs ?? 0) - (left.startedAtMs ?? 0))
    };
  }
}
