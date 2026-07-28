import type { DeploymentSyncRun, DeploymentSyncSnapshot } from "../types";

export const DEPLOYMENT_SYNC_ENDPOINTS = {
  snapshot: "snapshot",
  upsertTarget: "upsert-target",
  upsertArtifact: "upsert-artifact",
  sync: "sync",
  dryRun: "dry-run",
  rollback: "rollback"
} as const;

export type DeploymentSyncRequest = {
  targetId: string;
  versionSha?: string;
};

export type UpsertDeploymentTargetRequest = import("../types").DeploymentTarget;
export type UpsertDeploymentArtifactRequest = import("../types").DeploymentArtifact;

export type DeploymentSyncResponse = DeploymentSyncRun;

export type DeploymentSyncSnapshotResponse = DeploymentSyncSnapshot;
