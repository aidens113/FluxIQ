"use client";

import { useCallback, useEffect, useMemo } from "react";
import { AutomationHierarchyDialog } from "../hierarchy/AutomationHierarchyDialog";
import { createAutomationHierarchyCommandExecutor } from "../hierarchy/command-executor";
import { createAutomationHierarchyDialogStore } from "../hierarchy/dialog-store";
import type { AutomationWorkspaceBreadcrumb } from "../workspace/shell/contracts";
import { automationStudioViewId } from "../views/view-registry";
import { AutomationHierarchySurface } from "./AutomationHierarchySurface";
import { AutomationStudioProjectGate } from "./AutomationStudioProjectGate";
import { useAutomationStoreSelector } from "../stores";
import { useAutomationProjectCatalogLoader } from "../project";
import type { AutomationSelection } from "../shared/selection-contracts";
import { useAutomationNarrowWorkspace } from "../workspace/studio-ui-store";
import { RecordingActionPreviewDock as AutomationTimelineDock } from "../recordings";
import { automationStudioFlowNeedsDetail } from "../model/project-summary-converters";
import { useAutomationStudioDevelopmentTelemetry } from "../development/telemetry";
import { useAutomationProjectPreload } from "../sync";
import { useAutomationGatewayRecordingBridge } from "./use-gateway-recording-bridge";
import { useUiLongTaskMetrics, useUiRenderMetric } from "../../programs/ui-performance";
import type { CurrentUser } from "../../programs/types";
import { notifyGlobalAlert } from "../../programs/shared-ui";
import { useAutomationStudioFoundation } from "./useAutomationStudioFoundation";
import { useAutomationBrowserEntry } from "./useAutomationBrowserEntry";
import { useAutomationWorkspaceRuntime } from "./useAutomationWorkspaceRuntime";
import { useAutomationHierarchyUiRuntime } from "./useAutomationHierarchyUiRuntime";
import { useAutomationHierarchyCommandBridge } from "./useAutomationHierarchyCommandBridge";
import { useAutomationProjectRuntime } from "./useAutomationProjectRuntime";
import { useAutomationProjectView } from "./useAutomationProjectView";
import { useAutomationGraphRuntime } from "./useAutomationGraphRuntime";
import { useAutomationSelectionNavigation } from "./useAutomationSelectionNavigation";
import { useAutomationRecordingCommands } from "./useAutomationRecordingCommands";
import { useAutomationCanonicalViewInputs } from "./useAutomationCanonicalViewInputs";
import { useAdaptationWorkspaceNavigation } from "./useAdaptationWorkspaceNavigation";
import { useAutomationExternalLifecycle } from "./useAutomationExternalLifecycle";
import { useAutomationDeepLinkRuntime } from "./useAutomationDeepLinkRuntime";
import { AutomationStudioWorkspaceComposition } from "./AutomationStudioWorkspaceComposition";
import { useStableAutomationEvent } from "./useStableAutomationEvent";

const EMPTY_AUTOMATION_RECORD = Object.freeze({}) as Record<string, never>;
const EMPTY_AUTOMATION_LIST = Object.freeze([]) as unknown as any[];
export function AutomationStudioComposition({ currentUser }: { currentUser: CurrentUser }) {
  useUiRenderMetric("AutomationStudioLive");
  useUiLongTaskMetrics("AutomationStudio");
  useAutomationStudioDevelopmentTelemetry();
  const foundation = useAutomationStudioFoundation();
  const { api, hierarchyPaging, liveCommands, liveCommandScope, projectDataPlatform, uiCache } = foundation;
  const { deepLink, pathname, searchSignature } = useAutomationBrowserEntry();
  const { studioStores, studioUiStore, workspaceRenderStore } = foundation.owners;
  const { snapshot, setSnapshot, projects, projectsLoaded, projectCatalogError, activeProjectId } = foundation.shell;
  const {
    loadedProjectHierarchyId, setLoadedProjectHierarchyId, projectSearch, setProjectSearch,
    projectTypeFilter, setProjectTypeFilter, customHierarchyNodes, setCustomHierarchyNodes,
    deletedHierarchyIds, setDeletedHierarchyIds
  } = foundation.hierarchy;
  const {
    projectArtifacts, setProjectArtifacts, projectFlows, setProjectFlows, nativeNodeDefinitions,
    setNativeNodeDefinitions, publishedFlowDefinitions, setPublishedFlowDefinitions, flowPublications,
    setFlowPublications, flowDependencyInfo, setFlowDependencyInfo, automationActionStatus,
    setAutomationActionStatus, flowRunState, setFlowRunState, hasDirtyTaskGraph, setHasDirtyTaskGraph,
    taskGraphDrafts, setTaskGraphDrafts
  } = foundation.flow;
  const {
    projectRecordings, setProjectRecordings, projectTimelines, setProjectTimelines, recordingDomains,
    setRecordingDomains, recordingTreePrimaryKind, setRecordingTreePrimaryKind, recordingProcessing,
    setRecordingProcessing
  } = foundation.recording;
  const { runtimeSessions, setRuntimeSessions, pipelineArtifacts, setPipelineArtifacts, gatewaySnapshot, setGatewaySnapshot } = foundation.runtime;
  const {
    indexedStateSources, setIndexedStateSources, selection, setSelection, pendingStateOpen,
    setPendingStateOpen, bottomPreviewEntryId, setBottomPreviewEntryId
  } = foundation.state;
  const { runLatest, cancelAll: cancelAllRequests } = foundation.requests;
  const urlProjectId = deepLink.projectId;
  const workspacePrefs = workspaceRenderStore.getPrefs();
  const workspacePrefsSaveRevision = useAutomationStoreSelector(workspaceRenderStore, (state) => state.saveRevision, "save-request");
  const { isNarrowWorkspace, narrowWorkspacePanel, setIsNarrowWorkspace, setNarrowWorkspacePanel } = useAutomationNarrowWorkspace(studioUiStore);const hierarchyDialogStore = useMemo(createAutomationHierarchyDialogStore, []);
  const hierarchyCommandExecutor = useMemo(createAutomationHierarchyCommandExecutor, []);
  const workspaceRuntime = useAutomationWorkspaceRuntime({
    activeProjectId,
    currentUserId: currentUser.id,
    loadedProjectHierarchyId,
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
    customNodes: customHierarchyNodes,
    deletedIds: deletedHierarchyIds,
    workspacePrefs,
    saveRevision: workspacePrefsSaveRevision,
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
    foundation: { projectDataPlatform, uiCache, liveCommands, requests: foundation.requests, stores: studioStores },
    hierarchy: {
      setLoadedProjectId: setLoadedProjectHierarchyId,
      setCustomNodes: setCustomHierarchyNodes,
      setDeletedIds: setDeletedHierarchyIds,
      hydrateSidebar: hierarchyUi.hydrate,
      markPersisted: hierarchyUi.markPersisted,
      reset: hierarchyUi.reset
    },
    workspace: { replacePrefs: replaceWorkspaceRenderPrefs, resetCachedPrefs: resetCachedWorkspacePrefs },
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

  const projectView = useAutomationProjectView({
    model: {
      hasActiveProject: Boolean(activeProjectId),
      canonical: snapshot?.payload?.canonical ?? EMPTY_AUTOMATION_RECORD,
      pipelineArtifacts,
      snapshotProblems: snapshot?.payload?.problems ?? EMPTY_AUTOMATION_LIST,
      projectRecordings,
      projectTimelines,
      projectFlows,
      projectArtifacts,
      indexedStateSources,
      nativeNodeDefinitions,
      publishedFlowDefinitions,
      customHierarchyNodes,
      deletedHierarchyIds,
      selection,
      lastOpenFlowId: typeof workspacePrefs.viewStates?.[automationStudioViewId.flowEditor]?.lastOpenFlowId === "string"
        ? workspacePrefs.viewStates?.[automationStudioViewId.flowEditor]?.lastOpenFlowId as string
        : null,
      lastOpenTaskId: null
    },
    workspacePrefs,
    projects,
    activeProjectId,
    urlProjectId,
    projectCatalogError,
    projectsLoaded,
    pendingStateOpen,
    bottomPreviewEntryId,
    selection
  });
  const {
    recordings, timelines, registries, models, proposals, recordingFlowProposals, hierarchyProposals,
    policies, snapshotProblems, signals, availableNodeDefinitions, indexedStateSourceList, projectTasks,
    selectedFlowEntry, selectedFlow, runnableFlowEntry, runnableFlow, selectionProposalId,
    selectionRecordingIdForProposal, selectedProposal, selectedTask, selectedTaskFlow, projectFlowUrlScopeSignature,
    selectedTaskGraph, selectedCanonicalPolicy, selectedPolicy, selectedRecordingId, selectedRecording,
    selectedTimeline, selectedNode, selectedEntry, selectedSignal, selectedTimelineEntries, selectedRecordingNotes,
    hierarchyNodes, indexes: projectEntityIndexes, activeFlowScope, breadcrumbFlow, breadcrumbSubflow,
    viewLabelForSelection, viewWithTitleData, flowForSelection, recordingForSelection, proposalForSelection,
    taskForSelection, policyForSelection, workspaceBreadcrumbsForView, activePreviewEntry,
    activePreviewEntryId, activeProject, activeViewId, openViewIds: openWorkspaceViewIdList,
    openWorkspaceViewIds, restoringUrlProject, viewById, viewInstances
  } = projectView;
  useAutomationExternalLifecycle({
    actionStatus: automationActionStatus,
    activeProjectName: activeProject?.name ?? null,
    hasDirtyGraph: hasDirtyTaskGraph,
    selectionKey: selection ? selection.kind + ":" + selection.id : "none",
    setNarrow: setIsNarrowWorkspace,
    narrowPanel: narrowWorkspacePanel,
    setNarrowPanel: setNarrowWorkspacePanel
  });  useEffect(() => {
    if (!selectedFlow?.flowId || selectedFlowEntry?.source !== "canonical") {
      setFlowPublications([]);
      setFlowDependencyInfo({ dependencies: [], usedBy: [], availableUpgrades: [] });
      return;
    }
    void liveCommands.loadFlowMetadata(selectedFlow.flowId).then((metadata) => {
      setFlowPublications(metadata.publications);
      setFlowDependencyInfo(metadata.dependencies);
    });
  }, [selectedFlow?.flowId, selectedFlow?.updatedAt, selectedFlowEntry?.source, liveCommands]);
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
    notifyChanged: projectRuntime.notifyChanged
  });
  const activePreloadRunId = typeof flowRunState.runId === "string"
    ? flowRunState.runId
    : typeof runtimeSessions[0]?.runId === "string" ? runtimeSessions[0].runId : null;
  useAutomationProjectPreload(api, {
    projectId: activeProjectId,
    activeFlowId: selectedFlowEntry?.source === "canonical" ? selectedFlow?.flowId ?? null : null,
    activeRunId: activePreloadRunId,
    openViewIds: openWorkspaceViewIdList
  });
  const selectedTaskGraphDraft = graphRuntime.draft;
  const baseTaskGraphDocument = graphRuntime.baseGraph;
  const problems = graphRuntime.problems;
  const recoverableTaskGraphDraftView = graphRuntime.recoverableDraft;
  useEffect(() => {
    if (!activeProjectId || !selectedRecording?.recordingId || selectedRecording.metadata?.summaryOnly !== true) return;
    if (!["recording", "timeline", "state"].includes(selection?.kind ?? "")) return;
    void loadRecordingDetails(selectedRecording.recordingId);
  }, [activeProjectId, selectedRecording?.recordingId, selectedRecording?.metadata?.summaryOnly, selection?.kind]);
  useEffect(() => {
    if (!activeProjectId || !selection || !selectedRecordingId || selectedRecording?.recordingId === selectedRecordingId) return;
    if (!["editor-node", "state", "timeline"].includes(selection.kind)) return;
    void loadRecordingDetails(selectedRecordingId);
  }, [activeProjectId, selectedRecordingId, selectedRecording?.recordingId, selection?.kind]);
  useEffect(() => {
    if (!activeProjectId || selection?.kind !== "flow") return;
    updateWorkspacePrefs((current) => {
      const currentPolicyState = current.viewStates?.[automationStudioViewId.flowEditor] ?? {};
      if (currentPolicyState.lastOpenFlowId === selection.id) return current;
      return {
        ...current,
        viewStates: {
          ...current.viewStates,
          [automationStudioViewId.flowEditor]: { ...currentPolicyState, lastOpenFlowId: selection.id }
        }
      };
    }, { persist: false });
  }, [activeProjectId, selection?.kind, selection?.id]);

  useEffect(() => {
    if (!activeProjectId || selectedFlowEntry?.source !== "canonical" || !automationStudioFlowNeedsDetail(selectedFlow, activeViewId, selection?.kind)) return;
    void loadFlowDetails(selectedFlow.flowId);
  }, [activeProjectId, activeViewId, selectedFlow?.flowId, selectedFlow?.metadata?.summaryOnly, selectedFlowEntry?.source, selection?.kind]);  useEffect(() => {
    if (!activeProjectId || activeViewId !== automationStudioViewId.flowEditor) return;
    if (nativeNodeDefinitions.length || publishedFlowDefinitions.length) return;
    void loadNodeDefinitions();
  }, [activeProjectId, activeViewId, nativeNodeDefinitions.length, publishedFlowDefinitions.length]);
  useEffect(() => {
    if (!activeProjectId || activeViewId !== automationStudioViewId.recordingTimeline || !selectedRecording?.recordingId || selectedTimeline) return;
    void loadLatestNormalizedTimeline(selectedRecording.recordingId);
  }, [activeProjectId, activeViewId, selectedRecording?.recordingId, selectedTimeline?.normalizedTimelineId]);
  const navigation = useAutomationSelectionNavigation({
    activeProjectId,
    workspacePrefs,
    commands: workspaceCommands,
    updatePrefs: updateWorkspacePrefs,
    schedule: scheduleWorkspaceNavigation,
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
    setActionStatus: setAutomationActionStatus
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
    setRecordingProcessing((current) => current?.recordingId === recordingId ? null : current);
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
    lastOpenFlowId: typeof workspacePrefs.viewStates?.[automationStudioViewId.flowEditor]?.lastOpenFlowId === "string"
      ? workspacePrefs.viewStates?.[automationStudioViewId.flowEditor]?.lastOpenFlowId as string
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
    schedule: scheduleWorkspaceNavigation,
    openView,
    openSubflow: navigation.openSubflow,
    setSelection,
    updatePrefs: updateWorkspacePrefs,
    setProjectFlows,
    setCustomNodes: setCustomHierarchyNodes,
    setDeletedIds: setDeletedHierarchyIds
  });
  function openAutomationProblems() {
    workspaceCommands.selectRightTab(automationStudioViewId.problems);
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
  const deleteRecordingForRenderer = useStableAutomationEvent(recordingCommands.deleteOne);
  const finalizeRecordingForRenderer = useStableAutomationEvent(recordingCommands.finalize);
  const openTimelineEntryStateForRenderer = useStableAutomationEvent(openTimelineEntryState);
  const openProblemForRenderer = useStableAutomationEvent(openAutomationProblem);
  const openProblemsForRenderer = useStableAutomationEvent(openAutomationProblems);
  const openSubflowForRenderer = useStableAutomationEvent(openSubflowInEditor);
  const openStateForRenderer = useStableAutomationEvent(openStateView);
  const appendRecordingMarkerForRenderer = useStableAutomationEvent(recordingCommands.appendMarker);
  const appendRecordingNoteForRenderer = useStableAutomationEvent(recordingCommands.appendNote);
  const saveTaskGraphForRenderer = useStableAutomationEvent(graphRuntime.saveGraph);
  const updateTaskGraphDraftForRenderer = useStableAutomationEvent(graphRuntime.updateDraft);
  const restoreTaskGraphDraftForRenderer = useStableAutomationEvent(graphRuntime.restoreDraft);
  const discardTaskGraphForRenderer = useStableAutomationEvent(graphRuntime.discardDraft);
  const updateRecordingForRenderer = useStableAutomationEvent(recordingCommands.update);
  const setSelectionForRenderer = useStableAutomationEvent(setSelectionAndFollow);

  const handleRefreshRecordingsForRenderer = useCallback(async () => {
    await refreshProjectRuntimeState(activeProjectId);
  }, [activeProjectId]);

  const canonicalViewInputs = useAutomationCanonicalViewInputs({
    activeProjectId,
    actionStatus: automationActionStatus,
    availableNodeDefinitions,
    flowDependencyInfo,
    flowPublications,
    focusRequest: graphRuntime.focusRequest,
    indexedStateSourceList,
    models,
    pendingStateOpen,
    pipelineArtifacts,
    policies,
    problems,
    recordingProcessing,
...(workspacePrefs.viewStates?.[automationStudioViewId.adaptations]?.flowId === selectedTaskGraph?.flowId && typeof workspacePrefs.viewStates?.[automationStudioViewId.adaptations]?.selectedAdaptationId === "string"
      ? { requestedAdaptationId: workspacePrefs.viewStates[automationStudioViewId.adaptations]!.selectedAdaptationId as string }
      : {}),
    recordings,
    recoverableDraft: recoverableTaskGraphDraftView,
    runtimeSessions,
    selectedEntry: activePreviewEntry,
    selectedFlow,
    selectedFlowEntry,
    selectedNode,
    selectedPolicy,
    selectedProposal,
    selectedRecording,
    selectedRecordingNotes,
    selectedSignal,
    selectedTaskGraph,
    selectedTaskGraphDraft,
    selectedTimeline,
    selectedTimelineEntries,
    selection,
    signals,
    timelines
  }, {
    adaptations: { onSelectedAdaptationChange: adaptationNavigation.selectAdaptation },
    flowEditor: {
      onSaveGraph: saveTaskGraphForRenderer,
      onGraphDraftChange: updateTaskGraphDraftForRenderer,
      onDirtyChange: setHasDirtyTaskGraph,
      onOpenProblems: openProblemsForRenderer,
      onOpenNodeState: (nodeId) => openStateForRenderer({ nodeId, phase: "input" }),
      onRestoreDraft: restoreTaskGraphDraftForRenderer,
      onDiscardDraft: discardTaskGraphForRenderer,
      setSelection: setSelectionForRenderer
    },
    inspector: { onOpenState: openStateForRenderer, onUpdateEditorNodeSelection: setSelectionForRenderer },
    instructions: {},
    problems: { onOpenProblem: openProblemForRenderer },
    recording: {
      onAppendRecordingMarker: appendRecordingMarkerForRenderer,
      onAppendRecordingNote: appendRecordingNoteForRenderer,
      onDeleteRecording: deleteRecordingForRenderer,
      onFinalizeRecording: finalizeRecordingForRenderer,
      onOpenTimelineEntryState: openTimelineEntryStateForRenderer,
      onRefreshRecordings: handleRefreshRecordingsForRenderer,
      onUpdateRecording: updateRecordingForRenderer,
      setSelection: setSelectionForRenderer
    },
    router: { onCreateSubflow: hierarchyBridge.createSubflow },
    runtime: { onOpenAdaptation: adaptationNavigation.openAdaptation, onOpenReadinessTarget: adaptationNavigation.openReadinessTarget },
    settings: {},
    state: { setSelection: setSelectionForRenderer },
    subflows: { onOpenSubflow: openSubflowForRenderer }
  });  const resolveWorkspaceBreadcrumbs = useCallback((targetViewId: string) => (
    workspaceBreadcrumbsForView(
      targetViewId,
      targetViewId === automationStudioViewId.flowEditor ? "Nodes" : viewById.get(targetViewId)?.label ?? "Workspace"
    )
  ), [viewById, workspaceBreadcrumbsForView]);
  const activateWorkspaceBreadcrumb = useStableAutomationEvent((crumb: AutomationWorkspaceBreadcrumb) => {
    if (crumb.kind === "flow") {
      scheduleWorkspaceNavigation(() => {
        setSelection({ kind: "flow", id: crumb.id });
        workspaceCommands.openView(automationStudioViewId.router, "preview");
      });
    } else if (crumb.kind === "subflow" && activeFlowScope?.flowId) {
      void openSubflowForRenderer(activeFlowScope.flowId, crumb.id, "preview");
    }
  });  if (restoringUrlProject || !activeProject) {
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
    <AutomationHierarchyDialog execute={hierarchyBridge.execute} nodes={hierarchyNodes} store={hierarchyDialogStore} />
    <AutomationStudioWorkspaceComposition
      currentUser={currentUser}
      project={{
        id: activeProject.id,
        name: activeProject.name,
        selectedFlow: Boolean(selectedFlow),
        selectedRecording: Boolean(selectedRecording),
        selection
      }}
      workspace={{
        commands: workspaceCommands,
        port: workspaceCommandPort,
        warm: warmWorkspaceViews,
        store: workspaceRenderStore,
        studioUiStore,
        updatePrefs: updateWorkspacePrefs
      }}
      views={{ inputs: canonicalViewInputs, instances: viewInstances, openIds: openWorkspaceViewIds, resolveBreadcrumbs: resolveWorkspaceBreadcrumbs }}
      header={{ closeProject, activateBreadcrumb: activateWorkspaceBreadcrumb }}
      hierarchy={
        <AutomationHierarchySurface
          coordinator={hierarchyUiCoordinator}
          paging={hierarchyPaging}
          projectId={activeProjectId}
          nodes={hierarchyNodes}
          onCloseProject={closeProject}
          openSubflow={hierarchyBridge.openTreeSubflow}
          openView={hierarchyBridge.openTreeView}
          port={workspaceCommandPort}
          projectName={activeProject.name}
          recordingPrimaryKind={recordingTreePrimaryKind === "recording" ? "recording" : null}
          requestAction={hierarchyBridge.requestAction}
          selection={selection}
          setRecordingPrimaryKind={setRecordingTreePrimaryKind}
          setSelection={hierarchyBridge.setTreeSelection}
          store={workspaceRenderStore}
        />
      }
      timeline={
        <AutomationTimelineDock
          entries={selectedTimeline?.timeline ?? selectedRecording?.timeline ?? []}
          onSelectAction={handleBottomPreviewActionClick}
          {...(activePreviewEntryId ? { selectedEntryId: activePreviewEntryId } : {})}
        />
      }
      inspector={{ api, cacheStats: () => projectDataPlatform.stats() }}
    />
  </>;
}
