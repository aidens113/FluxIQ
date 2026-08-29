"use client";

import { useCallback } from "react";
import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../hierarchy/model";
import type { AutomationStudioStores } from "./studio-stores";
import { useAutomationStoreSelector } from "./use-store-selector";

export function useAutomationProjectShellStore(stores: AutomationStudioStores) {
  const snapshot = useAutomationStoreSelector(
    stores.projectData,
    (state) => state.resources.get("snapshot") ?? null,
    "resource:snapshot"
  ) as any;
  const setSnapshot = useCallback((value: any) => {
    stores.projectData.setResource("snapshot", value);
  }, [stores]);
  return {
    snapshot,
    setSnapshot,
    projects: useAutomationStoreSelector(stores.catalog, (state) => state.projects, "projects") as readonly AutomationStudioProject[],
    projectCategories: useAutomationStoreSelector(stores.catalog, (state) => state.categories, "categories") as readonly AutomationStudioProjectCategory[],
    projectsLoaded: useAutomationStoreSelector(stores.catalog, (state) => state.loaded, "status"),
    projectCatalogError: useAutomationStoreSelector(stores.catalog, (state) => state.error, "status"),
    activeProjectId: useAutomationStoreSelector(stores.catalog, (state) => state.activeProjectId, "active-project")
  };
}