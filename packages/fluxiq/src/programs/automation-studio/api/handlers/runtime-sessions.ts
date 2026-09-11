// Listing and reading runtime sessions.

import { AUTOMATION_STUDIO_ENDPOINTS } from "../contracts.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerRuntimeSessionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
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
}
