"use client";

import { useEffect, useMemo } from "react";
import { useProgramApi } from "../../programs/program-api";
import { useAutomationFlowProjectState } from "../flow-editor/useAutomationFlowProjectState";
import { useAutomationHierarchyWorkspaceState } from "../hierarchy/useAutomationHierarchyWorkspaceState";
import { useRequestCoordinator } from "../project/request-coordinator";
import { useAutomationRecordingProjectState } from "../recordings/useAutomationRecordingProjectState";
import { useAutomationRuntimeProjectState } from "../runtime/useAutomationRuntimeProjectState";
import { useAutomationRuntimeStatusState } from "../runtime/useAutomationRuntimeStatusState";
import { useAutomationStateProjectState } from "../state/useAutomationStateProjectState";
import {
  useAutomationProjectShellStore,
  useAutomationSelectionState,
  useAutomationStudioStoreOwners
} from "../stores";
import { useAutomationProjectDataPlatform } from "../sync";
import {
  ProgramApiAutomationStudioUiCacheBackend,
  useAutomationStudioUiCache
} from "../workspace/cache";
import { useAutomationLiveCommandScope } from "./command-scope";
import { AutomationLiveDomainCommands } from "./domain-commands";
import { useAutomationHierarchyBrowserPaging } from "./useAutomationHierarchyBrowserPaging";

export function useAutomationStudioFoundation() {
  const api = useProgramApi("automation-studio");
  const hierarchyPaging = useAutomationHierarchyBrowserPaging(api);
  const requests = useRequestCoordinator();
  const owners = useAutomationStudioStoreOwners();
  const shell = useAutomationProjectShellStore(owners.studioStores);
  const hierarchy = useAutomationHierarchyWorkspaceState();
  const flowProject = useAutomationFlowProjectState(owners.studioStores);
  const recordingProject = useAutomationRecordingProjectState(owners.studioStores);
  const runtimeProject = useAutomationRuntimeProjectState(owners.studioStores);
  const stateProject = useAutomationStateProjectState(owners.studioStores);
  const runtimeStatus = useAutomationRuntimeStatusState(owners.studioStores);
  const selection = useAutomationSelectionState(owners.studioStores);
  const uiCacheBackend = useMemo(() => new ProgramApiAutomationStudioUiCacheBackend(api), [api]);
  const uiCache = useAutomationStudioUiCache(uiCacheBackend);
  const projectDataPlatform = useAutomationProjectDataPlatform({
    api,
    projectId: shell.activeProjectId,
    stores: owners.studioStores,
    customHierarchyNodes: hierarchy.customHierarchyNodes,
    deletedHierarchyIds: hierarchy.deletedHierarchyIds,
    replaceCustomHierarchyNodes: hierarchy.setCustomHierarchyNodes,
    replaceDeletedHierarchyIds: hierarchy.setDeletedHierarchyIds
  });
  const liveCommandScope = useAutomationLiveCommandScope(shell.activeProjectId);
  const liveCommands = useMemo(
    () => new AutomationLiveDomainCommands(api, projectDataPlatform, liveCommandScope),
    [api, liveCommandScope, projectDataPlatform]
  );
  useEffect(() => liveCommands.syncProject(), [liveCommands, shell.activeProjectId]);

  return {
    api,
    flow: {
      ...flowProject,
      automationActionStatus: runtimeStatus.automationActionStatus,
      setAutomationActionStatus: runtimeStatus.setAutomationActionStatus,
      flowRunState: runtimeStatus.flowRunState,
      setFlowRunState: runtimeStatus.setFlowRunState
    },
    hierarchy,
    hierarchyPaging,
    liveCommands,
    liveCommandScope,
    owners,
    projectDataPlatform,
    recording: {
      ...recordingProject,
      recordingTreePrimaryKind: selection.recordingTreePrimaryKind,
      setRecordingTreePrimaryKind: selection.setRecordingTreePrimaryKind,
      recordingProcessing: runtimeStatus.recordingProcessing,
      setRecordingProcessing: runtimeStatus.setRecordingProcessing
    },
    requests,
    runtime: runtimeProject,
    shell,
    state: {
      ...stateProject,
      selection: selection.selection,
      setSelection: selection.setSelection,
      pendingStateOpen: selection.pendingStateOpen,
      setPendingStateOpen: selection.setPendingStateOpen,
      bottomPreviewEntryId: selection.bottomPreviewEntryId,
      setBottomPreviewEntryId: selection.setBottomPreviewEntryId
    },
    uiCache
  };
}