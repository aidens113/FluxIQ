import type { GlobalProgramApiRegistry } from "../../_shared/api.ts";
import { authorizeProgramPin } from "../../_shared/authorization.ts";
import {
  AUTOMATION_STUDIO_ENDPOINTS,
  type AppendRecordingMarkerRequest,
  type AppendRecordingNoteRequest,
  type AppendRecordingDomainEventRequest,
  type AppendRecordingEntryRequest,
  type ApprovePolicyProposalRequest,
  type CaptureClientSnapshotRequest,
  type CreateFlowRequest,
  type CreateRecordingRequest,
  type DeleteRecordingRequest,
  type FlowIdProjectRequest,
  type FlowProjectRequest,
  type ExecuteClientActionRequest,
  type FinalizeRecordingRequest,
  type GetProposalRequest,
  type ProcessFinalizedRecordingRequest,
  type InspectStateDiffRequest,
  type LearnTaskModelRequest,
  type MineRecordingEvidenceRequest,
  type NormalizeRecordingRequest,
  type ProposePolicyFromModelRequest,
  type PublishFlowRequest,
  type RecordingProjectRequest,
  type RecordingIdProjectRequest,
  type ReplayPolicyAgainstRecordingRequest,
  type RevokeClientTrustRequest,
  type StartClientRecordingRequest,
  type StopClientRecordingRequest,
  type SaveFlowRequest,
  type UpdateRecordingRequest,
  type ValidateRecordingDomainEventRequest
} from "./contracts.ts";
import type { AutomationStudioFlowDocument, AutomationStudioProjectArtifactKind } from "../model/index.ts";
import type { AutomationStudioService } from "../runtime/service.ts";
import type { IdentityAccessService } from "../../identity-access/index.ts";
import type { AutomationStudioClientGatewayBridge } from "../client-gateway/index.ts";
import type { ClientGatewayService } from "../../../client-gateway/index.ts";

export function registerAutomationStudioApi(registry: GlobalProgramApiRegistry, service: AutomationStudioService, identityAccess?: IdentityAccessService, clientGatewayBridge?: AutomationStudioClientGatewayBridge, clientGateway?: ClientGatewayService): void {
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.snapshot,
    permission: "programs.read",
    handler: async (request) => ({
      ok: true,
      payload: await service.snapshot(request.scope.domainId)
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
      return { ok: true, payload: { flow: await service.saveFlow({ projectId: String(payload.projectId ?? ""), flow: payload.flow }) } };
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
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return { ok: true, payload: { runtimeSessions: await service.listRuntimeSessions(String(payload.projectId ?? "")) } };
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
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; runId?: string; flow?: AutomationStudioFlowDocument; flowId?: string; inputs?: any; maxSteps?: number; authorizedDomainIds?: string[] } : {};
      return { ok: true, payload: { runtimeSession: await service.runRuntimeSession(payload) } };
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
