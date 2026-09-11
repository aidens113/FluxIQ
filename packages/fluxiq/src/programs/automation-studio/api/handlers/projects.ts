// Program snapshot and performance metrics, project problems, projects,
// project categories, and the project hierarchy and change feed.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { fluxiqPerformanceMetricsSnapshot } from "../../../_shared/performance-metrics.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type AutomationStudioListHierarchyChildrenRequest, type AutomationStudioProjectChangeFeedRequest } from "../contracts.ts";
import type { AutomationStudioService } from "../../runtime/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerProjectEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess } = dependencies;
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectProblems,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      const page = await service.listProjectProblems({
        projectId: String(payload.projectId ?? ""),
        ...(request.scope.domainId !== undefined ? { domainId: request.scope.domainId } : {}),
        ...(typeof payload.severity === "string" ? { severity: payload.severity } : {}),
        ...(typeof payload.source === "string" ? { source: payload.source } : {}),
        ...(typeof payload.status === "string" ? { status: payload.status } : {}),
        ...(typeof payload.scopeId === "string" ? { scopeId: payload.scopeId } : {}),
        ...(typeof payload.search === "string" ? { search: payload.search } : {}),
        limit: payload.limit,
        cursor: payload.cursor
      });
      return { ok: true, payload: { problems: page.problems, page } };
    }
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object"
        ? request.payload as Partial<AutomationStudioListHierarchyChildrenRequest>
        : {};
      return {
        ok: true,
        payload: {
          page: await service.listProjectHierarchyChildren({
            projectId: String(payload.projectId ?? ""),
            parentId: payload.parentId,
            cursor: payload.cursor,
            limit: payload.limit
          })
        }
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object"
        ? request.payload as { projectId?: unknown; node?: unknown }
        : {};
      return {
        ok: true,
        payload: await service.putProjectHierarchyNode(
          String(payload.projectId ?? ""),
          payload.node as Parameters<AutomationStudioService["putProjectHierarchyNode"]>[1]
        )
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectHierarchyNode,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object"
        ? request.payload as { projectId?: unknown; nodeId?: unknown }
        : {};
      return {
        ok: true,
        payload: await service.deleteProjectHierarchyNode(String(payload.projectId ?? ""), String(payload.nodeId ?? ""))
      };
    }
  });
}
