// Program snapshot and performance metrics, project problems, projects,
// project categories, and the project hierarchy and change feed.

import { createProjectCategoryInput, createProjectInput, deleteProjectCategoryInput, deleteProjectInput, listProjectProblemsInput, listProjectsInput, updateProjectCategoryInput, updateProjectInput } from "@fluxiq/contracts/program-api-inputs";
import { endpointResource } from "../../../_shared/iam/index.ts";
import { fluxiqPerformanceMetricsSnapshot } from "../../../../framework/persistence/performance-metrics/performance-metrics.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type AutomationStudioListHierarchyChildrenRequest, type AutomationStudioProjectChangeFeedRequest } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import { AutomationStudioProjectOwnerships } from "../../../../framework/persistence/automation/ownership/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerProjectEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.performanceMetrics,
    assistant: { hidden: "These are internal timing figures for engineers, not something a person asks the assistant for." },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetPerformanceMetrics",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
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
    assistant: { hidden: "This is the whole workspace in one large dump for the screens to draw from; a person asks for projects, Flows or runs instead." },
    permission: "programs.read",
    classification: "read",
    action: "studio:Snapshot",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    handler: async (request) => ({
      ok: true,
      payload: await service.snapshot(request.scope.domainId, { includeCanonical: false })
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectProblems,
    assistant: { input: listProjectProblemsInput, summary: "Lists what is wrong in a project.", phrases: ["what problems does my project have", "show the project problems"], contextArgs: { projectId: "projectId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListProjectProblems",
    accessLevel: "List",
    resource: endpointResource.project(),
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
    assistant: { input: listProjectsInput, summary: "Lists the projects a person can see.", phrases: ["show my projects", "what projects do I have"] },
    permission: "programs.read",
    classification: "read",
    action: "studio:Projects",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    list: {
      items: (payload) => {
        const projects = (payload as { projects?: unknown } | null)?.projects;
        return Array.isArray(projects) ? projects : [];
      },
      ref: (item) => ({ kind: "project", projectId: (item as { id?: unknown } | null)?.id }),
      replace: (payload, kept) => ({ ...(payload as object), projects: kept })
    },
    // Each project answers its owner (`ownerUserId`), which the IAM owner
    // condition reads; an unowned one is given its default owner here.
    handler: async (request) => {
      const listed = await service.listProjects(request.scope.domainId);
      const ownership = AutomationStudioProjectOwnerships.of(service);
      return { ok: true, payload: ownership ? { ...listed, projects: await ownership.withProjectOwners(listed.projects) } : listed };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createProject,
    assistant: { input: createProjectInput, summary: "Creates a new project.", phrases: ["make a new project", "create a project called"] },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:CreateProject",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    creates: (payload) => ({ kind: "project", projectId: (payload as { project?: { id?: unknown } | null } | null)?.project?.id }),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { name?: unknown; description?: unknown; categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      return { ok: true, payload: { project: await service.createProject({ ...payload, domainId: request.scope.domainId ?? null }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateProject,
    assistant: { input: updateProjectInput, summary: "Renames a project or changes its note or category.", phrases: ["rename this project", "change the project description"], contextArgs: { projectId: "projectId" } },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:UpdateProject",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      const project = await service.updateProject(payload);
      const ownership = AutomationStudioProjectOwnerships.of(service);
      return { ok: true, payload: { project: ownership ? (await ownership.withProjectOwners([project]))[0] ?? project : project } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProject,
    assistant: { input: deleteProjectInput, summary: "Deletes a project and everything in it.", phrases: ["delete this project", "remove the project"], contextArgs: { projectId: "projectId" } },
    permission: "programs.write",
    classification: "destructive",
    action: "studio:DeleteProject",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      return { ok: true, payload: await service.deleteProject(String(payload.projectId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createProjectCategory,
    assistant: { input: createProjectCategoryInput, summary: "Creates a category for grouping projects.", phrases: ["make a new category", "add a project category"] },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:CreateProjectCategory",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { name?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      return { ok: true, payload: { category: await service.createProjectCategory({ ...payload, domainId: request.scope.domainId ?? null }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateProjectCategory,
    assistant: { input: updateProjectCategoryInput, summary: "Renames a project category.", phrases: ["rename this category"] },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:UpdateProjectCategory",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryId?: unknown; name?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      return { ok: true, payload: { category: await service.updateProjectCategory(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectCategory,
    assistant: { input: deleteProjectCategoryInput, summary: "Deletes a project category; its projects stay.", phrases: ["delete this category", "remove the category"], target: { categoryId: "category" } },
    permission: "programs.write",
    classification: "destructive",
    action: "studio:DeleteProjectCategory",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryId?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      return { ok: true, payload: await service.deleteProjectCategory(String(payload.categoryId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.reorderProjectCategories,
    assistant: { hidden: "Categories are put in order by dragging them on the projects screen, which sends the whole new order." },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:ReorderProjectCategories",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { categoryIds?: unknown; authSessionId?: unknown; authorizationPin?: unknown } : {};
      return { ok: true, payload: await service.reorderProjectCategories(Array.isArray(payload.categoryIds) ? payload.categoryIds.map(String) : []) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectHierarchy,
    assistant: { hidden: "This is the tree the workspace sidebar draws, which a person never asks for in words." },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetProjectHierarchy",
    accessLevel: "Read",
    resource: endpointResource.project(),
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
    assistant: { hidden: "The sidebar tree asks for one branch at a time as it opens; it is not something a person asks for." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListProjectHierarchyChildren",
    accessLevel: "List",
    resource: endpointResource.project(),
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
    assistant: { hidden: "The screens poll this feed to refresh themselves; a person asks what happened in words through other reads." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListProjectChangeFeed",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioProjectChangeFeedRequest> : {};
      return { ok: true, payload: await service.listProjectChangeFeed({ projectId: String(payload.projectId ?? ""), afterSequence: payload.afterSequence, limit: payload.limit }) };
    }
  });
  // Both hierarchy endpoints are `authoring`, not `destructive`. They write only
  // `customHierarchyNodes` and `deletedHierarchyIds`: no Flow, recording, project
  // or dataset is touched, so what a delete removes is the filing, not the work —
  // the items survive and become unfiled. `delete-project-hierarchy-node` is also
  // an autosave path that fires while the operator drags items around the
  // workspace, and a PIN prompt during ordinary editing teaches people to enter it
  // reflexively, which weakens it everywhere it matters. The bulk save moves with
  // it because the granular delete can remove the same nodes one at a time; gating
  // one and not the other would only be a bypass.
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectHierarchy,
    assistant: { hidden: "The workspace screen saves how items are filed on its own as a person drags them around." },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:SaveProjectHierarchy",
    accessLevel: "Write",
    resource: endpointResource.project(),
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
    assistant: { hidden: "The workspace screen saves one filing change at a time on its own as a person drags items around." },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:PutProjectHierarchyNode",
    accessLevel: "Write",
    resource: endpointResource.project(),
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
    assistant: { hidden: "The workspace screen removes a folder from the sidebar on its own; the items in it are kept." },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:DeleteProjectHierarchyNode",
    accessLevel: "Write",
    resource: endpointResource.project(),
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
