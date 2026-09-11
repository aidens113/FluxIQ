// Reading, writing and deleting a single project artifact.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../contracts.ts";
import type { AutomationStudioProjectArtifactKind } from "../../model/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerArtifactEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectArtifact,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; kind?: unknown; artifactId?: unknown } : {};
      return { ok: true, payload: { artifact: await service.getProjectArtifact(String(payload.projectId ?? ""), String(payload.kind ?? "") as AutomationStudioProjectArtifactKind, String(payload.artifactId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectArtifact,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; kind?: unknown; artifact?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      const projectId = String(payload.projectId ?? ""); const kind = String(payload.kind ?? "") as AutomationStudioProjectArtifactKind;
      const deprecation = kind !== "config" ? await service.legacyEndpointDiagnostic(projectId) : undefined;
      if (deprecation?.code === "legacy.write_locked") return { ok: false, error: deprecation.message, payload: { diagnostic: deprecation } };
      return { ok: true, payload: { artifact: await service.saveProjectArtifact({ projectId, kind, artifact: payload.artifact }), ...(deprecation ? { diagnostic: deprecation } : {}) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectArtifact,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; kind?: unknown; artifactId?: unknown; deleteOwnedArtifacts?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      const projectId = String(payload.projectId ?? ""); const kind = String(payload.kind ?? "") as AutomationStudioProjectArtifactKind;
      const deprecation = kind !== "config" ? await service.legacyEndpointDiagnostic(projectId) : undefined;
      if (deprecation?.code === "legacy.write_locked") return { ok: false, error: deprecation.message, payload: { diagnostic: deprecation } };
      return {
        ok: true,
        payload: { ...(await service.deleteProjectArtifact({
          projectId,
          kind,
          artifactId: String(payload.artifactId ?? ""),
          deleteOwnedArtifacts: payload.deleteOwnedArtifacts === true
        })), ...(deprecation ? { diagnostic: deprecation } : {}) }
      };
    }
  });
}
