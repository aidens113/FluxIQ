import type { JsonObject } from "../../../core";
import type { ProductionRun, ProductionRunnerSnapshot, ProductionRunTargetType, ProductionTarget } from "../types";

export const PRODUCTION_RUNNER_ENDPOINTS = {
  snapshot: "snapshot",
  registerTarget: "register-target",
  start: "start",
  advance: "advance",
  stop: "stop",
  cancel: "cancel"
} as const;

export type StartProductionRunRequest = {
  name: string;
  domainId?: string | null;
  targetType?: ProductionRunTargetType;
  targetId?: string;
  loopsTotal?: number;
  waitMs?: number;
  initialDelayMs?: number;
  metadata?: JsonObject;
};

export type RegisterProductionTargetRequest = ProductionTarget;

export type StopProductionRunRequest = {
  runId: string;
};

export type AdvanceProductionRunRequest = {
  runId?: string;
  domainId?: string | null;
};

export type ProductionRunResponse = ProductionRun;

export type ProductionRunnerSnapshotResponse = ProductionRunnerSnapshot;
