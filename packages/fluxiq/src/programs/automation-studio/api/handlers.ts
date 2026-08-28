import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { authorizeProgramPin } from "../../_shared/authorization.ts";
import { fluxiqPerformanceMetricsSnapshot } from "../../_shared/performance-metrics.ts";
import {
  AUTOMATION_STUDIO_ENDPOINTS,
  type AppendRecordingMarkerRequest,
  type AppendRecordingNoteRequest,
  type AppendRecordingDomainEventRequest,
  type AppendRecordingEntryRequest,
  type ApprovePolicyProposalRequest,
  type CaptureClientSnapshotRequest,
  type CreateFlowSubflowRequest,
  type DeleteFlowMapRouteGroupRequest,
  type DeleteFlowMapRouteRequest,
  type CreateFlowRequest,
  type CreateRecordingRequest,
  type DeleteRecordingRequest,
  type DeleteRecordingsRequest,
  type DuplicateFlowSubflowRequest,
  type FlowAdaptationRequest,
  type FlowChangeProposalRequest,
  type FlowExpansionSummaryRequest,
  type FlowInstructionRequest,
  type FlowMetadataPageRequest,
  type FlowIdProjectRequest,
  type FlowInstructionSetRequest,
  type FlowProjectRequest,
  type FlowRunDetailRequest,
  type FlowRunActionPageRequest,
  type FlowRunEventPageRequest,
  type FlowSubflowRequest,
  type ExecuteClientActionRequest,
  type FinalizeRecordingRequest,
  type AutomationStudioProjectChangeFeedRequest,
  type AutomationStudioGetProjectUiCacheRequest,
  type AutomationStudioSaveProjectUiCacheRequest,
  type AutomationStudioDeleteProjectUiCacheRequest,
  type AutomationStudioListProjectUiCacheStatsRequest,
  type GetRecordingEntryStateRequest,
  type GetProposalRequest,
  type GetStateSnapshotRequest,
  type ProcessFinalizedRecordingRequest,
  type InspectStateDiffRequest,
  type LearnTaskModelRequest,
  type MineRecordingEvidenceRequest,
  type MutateFlowMapRouteRequest,
  type NormalizeRecordingRequest,
  type NormalizedTimelineProjectRequest,
  type ProposePolicyFromModelRequest,
  type PublishFlowRequest,
  type RecordingProjectRequest,
  type RecordingIdProjectRequest,
  type ReplayPolicyAgainstRecordingRequest,
  type RepairRecordingStateIndexRequest,
  type RevokeClientTrustRequest,
  type RenameFlowSubflowRequest,
  type ReviewFlowAdaptationRequest,
  type SaveFlowMapFallbackRequest,
  type SaveFlowMapRouteGroupRequest,
  type SaveFlowMapRouteRequest,
  type SaveFlowInstructionRequest,
  type StartClientRecordingRequest,
  type StopClientRecordingRequest,
  type TestFlowMapRouteConditionRequest,
  type SaveFlowRequest,
  type UpdateRecordingRequest,
  type UpdateFlowSubflowRequest,
  type ValidateRecordingDomainEventRequest
} from "./contracts.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowInstruction, AutomationStudioInstructionScope, AutomationStudioInstructionTag, AutomationStudioProjectArtifactKind } from "../model/index.ts";
import type { AutomationStudioService } from "../runtime/service.ts";
import { evaluateAutomationStudioRouteCondition } from "../runtime/router-runtime.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import type { AutomationStudioClientGatewayBridge } from "../client-gateway/index.ts";
import type { ClientGatewayService } from "../../../client-gateway/index.ts";

export function registerAutomationStudioApi(registry: GlobalProgramApiRegistry, service: AutomationStudioService, identityAccess?: IdentityAccessService, clientGatewayBridge?: AutomationStudioClientGatewayBridge, clientGateway?: ClientGatewayService): void {
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.performanceMetrics,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object"
        ? request.payload as { limit?: unknown }
        : {};
      const limit = Math.max(1, Math.min(500, Math.trunc(Number(payload.limit)) || 200));
      return { ok: true, payload: { metrics: fluxiqPerformanceMetricsSnapshot(limit), limit } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.snapshot,
    permission: "programs.read",
    handler: async (request) => ({
      ok: true,
      payload: await service.snapshot(request.scope.domainId, { includeCanonical: false })
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.projects,
    permission: "programs.read",
    handler: async (request) => ({
      ok: true,
      payload: await service.listProjects(request.scope.domainId)
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createProject,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { name?: unknown; description?: unknown; categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { project: await service.createProject({ ...payload, domainId: request.scope.domainId ?? null }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateProject,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { project: await service.updateProject(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProject,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteProject(String(payload.projectId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createProjectCategory,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { name?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { category: await service.createProjectCategory({ ...payload, domainId: request.scope.domainId ?? null }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateProjectCategory,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryId?: unknown; name?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { category: await service.updateProjectCategory(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectCategory,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteProjectCategory(String(payload.categoryId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.reorderProjectCategories,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryIds?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.reorderProjectCategories(Array.isArray(payload.categoryIds) ? payload.categoryIds.map(String) : []) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectHierarchy,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return {
        ok: true,
        payload: { hierarchy: await service.getProjectHierarchy(String(payload.projectId ?? "")) }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectChangeFeed,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioProjectChangeFeedRequest> : {};
      return { ok: true, payload: await service.listProjectChangeFeed({ projectId: String(payload.projectId ?? ""), afterSequence: payload.afterSequence, limit: payload.limit }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectHierarchy,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object"
        ? request.payload as { projectId?: unknown; hierarchy?: unknown }
        : {};
      return {
        ok: true,
        payload: {
          hierarchy: await service.saveProjectHierarchy(String(payload.projectId ?? ""), payload.hierarchy && typeof payload.hierarchy === "object"
            ? payload.hierarchy as Parameters<AutomationStudioService["saveProjectHierarchy"]>[1]
            : { customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} })
        }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectUiCache,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioGetProjectUiCacheRequest> : {};
      return { ok: true, payload: await service.getProjectUiCache({ projectId: String(payload.projectId ?? ""), userId: request.actor?.userId ?? "", cacheKeys: payload.cacheKeys }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectUiCache,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioSaveProjectUiCacheRequest> : {};
      return { ok: true, payload: await service.saveProjectUiCache({ projectId: String(payload.projectId ?? ""), userId: request.actor?.userId ?? "", entries: payload.entries }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectUiCache,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioDeleteProjectUiCacheRequest> : {};
      return { ok: true, payload: await service.deleteProjectUiCache({ projectId: String(payload.projectId ?? ""), userId: request.actor?.userId ?? "", cacheKeys: payload.cacheKeys }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectUiCacheStats,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioListProjectUiCacheStatsRequest> : {};
      return { ok: true, payload: await service.listProjectUiCacheStats({ projectId: payload.projectId, userId: request.actor?.userId ?? "" }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectWorkspaceSummary,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return { ok: true, payload: { summary: await service.getProjectWorkspaceSummary(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecordings,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      if (payload.summaries && (payload.limit !== undefined || payload.offset !== undefined)) {
        return { ok: true, payload: await service.listRecordingSessionSummaryPage(payload.projectId, { limit: payload.limit, offset: payload.offset }) };
      }
      return { ok: true, payload: { recordings: payload.summaries ? await service.listRecordingSessionSummaries(payload.projectId) : await service.listRecordingSessions(payload.projectId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectArtifacts,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return { ok: true, payload: { artifacts: await service.listProjectArtifacts(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlows,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowProjectRequest> : {};
      return { ok: true, payload: { flows: await service.listFlows(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowSummaries,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowProjectRequest> : {};
      return { ok: true, payload: { flows: await service.listAutomationFlowSummaries(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowMetadataPage,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowMetadataPageRequest> : {};
      return { ok: true, payload: { page: await service.listFlowMetadataPage({ projectId: String(payload.projectId ?? ""), ...(typeof payload.status === "string" ? { status: payload.status } : {}), ...(typeof payload.limit === "number" ? { limit: payload.limit } : {}), ...(typeof payload.cursor === "string" ? { cursor: payload.cursor } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowMetadataDetail,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowIdProjectRequest> : {};
      return { ok: true, payload: { flow: await service.getFlowMetadataDetail(String(payload.projectId ?? ""), String(payload.flowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createFlow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<CreateFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { flow: await service.createFlow({ projectId: String(payload.projectId ?? ""), name: payload.name, description: payload.description, ...(typeof payload.flowId === "string" ? { flowId: payload.flowId } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlow,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<FlowIdProjectRequest> : {};
      return { ok: true, payload: { flow: await service.getFlow(String(payload.projectId ?? ""), String(payload.flowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<SaveFlowRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      if (!payload.flow || typeof payload.flow !== "object") return { ok: false, error: "Flow object is required." };
      return { ok: true, payload: { flow: await service.saveFlow({ projectId: String(payload.projectId ?? ""), flow: payload.flow, ...(typeof payload.expectedUpdatedAt === "number" ? { expectedUpdatedAt: payload.expectedUpdatedAt } : {}) }) } };
    }
  });
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
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecording,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest & { recordingId?: unknown } : {};
      return { ok: true, payload: { recording: await service.getRecordingSession(String(payload.recordingId ?? ""), payload.projectId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecordingEntryState,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<GetRecordingEntryStateRequest> : {};
      return {
        ok: true,
        payload: await service.getRecordingEntryState({
          projectId: String(payload.projectId ?? ""),
          recordingId: String(payload.recordingId ?? ""),
          ...(typeof payload.entryId === "string" ? { entryId: payload.entryId } : {}),
          ...(typeof payload.actionId === "string" ? { actionId: payload.actionId } : {}),
          ...(typeof payload.stateSnapshotId === "string" ? { stateSnapshotId: payload.stateSnapshotId } : {}),
          includeState: payload.includeState === true
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getStateSnapshot,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<GetStateSnapshotRequest> : {};
      return {
        ok: true,
        payload: await service.getStateSnapshot({
          projectId: String(payload.projectId ?? ""),
          recordingId: String(payload.recordingId ?? ""),
          stateSnapshotId: String(payload.stateSnapshotId ?? ""),
          includeState: payload.includeState === true
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.repairRecordingStateIndex,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<RepairRecordingStateIndexRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return {
        ok: true,
        payload: await service.repairRecordingStateIndex({
          projectId: String(payload.projectId ?? ""),
          recordingId: String(payload.recordingId ?? ""),
          mode: payload.mode === "write" ? "write" : "dry_run"
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as CreateRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.createRecording({ ...payload, domainId: request.scope.domainId ?? null }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as UpdateRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.updateRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as DeleteRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteRecording(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRecordings,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as DeleteRecordingsRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteRecordings(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProposal,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as { projectId?: unknown; proposalId?: unknown; kind?: unknown; authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return {
        ok: true,
        payload: await service.deleteProposal({
          projectId: String(payload.projectId ?? ""),
          proposalId: String(payload.proposalId ?? ""),
          kind: payload.kind === "policy" || payload.kind === "recording_flow" ? payload.kind : "auto"
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProposal,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<GetProposalRequest> : {};
      return {
        ok: true,
        payload: await service.getProposal({
          projectId: String(payload.projectId ?? ""),
          proposalId: String(payload.proposalId ?? ""),
          kind: payload.kind === "policy" || payload.kind === "recording_flow" ? payload.kind : "auto"
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingEntry,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingEntryRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.appendRecordingEvent(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingNote,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingNoteRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.appendRecordingNoteEntry(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingMarker,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingMarkerRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.appendRecordingMarkerEntry(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.finalizeRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as FinalizeRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: service.summarizeRecordingSession(await service.finalizeRecording(payload)) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.processFinalizedRecording,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ProcessFinalizedRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { result: await service.processFinalizedRecording({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? ""), force: payload.force === true }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateRecordingProposal,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as { projectId?: unknown; recordingId?: unknown; mode?: unknown; title?: unknown; instructions?: unknown; constraints?: unknown; replaceProposalId?: unknown };
      return {
        ok: true,
        payload: {
          result: await service.generateRecordingProposal({
            projectId: String(payload.projectId ?? ""),
            recordingId: String(payload.recordingId ?? ""),
            mode: payload.mode === "llm_assisted" ? "llm_assisted" : "direct",
            ...(typeof payload.title === "string" ? { title: payload.title } : {}),
            ...(typeof payload.instructions === "string" ? { instructions: payload.instructions } : {}),
            ...(typeof payload.constraints === "string" ? { constraints: payload.constraints } : {}),
            ...(typeof payload.replaceProposalId === "string" ? { replaceProposalId: payload.replaceProposalId } : {})
          })
        }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.normalizeRecording,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as NormalizeRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { normalizedTimeline: await service.normalizeRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createNormalizationReview,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as RecordingIdProjectRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { review: await service.createNormalizationReview({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listNormalizedTimelines,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: { normalizedTimelines: payload.projectId ? await service.listProjectNormalizedTimelines(payload.projectId) : [] } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listNormalizedTimelineSummaries,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: { normalizedTimelines: payload.projectId ? await service.listProjectNormalizedTimelineSummaries(payload.projectId) : [] } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getNormalizedTimeline,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<NormalizedTimelineProjectRequest> : {};
      return { ok: true, payload: { normalizedTimeline: await service.getProjectNormalizedTimeline(String(payload.projectId ?? ""), String(payload.normalizedTimelineId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listPipelineArtifacts,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: await service.listPipelineArtifacts(String(payload.projectId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.mineRecordingEvidence,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as MineRecordingEvidenceRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const input: Parameters<AutomationStudioService["mineRecordingEvidence"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (payload.recordingId !== undefined) input.recordingId = payload.recordingId;
      if (payload.normalizedTimelineId !== undefined) input.normalizedTimelineId = payload.normalizedTimelineId;
      return { ok: true, payload: { miningRun: await service.mineRecordingEvidence(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.learnTaskModel,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as LearnTaskModelRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const input: Parameters<AutomationStudioService["learnTaskModel"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (payload.taskId !== undefined) input.taskId = payload.taskId;
      if (payload.miningRunId !== undefined) input.miningRunId = payload.miningRunId;
      return { ok: true, payload: { learnedTaskModel: await service.learnTaskModel(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.proposePolicyFromModel,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ProposePolicyFromModelRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const input: Parameters<AutomationStudioService["proposePolicyFromModel"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (payload.learnedTaskModelId !== undefined) input.learnedTaskModelId = payload.learnedTaskModelId;
      if (payload.miningRunId !== undefined) input.miningRunId = payload.miningRunId;
      if (payload.recordingId !== undefined) input.recordingId = payload.recordingId;
      return { ok: true, payload: { proposal: await service.proposePolicyFromModel(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.approvePolicyProposal,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ApprovePolicyProposalRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      const input: Parameters<AutomationStudioService["approvePolicyProposal"]>[0] = { projectId: String(payload.projectId ?? ""), proposalId: String(payload.proposalId ?? "") };
      if (typeof (payload as any).targetTaskId === "string") input.targetTaskId = (payload as any).targetTaskId;
      if (typeof (payload as any).targetFlowId === "string") input.targetFlowId = (payload as any).targetFlowId;
      if ((payload as any).policyOverride && typeof (payload as any).policyOverride === "object" && !Array.isArray((payload as any).policyOverride)) input.policyOverride = (payload as any).policyOverride;
      if (typeof (payload as any).requireExistingTask === "boolean") input.requireExistingTask = (payload as any).requireExistingTask;
      if (typeof (payload as any).requireExistingFlow === "boolean") input.requireExistingFlow = (payload as any).requireExistingFlow;
      return { ok: true, payload: { proposal: await service.approvePolicyProposal(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createRecordingFlowProposals,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Record<string, unknown>;
      return { ok: true, payload: await service.createRecordingFlowProposals({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? ""), ...(typeof payload.mapperId === "string" ? { mapperId: payload.mapperId } : {}), ...(payload.force === true ? { force: true } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.reviewRecordingFlowProposal,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Record<string, unknown>;
      await authorizeProgramPin(identityAccess, payload);
      const decision = payload.decision === "rejected" ? "rejected" as const : "approved" as const;
      const destination = payload.destination && typeof payload.destination === "object" && !Array.isArray(payload.destination) ? payload.destination as any : undefined;
      const policyOverride = payload.policyOverride && typeof payload.policyOverride === "object" && !Array.isArray(payload.policyOverride) ? payload.policyOverride as any : undefined;
      return { ok: true, payload: await service.reviewRecordingFlowProposal({ projectId: String(payload.projectId ?? ""), proposalId: String(payload.proposalId ?? ""), decision, ...(typeof payload.notes === "string" ? { notes: payload.notes } : {}), ...(typeof payload.reviewerId === "string" ? { reviewerId: payload.reviewerId } : {}), ...(destination ? { destination } : {}), ...(policyOverride ? { policyOverride } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.replayPolicyAgainstRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ReplayPolicyAgainstRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      const input: Parameters<AutomationStudioService["replayPolicyAgainstRecording"]>[0] = { projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? "") };
      if (payload.policyId !== undefined) input.policyId = payload.policyId;
      return { ok: true, payload: { replayResult: await service.replayPolicyAgainstRecording(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRuntimeSessions,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; summaries?: unknown; limit?: unknown; offset?: unknown } : {};
      const projectId = String(payload.projectId ?? "");
      if (payload.summaries === true) {
        const page = await service.listRuntimeSessionSummaries(projectId, { limit: payload.limit, offset: payload.offset });
        return { ok: true, payload: { runtimeSessions: page.runs, page } };
      }
      return { ok: true, payload: { runtimeSessions: await service.listRuntimeSessions(projectId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRuntimeSession,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; runId?: unknown } : {};
      return { ok: true, payload: { runtimeSession: await service.getRuntimeSession(String(payload.projectId ?? ""), String(payload.runId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowSubflows,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const page = await service.listFlowSubflowSummaries({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), limit: payload.limit, offset: payload.offset, ...(typeof payload.status === "string" ? { status: payload.status } : {}), ...(typeof payload.role === "string" ? { role: payload.role } : {}), ...(typeof payload.search === "string" ? { search: payload.search } : {}), ...((payload.sort === "updated" || payload.sort === "name" || payload.sort === "status" || payload.sort === "role") ? { sort: payload.sort } : {}), ...(payload.direction ? { direction: payload.direction } : {}) });
      return { ok: true, payload: { subflows: page.subflows, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowSubflow,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest : {} as FlowSubflowRequest;
      return { ok: true, payload: { subflow: await service.getFlowSubflow(String(payload.projectId ?? ""), String(payload.flowId ?? ""), String(payload.subflowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as CreateFlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as CreateFlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["createFlowSubflow"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), name: String(payload.name ?? "") };
      if (typeof payload.description === "string") input.description = payload.description;
      if (typeof payload.role === "string") input.role = payload.role as any;
      if (typeof payload.parentCategoryId === "string" || payload.parentCategoryId === null) input.parentCategoryId = payload.parentCategoryId;
      if (typeof payload.graphFlowId === "string") input.graphFlowId = payload.graphFlowId;
      if (Array.isArray(payload.routeTags)) input.routeTags = payload.routeTags.filter((tag): tag is string => typeof tag === "string");
      return { ok: true, payload: { subflow: await service.createFlowSubflow(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as UpdateFlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as UpdateFlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["updateFlowSubflow"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") };
      if (typeof payload.expectedUpdatedAt === "number") input.expectedUpdatedAt = payload.expectedUpdatedAt;
      if (typeof payload.name === "string") input.name = payload.name;
      if (typeof payload.description === "string") input.description = payload.description;
      if (typeof payload.role === "string") input.role = payload.role as any;
      if (typeof payload.parentCategoryId === "string" || payload.parentCategoryId === null) input.parentCategoryId = payload.parentCategoryId;
      if (typeof payload.graphFlowId === "string") input.graphFlowId = payload.graphFlowId;
      if (Array.isArray(payload.routeTags)) input.routeTags = payload.routeTags.filter((tag): tag is string => typeof tag === "string");
      if (Array.isArray(payload.inputMapping)) input.inputMapping = payload.inputMapping;
      if (Array.isArray(payload.outputMapping)) input.outputMapping = payload.outputMapping;
      if (Array.isArray(payload.localInstructionIds)) input.localInstructionIds = payload.localInstructionIds.filter((id): id is string => typeof id === "string");
      if (typeof payload.proposalModeOverride === "string" || payload.proposalModeOverride === null) input.proposalModeOverride = payload.proposalModeOverride as any;
      return { ok: true, payload: { subflow: await service.updateFlowSubflow(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.renameFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RenameFlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as RenameFlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { subflow: await service.renameFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? ""), name: String(payload.name ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.duplicateFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as DuplicateFlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as DuplicateFlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["duplicateFlowSubflow"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") };
      if (typeof payload.name === "string") input.name = payload.name;
      return { ok: true, payload: { subflow: await service.duplicateFlowSubflow(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.disableFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as FlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { subflow: await service.disableFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.archiveFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as FlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { subflow: await service.archiveFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.enableFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as FlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { subflow: await service.enableFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteFlowSubflow,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSubflowRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as FlowSubflowRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: await service.deleteFlowSubflow({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), subflowId: String(payload.subflowId ?? "") }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowInstructions,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const input: Parameters<AutomationStudioService["listFlowInstructionSummaries"]>[0] = { projectId: String(payload.projectId ?? ""), limit: payload.limit, offset: payload.offset };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      if (typeof payload.status === "string") input.status = payload.status;
      if (typeof payload.scopeKind === "string") input.scopeKind = payload.scopeKind;
      if (typeof payload.requirement === "string") input.requirement = payload.requirement;
      if (typeof payload.search === "string") input.search = payload.search;
      if (payload.sort === "updated" || payload.sort === "title" || payload.sort === "status" || payload.sort === "scope" || payload.sort === "priority") input.sort = payload.sort;
      if (payload.direction === "asc" || payload.direction === "desc") input.direction = payload.direction;
      const page = await service.listFlowInstructionSummaries(input);
      return { ok: true, payload: { instructions: page.instructions, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowInstruction,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowInstructionRequest : {} as FlowInstructionRequest;
      return { ok: true, payload: { instruction: await service.getFlowInstruction(String(payload.projectId ?? ""), String(payload.instructionId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowInstructionSet,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowInstructionSetRequest : {} as FlowInstructionSetRequest;
      const input: Parameters<AutomationStudioService["getFlowInstructionSet"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      return { ok: true, payload: { instructions: await service.getFlowInstructionSet(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowInstruction,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowInstructionRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowInstructionRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const projectId = String(payload.projectId ?? "");
      const flowId = String(payload.flowId ?? "");
      const now = Date.now();
      const title = String(payload.title ?? "").trim();
      const body = String(payload.body ?? "").trim();
      if (!projectId || !flowId) return { ok: false, error: "Project and Flow are required." };
      if (!title || !body) return { ok: false, error: "Instruction title and body are required." };
      const existing = typeof payload.instructionId === "string" && payload.instructionId.trim()
        ? await service.getFlowInstruction(projectId, payload.instructionId.trim())
        : null;
      const instructionId = existing?.instructionId ?? payload.instructionId?.trim() ?? `instruction.${slugSegment(title)}.${now.toString(36)}`;
      const instruction: AutomationStudioFlowInstruction = {
        schemaVersion: "0.1",
        instructionId,
        title,
        body,
        scope: flowInstructionScopeFromPayload(projectId, flowId, payload),
        priority: Number.isFinite(Number(payload.priority)) ? Number(payload.priority) : existing?.priority ?? 50,
        status: payload.status === "disabled" || payload.status === "archived" ? payload.status : existing?.status ?? "active",
        requirement: payload.requirement === "required" ? "required" : "advisory",
        tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is AutomationStudioInstructionTag => typeof tag === "string" && ["generation", "runtime", "error", "router", "subflow", "review", "safety"].includes(tag)) : existing?.tags ?? [],
        linkedRunIds: existing?.linkedRunIds ?? [],
        linkedAdaptationIds: existing?.linkedAdaptationIds ?? [],
        linkedRecordingIds: existing?.linkedRecordingIds ?? [],
        linkedSubflowIds: existing?.linkedSubflowIds ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        metadata: existing?.metadata ?? {}
      };
      return { ok: true, payload: { instruction: await service.saveFlowInstruction(projectId, instruction) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowChangeProposals,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const input: Parameters<AutomationStudioService["listFlowChangeProposalSummaries"]>[0] = { projectId: String(payload.projectId ?? ""), limit: payload.limit, offset: payload.offset };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      const page = await service.listFlowChangeProposalSummaries(input);
      return { ok: true, payload: { changeProposals: page.changeProposals, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowChangeProposal,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowChangeProposalRequest : {} as FlowChangeProposalRequest;
      return { ok: true, payload: { changeProposal: await service.getFlowChangeProposal(String(payload.projectId ?? ""), String(payload.flowId ?? ""), String(payload.proposalId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRuns,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const input: Parameters<AutomationStudioService["listFlowRunSummaries"]>[0] = { projectId: String(payload.projectId ?? ""), limit: payload.limit, offset: payload.offset };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.status === "string") input.status = payload.status;
      if (typeof payload.search === "string") input.search = payload.search;
      if (payload.sort === "updated" || payload.sort === "started" || payload.sort === "duration" || payload.sort === "actions" || payload.sort === "status") input.sort = payload.sort;
      if (payload.direction === "asc" || payload.direction === "desc") input.direction = payload.direction;
      const page = await service.listFlowRunSummaries(input);
      return { ok: true, payload: { runs: page.runs, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowRunDetailRequest : {} as FlowRunDetailRequest;
      const runDetail = await service.getFlowRunDetail(String(payload.projectId ?? ""), String(payload.runId ?? ""));
      return { ok: true, payload: { runDetail: payload.compact === true && runDetail ? { ...runDetail, actionAttempts: [] } : runDetail } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRunActions,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowRunActionPageRequest : {} as FlowRunActionPageRequest;
      const page = await service.listFlowRunActions({ projectId: String(payload.projectId ?? ""), runId: String(payload.runId ?? ""), limit: payload.limit, offset: payload.offset });
      return { ok: true, payload: { actions: page.actions, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRunEvents,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowRunEventPageRequest : {} as FlowRunEventPageRequest;
      const page = await service.listFlowRunEvents({ projectId: String(payload.projectId ?? ""), runId: String(payload.runId ?? ""), afterSequence: payload.afterSequence, limit: payload.limit });
      return { ok: true, payload: { events: page.events, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowAdaptations,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const input: Parameters<AutomationStudioService["listFlowAdaptationSummaries"]>[0] = { projectId: String(payload.projectId ?? ""), limit: payload.limit, offset: payload.offset };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      if (typeof payload.status === "string") input.status = payload.status;
      if (typeof payload.risk === "string") input.risk = payload.risk;
      if (typeof payload.search === "string") input.search = payload.search;
      if (payload.sort === "updated" || payload.sort === "status" || payload.sort === "risk" || payload.sort === "trigger") input.sort = payload.sort;
      if (payload.direction === "asc" || payload.direction === "desc") input.direction = payload.direction;
      const page = await service.listFlowAdaptationSummaries(input);
      return { ok: true, payload: { adaptations: page.adaptations, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowAdaptation,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowAdaptationRequest : {} as FlowAdaptationRequest;
      return { ok: true, payload: { adaptation: await service.getFlowAdaptation(String(payload.projectId ?? ""), String(payload.flowId ?? ""), String(payload.adaptationId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.reviewFlowAdaptation,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as ReviewFlowAdaptationRequest : {} as ReviewFlowAdaptationRequest;
      await authorizeProgramPin(identityAccess, payload);
      return {
        ok: true,
        payload: {
          adaptation: await service.reviewFlowAdaptation({
            projectId: String(payload.projectId ?? ""),
            flowId: String(payload.flowId ?? ""),
            adaptationId: String(payload.adaptationId ?? ""),
            action: payload.action,
            ...(payload.reason ? { reason: payload.reason } : {}),
            ...(payload.supersededByAdaptationId ? { supersededByAdaptationId: payload.supersededByAdaptationId } : {})
          })
        }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRouter,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowIdProjectRequest : {} as FlowIdProjectRequest;
      return { ok: true, payload: { router: await service.getFlowRouter(String(payload.projectId ?? ""), String(payload.flowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowMapRouteGroup,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowMapRouteGroupRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowMapRouteGroupRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["upsertFlowMapRouteGroup"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), name: String(payload.name ?? "") };
      if (typeof payload.groupId === "string") input.groupId = payload.groupId;
      if (typeof payload.description === "string") input.description = payload.description;
      input.order = payload.order;
      if (typeof payload.status === "string") input.status = payload.status as any;
      if (typeof payload.collapsed === "boolean") input.collapsed = payload.collapsed;
      return { ok: true, payload: { router: await service.upsertFlowMapRouteGroup(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteFlowMapRouteGroup,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as DeleteFlowMapRouteGroupRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as DeleteFlowMapRouteGroupRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { router: await service.deleteFlowMapRouteGroup({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), groupId: String(payload.groupId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowMapRoute,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowMapRouteRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowMapRouteRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["upsertFlowMapRoute"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), name: String(payload.name ?? ""), targetSubflowId: String(payload.targetSubflowId ?? "") };
      if (typeof payload.ruleId === "string") input.ruleId = payload.ruleId;
      if (typeof payload.description === "string") input.description = payload.description;
      input.order = payload.order;
      if (typeof payload.status === "string") input.status = payload.status as any;
      if (typeof payload.groupId === "string" || payload.groupId === null) input.groupId = payload.groupId;
      if (typeof payload.setAsFallback === "boolean") input.setAsFallback = payload.setAsFallback;
      input.confidence = payload.confidence;
      if (typeof payload.conditionSummary === "string") input.conditionSummary = payload.conditionSummary;
      if (typeof payload.conditionSignalPath === "string") input.conditionSignalPath = payload.conditionSignalPath;
      if (typeof payload.conditionOperator === "string") input.conditionOperator = payload.conditionOperator;
      if (payload.conditionExpected !== undefined) input.conditionExpected = payload.conditionExpected;
      if (typeof payload.clearCondition === "boolean") input.clearCondition = payload.clearCondition;
      return { ok: true, payload: { router: await service.upsertFlowMapRoute(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowMapFallback,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowMapFallbackRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowMapFallbackRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { router: await service.setFlowMapFallback({
        projectId: String(payload.projectId ?? ""),
        flowId: String(payload.flowId ?? ""),
        kind: payload.kind === "subflow" ? "subflow" : "fail",
        ...(typeof payload.targetSubflowId === "string" ? { targetSubflowId: payload.targetSubflowId } : {}),
        ...(typeof payload.message === "string" ? { message: payload.message } : {})
      }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.testFlowMapRouteCondition,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as TestFlowMapRouteConditionRequest : {} as TestFlowMapRouteConditionRequest;
      const condition = payload.condition && typeof payload.condition.signalPath === "string" ? payload.condition as any : undefined;
      return { ok: true, payload: evaluateAutomationStudioRouteCondition(condition, { ...(payload.inputs ? { inputs: payload.inputs as any } : {}), ...(payload.currentStateSummary ? { currentStateSummary: payload.currentStateSummary as any } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.mutateFlowMapRoute,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as MutateFlowMapRouteRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as MutateFlowMapRouteRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const action = ["move_up", "move_down", "duplicate", "toggle", "delete"].includes(payload.action) ? payload.action : "toggle";
      return { ok: true, payload: { router: await service.mutateFlowMapRoute({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), ruleId: String(payload.ruleId ?? ""), action }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteFlowMapRoute,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as DeleteFlowMapRouteRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as DeleteFlowMapRouteRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { router: await service.deleteFlowMapRoute({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), ruleId: String(payload.ruleId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startRuntimeSession,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; flow?: AutomationStudioFlowDocument; flowId?: string; targetKind?: any; targetId?: string; inputs?: any; authorizedDomainIds?: string[] } : {};
      return { ok: true, payload: { runtimeSession: await service.startRuntimeSession(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; runId?: string; flow?: AutomationStudioFlowDocument; flowId?: string; inputs?: any; maxSteps?: number; authorizedDomainIds?: string[]; adaptiveMode?: "default" | "manual_approval" | "deterministic"; dryRunLlm?: boolean; authorizedExternalSideEffects?: boolean; subflowId?: string; idempotencyKey?: string } : {};
      const runtimeSession = await service.runRuntimeSession(payload);
      const projectId = typeof payload.projectId === "string" ? payload.projectId : null;
      const runDetail = projectId ? await service.getFlowRunDetail(projectId, runtimeSession.runId).catch(() => null) : null;
      const durableBehaviorChanged = Boolean(runDetail?.adaptationIds?.length && runDetail.adaptationIds.some((adaptationId) => {
        const attempt = runDetail.metadata?.runtimePatchAttempts;
        return Array.isArray(attempt) && attempt.some((item) => typeof item === "object" && item && (item as any).adaptationId === adaptationId && (item as any).approvalDecision?.autoApply === true);
      }));
      return {
        ok: true,
        payload: {
          runtimeSession,
          runSummary: runDetail?.summary,
          runDetailLink: { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, runId: runtimeSession.runId },
          createdAdaptationIds: runDetail?.adaptationIds ?? [],
          interventionCount: runDetail?.summary.interventionCount ?? 0,
          terminalReason: runtimeSession.trace?.message ?? runtimeSession.status,
          durableBehaviorChanged
        }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.inspectStateDiff,
    permission: "programs.read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as InspectStateDiffRequest;
      return { ok: true, payload: await service.inspectStateDiff(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listSignalRegistries,
    permission: "programs.read",
    handler: async () => ({
      ok: true,
      payload: { signalRegistries: await service.listSignalRegistries() }
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecordingDomains,
    permission: "programs.read",
    handler: async () => ({
      ok: true,
      payload: { domains: service.listRecordingDomains() }
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.validateRecordingDomainEvent,
    permission: "programs.read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ValidateRecordingDomainEventRequest;
      return { ok: true, payload: service.validateRecordingDomainEvent(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingDomainEvent,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingDomainEventRequest;
      const result = await service.appendRecordingDomainEvent(payload);
      return result.accepted
        ? { ok: true, payload: result }
        : { ok: false, error: result.issues.map((issue) => issue.message).join(" ") || "Recording event was rejected.", payload: result };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.clientGatewaySnapshot,
    permission: "programs.read",
    handler: async () => {
      await clientGateway?.ready();
      return {
        ok: true,
        payload: clientGateway?.snapshot() ?? { enabled: false, sessions: [], pairings: [], trustedClients: [], auditLog: [] }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.revokeClientTrust,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGateway) return { ok: false, error: "Client gateway is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as RevokeClientTrustRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      const revoked = await clientGateway.revokeTrustedClient(String(payload.trustedClientId ?? ""), payload.reason?.trim() || "revoked by operator");
      return revoked ? { ok: true, payload: { revoked: true } } : { ok: false, error: "Trusted client was not found or was already revoked." };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startClientRecording,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as StartClientRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await clientGatewayBridge.startRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.stopClientRecording,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as StopClientRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      const recording = await clientGatewayBridge.stopRecording(String(payload.sessionId ?? ""));
      return { ok: true, payload: { recording: recording ? service.summarizeRecordingSession(recording) : null } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.captureClientSnapshot,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGateway) return { ok: false, error: "Client gateway is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as CaptureClientSnapshotRequest;
      await clientGateway.captureSnapshot(String(payload.sessionId ?? ""), {
        ...(payload.kind !== undefined ? { kind: payload.kind } : {}),
        ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {})
      });
      return { ok: true, payload: { queued: true } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.executeClientAction,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ExecuteClientActionRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { result: await clientGatewayBridge.executeAction(String(payload.sessionId ?? ""), payload.command) } };
    }
  });
}

export function flowInstructionScopeFromPayload(projectId: string, flowId: string, payload: SaveFlowInstructionRequest): AutomationStudioInstructionScope {
  if (payload.scopeKind === "global") return { kind: "global" };
  if (payload.scopeKind === "project") return { kind: "project", projectId };
  if (payload.scopeKind === "router") return { kind: "router", projectId, flowId, routerId: String(payload.routerId ?? "router.default") };
  if (payload.scopeKind === "subflow") return { kind: "subflow", projectId, flowId, subflowId: String(payload.subflowId ?? "") };
  if (payload.scopeKind === "node") return { kind: "node", projectId, flowId, nodeId: String(payload.nodeId ?? ""), ...(typeof payload.subflowId === "string" && payload.subflowId ? { subflowId: payload.subflowId } : {}) };
  if (payload.scopeKind === "on_error") return { kind: "on_error", projectId, flowId, ...(typeof payload.subflowId === "string" && payload.subflowId ? { subflowId: payload.subflowId } : {}), ...(typeof payload.nodeId === "string" && payload.nodeId ? { nodeId: payload.nodeId } : {}) };
  if (payload.scopeKind === "adaptation_review") return { kind: "adaptation_review", projectId, flowId, ...(typeof payload.subflowId === "string" && payload.subflowId ? { subflowId: payload.subflowId } : {}) };
  return { kind: "flow", projectId, flowId };
}

function slugSegment(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 48);
  return slug || "instruction";
}
