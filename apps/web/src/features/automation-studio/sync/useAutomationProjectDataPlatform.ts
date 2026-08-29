"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AutomationStudioCacheScope, AutomationStudioCacheStats } from "../cache/data-cache";
import { AutomationStudioProjectDataAccess, type ProjectDataRequest } from "../cache/project-data-access";
import type { AutomationHierarchyNode } from "../hierarchy/model";
import {
  loadAutomationProjectHydration,
  loadAutomationProjectRuntimeSummary,
  type AutomationProjectHydration
} from "../project/project-hydration";
import type { AutomationProjectApi } from "../project/project-api";
import type { AutomationStudioStores } from "../stores/studio-stores";
import type { AutomationStudioLazyPreloaderInput } from "./lazy-preloader";
import { useAutomationStudioLazyPreloader } from "./lazy-preloader";
import { applyAutomationProjectInvalidations } from "./project-invalidation";
import { AutomationProjectRevalidator } from "./project-revalidation";
import type { AutomationStudioProjectChangePage } from "./project-sync";
import { useProjectSynchronization } from "./useProjectSynchronization";

export type AutomationProjectDataPlatform = {
  openProject(projectId: string): void;
  closeProject(projectId?: string | null): void;
  readThrough<Value>(request: ProjectDataRequest<Value>): Promise<Value | undefined>;
  remember<Value>(projectId: string, scope: AutomationStudioCacheScope, resourceId: string, value: Value): Value | undefined;
  notifyMutation(scopes: readonly AutomationStudioCacheScope[], resourceIds?: readonly string[]): void;
  loadHydration(projectId: string, signal: AbortSignal): Promise<AutomationProjectHydration>;
  loadRuntimeSummary(projectId: string, signal?: AbortSignal): Promise<any | null>;
  stats(): AutomationStudioCacheStats;
};

export function useAutomationProjectDataPlatform(options: {
  api: AutomationProjectApi;
  projectId: string | null;
  stores: AutomationStudioStores;
  customHierarchyNodes: AutomationHierarchyNode[];
  deletedHierarchyIds: string[];
  replaceCustomHierarchyNodes(nodes: AutomationHierarchyNode[]): void;
  replaceDeletedHierarchyIds(ids: string[]): void;
}): AutomationProjectDataPlatform {
  const dataRef = useRef<AutomationStudioProjectDataAccess | null>(null);
  if (!dataRef.current) dataRef.current = new AutomationStudioProjectDataAccess();
  const data = dataRef.current;
  const hierarchyRef = useRef(options.customHierarchyNodes);
  const replaceHierarchyRef = useRef(options.replaceCustomHierarchyNodes);
  const replaceDeletedHierarchyRef = useRef(options.replaceDeletedHierarchyIds);
  hierarchyRef.current = options.customHierarchyNodes;
  replaceHierarchyRef.current = options.replaceCustomHierarchyNodes;
  replaceDeletedHierarchyRef.current = options.replaceDeletedHierarchyIds;
  const revalidator = useMemo(() => new AutomationProjectRevalidator({
    api: options.api,
    data,
    stores: options.stores,
    hierarchy: {
      replace: (nodes, deletedIds) => {
        replaceHierarchyRef.current(nodes);
        replaceDeletedHierarchyRef.current(deletedIds);
      }
    }
  }), [data, options.api, options.stores]);

  const synchronization = useProjectSynchronization({
    projectId: options.projectId,
    fetchPage: async ({ projectId, afterSequence, limit, signal }) => {
      const result = await options.api.post<AutomationStudioProjectChangePage>(
        "list-project-change-feed",
        { projectId, afterSequence, limit },
        { signal }
      );
      if (!result.ok || !result.payload) throw new Error(result.error ?? "Project change feed could not be loaded.");
      return result.payload;
    },
    onInvalidations: (invalidations) => {
      const projectId = invalidations[0]?.projectId ?? "";
      applyAutomationProjectInvalidations({
        projectId,
        invalidations,
        data,
        stores: options.stores,
        hierarchy: {
          getNodes: () => hierarchyRef.current,
          replaceNodes: (nodes) => replaceHierarchyRef.current(nodes)
        }
      });
      void revalidator.revalidate(projectId, invalidations);
    },
    ...(typeof window === "undefined" ? {} : { mutationTarget: window })
  });

  useEffect(() => {
    if (options.projectId) data.open(options.projectId);
    else data.close();
    return () => data.close(options.projectId);
  }, [data, options.projectId]);
  useEffect(() => () => data.dispose(), [data]);

  const openProject = useCallback((projectId: string) => data.open(projectId), [data]);
  const closeProject = useCallback((projectId?: string | null) => {
    synchronization.close(projectId ?? undefined);
    data.close(projectId);
  }, [data, synchronization]);
  const notifyMutation = useCallback((scopes: readonly AutomationStudioCacheScope[], resourceIds: readonly string[] = []) => {
    const projectId = data.projectId;
    if (!projectId) return;
    data.invalidate(projectId, scopes, resourceIds);
    synchronization.notifyMutation();
  }, [data, synchronization]);

  return useMemo(() => ({
    openProject,
    closeProject,
    readThrough: <Value,>(request: ProjectDataRequest<Value>) => data.readThrough(request),
    remember: <Value,>(projectId: string, scope: AutomationStudioCacheScope, resourceId: string, value: Value) => data.remember(projectId, scope, resourceId, value),
    notifyMutation,
    loadHydration: (projectId: string, signal: AbortSignal) => loadAutomationProjectHydration(options.api, data, projectId, signal),
    loadRuntimeSummary: (projectId: string, signal?: AbortSignal) => loadAutomationProjectRuntimeSummary(options.api, data, projectId, signal),
    stats: () => data.stats()
  }), [closeProject, data, notifyMutation, openProject, options.api]);
}

export function useAutomationProjectPreload(
  api: AutomationProjectApi,
  input: AutomationStudioLazyPreloaderInput
): void {
  useAutomationStudioLazyPreloader(api, input);
}