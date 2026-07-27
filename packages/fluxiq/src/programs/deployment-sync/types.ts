import type { JsonObject } from "../../core";

export type DeploymentSyncStatus = "idle" | "syncing" | "synced" | "failed";

export type DeploymentTarget = {
  id: string;
  name: string;
  environment: string;
  status: DeploymentSyncStatus;
  lastSyncAtMs?: number;
  metadata?: JsonObject;
};

export type DeploymentArtifact = {
  id: string;
  targetId: string;
  kind: "config" | "policy" | "program" | "domain" | "data";
  version: string;
  checksum?: string;
  metadata?: JsonObject;
};

export type DeploymentSyncRun = {
  id: string;
  targetId: string;
  status: DeploymentSyncStatus;
  startedAtMs: number;
  finishedAtMs?: number;
  message?: string;
};

export type DeploymentSyncSnapshot = {
  targets: DeploymentTarget[];
  artifacts: DeploymentArtifact[];
  runs: DeploymentSyncRun[];
};
