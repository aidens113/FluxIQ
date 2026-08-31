"use client";

import { useEffect, useMemo } from "react";
import { useProgramApi } from "../../programs/program-api";
import type { AutomationStudioRuntime } from "../bootstrap/studio-runtime";
import { useAutomationStoreSelector } from "../stores";
import { useAutomationProjectDataPlatform } from "../sync";
import {
  ProgramApiAutomationStudioUiCacheBackend,
  useAutomationStudioUiCache
} from "../workspace/cache";
import { useAutomationLiveCommandScope } from "./command-scope";
import { AutomationLiveDomainCommands } from "./domain-commands";
import { useAutomationHierarchyBrowserPaging } from "./useAutomationHierarchyBrowserPaging";

export function useAutomationStudioFoundation(runtime: AutomationStudioRuntime) {
  const api = useProgramApi("automation-studio");
  const hierarchyPaging = useAutomationHierarchyBrowserPaging(api);
  const requests = runtime.requests;
  const owners = runtime.owners;
  const activeProjectId = useAutomationStoreSelector(
    owners.studioStores.catalog,
    (state) => state.activeProjectId,
    "active-project"
  );
  const uiCacheBackend = useMemo(() => new ProgramApiAutomationStudioUiCacheBackend(api), [api]);
  const uiCache = useAutomationStudioUiCache(uiCacheBackend);
  const projectDataPlatform = useAutomationProjectDataPlatform({
    api,
    projectId: activeProjectId,
    stores: owners.studioStores,
    getCustomHierarchyNodes: () => projectResource<any[]>(owners.studioStores, "customHierarchyNodes", []),
    replaceCustomHierarchyNodes: (nodes) => owners.studioStores.projectData.setResource("customHierarchyNodes", nodes),
    replaceDeletedHierarchyIds: (ids) => owners.studioStores.projectData.setResource("deletedHierarchyIds", ids)
  });
  const liveCommandScope = useAutomationLiveCommandScope(activeProjectId);
  const liveCommands = useMemo(
    () => new AutomationLiveDomainCommands(api, projectDataPlatform, liveCommandScope),
    [api, liveCommandScope, projectDataPlatform]
  );
  useEffect(() => liveCommands.syncProject(), [liveCommands, activeProjectId]);

  return {
    api,
    hierarchyPaging,
    liveCommands,
    liveCommandScope,
    owners,
    projectGeneration: runtime.projectGeneration,
    projectDataPlatform,
    requests,
    activeProjectId,
    uiCache
  };
}

function projectResource<Value>(
  stores: AutomationStudioRuntime["owners"]["studioStores"],
  key: string,
  fallback: Value
): Value {
  const resources = stores.projectData.getState().resources;
  return resources.has(key) ? resources.get(key) as Value : fallback;
}
