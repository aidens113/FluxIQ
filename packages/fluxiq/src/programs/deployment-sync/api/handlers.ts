import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { DEPLOYMENT_SYNC_ENDPOINTS, type DeploymentSyncRequest } from "./contracts";
import type { DeploymentSyncService } from "../runtime/service";

export function registerDeploymentSyncApi(registry: GlobalProgramApiRegistry, service: DeploymentSyncService): void {
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.snapshot,
    handler: () => ({ ok: true, payload: service.snapshot() })
  });
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.sync,
    handler: async (request) => {
      const payload = request.payload as DeploymentSyncRequest | undefined;
      if (!payload?.targetId) return { ok: false, error: "targetId is required" };
      return { ok: true, payload: await service.sync(payload.targetId) };
    }
  });
}
