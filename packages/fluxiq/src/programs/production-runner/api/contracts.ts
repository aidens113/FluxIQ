import type { JsonObject } from "../../../core";
import type { ProductionRun, ProductionRunnerSnapshot, ProductionRunTargetType } from "../types";

export const PRODUCTION_RUNNER_ENDPOINTS = {
  snapshot: "snapshot",
  start: "start",
  stop: "stop"
} as const;

export type StartProductionRunRequest = {
  name: string;
  domainId?: string | null;
  targetType?: ProductionRunTargetType;
  targetId?: string;
  metadata?: JsonObject;
};

export type StopProductionRunRequest = {
  runId: string;
};

export type ProductionRunResponse = ProductionRun;

export type ProductionRunnerSnapshotResponse = ProductionRunnerSnapshot;
