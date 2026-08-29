"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../hierarchy/model";
import type { AutomationProjectCatalogStore } from "../stores";
import type { AutomationProjectApi } from "./project-api";
import { loadAutomationProjectCatalog } from "./project-catalog-queries";

export function useAutomationProjectCatalogLoader(
  api: AutomationProjectApi,
  store: AutomationProjectCatalogStore<AutomationStudioProject, AutomationStudioProjectCategory>
) {
  const controllerRef = useRef<AbortController | null>(null);
  const refreshProjects = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await loadAutomationProjectCatalog(api, store, controller.signal);
    } catch {
      // The catalog store owns the user-facing error state.
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [api, store]);

  useEffect(() => {
    void refreshProjects();
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !store.getState().activeProjectId) void refreshProjects();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refreshProjects, store]);

  return refreshProjects;
}