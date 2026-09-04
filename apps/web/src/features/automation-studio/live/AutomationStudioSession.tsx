"use client";
import { useCallback, useEffect, useMemo } from "react";
import { createAutomationHierarchyCommandExecutor } from "../hierarchy/command-executor";
import { createAutomationHierarchyDialogStore } from "../hierarchy/dialog-store";
import type { AutomationWorkspaceBreadcrumb } from "../workspace/shell/contracts";
import { automationWorkspaceViewStateForBase } from "../workspace/view-state";
import { automationStudioViewBaseId, automationStudioViewDefinition, automationStudioViewId, automationStudioViewObjectId } from "../views/view-registry";
import { AutomationStudioProjectGate } from "./AutomationStudioProjectGate";
import {
  automationEntityCollectionSelector,
  useAutomationProjectResource,
  useAutomationStoreSelector,
  type AutomationProjectEntityKind
} from "../stores";
import { useAutomationProjectCatalogLoader } from "../project";
import type { AutomationSelection } from "../shared/selection-contracts";
import { useAutomationNarrowWorkspace } from "../workspace/studio-ui-store";
import type { AutomationStudioRuntime } from "../bootstrap/studio-runtime";
import { useAutomationProjectPreload } from "../sync";
import { useAutomationGatewayRecordingBridge } from "./use-gateway-recording-bridge";
import type { CurrentUser } from "../../programs/types";
import { notifyGlobalAlert } from "../../programs/shared-ui";
import { useAutomationStudioFoundation } from "./useAutomationStudioFoundation";
import { useAutomationBrowserEntry } from "./useAutomationBrowserEntry";
import { useAutomationWorkspaceRuntime } from "./useAutomationWorkspaceRuntime";
import { useAutomationHierarchyUiRuntime } from "./useAutomationHierarchyUiRuntime";
import { useAutomationHierarchyCommandBridge } from "./useAutomationHierarchyCommandBridge";
import { useAutomationProjectRuntime } from "./useAutomationProjectRuntime";
import { createAutomationStudioViewInstances } from "../views/view-instances";
import { useAutomationGraphRuntime } from "./useAutomationGraphRuntime";
import { useAutomationSelectionNavigation } from "./useAutomationSelectionNavigation";
import { useAutomationRecordingCommands } from "./useAutomationRecordingCommands";
import { useAdaptationWorkspaceNavigation } from "./useAdaptationWorkspaceNavigation";
import { useAutomationExternalLifecycle } from "./useAutomationExternalLifecycle";
import { useAutomationDeepLinkRuntime } from "./useAutomationDeepLinkRuntime";
import { AutomationStudioWorkspaceComposition } from "./AutomationStudioWorkspaceComposition";
import { useAutomationSessionDirtyGuards } from "./useAutomationSessionDirtyGuards";
import { useStableAutomationEvent } from "./useStableAutomationEvent";
import {
  automationWorkspaceViewRegistrationEqual,
  selectAutomationWorkspaceViewRegistration
} from "./workspace-view-registration";
import { useAutomationWorkspaceSelector } from "../workspace/shell/selectors";
import { runAutomationPresentationTransaction } from "../presentation/transaction";
import type { AutomationCanonicalConnectorScope } from "./view-host/canonical-connected-views";
import { useAutomationConnectedViewEntries, useAutomationConnectedViewSource } from "./view-host/connected-view-entries";
import { useAutomationConnectorCommands } from "./view-host/useAutomationConnectorCommands";
import {
  AutomationStudioConnectedHierarchy,
  AutomationStudioConnectedTimeline
} from "./AutomationStudioConnectedRegions";
import { listProjectProblems } from "../problems/problem-queries";
import {
  EMPTY_AUTOMATION_GATEWAY_SNAPSHOT,
  EMPTY_AUTOMATION_LIST,
  EMPTY_AUTOMATION_PROJECT_ARTIFACTS,
  EMPTY_AUTOMATION_RECORD
} from "./session-project-view";
import { createAutomationProjectViewModelCache } from "../model/project-view-model-cache";
import {
  automationFlowEntryId,
  automationRecordingId,
  automationRunId,
  automationTimelineId,
  createAutomationSessionStoreCommands
} from "./session-store-commands";
export function AutomationStudioSession(props: {
  currentUser: CurrentUser;
  runtime: AutomationStudioRuntime;
}) {
  const { currentUser, runtime } = props; const foundation = useAutomationStudioFoundation(runtime);
  const { api, hierarchyPaging, liveCommands, liveCommandScope, projectDataPlatform, uiCache } = foundation;
  const { deepLink, pathname, searchSignature } = useAutomationBrowserEntry();
  const { studioStores, studioUiStore, workspaceRenderStore } = foundation.owners;
  const activeProjectId = foundation.activeProjectId;
  const catalogState = useAutomationStoreSelector(
    studioStores.catalog,
    (state) => ({
      projects: state.projects,
      loaded: state.loaded,
      error: state.error
    }),
    "status",
    (left, right) => left.projects === right.projects && left.loaded === right.loaded && left.error === right.error
  );
  const projects = catalogState.projects;
  const projectsLoaded = catalogState.loaded;
  const projectCatalogError = catalogState.error;
  const dataState = studioStores.projectData.getState();
  const selectionState = studioStores.selection.getState();
  const runtimeStatusState = studioStores.runtimeStatus.getState();
  const resource = <Value,>(key: string, fallback: Value): Value => (
    dataState.resources.has(key) ? dataState.resources.get(key) as Value : fallback
  );
  const entities = <Value,>(kind: AutomationProjectEntityKind): Value[] => (
    automationEntityCollectionSelector(kind)(dataState) as Value[]
  );
  const storeCommands = useMemo(() => createAutomationSessionStoreCommands(studioStores), [studioStores]);
  const snapshot = resource<any | null>("snapshot", null);
  const setSnapshot = storeCommands.resource<any>("snapshot");
  const loadedProjectHierarchyId = resource<string | null>("loadedProjectHierarchyId", null);
  const setLoadedProjectHierarchyId = storeCommands.resource<string | null>("loadedProjectHierarchyId");
  const projectSearch = resource("projectSearch", "");
  const setProjectSearch = storeCommands.resource<string>("projectSearch");
  const projectTypeFilter = resource<any>("projectTypeFilter", "all");
  const setProjectTypeFilter = storeCommands.resource<any>("projectTypeFilter");
  const customHierarchyNodes = resource<any[]>("customHierarchyNodes", EMPTY_AUTOMATION_LIST);
  const setCustomHierarchyNodes = storeCommands.resource<any[]>("customHierarchyNodes");
  const deletedHierarchyIds = resource<string[]>("deletedHierarchyIds", EMPTY_AUTOMATION_LIST);
  const setDeletedHierarchyIds = storeCommands.resource<string[]>("deletedHierarchyIds");
  const projectArtifacts = resource<any>("projectArtifacts", EMPTY_AUTOMATION_PROJECT_ARTIFACTS);
  const setProjectArtifacts = storeCommands.resource<any>("projectArtifacts");
  const projectFlows = entities<any>("flows");
  const setProjectFlows = storeCommands.entities<any>("flows", automationFlowEntryId);
  const nativeNodeDefinitions = resource<any[]>("nativeNodeDefinitions", EMPTY_AUTOMATION_LIST);
  const setNativeNodeDefinitions = storeCommands.resource<any[]>("nativeNodeDefinitions");
  const publishedFlowDefinitions = resource<any[]>("publishedFlowDefinitions", EMPTY_AUTOMATION_LIST);
  const setPublishedFlowDefinitions = storeCommands.resource<any[]>("publishedFlowDefinitions");
  const automationActionStatus = runtimeStatusState.actionStatus;
  const setAutomationActionStatus = storeCommands.actionStatus;
  const flowRunState = runtimeStatusState.flowRunState as any;
  const setFlowRunState = storeCommands.flowRunState;
  const hasDirtyTaskGraph = useAutomationProjectResource(studioStores, "hasDirtyTaskGraph", false);
  const setHasDirtyTaskGraph = storeCommands.resource<boolean>("hasDirtyTaskGraph");
  const taskGraphDrafts = resource<Record<string, { nodes: any[]; edges: any[] }>>("taskGraphDrafts", EMPTY_AUTOMATION_RECORD);
  const setTaskGraphDrafts = storeCommands.resource<Record<string, { nodes: any[]; edges: any[] }>>("taskGraphDrafts");
  const projectRecordings = entities<any>("recordings");
  const setProjectRecordings = storeCommands.entities<any>("recordings", automationRecordingId);
  const projectTimelines = entities<any>("timelines");
  const setProjectTimelines = storeCommands.entities<any>("timelines", automationTimelineId);
  const recordingDomains = resource<any[]>("recordingDomains", EMPTY_AUTOMATION_LIST);
  const setRecordingDomains = storeCommands.resource<any[]>("recordingDomains");
  const recordingTreePrimaryKind = selectionState.recordingPrimaryKind;
  const setRecordingTreePrimaryKind = storeCommands.recordingPrimaryKind;
  const recordingProcessing = runtimeStatusState.recordingProcessing as any;
  const setRecordingProcessing = storeCommands.recordingProcessing;
  const runtimeSessions = entities<any>("runs");
  const setRuntimeSessions = storeCommands.entities<any>("runs", automationRunId);
  const pipelineArtifacts = resource<any>("pipelineArtifacts", EMPTY_AUTOMATION_RECORD);
  const setPipelineArtifacts = storeCommands.resource<any>("pipelineArtifacts");
  const gatewaySnapshot = resource<any>("gatewaySnapshot", EMPTY_AUTOMATION_GATEWAY_SNAPSHOT);
  const setGatewaySnapshot = storeCommands.resource<any>("gatewaySnapshot");
  const indexedStateSources = resource<Record<string, any>>("indexedStateSources", EMPTY_AUTOMATION_RECORD);
  const setIndexedStateSources = storeCommands.resource<Record<string, any>>("indexedStateSources");
  const selection = selectionState.selection;
  const setSelection = storeCommands.selection;
  const setPendingStateOpen = storeCommands.pendingStateOpen;
  const setBottomPreviewEntryId = storeCommands.bottomPreview;
  const { runLatest, cancelAll: cancelAllRequests } = foundation.requests;
  const urlProjectId = deepLink.projectId;
  const workspaceViewRegistration = useAutomationWorkspaceSelector(
    workspaceRenderStore,
    selectAutomationWorkspaceViewRegistration,
    automationWorkspaceViewRegistrationEqual
  );
  const workspacePrefs = workspaceRenderStore.getPrefs();
  const { isNarrowWorkspace, narrowWorkspacePanel, setIsNarrowWorkspace, setNarrowWorkspacePanel } = useAutomationNarrowWorkspace(studioUiStore);const hierarchyDialogStore = useMemo(createAutomationHierarchyDialogStore, []);
  const hierarchyCommandExecutor = useMemo(createAutomationHierarchyCommandExecutor, []);
  const workspaceRuntime = useAutomationWorkspaceRuntime({
    transport: api,
    activeProjectId,
    currentUserId: currentUser.id,
    loadedProjectHierarchyId,
    constrained: isNarrowWorkspace,
    uiCache,
    workspaceRenderStore
  });
  const {
    commands: workspaceCommands,
    port: workspaceCommandPort,
    replacePrefs: replaceWorkspaceRenderPrefs,
    resetCachedPrefs: resetCachedWorkspacePrefs,
    schedule: scheduleWorkspaceNavigation,
    updatePrefs: updateWorkspacePrefs,
    warm: warmWorkspaceViews
  } = workspaceRuntime;

  const hierarchyUi = useAutomationHierarchyUiRuntime({
    transport: api,
    activeProjectId,
    loadedProjectId: loadedProjectHierarchyId,
    currentUserId: currentUser.id,
    getCustomNodes: () => studioStores.projectData.getState().resources.get("customHierarchyNodes") as any[] ?? [],
    getDeletedIds: () => studioStores.projectData.getState().resources.get("deletedHierarchyIds") as string[] ?? [],
    workspaceStore: workspaceRenderStore,
    uiCache,
    setSearch: setProjectSearch,
    setTypeFilter: setProjectTypeFilter
  });
  const hierarchyUiCoordinator = hierarchyUi.coordinator;
  const projectRuntime = useAutomationProjectRuntime({
    currentUserId: currentUser.id,
    pathname,
    activeProjectId,
    urlProjectId,
    foundation: {
      projectDataPlatform,
      projectGeneration: foundation.projectGeneration,
      uiCache,
      liveCommands,
      requests: foundation.requests,
      stores: studioStores
    },
    hierarchy: {
      getUiRevision: hierarchyUi.coordinator.getRevision,
      setLoadedProjectId: setLoadedProjectHierarchyId,
      setCustomNodes: setCustomHierarchyNodes,
      setDeletedIds: setDeletedHierarchyIds,
      hydrateSidebar: hierarchyUi.hydrate,
      markPersisted: hierarchyUi.markPersisted,
      reset: hierarchyUi.reset
    },
    workspace: {
      getPrefsRevision: () => workspaceRenderStore.getRevision("prefs"),
      replacePrefs: replaceWorkspaceRenderPrefs,
      resetCachedPrefs: resetCachedWorkspacePrefs
    },
    data: {
      setDirty: setHasDirtyTaskGraph,
      setProjectRecordings,
      setPipelineArtifacts,
      setProjectFlows,
      setRuntimeSessions,
      setNativeNodeDefinitions,
      setPublishedFlowDefinitions,
      setProjectTimelines
    },
    schedule: scheduleWorkspaceNavigation
  });
  const { openProject, closeProject, loadFlowDetails, loadNodeDefinitions, loadRecording: loadRecordingDetails,
    loadTimeline: loadLatestNormalizedTimeline, notifyChanged: notifyProjectDataChanged,
    refreshRuntime: refreshProjectRuntimeState } = projectRuntime;

  const refreshProjects = useAutomationProjectCatalogLoader(api, studioStores.catalog);
  const projectViewCache = useMemo(() => {
    return createAutomationProjectViewModelCache({
      activeProjectId,
      stores: studioStores,
      workspace: workspaceRenderStore
    });
  }, [activeProjectId, studioStores, workspaceRenderStore]);
  const getProjectView = projectViewCache.read;
  const projectView = getProjectView();
  const activeViewId = workspaceViewRegistration.activeViewId ?? automationStudioViewId.flowEditor;
  const openWorkspaceViewIdList = workspaceViewRegistration.openViewIds;
  const openWorkspaceViewIds = new Set(openWorkspaceViewIdList);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const restoringUrlProject = Boolean(
    urlProjectId
    && !activeProject
    && !projectCatalogError
    && (!projectsLoaded || activeProjectId === urlProjectId)
  );
  const {
    recordings, timelines, registries, models, proposals, recordingFlowProposals, hierarchyProposals,
    policies, snapshotProblems, signals, availableNodeDefinitions, indexedStateSourceList, projectTasks,
    selectedFlowEntry, selectedFlow, runnableFlowEntry, runnableFlow, selectionProposalId,
    selectionRecordingIdForProposal, selectedProposal, selectedTask, selectedTaskFlow, projectFlowUrlScopeSignature,
    selectedTaskGraph, selectedCanonicalPolicy, selectedPolicy, selectedRecordingId, selectedRecording,
    selectedTimeline, selectedNode, selectedEntry, selectedSignal, selectedTimelineEntries, selectedRecordingNotes,
    hierarchyNodes, indexes: projectEntityIndexes, activeFlowScope, breadcrumbFlow, breadcrumbSubflow,
    viewLabelForSelection, viewWithTitleData, flowForSelection, recordingForSelection, proposalForSelection,
    taskForSelection, policyForSelection, workspaceBreadcrumbsForView
  } = projectView;
  const openWorkspaceViewKey = openWorkspaceViewIdList.join("\u001f");
  const viewInstances = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const instanceId of openWorkspaceViewIdList) {
      const objectId = automationStudioViewObjectId(instanceId);
      if (!objectId) continue;
      const definition = automationStudioViewDefinition(instanceId, { hasFlow: true });
      const entry = projectEntityIndexes.canonicalFlowEntryById.get(objectId);
      const flow = entry?.flow ?? entry;
      labels[instanceId] = `${definition?.label ?? automationStudioViewBaseId(instanceId)}: ${flow?.name ?? objectId}`;
    }
    return createAutomationStudioViewInstances(labels, openWorkspaceViewIdList);
  }, [openWorkspaceViewKey, projectEntityIndexes.canonicalFlowEntryById]);
  const viewById = new Map(viewInstances.map((view) => [view.id, view]));
  useAutomationExternalLifecycle({
    actionStatus: automationActionStatus,
    activeProjectName: activeProject?.name ?? null,
    selectionKey: selection ? selection.kind + ":" + selection.id : "none",
    setNarrow: setIsNarrowWorkspace,
    narrowPanel: narrowWorkspacePanel,
    setNarrowPanel: setNarrowWorkspacePanel
  });
  const graphRuntime = useAutomationGraphRuntime({
    activeProjectId,
    activeViewId,
    workspacePrefs,
    selectedTaskGraph,
    selectedFlow,
    selectedFlowEntry,
    availableNodeDefinitions,
    snapshotProblems,
    taskGraphDrafts,
    liveCommands,
    setTaskGraphDrafts,
    setProjectFlows,
    setDirty: setHasDirtyTaskGraph,
    setActionStatus: setAutomationActionStatus,
    notifyChanged: projectRuntime.notifyChanged,
    reloadFlowDetail: (flowId) => loadFlowDetails(flowId, { refresh: true }),
    getSnapshot: () => {
      const current = getProjectView();
      const resources = studioStores.projectData.getState().resources;
      return {
        activeProjectId: studioStores.catalog.getState().activeProjectId,
        selectedTaskGraph: current.selectedTaskGraph,
        selectedFlow: current.selectedFlow,
        selectedFlowEntry: current.selectedFlowEntry,
        availableNodeDefinitions: current.availableNodeDefinitions,
        snapshotProblems: (resources.get("snapshot") as any)?.payload?.problems ?? [],
        taskGraphDrafts: resources.get("taskGraphDrafts") as any ?? {}
      };
    }
  });
  const activePreloadRunId = typeof flowRunState.runId === "string"
    ? flowRunState.runId
    : typeof runtimeSessions[0]?.runId === "string" ? runtimeSessions[0].runId : null;
  useAutomationProjectPreload(api, {
    projectId: activeProjectId,
    activeFlowId: selectedFlowEntry?.source === "canonical" ? selectedFlow?.flowId ?? null : null,
    activeRunId: activePreloadRunId,
    openViewIds: openWorkspaceViewIdList.map(automationStudioViewBaseId)
  });
  const selectedTaskGraphDraft = graphRuntime.draft;
  const baseTaskGraphDocument = graphRuntime.baseGraph;
  const problems = graphRuntime.problems;
  const recoverableTaskGraphDraftView = graphRuntime.recoverableDraft;
  const navigation = useAutomationSelectionNavigation({
    activeProjectId,
    workspacePrefs,
    commands: workspaceCommands,
    updatePrefs: updateWorkspacePrefs,
    liveCommands,
    selection,
    selectedNode,
    selectedFlow,
    selectedProposal,
    selectedRecording,
    selectedTimeline,
    timelineEntryById: projectEntityIndexes.timelineEntryById,
    setSelection,
    setPendingStateOpen,
    setBottomPreviewEntryId,
    setRecordingPrimaryKind: setRecordingTreePrimaryKind,
    setIndexedStateSources,
    setActionStatus: setAutomationActionStatus,
    getSnapshot: () => {
      const current = getProjectView();
      return {
        activeProjectId: studioStores.catalog.getState().activeProjectId,
        workspacePrefs: workspaceRenderStore.getPrefs(),
        selection: studioStores.selection.getState().selection,
        selectedNode: current.selectedNode,
        selectedFlow: current.selectedFlow,
        selectedProposal: current.selectedProposal,
        selectedRecording: current.selectedRecording,
        selectedTimeline: current.selectedTimeline,
        timelineEntryById: current.indexes.timelineEntryById
      };
    }
  });
  const setSelectionAndFollow = navigation.selectAndFollow;
  const openStateView = navigation.openState;
  const openTimelineEntryState = navigation.openTimelineEntryState;
  const handleBottomPreviewActionClick = navigation.selectPreviewEntry;
  const openSubflowInEditor = navigation.openSubflow;
  const openView = navigation.openView;
  const publishGatewayBlocked = useStableAutomationEvent((blocked: any) => {
    notifyGlobalAlert({
      tone: "warning",
      title: "Recording cannot start",
      message: blocked.message ?? "Recording cannot start because Automation Studio does not have an open project.",
      id: "recording-blocked:" + blocked.id
    });
  });
  const publishGatewayTransition = useStableAutomationEvent(async (transition: { kind: "live" | "stopped"; recordingId: string }) => {
    const recordingId = transition.recordingId;
    notifyProjectDataChanged(["recording", "timeline", "summary"], [recordingId]);
    setSelection({ kind: "recording", id: recordingId });
    setRecordingTreePrimaryKind("recording");
    openView(automationStudioViewId.recordingTimeline, "preview");
    if (transition.kind === "live") {
      setAutomationActionStatus("Recording " + recordingId + " is live.");
      return;
    }
    setRecordingProcessing({
      recordingId,
      label: "Recording stopped",
      detail: "Loading the finalized recording as optional Flow evidence.",
      progress: 12
    });
    setAutomationActionStatus("Recording stopped. Loading final timeline...");
    setRecordingProcessing((current: any) => current?.recordingId === recordingId ? null : current);
    setAutomationActionStatus("Recording stopped. The finalized recording is available as Flow evidence.");
  });
  useAutomationGatewayRecordingBridge({
    projectId: activeProjectId,
    scopes: liveCommandScope,
    snapshot: gatewaySnapshot,
    publishSnapshot: setGatewaySnapshot,
    publishBlocked: publishGatewayBlocked,
    publishTransition: publishGatewayTransition
  });
  useAutomationDeepLinkRuntime({
    deepLink,
    searchSignature,
    activeProjectId,
    loadedProjectId: loadedProjectHierarchyId,
    activeViewId,
    projectFlowSignature: projectFlowUrlScopeSignature,
    projectFlows,
    selection,
    selectedFlow,
    lastOpenFlowId: typeof automationWorkspaceViewStateForBase(workspacePrefs, automationStudioViewId.flowEditor)?.lastOpenFlowId === "string"
      ? automationWorkspaceViewStateForBase(workspacePrefs, automationStudioViewId.flowEditor)?.lastOpenFlowId as string
      : null,
    flowById: projectEntityIndexes.flowById,
    loadFlow: loadFlowDetails,
    openSubflow: navigation.openSubflow,
    selectFlow: navigation.selectAndFollow,
    openView: navigation.openView
  });  useEffect(() => {
    if (!activeProjectId || !projectRecordings.length) return;
    setDeletedHierarchyIds((current) => {
      const cleaned = current.filter((id) => !id.startsWith("recordings-client-") && !id.startsWith("proposals-client-") && !id.startsWith("proposals-recording-"));
      return cleaned.length === current.length ? current : cleaned;
    });
  }, [activeProjectId, projectRecordings]);
  const recordingCommands = useAutomationRecordingCommands({
    liveCommands,
    selection,
    getSelection: () => studioStores.selection.getState().selection,
    setActionStatus: setAutomationActionStatus,
    setProjectRecordings,
    setProjectTimelines,
    setProjectFlows,
    setPipelineArtifacts,
    setSnapshot,
    setIndexedStateSources,
    setRecordingProcessing,
    setRecordingPrimaryKind: setRecordingTreePrimaryKind,
    setSelection,
    notifyChanged: projectRuntime.notifyChanged
  });
  const deleteProjectRecordings = recordingCommands.deleteMany;
  const hierarchyBridge = useAutomationHierarchyCommandBridge({
    activeProjectId,
    nodes: hierarchyNodes,
    indexes: projectEntityIndexes,
    selection,
    projectTasks: projectArtifacts.tasks ?? [],
    selectedTaskGraph,
    liveCommands,
    dialogStore: hierarchyDialogStore,
    executor: hierarchyCommandExecutor,
    projectDataPlatform,
    deleteRecordings: deleteProjectRecordings,
    notifyChanged: notifyProjectDataChanged,
    clearFlowDrafts: graphRuntime.clearDrafts,
    openView,
    openSubflow: navigation.openSubflow,
    setSelection,
    updatePrefs: updateWorkspacePrefs,
    setProjectFlows,
    setCustomNodes: setCustomHierarchyNodes,
    setDeletedIds: setDeletedHierarchyIds,
    requestSave: workspaceRenderStore.markSaveRequested,
    getSnapshot: () => {
      const current = getProjectView();
      return {
        activeProjectId: studioStores.catalog.getState().activeProjectId,
        nodes: current.hierarchyNodes,
        indexes: current.indexes,
        selection: studioStores.selection.getState().selection,
        projectTasks: (studioStores.projectData.getState().resources.get("projectArtifacts") as any)?.tasks ?? [],
        selectedTaskGraph: current.selectedTaskGraph
      };
    }
  });
  const { guardedCloseProject, selectTreeItem } = useAutomationSessionDirtyGuards({
    activeProjectId,
    selectedTaskGraph,
    selectedFlow,
    hasDirtyTaskGraph,
    graphRuntime,
    setDirty: setHasDirtyTaskGraph,
    closeProject,
    setTreeSelection: hierarchyBridge.setTreeSelection,
    afterTreeSelection: () => setNarrowWorkspacePanel(null)
  });
  function openAutomationProblems() {
    workspaceCommands.selectRightTab(automationStudioViewId.problems);
    if (isNarrowWorkspace) setNarrowWorkspacePanel("inspector");
  }
  function openAutomationInspector() {
    workspaceCommands.selectRightTab(automationStudioViewId.inspector);
    if (isNarrowWorkspace) setNarrowWorkspacePanel("inspector");
  }
  function openAutomationProblem(problem: any) {
    if (problem?.source === "graph" || ["node", "edge", "graph"].includes(problem?.kind)) {
      openView(automationStudioViewId.flowEditor, "preview");
      graphRuntime.focusProblem(problem);
    } else if (typeof problem?.viewId === "string") openView(problem.viewId);
  }
  const adaptationNavigation = useAdaptationWorkspaceNavigation({
    selectedFlowId: selectedTaskGraph?.flowId,
    updatePrefs: updateWorkspacePrefs,
    openView,
    openProblems: openAutomationProblems,
    setSelection
  });
  const connectorScope = useMemo<AutomationCanonicalConnectorScope>(() => ({
    projectId: activeProjectId,
    projectView: projectViewCache,
    getWorkspacePrefs: workspaceRenderStore.getPrefs,
    loadFlowDetail: loadFlowDetails,
    loadNodeDefinitions,
    loadRecording: loadRecordingDetails,
    loadTimeline: loadLatestNormalizedTimeline,
    async loadFlowMetadata(flowId: string) {
      const generation = foundation.projectGeneration.current();
      const metadata = await liveCommands.loadFlowMetadata(flowId);
      if (!foundation.projectGeneration.isCurrent(generation)) return;
      studioStores.projectData.transaction(() => {
        studioStores.projectData.setResource("flowPublications", metadata.publications);
        studioStores.projectData.setResource("flowDependencyInfo", metadata.dependencies);
        studioStores.projectData.setResource("flowMetadataFlowId", flowId);
      });
    }
  }), [
    activeProjectId,
    foundation.projectGeneration,
    liveCommands,
    loadFlowDetails,
    loadLatestNormalizedTimeline,
    loadNodeDefinitions,
    loadRecordingDetails,
    projectViewCache,
    studioStores.projectData,
    workspaceRenderStore
  ]);
  const connectorStores = studioStores;
  const connectorGeneration = foundation.projectGeneration.current();
  const connectorCommands = useAutomationConnectorCommands({
    appendRecordingMarker: recordingCommands.appendMarker,
    appendRecordingNote: recordingCommands.appendNote,
    createSubflow: hierarchyBridge.createSubflow,
    deleteRecording: recordingCommands.deleteOne,
    discardGraphDraft: graphRuntime.discardDraft,
    finalizeRecording: recordingCommands.finalize,
    listProblems: (payload: Record<string, unknown>) => listProjectProblems(foundation.api, payload),
    openAdaptation: adaptationNavigation.openAdaptation,
    openInspector: openAutomationInspector,
    openNodeState: (nodeId: string) => openStateView({ nodeId, phase: "input" }),
    openProblem: openAutomationProblem,
    openProblems: openAutomationProblems,
    openReadinessTarget: adaptationNavigation.openReadinessTarget,
    openState: openStateView,
    openSubflow: openSubflowInEditor,
    openTimelineEntryState,
    refreshRecordings: () => refreshProjectRuntimeState(activeProjectId),
    reloadGraph: graphRuntime.reloadGraph,
    restoreGraphDraft: graphRuntime.restoreDraft,
    saveGraph: graphRuntime.saveGraph,
    selectAdaptation: adaptationNavigation.selectAdaptation,
    setGraphDirty: setHasDirtyTaskGraph,
    setSelection: setSelectionAndFollow,
    updateGraphDraft: graphRuntime.updateDraft,
    updateRecording: recordingCommands.update
  });
  const connectedEntries = useAutomationConnectedViewEntries({
    commands: connectorCommands,
    generation: connectorGeneration,
    scope: connectorScope,
    stores: connectorStores,
    views: viewInstances
  });
  const connectedViewSource = useAutomationConnectedViewSource(activeProjectId ?? "no-project", connectedEntries);
  const resolveWorkspaceBreadcrumbs = useCallback((targetViewId: string) => {
    const baseViewId = automationStudioViewBaseId(targetViewId);
    return workspaceBreadcrumbsForView(
      baseViewId,
      viewById.get(targetViewId)?.label ?? (baseViewId === automationStudioViewId.flowEditor ? "Nodes" : "Workspace")
    );
  }, [viewById, workspaceBreadcrumbsForView]);
  const activateWorkspaceBreadcrumb = useStableAutomationEvent((crumb: AutomationWorkspaceBreadcrumb) => {
    if (crumb.kind === "flow") {
      runAutomationPresentationTransaction(() => {
        setSelection({ kind: "flow", id: crumb.id });
        workspaceCommands.openView(automationStudioViewId.router, "preview");
      });
    } else if (crumb.kind === "subflow" && activeFlowScope?.flowId) {
      void openSubflowInEditor(activeFlowScope.flowId, crumb.id, "preview");
    }
  });
  const hierarchySurface = useMemo(() => (
    <AutomationStudioConnectedHierarchy
      dialog={{ execute: hierarchyBridge.execute, store: hierarchyDialogStore }}
      getProjectView={getProjectView}
      stores={studioStores}
      surface={{
        coordinator: hierarchyUiCoordinator,
        paging: hierarchyPaging,
        projectId: activeProject?.id ?? "",
        onCloseProject: guardedCloseProject,
        openSubflow: hierarchyBridge.openTreeSubflow,
        openView: hierarchyBridge.openTreeView,
        port: workspaceCommandPort,
        projectName: activeProject?.name ?? "",
        requestAction: hierarchyBridge.requestAction,
        setRecordingPrimaryKind: setRecordingTreePrimaryKind,
        setSelection: selectTreeItem,
        store: workspaceRenderStore
      }}
    />
  ), [
    activeProject?.id,
    activeProject?.name,
    guardedCloseProject,
    getProjectView,
    hierarchyBridge.execute,
    hierarchyBridge.openTreeSubflow,
    hierarchyBridge.openTreeView,
    hierarchyBridge.requestAction,
    selectTreeItem,
    hierarchyDialogStore,
    hierarchyPaging,
    hierarchyUiCoordinator,
    setRecordingTreePrimaryKind,
    studioStores,
    workspaceCommandPort,
    workspaceRenderStore
  ]);
  const timelineSurface = useMemo(() => (
    <AutomationStudioConnectedTimeline
      onSelectAction={handleBottomPreviewActionClick}
      stores={studioStores}
    />
  ), [
    handleBottomPreviewActionClick,
    studioStores
  ]);
  const getViewAdderContext = useCallback(() => {
    const current = getProjectView();
    return {
      selectedFlow: Boolean(current.selectedFlow),
      selectedTopLevelFlow: Boolean(current.selectedFlow && current.selectedFlow.metadata?.subflowGraph !== true && typeof current.selectedFlow.metadata?.parentFlowId !== "string"),
      selectedRecording: Boolean(current.selectedRecording),
      selection: studioStores.selection.getState().selection
    };
  }, [getProjectView, studioStores.selection]);
  const projectBinding = useMemo(() => ({
    id: activeProject?.id ?? "",
    name: activeProject?.name ?? "",
    getViewAdderContext
  }), [activeProject?.id, activeProject?.name, getViewAdderContext]);
  const workspaceBinding = useMemo(() => ({
    commands: workspaceCommands,
    port: workspaceCommandPort,
    warm: warmWorkspaceViews,
    store: workspaceRenderStore,
    studioUiStore,
    updatePrefs: updateWorkspacePrefs
  }), [
    studioUiStore,
    updateWorkspacePrefs,
    warmWorkspaceViews,
    workspaceCommands,
    workspaceCommandPort,
    workspaceRenderStore
  ]);
  const viewBinding = useMemo(() => ({
    source: connectedViewSource,
    instances: viewInstances,
    openIds: openWorkspaceViewIds,
    resolveBreadcrumbs: resolveWorkspaceBreadcrumbs
  }), [connectedViewSource, openWorkspaceViewIds, resolveWorkspaceBreadcrumbs, viewInstances]);
  const headerBinding = useMemo(() => ({
    closeProject: guardedCloseProject,
    activateBreadcrumb: activateWorkspaceBreadcrumb,
    openRuntime: () => openView(automationStudioViewId.runtime, "preview"),
    requestWorkspaceSave: workspaceRenderStore.markSaveRequested
  }), [activateWorkspaceBreadcrumb, guardedCloseProject, openView, workspaceRenderStore]);
  const cacheStats = useCallback(() => projectDataPlatform.stats(), [projectDataPlatform]);
  const inspectorBinding = useMemo(() => ({ api, cacheStats }), [api, cacheStats]);
  if (restoringUrlProject || !activeProject) {
    return (
      <AutomationStudioProjectGate
        api={api}
        catalog={studioStores.catalog}
        currentUser={currentUser}
        onOpenProject={(projectId) => { void openProject(projectId); }}
        refreshProjects={() => { void refreshProjects(); }}
        state={restoringUrlProject ? "restoring" : "catalog"}
        studioUiStore={studioUiStore}
      />
    );
  }

  return <>
    <AutomationStudioWorkspaceComposition
      currentUser={currentUser}
      project={projectBinding}
      workspace={workspaceBinding}
      views={viewBinding}
      header={headerBinding}
      hierarchy={hierarchySurface}
      timeline={timelineSurface}
      inspector={inspectorBinding}
    />
  </>;
}
