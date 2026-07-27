import type { JsonObject } from "../../core";

export type ProductionRunStatus = "created" | "starting" | "running" | "stopping" | "stopped" | "failed";

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
  startedAtMs?: number;
  stoppedAtMs?: number;
  metadata?: JsonObject;
};

export type ProductionRunnerSnapshot = {
  runs: ProductionRun[];
};
