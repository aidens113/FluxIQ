import { randomUUID } from "node:crypto";
import type { DeploymentArtifact, DeploymentSyncRun, DeploymentSyncSnapshot, DeploymentTarget } from "../types";

export type DeploymentSyncAdapter = {
  sync(target: DeploymentTarget): Promise<string | void> | string | void;
};

export class DeploymentSyncService {
  private readonly targets = new Map<string, DeploymentTarget>();
  private readonly artifacts = new Map<string, DeploymentArtifact>();
  private readonly runs = new Map<string, DeploymentSyncRun>();

  constructor(private readonly adapter?: DeploymentSyncAdapter) {}

  upsertTarget(target: DeploymentTarget): DeploymentTarget {
    this.targets.set(target.id, target);
    return target;
  }

  upsertArtifact(artifact: DeploymentArtifact): DeploymentArtifact {
    if (!this.targets.has(artifact.targetId)) {
      throw new Error(`Unknown deployment target: ${artifact.targetId}`);
    }
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  async sync(targetId: string, nowMs = Date.now()): Promise<DeploymentSyncRun> {
    const target = this.targets.get(targetId);
    if (!target) {
      throw new Error(`Unknown deployment target: ${targetId}`);
    }
    this.targets.set(targetId, { ...target, status: "syncing" });
    const run: DeploymentSyncRun = {
      id: randomUUID(),
      targetId,
      status: "syncing",
      startedAtMs: nowMs
    };
    this.runs.set(run.id, run);
    try {
      const message = await this.adapter?.sync(target);
      const finishedAtMs = Date.now();
      const finished: DeploymentSyncRun = {
        ...run,
        status: "synced",
        finishedAtMs
      };
      if (message) {
        finished.message = message;
      }
      this.runs.set(finished.id, finished);
      this.targets.set(targetId, { ...target, status: "synced", lastSyncAtMs: finishedAtMs });
      return finished;
    } catch (error) {
      const failed: DeploymentSyncRun = {
        ...run,
        status: "failed",
        finishedAtMs: Date.now(),
        message: error instanceof Error ? error.message : String(error)
      };
      this.runs.set(failed.id, failed);
      this.targets.set(targetId, { ...target, status: "failed" });
      return failed;
    }
  }

  snapshot(): DeploymentSyncSnapshot {
    return {
      targets: [...this.targets.values()].sort((left, right) => left.name.localeCompare(right.name)),
      artifacts: [...this.artifacts.values()].sort((left, right) => left.id.localeCompare(right.id)),
      runs: [...this.runs.values()].sort((left, right) => right.startedAtMs - left.startedAtMs)
    };
  }
}
