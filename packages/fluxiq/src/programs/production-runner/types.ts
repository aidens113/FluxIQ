import type { JsonObject } from "../../core/index.ts";

export type ProductionRunStatus = "created" | "starting" | "running" | "scheduled" | "stopping" | "stopped" | "completed" | "failed" | "cancelled";

export type ProductionRunTargetType = "flow" | "task" | "routine" | "interface";

export type ProductionRun = {
  id: string;
  name: string;
  domainId?: string | null;
  targetType?: ProductionRunTargetType;
  targetId?: string;
  flowId?: string;
  taskId?: string;
  status: ProductionRunStatus;
  loopsTotal?: number;
  loopsCompleted?: number;
  waitMs?: number;
  nextRunAtMs?: number | null;
  startedAtMs?: number;
  stoppedAtMs?: number;
  updatedAtMs?: number;
  executions?: ProductionRunExecution[];
  metadata?: JsonObject;
};

export type ProductionRunExecution = {
  loop: number;
  atMs: number;
  ok: boolean;
  result?: JsonObject;
  error?: string;
};

export type ProductionTarget = {
  id: string;
  name: string;
  type: ProductionRunTargetType;
  domainId?: string | null;
  description?: string;
  metadata?: JsonObject;
};

export type ProductionRunnerSnapshot = {
  targets: ProductionTarget[];
  runs: ProductionRun[];
};
