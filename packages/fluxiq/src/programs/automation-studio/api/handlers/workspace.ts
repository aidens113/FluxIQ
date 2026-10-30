// The workspace overview: one project's summary plus its recording and
// artifact listings.

import { AUTOMATION_STUDIO_ENDPOINTS, type RecordingProjectRequest } from "../contracts.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";
import { projectOrWorkspaceResource } from "./recordings.ts";

export function registerWorkspaceEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectWorkspaceSummary,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetProjectWorkspaceSummary",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return { ok: true, payload: { summary: await service.getProjectWorkspaceSummary(String(payload.projectId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecordings,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListRecordings",
    accessLevel: "List",
    resource: projectOrWorkspaceResource,
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
    classification: "read",
    action: "studio:ListProjectArtifacts",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown } : {};
      return { ok: true, payload: { artifacts: await service.listProjectArtifacts(String(payload.projectId ?? "")) } };
    }
  });
}
