"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyGlobalAlert } from "../../programs/shared-ui";
import type { AutomationHierarchyKind, AutomationHierarchyNode } from "../hierarchy/model";
import { normalizeAutomationHierarchyUiState, type AutomationHierarchyUiState } from "../hierarchy/store";
import {
  createAutomationHierarchyUiCoordinator,
  normalizeAutomationHierarchySidebarUiState,
  type AutomationHierarchySidebarUiState
} from "../hierarchy/ui-coordinator";
import { useHierarchyPersistence } from "../hierarchy/useHierarchyPersistence";
import type { useAutomationStudioStoreOwners } from "../stores";
import type { AutomationStudioUiCachePort } from "../workspace/cache";
import type { AutomationWorkspacePrefs } from "../workspace/layout";

type WorkspaceStore = ReturnType<typeof useAutomationStudioStoreOwners>["workspaceRenderStore"];
type Options = {
  transport: Parameters<typeof useHierarchyPersistence>[0]["transport"];
  activeProjectId: string | null;
  loadedProjectId: string | null;
  currentUserId: string;
  getCustomNodes(): AutomationHierarchyNode[];
  getDeletedIds(): string[];
  workspaceStore: WorkspaceStore;
  uiCache: AutomationStudioUiCachePort;
  setSearch: (value: string) => void;
  setTypeFilter: (value: "all" | AutomationHierarchyKind) => void;
};

export function useAutomationHierarchyUiRuntime(options: Options) {
  const [treeState, setTreeState] = useState<AutomationHierarchyUiState | null>(null);
  const treeRef = useRef<AutomationHierarchyUiState | null>(null);
  const filterRef = useRef<{ search: string; typeFilter: "all" | AutomationHierarchyKind }>({ search: "", typeFilter: "all" });
  const coordinator = useMemo(() => createAutomationHierarchyUiCoordinator(), []);
  const persistence = useHierarchyPersistence({
    transport: options.transport,
    projectId: options.activeProjectId,
    loadedProjectId: options.loadedProjectId,
    getCustomNodes: options.getCustomNodes,
    getDeletedIds: options.getDeletedIds,
    getWorkspacePrefs: options.workspaceStore.getPrefs,
    subscribeSaveRequests: (listener) => options.workspaceStore.subscribe(listener, "save-request"),
    setSaveStatus: options.workspaceStore.setSaveStatus,
    reportSaveError: (message) => notifyGlobalAlert({
      tone: "error", title: "Workspace save failed", message, id: "automation-workspace-save-failed"
    })
  });
  const persistTree = useCallback((state: AutomationHierarchyUiState) => {
    treeRef.current = state;
    if (!options.activeProjectId || options.loadedProjectId !== options.activeProjectId) return;
    options.uiCache.scheduleSidebarWrite({
      projectId: options.activeProjectId,
      userId: options.currentUserId,
      sidebar: { ...state, ...filterRef.current },
      delayMs: 400
    });
  }, [options]);
  const persistFilter = useCallback((filter: { search: string; typeFilter: "all" | AutomationHierarchyKind }) => {
    filterRef.current = filter;
    if (!options.activeProjectId || options.loadedProjectId !== options.activeProjectId) return;
    options.uiCache.scheduleSidebarWrite({
      projectId: options.activeProjectId,
      userId: options.currentUserId,
      sidebar: { ...normalizeAutomationHierarchyUiState(treeRef.current), ...filter },
      delayMs: 400
    });
  }, [options]);
  useEffect(() => {
    coordinator.setChangeListener((snapshot) => {
      persistFilter(snapshot.filter);
      persistTree(snapshot.tree);
    });
    return () => coordinator.setChangeListener(undefined);
  }, [coordinator, persistFilter, persistTree]);
  useEffect(() => {
    coordinator.hydrate({ filter: filterRef.current, tree: normalizeAutomationHierarchyUiState(treeState) });
  }, [coordinator, options.activeProjectId, treeState]);
  const hydrate = useCallback((sidebar: AutomationHierarchySidebarUiState) => {
    const next = normalizeAutomationHierarchySidebarUiState(sidebar);
    const tree = normalizeAutomationHierarchyUiState(next);
    treeRef.current = tree;
    filterRef.current = { search: next.search, typeFilter: next.typeFilter };
    options.setSearch(next.search);
    options.setTypeFilter(next.typeFilter);
    setTreeState(tree);
  }, [options.setSearch, options.setTypeFilter]);
  const reset = useCallback(() => {
    treeRef.current = null;
    filterRef.current = { search: "", typeFilter: "all" };
    setTreeState(null);
    persistence.resetPersisted();
  }, [persistence]);
  return { coordinator, hydrate, markPersisted: persistence.markPersisted, reset };
}
