import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import {
  DEPLOYMENT_SYNC_ENDPOINTS,
  type DeploymentSyncRequest,
  type UpsertDeploymentArtifactRequest,
  type UpsertDeploymentTargetRequest
} from "./contracts.ts";
import type { DeploymentSyncService } from "../runtime/service.ts";

export function registerDeploymentSyncApi(registry: GlobalProgramApiRegistry, service: DeploymentSyncService): void {
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.snapshot,
    permission: "programs.read",
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.upsertTarget,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as UpsertDeploymentTargetRequest | undefined;
      if (!payload?.id || !payload.name) return { ok: false, error: "id and name are required" };
      return { ok: true, payload: await service.upsertTarget(payload) };
    }
  });
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.upsertArtifact,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as UpsertDeploymentArtifactRequest | undefined;
      if (!payload?.id || !payload.targetId || !payload.kind || !payload.version) return { ok: false, error: "id, targetId, kind, and version are required" };
      return { ok: true, payload: await service.upsertArtifact(payload) };
    }
  });
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.dryRun,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as DeploymentSyncRequest | undefined;
      if (!payload?.targetId) return { ok: false, error: "targetId is required" };
      return { ok: true, payload: await service.dryRun(payload.targetId) };
    }
  });
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.sync,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as DeploymentSyncRequest | undefined;
      if (!payload?.targetId) return { ok: false, error: "targetId is required" };
      return { ok: true, payload: await service.sync(payload.targetId) };
    }
  });
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.rollback,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload as DeploymentSyncRequest | undefined;
      if (!payload?.targetId) return { ok: false, error: "targetId is required" };
      return { ok: true, payload: await service.rollback(payload.targetId, payload.versionSha) };
    }
  });
}
