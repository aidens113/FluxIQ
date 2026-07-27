import type { JsonObject } from "../../core";

export type ProductionRunStatus = "created" | "starting" | "running" | "stopping" | "stopped" | "failed";

export type ProductionRun = {
  id: string;
  name: string;
  domainId?: string | null;
  flowId?: string;
  taskId?: string;
  status: ProductionRunStatus;
  startedAtMs?: number;
  stoppedAtMs?: number;
  metadata?: JsonObject;
};
