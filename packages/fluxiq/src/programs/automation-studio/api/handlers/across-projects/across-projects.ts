// The reads a client screen makes across every project the caller may see: one
// request each, in place of one per project. A screen such as the panel's Home
// shows the latest runs and the Flow names of all projects, and answering that
// with a call per project makes the page cost grow with the project count.
//
// Both reads are scoped as `listConversations` is: `listProjects(domainId)` is
// the one entitlement for "what may this caller see", and the registry's list
// filter then decides each item on its own project, so a project the caller
// may not list is never in the answer.

import { endpointResource } from "../../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../api-contracts/automation.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";

/** The newest runs read from each project: the API's largest page, as the Runs page reads one project. */
const RUNS_PER_PROJECT = 200;

function listedItems(key: string): (payload: unknown) => unknown[] {
  return (payload) => {
    const found = (payload as Record<string, unknown> | null)?.[key];
    return Array.isArray(found) ? found : [];
  };
}

function itemProject(item: unknown): { kind: "project"; projectId: unknown } {
  return { kind: "project", projectId: (item as { projectId?: unknown } | null)?.projectId };
}

export function registerAcrossProjectEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecentFlowRuns,
    assistant: { hidden: "The same runs as the per-project run listing, newest first from every project at once, for screens such as Home; people ask for their runs." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListRecentFlowRuns",
    accessLevel: "List",
    resource: endpointResource.workspace(),
    list: { items: listedItems("runs"), ref: itemProject, replace: (payload, kept) => ({ ...(payload as object), runs: kept }) },
    handler: async (request) => {
      const { projects } = await service.listProjects(request.scope.domainId);
      const perProject = await Promise.all(projects.map(async (project) => {
        const page = await service.listFlowRunSummaries({ projectId: project.id, limit: RUNS_PER_PROJECT, sort: "started", direction: "desc" });
        return page.runs.map((run) => ({ ...run, projectId: project.id, durableBehaviorChanged: run.durableBehaviorChanged === true }));
      }));
      return { ok: true, payload: { runs: perProject.flat() } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listWorkspaceFlowSummaries,
    assistant: { hidden: "The Flow list of every project at once, each Flow naming its project, for screens that show Flow names across projects; people ask for the Flow list." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListWorkspaceFlowSummaries",
    accessLevel: "List",
    resource: endpointResource.workspace(),
    list: { items: listedItems("flows"), ref: itemProject, replace: (payload, kept) => ({ ...(payload as object), flows: kept }) },
    handler: async (request) => {
      const { projects } = await service.listProjects(request.scope.domainId);
      const perProject = await Promise.all(projects.map(async (project) => (await service.listAutomationFlowSummaries(project.id)).map((flow) => ({ ...flow, projectId: project.id }))));
      return { ok: true, payload: { flows: perProject.flat() } };
    }
  });
}
