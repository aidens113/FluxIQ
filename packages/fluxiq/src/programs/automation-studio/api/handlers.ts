import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { authorizeProgramPin } from "../../_shared/authorization";
import {
  AUTOMATION_STUDIO_ENDPOINTS,
  type AppendRecordingEntryRequest,
  type CreateRecordingRequest,
  type FinalizeRecordingRequest,
  type InspectStateDiffRequest,
  type NormalizeRecordingRequest,
  type RecordingProjectRequest
} from "./contracts";
import type { AutomationStudioFlowDocument, AutomationStudioProjectArtifactKind } from "../model";
import type { AutomationStudioService } from "../runtime/service";
import type { IdentityAccessService } from "../../identity-access";

export function registerAutomationStudioApi(registry: GlobalProgramApiRegistry, service: AutomationStudioService, identityAccess?: IdentityAccessService): void {
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.snapshot,
    handler: async (request) => ({
      ok: true,
      payload: await service.snapshot(request.scope.domainId)
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.projects,
    handler: async () => ({
      ok: true,
      payload: await service.listProjects()
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createProject,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { name?: unknown; description?: unknown; categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { project: await service.createProject(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateProject,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { project: await service.updateProject(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProject,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteProject(String(payload.projectId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createProjectCategory,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { name?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { category: await service.createProjectCategory(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateProjectCategory,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryId?: unknown; name?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { category: await service.updateProjectCategory(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectCategory,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteProjectCategory(String(payload.categoryId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.reorderProjectCategories,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryIds?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.reorderProjectCategories(Array.isArray(payload.categoryIds) ? payload.categoryIds.map(String) : []) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectHierarchy,
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecordings,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: { recordings: await service.listRecordingSessions(payload.projectId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectArtifacts,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return { ok: true, payload: { artifacts: await service.listProjectArtifacts(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectArtifact,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; kind?: unknown; artifactId?: unknown } : {};
      return { ok: true, payload: { artifact: await service.getProjectArtifact(String(payload.projectId ?? ""), String(payload.kind ?? "") as AutomationStudioProjectArtifactKind, String(payload.artifactId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectArtifact,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; kind?: unknown; artifact?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { artifact: await service.saveProjectArtifact({ projectId: String(payload.projectId ?? ""), kind: String(payload.kind ?? "") as AutomationStudioProjectArtifactKind, artifact: payload.artifact }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecording,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest & { recordingId?: unknown } : {};
      return { ok: true, payload: { recording: await service.getRecordingSession(String(payload.recordingId ?? ""), payload.projectId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createRecording,
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as CreateRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.createRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingEntry,
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingEntryRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.appendRecordingEvent(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.finalizeRecording,
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as FinalizeRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.finalizeRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.normalizeRecording,
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as NormalizeRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { normalizedTimeline: await service.normalizeRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listNormalizedTimelines,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: { normalizedTimelines: payload.projectId ? await service.listProjectNormalizedTimelines(payload.projectId) : [] } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRuntimeSessions,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return { ok: true, payload: { runtimeSessions: await service.listRuntimeSessions(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startRuntimeSession,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; flow?: AutomationStudioFlowDocument; flowId?: string; targetKind?: any; targetId?: string; inputs?: any } : {};
      return { ok: true, payload: { runtimeSession: await service.startRuntimeSession(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; runId?: string; flow?: AutomationStudioFlowDocument; flowId?: string; inputs?: any; maxSteps?: number } : {};
      return { ok: true, payload: { runtimeSession: await service.runRuntimeSession(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.inspectStateDiff,
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as InspectStateDiffRequest;
      return { ok: true, payload: await service.inspectStateDiff(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listSignalRegistries,
    handler: async () => ({
      ok: true,
      payload: { signalRegistries: await service.listSignalRegistries() }
    })
  });
}
