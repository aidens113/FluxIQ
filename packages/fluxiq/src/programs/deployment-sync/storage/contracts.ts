import type { DeploymentArtifact, DeploymentSyncRun, DeploymentTarget } from "../types.ts";

export type DeploymentSyncStore = {
  listTargets(): Promise<DeploymentTarget[]>;
  saveTarget(target: DeploymentTarget): Promise<DeploymentTarget>;
  listArtifacts(targetId?: string): Promise<DeploymentArtifact[]>;
  saveArtifact(artifact: DeploymentArtifact): Promise<DeploymentArtifact>;
  listRuns(targetId?: string): Promise<DeploymentSyncRun[]>;
  saveRun(run: DeploymentSyncRun): Promise<DeploymentSyncRun>;
};
