import type { DeploymentSyncRun, DeploymentSyncSnapshot } from "../types";

export const DEPLOYMENT_SYNC_ENDPOINTS = {
  snapshot: "snapshot",
  sync: "sync"
} as const;

export type DeploymentSyncRequest = {
  targetId: string;
};

export type DeploymentSyncResponse = DeploymentSyncRun;

export type DeploymentSyncSnapshotResponse = DeploymentSyncSnapshot;
