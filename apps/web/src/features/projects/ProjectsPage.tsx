"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import type { CurrentUser } from "../programs/types";
import { PublishPanelPage, usePanelContext } from "../panel-shell";
import { useProgramTransport } from "../automation-studio/data/use-program-transport";
import { createAutomationProjectCatalogStore, useAutomationStoreSelector } from "../automation-studio/stores";
import { createAutomationStudioUiStore } from "../automation-studio/workspace/studio-ui-store";
import type { AutomationStudioProject, AutomationStudioProjectCategory } from "../automation-studio/hierarchy/model";
import { AutomationProjectCatalogSurface, useAutomationProjectCatalogLoader } from "../automation-studio/project";
import { useProjectsChangedSync } from "./use-projects-changed-sync";
import "./projects-page.css";

/** Creating, renaming and moving a project asks for no PIN in the panel; only deleting does, and it is not offered here. */
const PANEL_PERSON: CurrentUser = { id: "panel", displayName: "", roleId: "", totpEnabled: false, pinConfigured: false };

/** The Projects place: the project catalog, where a person creates, renames and opens a project. Opening one makes it the panel's project. */
export function ProjectsPage() {
  const studio = useProgramTransport("automation-studio");
  const router = useRouter();
  const { dispatch } = usePanelContext();
  const catalogRef = useRef<ReturnType<typeof createAutomationProjectCatalogStore<AutomationStudioProject, AutomationStudioProjectCategory>> | null>(null);
  const uiRef = useRef<ReturnType<typeof createAutomationStudioUiStore> | null>(null);
  if (!catalogRef.current) catalogRef.current = createAutomationProjectCatalogStore<AutomationStudioProject, AutomationStudioProjectCategory>();
  if (!uiRef.current) uiRef.current = createAutomationStudioUiStore();
  const catalog = catalogRef.current;
  const refresh = useAutomationProjectCatalogLoader(studio, catalog);
  // A create, rename or removal here changes the catalog; the top bar and the dock read the list again.
  const projects = useAutomationStoreSelector(catalog, (state) => state.projects);
  // A project made elsewhere (the top bar picker) shows here at once, without a reload.
  const announce = useProjectsChangedSync(() => void refresh());
  const seen = useRef<unknown>(null);
  useEffect(() => {
    if (seen.current !== null && seen.current !== projects) announce();
    seen.current = projects;
  }, [projects, announce]);
  const open = useCallback((projectId: string) => {
    dispatch({ type: "project", projectId });
    router.push("/flows");
  }, [dispatch, router]);
  return (
    <div className="projects-page">
      <PublishPanelPage page="projects" />
      <AutomationProjectCatalogSurface
        api={studio}
        catalog={catalog}
        currentUser={PANEL_PERSON}
        onOpenProject={open}
        refreshProjects={() => void refresh()}
        studioUiStore={uiRef.current}
      />
    </div>
  );
}
