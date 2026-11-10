import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { deploymentSyncSnapshotInput } from "@fluxiq/contracts/program-api-inputs";
import { endpointResource } from "../../_shared/iam/index.ts";
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
    classification: "read",
    action: "ops:Snapshot",
    accessLevel: "Read",
    resource: endpointResource.program(),
    assistant: { input: deploymentSyncSnapshotInput, summary: "Lists the places the engine deploys to and what each holds.", phrases: ["show deployment targets"] },
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "deployment-sync",
    endpoint: DEPLOYMENT_SYNC_ENDPOINTS.upsertTarget,
    permission: "runtime.control",
    classification: "authoring",
    action: "ops:UpsertTarget",
    accessLevel: "Write",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator adds or changes a deployment target; a person does not ask for that in words." },
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
    classification: "authoring",
    action: "ops:UpsertArtifact",
    accessLevel: "Write",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator records a deployable build; a person does not ask for that in words." },
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
    classification: "read",
    action: "ops:DryRun",
    accessLevel: "Read",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator previews a deployment; a person does not ask for that in words." },
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
    classification: "destructive",
    action: "ops:Sync",
    accessLevel: "Write",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator deploys to a target, which is an operator step and not something a person asks for in words." },
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
    classification: "destructive",
    action: "ops:Rollback",
    accessLevel: "Write",
    resource: endpointResource.program(),
    assistant: { hidden: "An operator rolls a deployment back, which is an operator step and not something a person asks for in words." },
    handler: async (request) => {
      const payload = request.payload as DeploymentSyncRequest | undefined;
      if (!payload?.targetId) return { ok: false, error: "targetId is required" };
      return { ok: true, payload: await service.rollback(payload.targetId, payload.versionSha) };
    }
  });
}
