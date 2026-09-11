// What happens to a flow after it is authored: compilation, conversion,
// deletion, publication, node catalogues, migration, and legacy retirement.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type FlowIdProjectRequest, type FlowProjectRequest, type PublishFlowRequest } from "../contracts.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerFlowLifecycleEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.compileFlowSource,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as { projectId?: unknown; flowId?: unknown; moduleId?: unknown; sourceText?: unknown; authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.compileAndSaveFlowSource({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), moduleId: String(payload.moduleId ?? ""), sourceText: String(payload.sourceText ?? "") }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.convertFlowToVisual,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as { projectId?: unknown; flowId?: unknown; authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { flow: await service.convertFlowToVisual({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteFlow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<FlowIdProjectRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteFlow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? "") }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.publishFlow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<PublishFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { flow: await service.publishFlow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), version: String(payload.version ?? ""), ...(typeof payload.flowDigest === "string" ? { flowDigest: payload.flowDigest } : {}), ...(typeof payload.publishedBy === "string" ? { publishedBy: payload.publishedBy } : {}), ...(typeof payload.changelog === "string" ? { changelog: payload.changelog } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowPublications,
    permission: "programs.read",
    handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; flowId?: unknown } : {}; return { ok: true, payload: { publications: await service.listFlowPublications(String(payload.projectId ?? ""), typeof payload.flowId === "string" ? payload.flowId : undefined) } }; }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deprecateFlowPublication,
    permission: "flows.write",
    handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; flowId?: unknown; version?: unknown; reason?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {}; await authorizeProgramPin(identityAccess, payload); return { ok: true, payload: { publication: await service.deprecateFlowPublication({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), version: String(payload.version ?? ""), ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}) }) } }; }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.inspectFlowDependencies,
    permission: "programs.read",
    handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; flowId?: unknown } : {}; return { ok: true, payload: await service.inspectFlowDependencies(String(payload.projectId ?? ""), String(payload.flowId ?? "")) }; }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listPublishedFlowNodes,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowProjectRequest> : {};
      return { ok: true, payload: { nodes: await service.listPublishedFlowNodes(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listNativeNodeDefinitions,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return { ok: true, payload: { nodes: await service.listNativeNodeDefinitions(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.inspectFlowMigration,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowProjectRequest> : {};
      return { ok: true, payload: { inspection: await service.inspectFlowMigration(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.migrateFlows,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<FlowProjectRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { migration: await service.migrateFlows(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.inspectLegacyRetirement, permission: "programs.read", handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {}; return { ok: true, payload: { report: await service.inspectLegacyRetirement(String(payload.projectId ?? "")) } }; } });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.recordLegacyRetirementEvidence, permission: "flows.write", handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {}; await authorizeProgramPin(identityAccess, payload); return { ok: true, payload: { report: await service.recordLegacyRetirementEvidence({ projectId: String(payload.projectId ?? ""), ...(Array.isArray(payload.importerEvidence) ? { importerEvidence: payload.importerEvidence as any } : {}), ...(Array.isArray(payload.intentionallyDeferred) ? { intentionallyDeferred: payload.intentionallyDeferred as any } : {}), ...(typeof payload.importerCoverageAcknowledged === "boolean" ? { importerCoverageAcknowledged: payload.importerCoverageAcknowledged } : {}) }) } }; } });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportLegacyProject, permission: "programs.read", handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {}; return { ok: true, payload: { backup: await service.exportLegacyProject(String(payload.projectId ?? "")) } }; } });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.verifyLegacyBackup, permission: "flows.write", handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {}; await authorizeProgramPin(identityAccess, payload); return { ok: true, payload: { report: await service.verifyLegacyBackup(String(payload.projectId ?? ""), String(payload.backupId ?? "")) } }; } });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.sealLegacyWrites, permission: "flows.write", handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {}; await authorizeProgramPin(identityAccess, payload); return { ok: true, payload: { report: await service.sealLegacyWrites({ projectId: String(payload.projectId ?? ""), expectedSchemaVersion: String(payload.expectedSchemaVersion ?? "") }) } }; } });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listLegacyRetirementAudit, permission: "programs.read", handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {}; return { ok: true, payload: { events: await service.listLegacyRetirementAudit(String(payload.projectId ?? "")) } }; } });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.planFlowMigrationRollback, permission: "programs.read", handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {}; return { ok: true, payload: { plan: await service.planFlowMigrationRollback(String(payload.projectId ?? ""), String(payload.migrationId ?? "")) } }; } });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.rollbackFlowMigration, permission: "flows.write", handler: async (request) => { const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {}; await authorizeProgramPin(identityAccess, payload); return { ok: true, payload: { plan: await service.rollbackFlowMigration(String(payload.projectId ?? ""), String(payload.migrationId ?? "")) } }; } });
}
