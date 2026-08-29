import type { AutomationStudioProjectDataAccess } from "../cache/project-data-access";
import type { AutomationHierarchyNode } from "../hierarchy/model";
import { isPersistableHierarchyNode } from "../model/project-artifacts";
import { automationStudioProjectOpenRequests, automationStudioRuntimeSummaryRequests } from "../model/live-helpers";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import type { AutomationProjectApi } from "./project-api";

export type AutomationProjectHierarchyHydration = {
  customHierarchyNodes: AutomationHierarchyNode[];
  deletedHierarchyIds: string[];
  workspacePrefs?: AutomationWorkspacePrefs;
};

export type AutomationProjectHydration = {
  hierarchy: AutomationProjectHierarchyHydration;
  summary: any | null;
};

export async function loadAutomationProjectHydration(
  api: AutomationProjectApi,
  data: AutomationStudioProjectDataAccess,
  projectId: string,
  signal: AbortSignal
): Promise<AutomationProjectHydration> {
  const [hierarchyRequest] = automationStudioProjectOpenRequests(projectId);
  const [hierarchyResult, summary] = await Promise.all([
    api.post<{ hierarchy: AutomationProjectHierarchyHydration }>(hierarchyRequest.endpoint, hierarchyRequest.payload, { signal }),
    loadAutomationProjectRuntimeSummary(api, data, projectId, signal).catch((error) => {
      if (signal.aborted) throw error;
      return null;
    })
  ]);
  if (signal.aborted || hierarchyResult.aborted) throw abortError();
  if (!hierarchyResult.ok || !hierarchyResult.payload?.hierarchy) {
    throw new Error(hierarchyResult.error ?? "Project could not be opened.");
  }
  return {
    hierarchy: {
      ...hierarchyResult.payload.hierarchy,
      customHierarchyNodes: hierarchyResult.payload.hierarchy.customHierarchyNodes.filter(isPersistableHierarchyNode),
      deletedHierarchyIds: hierarchyResult.payload.hierarchy.deletedHierarchyIds ?? []
    },
    summary
  };
}

export async function loadAutomationProjectRuntimeSummary(
  api: AutomationProjectApi,
  data: AutomationStudioProjectDataAccess,
  projectId: string,
  signal?: AbortSignal
): Promise<any | null> {
  const [request] = automationStudioRuntimeSummaryRequests(projectId);
  const result = await data.readThrough({
    scope: "summary",
    projectId,
    resourceId: "root",
    maxAgeMs: 10_000,
    load: async (dataSignal) => {
      const combined = combineAbortSignals(signal, dataSignal);
      return api.post<{ summary: any }>(request.endpoint, request.payload, { signal: combined.signal })
        .finally(combined.dispose);
    }
  });
  if (signal?.aborted || result?.aborted) throw abortError();
  return result?.ok ? result.payload?.summary ?? null : null;
}

function combineAbortSignals(first: AbortSignal | undefined, second: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  first?.addEventListener("abort", abort, { once: true });
  second.addEventListener("abort", abort, { once: true });
  if (first?.aborted || second.aborted) controller.abort();
  return {
    signal: controller.signal,
    dispose: () => {
      first?.removeEventListener("abort", abort);
      second.removeEventListener("abort", abort);
    }
  };
}

function abortError(): Error {
  const error = new Error("Project hydration was cancelled.");
  error.name = "AbortError";
  return error;
}