import type { GlobalProgramApiRegistry } from "../../_shared/api";
import { authorizeProgramPin } from "../../_shared/authorization";
import { AUTOMATION_STUDIO_ENDPOINTS } from "./contracts";
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
}
