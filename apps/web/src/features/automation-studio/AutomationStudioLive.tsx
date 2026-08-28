"use client";

import { AlertTriangle, Blocks, Bug, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, FileSearch, FolderOpen, FolderPlus, GitBranch, GripVertical, History, ListChecks, Network, Plus, Radio, Search, SlidersHorizontal, Sparkles, Trash2, Workflow, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import type { NodeStatePhase } from "fluxiq/automation-studio";
import {
  automationHierarchyCategories,
  automationHierarchyCategoryLabel,
  automationHierarchyNodeIsGeneratedFlowStructure,
  automationHierarchyNodeIsSubflowCategory,
  automationHierarchyNodeIsSubflowRoot,
  automationHierarchySignature,
  collectHierarchyDescendantIds,
  flowHierarchyNodes,
  type AutomationCreatableHierarchyKind,
  type AutomationHierarchyAction,
  type AutomationHierarchyCategory,
  type AutomationHierarchyKind,
  type AutomationHierarchyNode,
  type AutomationProjectModal,
  type AutomationStudioProject,
  type AutomationStudioProjectCategory
} from "./hierarchy/model";
import { AutomationProjectModalView, moveCategoryId } from "./hierarchy/ProjectModal";
import { AutomationProjectBrowser } from "./hierarchy/ProjectBrowser";
import { AutomationProjectTree } from "./hierarchy/ProjectTree";
import {
  useFlowController,
  useHierarchyController,
  useLayoutController,
  useProjectController,
  useRecordingController,
  useRuntimeController,
  useStateController,
  type AutomationFlowPreset,
  type AutomationFlowRunState
} from "./controllers/useAutomationStudioControllers";
import { useAutomationStudioCache } from "./controllers/useAutomationStudioCache";
import { useRequestCoordinator } from "./controllers/useRequestCoordinator";
import { automationStudioDeepLinkParams, automationStudioDefaultViewForLink, automationStudioFlowScope, automationStudioWorkspaceBreadcrumbs, parseAutomationStudioDeepLink } from "./navigation";
import type {
  AutomationSelection,
  AutomationViewInstance,
  RecordingProcessingStatus
} from "./types";
import {
  automationLayoutPresetOptions,
  automationBottomDockMaxHeight,
  automationBottomDockMinHeight,
  defaultAutomationMainSplitRatios,
  automationWorkspaceRegionForView,
  automationMainPaneCount,
  clampNumber,
  closeAutomationWorkspacePaneTab,
  defaultAutomationWorkspacePrefs,
  moveAutomationWorkspacePaneTab,
  normalizeAutomationWorkspacePrefs,
  resizeAutomationMainSplitRatios,
  type AutomationLayoutPreset,
  type AutomationWorkspaceArea,
  type AutomationWorkspacePrefs,
} from "./workspace/layout";
import {
  AutomationLayoutPicker,
  AutomationViewContainer,
  AutomationWindowAdderPalette,
  AutomationWorkspacePreferences,
  automationAreaLabel,
  automationFloatingPanelStyle,
  automationLayoutOptionsForArea,
  viewTitle
} from "./workspace/components";
import { AutomationTimelineDock, AutomationViewRenderer } from "./views";
import { automationPolicyGraphProblems } from "./views/GraphEditorViews";
import { taskFlowToReactFlowGraph } from "./graph/view-model";
import { automationGraphDraftIdentity, loadAutomationGraphDraft, loadAutomationGraphOperationDraft, removeAutomationGraphDraft, removeAutomationGraphOperationDraft, saveAutomationGraphDraft, saveAutomationGraphOperationDraft, type AutomationGraphDraftRecord } from "./graph/draft-store";
import { applyAutomationGraphOperationBatch, diffAutomationGraphDocuments } from "./graph/operation-history";
import { scheduleAutomationGraphIdleTask } from "./graph/worker-tasks";
import { automationViewAdderOptions } from "./workspace/view-adder";
import { removeDeletedRecordingArtifacts, removeDeletedRecordingSnapshotData, selectionReferencesDeletedRecording } from "./model/deletion";
import {
  applyCustomFolderCreate,
  applyCustomFolderDelete,
  applyFlowObjectReferenceDelete,
  applySubflowCategoryCreate,
  applySubflowCategoryDelete,
  applySubflowReferenceDelete,
  deleteRecordingCollectionItems,
  type FlowObjectKind
} from "./model/local-mutations";
import { flowToTaskPolicy, graphToTaskFlow, isPersistableHierarchyNode, mergeById } from "./model/project-artifacts";
import { AutomationStudioDataInspector } from "./development/DataInspector";
import {
  registerAutomationStudioDevelopmentSubscription,
  useAutomationStudioDevelopmentTelemetry
} from "./development/telemetry";
import {
  AutomationStudioProjectSyncClient,
  applyAutomationStudioInvalidations,
  createAutomationStudioClientStores,
  emitAutomationStudioFeedReconciliationDiagnostic,
  type AutomationStudioProjectChangeEvent,
  type AutomationStudioProjectChangePage,
  type AutomationStudioScopedInvalidation
} from "./sync/project-sync";
import { useProgramApi, type JsonObject } from "../programs/program-api";
import { useUiLongTaskMetrics, useUiRenderMetric } from "../programs/ui-performance";
import { automationStudioUiRequest, type AutomationStudioUiRequest } from "./data-request-policy";
import type { CurrentUser } from "../programs/types";
import {
  Drawer,
  Field,
  KeyValue,
  Modal,
  notifyGlobalAlert,
  StatusText,
  VisualAlert
} from "../programs/shared-ui";

type TabButton<T extends string> = { id: T; label: string; count?: number };
type DeletedHierarchyRefs = { taskIds: Set<string>; routineIds: Set<string>; configIds: Set<string>; flowIds: Set<string>; recordingIds: Set<string>; proposalIds: Set<string>; timelineEntryIds: Set<string> };
export const AUTOMATION_STUDIO_PROJECT_OPEN_DETAIL_ENDPOINT_DENYLIST = [
  "get-recording",
  "get-runtime-session",
  "get-runtime-session-action-log",
  "get-normalized-timeline",
  "get-flow",
  "get-flow-subflow",
  "get-flow-instruction-set",
  "get-flow-change-proposal",
  "get-flow-run-detail",
  "get-flow-adaptation",
  "list-runtime-session-events"
] as const;

export function automationStudioProjectOpenRequests(projectId: string): [AutomationStudioUiRequest] {
  return [automationStudioUiRequest("catalog", "get-project-hierarchy", { projectId })];
}

export function automationStudioRuntimeSummaryRequests(projectId: string): [AutomationStudioUiRequest] {
  return [automationStudioUiRequest("summary", "get-project-workspace-summary", { projectId })];
}

function shortAutomationId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function emitAutomationStudioCommandStatus(detail: { state: string; detail: string; running?: boolean; dirty?: boolean }) {
  window.dispatchEvent(new CustomEvent("automation-studio:command-status", { detail }));
}

export function AutomationStudioLive({ currentUser }: { currentUser: CurrentUser }) {
  useUiRenderMetric("AutomationStudioLive");
  useUiLongTaskMetrics("AutomationStudio");
  useAutomationStudioDevelopmentTelemetry();
  const api = useProgramApi("automation-studio");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLink = parseAutomationStudioDeepLink(searchParams);
  const { runLatest } = useRequestCoordinator();
  const dataCache = useAutomationStudioCache();
  const clientStores = useMemo(() => createAutomationStudioClientStores(), []);
  const [dataInspectorOpen, setDataInspectorOpen] = useState(false);
  const urlProjectId = deepLink.projectId;
  const {
    snapshot, setSnapshot, projects, setProjects, projectCategories, setProjectCategories,
    projectsLoaded, setProjectsLoaded, activeProjectId, setActiveProjectId, projectModal, setProjectModal,
    projectTarget, setProjectTarget, categoryTarget, setCategoryTarget, projectName, setProjectName,
    projectDescription, setProjectDescription, categoryName, setCategoryName, projectPin, setProjectPin,
    projectStatus, setProjectStatus, projectActionBusy, setProjectActionBusy, pendingProjectMove, setPendingProjectMove, pendingCategoryMove,
    setPendingCategoryMove, dragOverCategoryId, setDragOverCategoryId
  } = useProjectController();
  const {
    loadedProjectHierarchyId, setLoadedProjectHierarchyId, projectSearch, setProjectSearch,
    projectTypeFilter, setProjectTypeFilter, hierarchyAction, setHierarchyAction, hierarchyCreateStep,
    setHierarchyCreateStep, hierarchyPin, setHierarchyPin, hierarchyName, setHierarchyName,
    hierarchyFlowOrigin, setHierarchyFlowOrigin, hierarchyKind, setHierarchyKind, hierarchyCategory,
    setHierarchyCategory, hierarchyParentId, setHierarchyParentId, hierarchyStatus, setHierarchyStatus,
    customHierarchyNodes, setCustomHierarchyNodes, deletedHierarchyIds, setDeletedHierarchyIds
  } = useHierarchyController();
  const {
    projectArtifacts, setProjectArtifacts, projectFlows, setProjectFlows, nativeNodeDefinitions,
    setNativeNodeDefinitions, publishedFlowDefinitions, setPublishedFlowDefinitions, flowPublications,
    setFlowPublications, flowDependencyInfo, setFlowDependencyInfo, automationActionStatus,
    setAutomationActionStatus, flowRunState, setFlowRunState, hasDirtyTaskGraph, setHasDirtyTaskGraph,
    taskGraphDrafts, setTaskGraphDrafts
  } = useFlowController();
  const {
    projectRecordings, setProjectRecordings, projectTimelines, setProjectTimelines, recordingDomains,
    setRecordingDomains, recordingTreePrimaryKind, setRecordingTreePrimaryKind, recordingProcessing,
    setRecordingProcessing
  } = useRecordingController();
  const {
    runtimeSessions, setRuntimeSessions, pipelineArtifacts, setPipelineArtifacts, gatewaySnapshot,
    setGatewaySnapshot
  } = useRuntimeController();
  const {
    indexedStateSources, setIndexedStateSources, selection, setSelection, pendingStateOpen,
    setPendingStateOpen, bottomPreviewEntryId, setBottomPreviewEntryId
  } = useStateController();
  const {
    workspacePrefs, setWorkspacePrefs,
    liveSidebarWidth, setLiveSidebarWidth, liveInspectorWidth, setLiveInspectorWidth, liveBottomTimelineHeight, setLiveBottomTimelineHeight,
    liveMainSplitRatios, setLiveMainSplitRatios, preferencesOpen, setPreferencesOpen, windowAdderOpen,
    setWindowAdderOpen, layoutPickerOpen, setLayoutPickerOpen,
  } = useLayoutController();
  const [workspaceSaveStatus, setWorkspaceSaveStatus] = useState("All workspace changes saved");
  const [workspacePrefsSaveRevision, setWorkspacePrefsSaveRevision] = useState(0);
  const [recoverableTaskGraphDraft, setRecoverableTaskGraphDraft] = useState<AutomationGraphDraftRecord<{ nodes: any[]; edges: any[] }> | null>(null);
  const graphDraftPersistenceRef = useRef<AutomationGraphDraftRecord<{ nodes: any[]; edges: any[] }> | null>(null);
  const [isNarrowWorkspace, setIsNarrowWorkspace] = useState(false);
  const [narrowWorkspacePanel, setNarrowWorkspacePanel] = useState<"hierarchy" | "inspector" | "timeline" | null>(null);
  const sidebarCollapsed = workspacePrefs.leftSidebarCollapsed;
  const urlProjectOpenAttemptRef = useRef<string | null>(null);
  const restoredDeepLinkRef = useRef<string | null>(null);
  const restoringDeepLinkRef = useRef(false);
  const projectActionBusyRef = useRef(false);
  const mainWorkspaceCanvasRef = useRef<HTMLDivElement>(null);
  const rightWorkspaceCanvasRef = useRef<HTMLDivElement>(null);
  const lastSavedHierarchySignatureRef = useRef("");
  const lastOpenedGatewayRecordingRef = useRef("");
  const lastActiveGatewayRecordingRef = useRef<string | null>(null);
  const processedStoppedGatewayRecordingsRef = useRef<Set<string>>(new Set());
  const lastRecordingBlockedAuditRef = useRef("");
  const pendingStateOpenKeyRef = useRef<string | null>(null);
  const gatewayActivitySignatureRef = useRef("");
  const projectSyncClientRef = useRef<AutomationStudioProjectSyncClient | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => {
      setIsNarrowWorkspace(query.matches);
      if (!query.matches) setNarrowWorkspacePanel(null);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (narrowWorkspacePanel === "hierarchy") setNarrowWorkspacePanel(null);
  }, [selection?.kind, selection?.id]);

  const refreshProjects = useCallback(async () => {
    setProjectStatus("");
    const result = await runLatest("projects", (signal) => api.get<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }>("projects", { signal }));
    if (!result) return;
    if (result.ok) {
      setProjects(result.payload?.projects ?? []);
      setProjectCategories(result.payload?.categories ?? []);
    } else {
      setProjectStatus(result.error ?? "Projects could not be loaded.");
    }
    setProjectsLoaded(true);
  }, [api, runLatest]);
  useEffect(() => void refreshProjects(), [refreshProjects]);
  useEffect(() => {
    if (!activeProjectId) {
      setProjectRecordings([]);
      setProjectTimelines([]);
      setProjectArtifacts({ tasks: [], routines: [], configs: [], flows: [] });
      setProjectFlows([]);
      setNativeNodeDefinitions([]);
      setPublishedFlowDefinitions([]);
      setFlowPublications([]);
      setFlowDependencyInfo({ dependencies: [], usedBy: [], availableUpgrades: [] });
      setRuntimeSessions([]);
      setPipelineArtifacts({ normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [], stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
      setRecordingDomains([]);
      return;
    }
    void refreshProjectRuntimeState(activeProjectId).then(() => undefined);
  }, [activeProjectId]);
  useEffect(() => {
    function refreshProjectChooser() {
      if (document.visibilityState === "visible" && !activeProjectId) void refreshProjects();
    }
    window.addEventListener("focus", refreshProjectChooser);
    document.addEventListener("visibilitychange", refreshProjectChooser);
    return () => {
      window.removeEventListener("focus", refreshProjectChooser);
      document.removeEventListener("visibilitychange", refreshProjectChooser);
    };
  }, [activeProjectId, refreshProjects]);

  useEffect(() => {
    const unregister = registerAutomationStudioDevelopmentSubscription({ id: "project-context", kind: "event" });
    async function publishContext() {
      await fetch("/api/client-gateway/automation-studio-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeProjectId })
      }).catch(() => undefined);
    }
    function publishVisibleContext() {
      if (document.visibilityState === "visible") void publishContext();
    }
    void publishContext();
    window.addEventListener("focus", publishVisibleContext);
    document.addEventListener("visibilitychange", publishVisibleContext);
    return () => {
      unregister();
      window.removeEventListener("focus", publishVisibleContext);
      document.removeEventListener("visibilitychange", publishVisibleContext);
      void fetch("/api/client-gateway/automation-studio-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeProjectId: null })
      }).catch(() => undefined);
    };
  }, [activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    const unregister = registerAutomationStudioDevelopmentSubscription({ id: "gateway-activity", kind: "event" });
    async function refreshGatewaySnapshot() {
      const response = await fetch("/api/client-gateway/snapshot", { cache: "no-store" }).catch(() => null);
      if (!response) return;
      if (response.status === 401) {
        cancelled = true;
        window.location.href = "/";
        return;
      }
      const result = await response.json().catch(() => null);
      if (!cancelled && result?.ok) {
        const activity = automationStudioGatewayActivitySnapshot(result.payload);
        const signature = JSON.stringify(activity);
        if (signature !== gatewayActivitySignatureRef.current) {
          gatewayActivitySignatureRef.current = signature;
          setGatewaySnapshot(activity);
        }
      }
    }
    function refreshVisibleGatewaySnapshot() {
      if (document.visibilityState === "visible") void refreshGatewaySnapshot();
    }
    void refreshGatewaySnapshot();
    window.addEventListener("focus", refreshVisibleGatewaySnapshot);
    document.addEventListener("visibilitychange", refreshVisibleGatewaySnapshot);
    window.addEventListener("program-api:mutation", refreshVisibleGatewaySnapshot);
    return () => {
      cancelled = true;
      unregister();
      window.removeEventListener("focus", refreshVisibleGatewaySnapshot);
      document.removeEventListener("visibilitychange", refreshVisibleGatewaySnapshot);
      window.removeEventListener("program-api:mutation", refreshVisibleGatewaySnapshot);
    };
  }, []);

  useEffect(() => {
    projectSyncClientRef.current?.stop();
    projectSyncClientRef.current = null;
    if (!activeProjectId) return;
    const projectId = activeProjectId;
    const client = new AutomationStudioProjectSyncClient({
      projectId,
      fetchPage: async ({ afterSequence, limit, signal }) => {
        const result = await api.post<AutomationStudioProjectChangePage>("list-project-change-feed", { projectId, afterSequence, limit }, { signal });
        if (!result.ok || !result.payload) throw new Error(result.error ?? "Project change feed could not be loaded.");
        return result.payload;
      },
      onInvalidations: (invalidations) => {
        applyAutomationStudioInvalidations(clientStores, invalidations);
        reconcileProjectChangeFeedInvalidations(projectId, invalidations);
      }
    });
    projectSyncClientRef.current = client;
    client.start();
    function notifyProjectMutation(event: Event) {
      const detail = (event as CustomEvent<{ programId?: string; projectId?: string }>).detail;
      if (detail?.programId === "automation-studio" && detail.projectId === projectId) client.notifyMutation();
    }
    window.addEventListener("program-api:mutation", notifyProjectMutation);
    return () => {
      window.removeEventListener("program-api:mutation", notifyProjectMutation);
      client.stop();
      if (projectSyncClientRef.current === client) projectSyncClientRef.current = null;
    };
  }, [activeProjectId, api, clientStores, dataCache]);

  const canonical = snapshot?.payload?.canonical ?? {};
  const recordings = useMemo(
    () => activeProjectId ? projectRecordings : mergeById(projectRecordings, canonical.recordingSessions ?? [], "recordingId"),
    [activeProjectId, projectRecordings, canonical.recordingSessions]
  );
  const timelines = useMemo(
    () => activeProjectId ? projectTimelines : mergeById(projectTimelines, canonical.normalizedTimelines ?? [], "normalizedTimelineId"),
    [activeProjectId, projectTimelines, canonical.normalizedTimelines]
  );
  const registries = useMemo(() => canonical.signalRegistries ?? [], [canonical.signalRegistries]);
  const models = useMemo(
    () => mergeById(pipelineArtifacts.learnedTaskModels ?? [], canonical.learnedTaskModels ?? [], "learnedTaskModelId"),
    [pipelineArtifacts.learnedTaskModels, canonical.learnedTaskModels]
  );
  const proposals = useMemo(() => pipelineArtifacts.policyProposals ?? [], [pipelineArtifacts.policyProposals]);
  const recordingFlowProposals = useMemo(() => pipelineArtifacts.recordingFlowProposals ?? [], [pipelineArtifacts.recordingFlowProposals]);
  const hierarchyProposals = useMemo(
    () => [...proposals, ...recordingFlowProposals],
    [proposals, recordingFlowProposals]
  );
  const policies = useMemo<any[]>(() => canonical.policyGraphs ?? [], [canonical.policyGraphs]);
  const snapshotProblems = useMemo<any[]>(() => snapshot?.payload?.problems ?? [], [snapshot?.payload?.problems]);
  const signals = useMemo(
    () => registries.flatMap((registry: any) => (registry.definitions ?? []).map((signal: any) => ({ ...signal, registryId: registry.registryId }))),
    [registries]
  );
  const availableNodeDefinitions = useMemo(
    () => [...nativeNodeDefinitions, ...publishedFlowDefinitions],
    [nativeNodeDefinitions, publishedFlowDefinitions]
  );
  const indexedStateSourceList = useMemo(() => Object.values(indexedStateSources), [indexedStateSources]);
  const projectTasks = projectArtifacts.tasks ?? [];
  const flowViewState = workspacePrefs.viewStates?.["policy-primary"] ?? {};
  const lastOpenFlowId = typeof flowViewState.lastOpenFlowId === "string" ? flowViewState.lastOpenFlowId : null;
  const validLastOpenFlowEntry = lastOpenFlowId ? projectFlows.find((entry: any) => entry.source === "canonical" && entry.flow?.flowId === lastOpenFlowId) : null;
  const selectedFlowEntry = projectFlows.find((entry: any) => selection?.kind === "flow" && entry.flow?.flowId === selection.id)
    ?? validLastOpenFlowEntry
    ?? projectFlows.find((entry: any) => entry.source === "canonical")
    ?? projectFlows[0]
    ?? null;
  const selectedFlow = selectedFlowEntry?.flow ?? null;
  const runnableFlowEntry = selectedFlowEntry?.source === "canonical" ? selectedFlowEntry : null;
  const runnableFlow = runnableFlowEntry?.flow ?? null;
  useEffect(() => {
    if (!activeProjectId || !selectedFlow?.flowId || selectedFlowEntry?.source !== "canonical") {
      setFlowPublications([]);
      setFlowDependencyInfo({ dependencies: [], usedBy: [], availableUpgrades: [] });
      return;
    }
    const projectId = activeProjectId;
    const flowId = selectedFlow.flowId;
    void (async () => {
      let results = dataCache.get<any[]>("flow-metadata", projectId, flowId, 30_000);
      if (!results) {
        results = await runLatest("flow-metadata", (signal) => Promise.all([
          api.post<any>("list-flow-publications", { projectId, flowId }, { signal }),
          api.post<any>("inspect-flow-dependencies", { projectId, flowId }, { signal })
        ]));
        if (!results) return;
        dataCache.set("flow-metadata", projectId, flowId, results);
      }
      const [publicationResult, dependencyResult] = results;
      if (publicationResult.ok) setFlowPublications(publicationResult.payload?.publications ?? []);
      if (dependencyResult.ok) setFlowDependencyInfo(dependencyResult.payload ?? { dependencies: [], usedBy: [], availableUpgrades: [] });
    })();
  }, [activeProjectId, selectedFlow?.flowId, selectedFlow?.updatedAt, selectedFlowEntry?.source, api, dataCache, runLatest]);
  const proposalViewState = workspacePrefs.viewStates?.["proposal-workbench"] ?? {};
  const proposalReviewsSource = proposalViewState.proposalReviews;
  const proposalReviews = proposalReviewsSource && typeof proposalReviewsSource === "object" && !Array.isArray(proposalReviewsSource) ? proposalReviewsSource as Record<string, any> : {};
  const lastOpenTaskId = typeof proposalViewState.lastOpenTaskId === "string" ? proposalViewState.lastOpenTaskId : null;
  const validLastOpenTask = lastOpenTaskId ? projectTasks.find((task: any) => task.taskId === lastOpenTaskId) : null;
  const selectionProposalId = selection?.kind === "proposal"
    ? selection.id
    : selection?.kind === "proposal-step"
      ? selection.proposalId
      : selection?.kind === "state"
        ? selection.proposalId
        : selection?.kind === "editor-node" && typeof selection.node.metadata?.proposalId === "string"
          ? selection.node.metadata.proposalId
          : undefined;
  const selectionRecordingIdForProposal = selection?.kind === "recording"
    ? selection.id
    : selection?.kind === "timeline"
      ? timelines.find((timeline: any) => timeline.timeline?.some((entry: any) => entry.id === selection.id))?.recordingId
        ?? recordings.find((recording: any) => recording.timeline?.some((entry: any) => entry.id === selection.id))?.recordingId
      : selection?.kind === "state"
        ? selection.recordingId ?? recordingIdFromStateSourceId(selection.sourceId)
        : selection?.kind === "proposal" || selection?.kind === "proposal-step"
          ? selection.recordingId
          : selection?.kind === "editor-node" && typeof selection.node.metadata?.recordingId === "string"
            ? selection.node.metadata.recordingId
            : undefined;
  const selectedProposal = hierarchyProposals.find((proposal: any) => selectionProposalId && proposal.proposalId === selectionProposalId)
    ?? latestProposalForRecordingId(selectionRecordingIdForProposal, proposals, recordingFlowProposals)
    ?? (selection ? null : hierarchyProposals[0] ?? null);
  const selectedTask = projectTasks.find((task: any) => selection?.kind === "policy" && (task.metadata?.policyId === selection.id || task.taskId === selection.id))
    ?? validLastOpenTask
    ?? projectTasks[0]
    ?? null;
  const selectedTaskFlow = selectedTask
    ? (projectArtifacts.flows ?? []).find((flow: any) => (selectedTask.graphId || selectedTask.policyFlowId) && flow.flowId === (selectedTask.graphId ?? selectedTask.policyFlowId))
      ?? (projectArtifacts.flows ?? []).find((flow: any) => flow.ownerKind === "task" && flow.ownerId === selectedTask.taskId)
      ?? null
    : null;
  const projectFlowUrlScopeSignature = useMemo(() => projectFlows.map((entry: any) => {
    const flow = entry?.flow ?? entry;
    return [
      flow?.flowId ?? "",
      flow?.metadata?.subflowGraph === true ? "subflow" : "flow",
      flow?.metadata?.parentFlowId ?? "",
      flow?.metadata?.parentSubflowId ?? ""
    ].join(":");
  }).join("|"), [projectFlows]);  const selectedTaskGraph = selectedFlow ?? selectedTask?.graph ?? selectedTaskFlow;
  const selectedTaskGraphDraftKey = automationGraphDraftIdentity(selectedTaskGraph);
  const selectedTaskGraphDraft = selectedTaskGraphDraftKey ? taskGraphDrafts[selectedTaskGraphDraftKey] ?? null : null;
  const baseTaskGraphDocument = useMemo(() => selectedTaskGraph
    ? taskFlowToReactFlowGraph(selectedTaskGraph, "", [...nativeNodeDefinitions, ...publishedFlowDefinitions])
    : null, [selectedTaskGraph, nativeNodeDefinitions, publishedFlowDefinitions]);
  useEffect(() => {
    if (!activeProjectId || !selectedTaskGraph?.flowId) {
      setRecoverableTaskGraphDraft(null);
      return;
    }
    if (selectedTaskGraphDraft) {
      setRecoverableTaskGraphDraft(null);
      return;
    }
    const legacyDraft = loadAutomationGraphDraft<{ nodes: any[]; edges: any[] }>(activeProjectId, selectedTaskGraph.flowId);
    if (legacyDraft) {
      setRecoverableTaskGraphDraft(legacyDraft);
      return;
    }
    let cancelled = false;
    void loadAutomationGraphOperationDraft(activeProjectId, selectedTaskGraph.flowId).then((draft) => {
      if (cancelled || !draft || !baseTaskGraphDocument) return;
      const graph = applyAutomationGraphOperationBatch(baseTaskGraphDocument as any, { batchId: "browser-draft", baseRevision: draft.baseRevision, createdAt: draft.savedAt, operations: draft.operations as any, estimatedBytes: draft.estimatedBytes }, "forward");
      setRecoverableTaskGraphDraft({ projectId: draft.projectId, flowId: draft.flowId, baseUpdatedAt: draft.baseUpdatedAt, savedAt: draft.savedAt, graph });
    });
    return () => { cancelled = true; };
  }, [activeProjectId, selectedTaskGraph?.flowId, selectedTaskGraph?.updatedAt, Boolean(selectedTaskGraphDraft), baseTaskGraphDocument]);

  useEffect(() => {
    if (!activeProjectId || !selectedTaskGraph?.flowId || !selectedTaskGraphDraft) {
      graphDraftPersistenceRef.current = null;
      return;
    }
    const existing = loadAutomationGraphDraft(activeProjectId, selectedTaskGraph.flowId);
    graphDraftPersistenceRef.current = {
      projectId: activeProjectId,
      flowId: selectedTaskGraph.flowId,
      baseUpdatedAt: existing?.baseUpdatedAt ?? selectedTaskGraph.updatedAt ?? 0,
      savedAt: Date.now(),
      graph: selectedTaskGraphDraft
    };
  }, [activeProjectId, selectedTaskGraph?.flowId, selectedTaskGraph?.updatedAt, selectedTaskGraphDraft]);

  useEffect(() => {
    const projectId = activeProjectId;
    const flowId = selectedTaskGraph?.flowId;
    return () => {
      const pending = graphDraftPersistenceRef.current;
      if (projectId && flowId && pending?.projectId === projectId && pending.flowId === flowId) saveAutomationGraphDraft({ ...pending, savedAt: Date.now() });
    };
  }, [activeProjectId, selectedTaskGraph?.flowId]);
  useEffect(() => {
    if (!activeProjectId || !selectedTaskGraph?.flowId || !selectedTaskGraphDraft) return;
    const projectId = activeProjectId;
    const flowId = selectedTaskGraph.flowId;
    const timeout = window.setTimeout(() => {
      const existing = loadAutomationGraphDraft(projectId, flowId);
      const stored = saveAutomationGraphDraft({
        projectId,
        flowId,
        baseUpdatedAt: existing?.baseUpdatedAt ?? selectedTaskGraph.updatedAt ?? 0,
        savedAt: Date.now(),
        graph: selectedTaskGraphDraft
      });
      if (!stored) notifyGlobalAlert({ tone: "error", title: "Draft recovery unavailable", message: "FluxIQ could not preserve this whiteboard draft in browser storage.", id: "automation-draft-store-failed" });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [activeProjectId, selectedTaskGraph?.flowId, selectedTaskGraph?.updatedAt, selectedTaskGraphDraft]);
  const activePane = workspacePrefs.panes.find((item) => item.id === workspacePrefs.activePaneId) ?? workspacePrefs.panes[0];
  const activeViewId = activePane?.activeViewId ?? workspacePrefs.activeViewId ?? "policy-primary";
  const graphForValidation = useMemo(() => selectedTaskGraphDraft ?? baseTaskGraphDocument, [selectedTaskGraphDraft, baseTaskGraphDocument]);
  const [graphProblems, setGraphProblems] = useState<any[]>([]);
  const graphProblemsVisible = activeViewId === "problems-view" || workspacePrefs.rightSidebar.activeViewId === "problems-view";
  useEffect(() => {
    if (!graphProblemsVisible || !graphForValidation) {
      if (graphProblems.length) setGraphProblems([]);
      return;
    }
    const flowId = selectedTaskGraph?.flowId ?? selectedTaskGraph?.id ?? "current-flow";
    const flowName = selectedTaskGraph?.name ?? "Current Flow";
    let cancelled = false;
    const cancel = scheduleAutomationGraphIdleTask(() => {
      const nextProblems = automationPolicyGraphProblems(graphForValidation.nodes, graphForValidation.edges).map((problem) => ({
        ...problem,
        id: "graph:" + problem.id,
        severity: "error",
        source: "graph",
        artifactId: flowId,
        artifactLabel: flowName
      }));
      if (!cancelled) setGraphProblems(nextProblems);
    }, { delayMs: 80, timeoutMs: 1_000 });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [graphProblemsVisible, graphForValidation, selectedTaskGraph?.flowId, selectedTaskGraph?.id, selectedTaskGraph?.name]);
  const problems = useMemo(() => {
    const graphProblemIds = new Set(graphProblems.map((problem) => problem.id));
    return [...graphProblems, ...snapshotProblems.map((problem: any, index: number) => ({
      ...problem,
      id: problem.id && !graphProblemIds.has(String(problem.id)) ? String(problem.id) : "snapshot:" + (problem.id ?? index),
      severity: problem.severity ?? "error",
      source: problem.source ?? "project"
    }))];
  }, [graphProblems, snapshotProblems]);
  const selectedCanonicalPolicy = selectedTask
    ? policies.find((policy: any) => selectedTask.metadata?.policyId && policy.policyId === selectedTask.metadata.policyId)
      ?? policies.find((policy: any) => policy.taskId === selectedTask.taskId)
      ?? null
    : selection?.kind === "policy"
    ? policies.find((policy: any) => policy.policyId === selection.id)
      ?? null
    : policies[0] ?? null;
  const selectedPolicy = useMemo(
    () => selectedTaskGraph ? flowToTaskPolicy(selectedTaskGraph, selectedTask) : selectedCanonicalPolicy,
    [selectedTaskGraph, selectedTask, selectedCanonicalPolicy]
  );
  const timelineSelectionRecordingId = selection?.kind === "timeline"
    ? timelines.find((timeline: any) => timeline.timeline?.some((entry: any) => entry.id === selection.id))?.recordingId
      ?? recordings.find((recording: any) => recording.timeline?.some((entry: any) => entry.id === selection.id))?.recordingId
    : selection?.kind === "state"
      ? selection.recordingId ?? recordingIdFromStateSourceId(selection.sourceId)
    : null;
  const proposalSelectionRecordingId = selection?.kind === "proposal"
    ? selection.recordingId ?? selectedProposal?.metadata?.recordingId ?? selectedProposal?.recordingId
    : selection?.kind === "proposal-step"
      ? selection.recordingId ?? selectedProposal?.metadata?.recordingId ?? selectedProposal?.recordingId
      : selection?.kind === "editor-node"
        ? typeof selection.node.metadata?.recordingId === "string" ? selection.node.metadata.recordingId : selectedProposal?.metadata?.recordingId ?? selectedProposal?.recordingId
      : selection?.kind === "state"
        ? selection.recordingId ?? (selection.proposalId ? hierarchyProposals.find((proposal: any) => proposal.proposalId === selection.proposalId)?.metadata?.recordingId ?? hierarchyProposals.find((proposal: any) => proposal.proposalId === selection.proposalId)?.recordingId : undefined)
      : null;
  const selectedRecordingId = timelineSelectionRecordingId ?? proposalSelectionRecordingId;
  const selectedRecording = recordings.find((recording: any) => selection?.kind === "recording" ? recording.recordingId === selection.id : recording.recordingId === selectedRecordingId)
    ?? (selection ? null : recordings[0] ?? null);
  const selectedTimeline = selectedRecording
    ? timelines.find((timeline: any) => timeline.recordingId === selectedRecording.recordingId) ?? null
    : selection ? null : timelines[0] ?? null;
  const selectedNode = selection?.kind === "editor-node"
    ? { id: selection.id, ...selection.node, actions: (selection.node.actionTypes ?? []).map((actionType) => ({ actionType })), recovery: { strategy: selection.node.family } }
    : selectedProposal?.policy?.nodes?.find((node: any) => selection?.kind === "state" && selection.proposalId && selection.nodeId && selection.nodeId === node.id)
      ?? selectedProposal?.policy?.nodes?.find((node: any) => selection?.kind === "proposal-step" && selection.id === node.id)
      ?? selectedProposal?.policy?.nodes?.find((node: any) => selection?.kind === "proposal-step" && `node.${selection.id}` === node.id)
      ?? selectedPolicy?.nodes?.find((node: any) => selection?.kind === "node" && selection.id === node.id)
      ?? selectedPolicy?.nodes?.find((node: any) => selection?.kind === "state" && selection.nodeId && selection.nodeId === node.id)
      ?? (selection ? null : selectedPolicy?.nodes?.[0] ?? null);
  const selectedEntry = selectedTimeline?.timeline?.find((entry: any) => selection?.kind === "timeline" && selection.id === entry.id) ?? selectedRecording?.timeline?.find((entry: any) => selection?.kind === "timeline" && selection.id === entry.id);
  const activePreviewSourceEntryId = pendingStateOpen?.timelineEntryId
    ?? bottomPreviewEntryId
    ?? (selection?.kind === "state" && selection.timelineEntryId ? selection.timelineEntryId : undefined)
    ?? selectedNodeActionPreviewEntryId(selectedTimeline ?? selectedRecording, selectedNode);
  const activePreviewEntryId = selectedEntry?.id
    ?? resolveActionPreviewEntryId(selectedTimeline ?? selectedRecording, activePreviewSourceEntryId);
  const activePreviewEntry = activePreviewEntryId
    ? (selectedTimeline?.timeline?.find((entry: any) => entry.id === activePreviewEntryId)
      ?? selectedRecording?.timeline?.find((entry: any) => entry.id === activePreviewEntryId)
      ?? selectedEntry)
    : selectedEntry;
  const selectedSignal = signals.find((signal: any) => selection?.kind === "signal" && selection.id === signal.path);
  const selectedTimelineEntries = useMemo(() => selectedTimeline?.timeline ?? selectedRecording?.timeline ?? [], [selectedTimeline?.timeline, selectedRecording?.timeline]);
  const selectedRecordingNotes = useMemo(() => selectedRecording?.notes ?? [], [selectedRecording?.notes]);
  const recoverableTaskGraphDraftView = useMemo(() => recoverableTaskGraphDraft
    ? { savedAt: recoverableTaskGraphDraft.savedAt, stale: recoverableTaskGraphDraft.baseUpdatedAt !== (selectedTaskGraph?.updatedAt ?? 0) }
    : null, [recoverableTaskGraphDraft?.savedAt, recoverableTaskGraphDraft?.baseUpdatedAt, selectedTaskGraph?.updatedAt]);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const restoringUrlProject = Boolean(urlProjectId && !activeProject && !projectStatus && (!projectsLoaded || activeProjectId === urlProjectId || urlProjectOpenAttemptRef.current === urlProjectId));
  useEffect(() => {
    if (!activeProjectId || !selectedRecording?.recordingId || selectedRecording.metadata?.summaryOnly !== true) return;
    if (!["recording", "timeline", "state"].includes(selection?.kind ?? "")) return;
    void loadRecordingDetails(selectedRecording.recordingId);
  }, [activeProjectId, selectedRecording?.recordingId, selectedRecording?.metadata?.summaryOnly, selection?.kind]);
  useEffect(() => {
    if (!activeProjectId || !selectedProposal?.proposalId || selectedProposal.metadata?.summaryOnly !== true) return;
    if (!["proposal", "proposal-step", "editor-node", "state"].includes(selection?.kind ?? "")) return;
    void loadProposalDetails(selectedProposal.proposalId, proposalArtifactKind(selectedProposal));
  }, [activeProjectId, selectedProposal?.proposalId, selectedProposal?.metadata?.summaryOnly, selection?.kind]);
  useEffect(() => {
    if (!activeProjectId || !selection || !selectedRecordingId || selectedRecording?.recordingId === selectedRecordingId) return;
    if (!["proposal", "proposal-step", "editor-node", "state", "timeline"].includes(selection.kind)) return;
    void loadRecordingDetails(selectedRecordingId);
  }, [activeProjectId, selectedRecordingId, selectedRecording?.recordingId, selection?.kind]);
  useEffect(() => {
    if (!activeProjectId || !selectionProposalId || selectedProposal?.proposalId === selectionProposalId) return;
    if (!["proposal", "proposal-step", "editor-node", "state"].includes(selection?.kind ?? "")) return;
    void loadProposalDetails(selectionProposalId);
  }, [activeProjectId, selectionProposalId, selectedProposal?.proposalId, selection?.kind]);

  const viewInstances: AutomationViewInstance[] = [
    { id: "client-gateway", label: "Connected Clients", type: "clients", icon: Radio, state: "live" },
    { id: "timeline-recording", label: `Timeline: ${selectedRecording?.name ?? selectedRecording?.recordingId ?? "Recording"}`, type: "recordings", icon: Radio, state: "live" },
    { id: "proposal-generator", label: `Legacy Proposal Generator: ${selectedRecording?.metadata?.name ?? selectedRecording?.recordingId ?? "Recording"}`, type: "proposal-generator", icon: Sparkles },
    { id: "proposal-workbench", label: `Legacy Proposal: ${selectedProposal?.policy?.taskId ?? selectedProposal?.proposalId ?? "Proposal"}`, type: "proposal", icon: Sparkles },
    { id: "policy-primary", label: selectedFlow ? `Flow: ${selectedFlow.name}` : "Flow: None", type: "design", icon: GitBranch },
    { id: "flow-router", label: "Router", type: "router", icon: GitBranch },
    { id: "flow-subflows", label: "Subflows", type: "subflows", icon: GitBranch },
    { id: "flow-instructions", label: "Instructions", type: "instructions", icon: ListChecks },
    { id: "adaptations", label: "Adaptations", type: "adaptations", icon: FileSearch },
    { id: "flow-settings", label: "Settings", type: "settings", icon: SlidersHorizontal },
    { id: "state-explorer", label: selectedNode?.label ? `State: ${selectedNode.label}` : "State View", type: "state", icon: ListChecks },
    { id: "runtime-debug", label: "Runtime Debug", type: "runtime", icon: Bug },
    { id: "problems-view", label: "Problems", type: "problems", icon: AlertTriangle },
    { id: "global-inspector", label: "Inspector", type: "inspector", icon: SlidersHorizontal },
  ];
  const openWorkspaceViewIds = new Set([
    ...workspacePrefs.panes.flatMap((pane) => pane.tabs),
    ...workspacePrefs.rightSidebar.tabs
  ]);
  const viewAdderOptions = windowAdderOpen
    ? automationViewAdderOptions(viewInstances, windowAdderOpen.area, {
      hasProject: Boolean(activeProjectId),
      hasFlow: Boolean(selectedFlow),
      hasRecording: Boolean(selectedRecording),
      hasSelection: Boolean(selection)
    }, openWorkspaceViewIds)
  : [];
  const flowNodes = useMemo(
    () => flowHierarchyNodes(projectFlows, { recordings, proposals: hierarchyProposals }),
    [projectFlows, recordings, hierarchyProposals]
  );
  const generatedHierarchyIds = useMemo(() => new Set(flowNodes.map((node) => node.id)), [flowNodes]);
  const hierarchyNodes = useMemo<AutomationHierarchyNode[]>(() => {
    const deletedIds = new Set(deletedHierarchyIds);
    return [
      ...flowNodes,
      ...customHierarchyNodes.filter((node) => isPersistableHierarchyNode(node) && node.category === "flow")
    ].filter((node) => !deletedIds.has(node.id) || (generatedHierarchyIds.has(node.id) && automationHierarchyNodeIsGeneratedFlowStructure(node)));
  }, [customHierarchyNodes, deletedHierarchyIds, flowNodes, generatedHierarchyIds]);
  const normalizedProjectSearch = projectSearch.trim().toLocaleLowerCase();
  const hierarchyMatchCount = hierarchyNodes.filter((node) =>
    (projectTypeFilter === "all" || node.kind === projectTypeFilter)
    && (!normalizedProjectSearch || (node.label + " " + node.kind).toLocaleLowerCase().includes(normalizedProjectSearch))
  ).length;  const folderOptions = hierarchyNodes.filter((node) => node.kind === "folder" && node.category === hierarchyCategory);
  const hierarchySubflowParent = hierarchyAction?.action === "create" ? hierarchySubflowCategoryParent(hierarchyParentId) : null;
  const hierarchyFolderOptions = hierarchySubflowParent
    ? hierarchyNodes.filter((node) => node.flowId === hierarchySubflowParent.flowId && (automationHierarchyNodeIsSubflowRoot(node) || automationHierarchyNodeIsSubflowCategory(node)))
    : folderOptions;
  const viewById = new Map(viewInstances.map((view) => [view.id, view]));
  function viewWithTitleData(view: AutomationViewInstance, sourceSelection?: AutomationSelection | null): AutomationViewInstance {
    return {
      ...view,
      label: viewLabelForSelection(view, sourceSelection)
    };
  }
  function viewLabelForSelection(view: AutomationViewInstance, sourceSelection?: AutomationSelection | null): string {
    const source = sourceSelection ?? selection;
    const recording = recordingForSelection(source);
    const proposal = proposalForSelection(source);
    const policy = policyForSelection(source);
    const task = taskForSelection(source);
    if (view.id === "timeline-recording") return `Timeline: ${recording?.name ?? recording?.recordingId ?? "Recording"}`;
    if (view.id === "proposal-generator") return `Legacy Proposal Generator: ${recording?.metadata?.name ?? recording?.name ?? recording?.recordingId ?? "Recording"}`;
    if (view.id === "proposal-workbench") return `Legacy Proposal: ${proposal?.policy?.taskId ?? proposal?.proposalId ?? "Proposal"}`;
    if (view.id === "policy-primary") return selectedFlow ? `Flow: ${selectedFlow.name}` : "Flow: None";
    if (view.id === "state-explorer") return `State: ${selectedNode?.label ?? source?.id ?? "View"}`;
    return view.label;
  }
  function flowForSelection(source: AutomationSelection | null | undefined) {
    if (source?.kind === "flow") {
      return projectFlows.find((entry: any) => entry.flow?.flowId === source.id)?.flow
        ?? (projectArtifacts.flows ?? []).find((flow: any) => flow.flowId === source.id)
        ?? selectedFlow;
    }
    const task = taskForSelection(source);
    return task
      ? (projectArtifacts.flows ?? []).find((flow: any) => (task.graphId || task.policyFlowId) && flow.flowId === (task.graphId ?? task.policyFlowId))
        ?? (projectArtifacts.flows ?? []).find((flow: any) => flow.ownerKind === "task" && flow.ownerId === task.taskId)
        ?? task.graph
        ?? selectedFlow
      : selectedFlow;
  }
  function recordingForSelection(source: AutomationSelection | null | undefined) {
    const timelineRecordingId = source?.kind === "timeline"
      ? timelines.find((timeline: any) => timeline.timeline?.some((entry: any) => entry.id === source.id))?.recordingId
        ?? recordings.find((recording: any) => recording.timeline?.some((entry: any) => entry.id === source.id))?.recordingId
      : source?.kind === "state"
        ? source.recordingId ?? recordingIdFromStateSourceId(source.sourceId)
      : null;
    const proposalRecordingId = source?.kind === "proposal"
      ? source.recordingId ?? hierarchyProposals.find((proposal: any) => proposal.proposalId === source.id)?.metadata?.recordingId ?? hierarchyProposals.find((proposal: any) => proposal.proposalId === source.id)?.recordingId
      : source?.kind === "proposal-step"
        ? source.recordingId ?? hierarchyProposals.find((proposal: any) => proposal.proposalId === source.proposalId)?.metadata?.recordingId ?? hierarchyProposals.find((proposal: any) => proposal.proposalId === source.proposalId)?.recordingId
        : source?.kind === "state"
          ? source.recordingId ?? (source.proposalId ? hierarchyProposals.find((proposal: any) => proposal.proposalId === source.proposalId)?.metadata?.recordingId ?? hierarchyProposals.find((proposal: any) => proposal.proposalId === source.proposalId)?.recordingId : undefined)
        : null;
    if (source?.kind === "recording") return recordings.find((recording: any) => recording.recordingId === source.id) ?? null;
    const requestedRecordingId = timelineRecordingId ?? proposalRecordingId;
    const exact = recordings.find((recording: any) => recording.recordingId === requestedRecordingId);
    if (source?.kind === "timeline" || source?.kind === "proposal" || source?.kind === "proposal-step" || source?.kind === "editor-node" || source?.kind === "state") return exact ?? null;
    return exact ?? selectedRecording;
  }
  function proposalForSelection(source: AutomationSelection | null | undefined) {
    const exact = hierarchyProposals.find((proposal: any) => source?.kind === "proposal" && proposal.proposalId === source.id)
      ?? hierarchyProposals.find((proposal: any) => source?.kind === "proposal-step" && proposal.proposalId === source.proposalId)
      ?? hierarchyProposals.find((proposal: any) => source?.kind === "recording" && (proposal.metadata?.recordingId === source.id || proposal.recordingId === source.id))
      ?? hierarchyProposals.find((proposal: any) => source?.kind === "state" && source.proposalId && proposal.proposalId === source.proposalId)
      ?? null;
    if (source?.kind === "proposal" || source?.kind === "proposal-step" || source?.kind === "editor-node" || source?.kind === "state" || source?.kind === "recording") return exact;
    return exact ?? selectedProposal;
  }
  function taskForSelection(source: AutomationSelection | null | undefined) {
    return projectTasks.find((task: any) => source?.kind === "policy" && (task.metadata?.policyId === source.id || task.taskId === source.id))
      ?? validLastOpenTask
      ?? projectTasks[0]
      ?? selectedTask;
  }
  function policyForSelection(source: AutomationSelection | null | undefined) {
    const task = taskForSelection(source);
    return source?.kind === "policy"
      ? policies.find((policy: any) => policy.policyId === source.id)
        ?? policies.find((policy: any) => task?.metadata?.policyId && policy.policyId === task.metadata.policyId)
        ?? selectedPolicy
      : selectedPolicy;
  }
  const activeFlowScope = selectedFlow?.flowId ? automationStudioFlowScope(selectedFlow.flowId, projectFlows) : null;
  const breadcrumbFlow = activeFlowScope ? projectFlows.find((entry: any) => entry.flow?.flowId === activeFlowScope.flowId)?.flow ?? null : null;
  const breadcrumbSubflow = activeFlowScope?.subflowId ? hierarchyNodes.find((node) => node.kind === "subflow" && node.flowId === activeFlowScope.flowId && node.sourceId === activeFlowScope.subflowId) ?? null : null;
  const workspaceBreadcrumbs = automationStudioWorkspaceBreadcrumbs({
    flowId: activeFlowScope?.flowId,
    flowName: breadcrumbFlow?.name ?? (activeFlowScope?.subflowId ? null : selectedFlow?.name),
    subflowId: activeFlowScope?.subflowId,
    subflowName: breadcrumbSubflow?.label ?? (activeFlowScope?.subflowId ? selectedFlow?.name : null),
    viewId: activeViewId,
    viewLabel: activeViewId === "policy-primary" ? "Nodes" : viewById.get(activeViewId)?.label ?? "Workspace"
  });
  useEffect(() => {
    if (!activeProjectId || selection?.kind !== "flow") return;
    updateWorkspacePrefs((current) => {
      const currentPolicyState = current.viewStates?.["policy-primary"] ?? {};
      if (currentPolicyState.lastOpenFlowId === selection.id) return current;
      return {
        ...current,
        viewStates: {
          ...current.viewStates,
          "policy-primary": { ...currentPolicyState, lastOpenFlowId: selection.id }
        }
      };
    }, { persist: false });
  }, [activeProjectId, selection?.kind, selection?.id]);

  useEffect(() => {
    if (!activeProjectId || selectedFlowEntry?.source !== "canonical" || !automationStudioFlowNeedsDetail(selectedFlow, activeViewId, selection?.kind)) return;
    void loadFlowDetails(selectedFlow.flowId);
  }, [activeProjectId, activeViewId, selectedFlow?.flowId, selectedFlow?.metadata?.summaryOnly, selectedFlowEntry?.source, selection?.kind]);
  useEffect(() => {
    if (!activeProjectId || activeViewId !== "policy-primary") return;
    if (nativeNodeDefinitions.length || publishedFlowDefinitions.length) return;
    void loadNodeDefinitions(activeProjectId);
  }, [activeProjectId, activeViewId, nativeNodeDefinitions.length, publishedFlowDefinitions.length]);
  useEffect(() => {
    if (!activeProjectId || activeViewId !== "timeline-recording" || !selectedRecording?.recordingId || selectedTimeline) return;
    void loadLatestNormalizedTimeline(selectedRecording.recordingId);
  }, [activeProjectId, activeViewId, selectedRecording?.recordingId, selectedTimeline?.normalizedTimelineId]);
  const selectedProposalReview = selectedProposal?.proposalId ? proposalReviews[selectedProposal.proposalId] ?? null : null;
  const proposalTargetFlowId = typeof selectedProposalReview?.targetFlowId === "string" && projectFlows.some((entry: any) => entry.source === "canonical" && entry.flow?.flowId === selectedProposalReview.targetFlowId)
    ? selectedProposalReview.targetFlowId
    : selectedFlowEntry?.source === "canonical" ? selectedFlow?.flowId ?? null : null;
  const showRecordingActionPreview = () => {
    updateWorkspacePrefs((current) => ({
      ...current,
      bottomDock: { ...current.bottomDock, activeViewId: "recording-action-preview", expanded: true },
      bottomTimelineCollapsed: false
    }), { persist: false });
  };
  const setSelectionAndFollow = (next: AutomationSelection, flowOpenMode: "preview" | "new-window" = "preview"): boolean => {

    if (next.kind !== "state") {
      pendingStateOpenKeyRef.current = null;
      setPendingStateOpen(null);
    }
    if (next.kind === "timeline") setBottomPreviewEntryId(next.id);
    else if (next.kind !== "state") setBottomPreviewEntryId(null);
    setSelection(next);
    if (next.kind === "recording" || next.kind === "timeline") {
      const recordingId = next.kind === "recording" ? next.id : recordings.find((recording: any) => recording.timeline?.some((entry: any) => entry.id === next.id))?.recordingId;
      if (recordingId) void loadRecordingDetails(recordingId);
      setRecordingTreePrimaryKind("recording");
      showRecordingActionPreview();
    }
    if (next.kind === "signal") openView("state-explorer", "preview", "main");
    if (next.kind === "state") openView("state-explorer", "preview", "main");
    if (next.kind === "policy") openView("policy-primary", "preview");
    if (next.kind === "flow") {
      const flowEntry = projectFlows.find((entry: any) => entry.source === "canonical" && entry.flow?.flowId === next.id);
      if (flowEntry) {
        if (flowEntry.flow?.metadata?.summaryOnly === true) void loadFlowDetails(next.id);
        if (!nativeNodeDefinitions.length && !publishedFlowDefinitions.length && activeProjectId) void loadNodeDefinitions(activeProjectId);
      }
      openView("policy-primary", flowOpenMode);
    }
    return true;
  };
  const openRecordingTimeline = (recordingId: string) => {
    setSelection({ kind: "recording", id: recordingId });
    void loadRecordingDetails(recordingId);
    setRecordingTreePrimaryKind("recording");
    showRecordingActionPreview();
    openView("timeline-recording", "preview");
  };
  const openTimelineEntryState = (recordingId: string, entryId: string) => {
    void loadRecordingDetails(recordingId);
    void openStateView({ recordingId, timelineEntryId: entryId, phase: "input" });
  };
  const handleBottomPreviewActionClick = (entryId: string) => {
    const recordingId = selectedRecording?.recordingId
      ?? recordings.find((recording: any) => recording.timeline?.some((entry: any) => entry.id === entryId))?.recordingId;
    const activePane = workspacePrefs.panes.find((pane) => pane.id === workspacePrefs.activePaneId) ?? workspacePrefs.panes[0];
    const activeView = activePane?.activeViewId;
    if (activeView === "state-explorer" && recordingId) {
      openTimelineEntryState(recordingId, entryId);
      return;
    }
    if (activeView === "timeline-recording") {
      setSelectionAndFollow({ kind: "timeline", id: entryId });
      return;
    }
    const openTimelinePane = workspacePrefs.panes.find((pane) => pane.activeViewId === "timeline-recording");
    if (openTimelinePane) {
      setSelectionAndFollow({ kind: "timeline", id: entryId });
      return;
    }
    const openStatePane = workspacePrefs.panes.find((pane) => pane.activeViewId === "state-explorer");
    if (openStatePane && recordingId) {
      openTimelineEntryState(recordingId, entryId);
      return;
    }
    setSelectionAndFollow({ kind: "timeline", id: entryId });
  };
  const openStateView = async (request: { nodeId?: string; sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; proposalId?: string; recordingId?: string; timelineEntryId?: string; stateSnapshotId?: string; repairAttempted?: boolean }) => {
    const nodeId = request.nodeId ?? selectedNode?.id;
    const nodeMetadata = stateOpenNodeMetadata(nodeId, selectedNode);
    const metadataStateSnapshotId = stringRecordValue(nodeMetadata, "stateSnapshotId");
    const metadataTimelineEntryId = stringRecordValue(nodeMetadata, "actionEntryId") ?? stringRecordValue(nodeMetadata, "timelineEntryId");
    const metadataStateRef = stringRecordValue(nodeMetadata, "stateRef");
    const recordingId = request.recordingId
      ?? stringRecordValue(nodeMetadata, "recordingId")
      ?? selectedRecording?.recordingId
      ?? selectedProposal?.metadata?.recordingId
      ?? selectedProposal?.recordingId
      ?? recordingIdFromStateSourceId(request.sourceId);
    const timelineEntryId = request.timelineEntryId ?? metadataTimelineEntryId;
    let sourceId = request.sourceId;
    let resolvedStateSnapshotId = request.stateSnapshotId ?? metadataStateSnapshotId;
    let resolvedStateRef: string | undefined = metadataStateRef;
    const phase = request.phase ?? "input";
    const pendingKey = recordingId && (timelineEntryId || resolvedStateSnapshotId)
      ? [recordingId, timelineEntryId ?? "", resolvedStateSnapshotId ?? "", phase].join("::")
      : "";
    const proposalId = request.proposalId
      ?? (selection?.kind === "proposal" ? selection.id : undefined)
      ?? (selection?.kind === "proposal-step" ? selection.proposalId : undefined)
      ?? (selection?.kind === "state" ? selection.proposalId : undefined)
      ?? selectedProposal?.proposalId;
    if (pendingKey) {
      pendingStateOpenKeyRef.current = pendingKey;
      if (timelineEntryId) setBottomPreviewEntryId(resolveActionPreviewEntryId(selectedTimeline ?? selectedRecording, timelineEntryId));
      setPendingStateOpen({
        key: pendingKey,
        recordingId,
        phase,
        ...(timelineEntryId ? { timelineEntryId } : {}),
        ...(resolvedStateSnapshotId ? { stateSnapshotId: resolvedStateSnapshotId } : {})
      });
      setSelection(compactStateSelection({
        kind: "state",
        id: stateSelectionId(compactStateSelectionId({ nodeId, flowId: selectedFlow?.flowId, proposalId, timelineEntryId, stateSnapshotId: resolvedStateSnapshotId })),
        nodeId,
        sourceId,
        phase,
        evidenceId: request.evidenceId,
        factPath: request.factPath,
        recordingId,
        proposalId,
        timelineEntryId,
        stateSnapshotId: resolvedStateSnapshotId,
        stateRef: resolvedStateRef
      }));
      if (timelineEntryId) setRecordingTreePrimaryKind("recording");
      openView("state-explorer", "preview", "main");
    }
    try {
    if (activeProjectId && recordingId && (timelineEntryId || resolvedStateSnapshotId)) {
      const endpoint = resolvedStateSnapshotId ? "get-state-snapshot" : "get-recording-entry-state";
      const payload = {
        projectId: activeProjectId,
        recordingId,
        ...(timelineEntryId ? { entryId: timelineEntryId } : {}),
        ...(resolvedStateSnapshotId ? { stateSnapshotId: resolvedStateSnapshotId } : {}),
        includeState: true
      };
      const result = await api.post<{
        resolved: { stateSnapshotId: string; entryId: string; stateRef: string; screenshotRef?: string } | null;
        state?: any;
        reason?: string;
      }>(endpoint, payload);
      if (result.ok && result.payload?.resolved) {
        const resolved = result.payload.resolved;
        resolvedStateSnapshotId = resolved.stateSnapshotId;
        resolvedStateRef = resolved.stateRef;
        sourceId = `observed:${recordingId}:${resolved.entryId}`;
        setBottomPreviewEntryId(resolveActionPreviewEntryId(selectedTimeline ?? selectedRecording, timelineEntryId ?? resolved.entryId));
        const resolvedState = result.payload.state;
        if (resolvedState) {
          setIndexedStateSources((current) => ({
            ...current,
            [sourceId!]: {
              source: {
                kind: "observed",
                id: sourceId,
                label: `Recording ${shortAutomationId(recordingId)} @ ${shortAutomationId(resolved.entryId)}`,
                recordingId,
                timelineEntryId: resolved.entryId,
                stateSnapshotId: resolved.stateSnapshotId,
                stateRef: resolved.stateRef,
                timestamp: resolvedState.timestamp
              },
              snapshot: resolvedState,
              raw: { resolved, state: resolvedState }
            }
          }));
        }
      } else {
        const reason = result.payload?.reason ?? result.error ?? "No linked state snapshot exists for this item.";
        setAutomationActionStatus(`${reason} Open this recording in Timeline and use Repair Index, then retry the state.`);
      }
    } else if ((timelineEntryId || resolvedStateSnapshotId) && recordingId) {
      setAutomationActionStatus("No indexed state lookup is available for this project.");
    }
    const selectionValue: AutomationSelection = compactStateSelection({
      kind: "state",
      id: stateSelectionId(compactStateSelectionId({ nodeId, flowId: selectedFlow?.flowId, proposalId, timelineEntryId, stateSnapshotId: resolvedStateSnapshotId })),
      nodeId,
      sourceId,
      phase,
      evidenceId: request.evidenceId,
      factPath: request.factPath,
      recordingId,
      proposalId,
      timelineEntryId,
      stateSnapshotId: resolvedStateSnapshotId,
      stateRef: resolvedStateRef
    });
    if (pendingKey && pendingStateOpenKeyRef.current !== pendingKey) return;
    setSelection(selectionValue);
    if (timelineEntryId) setRecordingTreePrimaryKind("recording");
    openView("state-explorer", "preview", "main");
    } finally {
      if (pendingKey) {
        setPendingStateOpen((current) => current?.key === pendingKey ? null : current);
        if (pendingStateOpenKeyRef.current === pendingKey) pendingStateOpenKeyRef.current = null;
      }
    }
  };
  const openStateViewRef = useRef(openStateView);
  useEffect(() => {
    openStateViewRef.current = openStateView;
  }, [openStateView]);
  useEffect(() => {
    function handleOpenNodeState(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId) openStateViewRef.current({ nodeId: detail.nodeId });
    }
    window.addEventListener("automation-studio:open-node-state", handleOpenNodeState);
    return () => window.removeEventListener("automation-studio:open-node-state", handleOpenNodeState);
  }, []);

  async function monitorStoppedGatewayRecording(recordingId: string) {
    if (!activeProjectId) return;
    setSelection({ kind: "recording", id: recordingId });
    setRecordingTreePrimaryKind("recording");
    openView("timeline-recording", "preview", "main");
    setRecordingProcessing({
      recordingId,
      label: "Recording stopped",
      detail: "Loading the finalized recording as optional Flow evidence.",
      progress: 12
    });
    setAutomationActionStatus("Recording stopped. Loading final timeline...");
    dataCache.invalidateScopes(activeProjectId, ["recording", "timeline", "summary"], [recordingId]);
    projectSyncClientRef.current?.notifyMutation();
    notifyProjectDataChanged(["recording", "timeline", "summary"], [recordingId]);
    setRecordingProcessing((current) => current?.recordingId === recordingId ? null : current);
    setAutomationActionStatus("Recording stopped. The finalized recording is available as Flow evidence.");
  }

  useEffect(() => {
    const blocked = [...(gatewaySnapshot.auditLog ?? [])].reverse().find((entry: any) => entry.type === "recording.project_required");
    if (!blocked || blocked.id === lastRecordingBlockedAuditRef.current) return;
    lastRecordingBlockedAuditRef.current = blocked.id;
    notifyGlobalAlert({
      tone: "warning",
      title: "Recording cannot start",
      message: blocked.message ?? "Recording cannot start because Automation Studio does not have an open project.",
      id: `recording-blocked:${blocked.id}`
    });
  }, [gatewaySnapshot.auditLog]);

  useEffect(() => {
    if (!activeProjectId) return;
    const activeRecordingId = (gatewaySnapshot.sessions ?? [])
      .map((session: any) => session.activeRecordingId)
      .find((recordingId: unknown): recordingId is string => typeof recordingId === "string" && recordingId.length > 0);
    const previousActiveRecordingId = lastActiveGatewayRecordingRef.current;
    if (activeRecordingId) {
      lastActiveGatewayRecordingRef.current = activeRecordingId;
      if (activeRecordingId === lastOpenedGatewayRecordingRef.current) return;
      lastOpenedGatewayRecordingRef.current = activeRecordingId;
      dataCache.invalidateScopes(activeProjectId, ["recording", "timeline", "summary"], [activeRecordingId]);
      projectSyncClientRef.current?.notifyMutation();
      void Promise.resolve().then(() => {
        setSelection({ kind: "recording", id: activeRecordingId });
        openView("timeline-recording", "preview", "main");
        setAutomationActionStatus(`Recording ${activeRecordingId} is live.`);
      });
      return;
    }
    if (!previousActiveRecordingId || processedStoppedGatewayRecordingsRef.current.has(previousActiveRecordingId)) return;
    lastActiveGatewayRecordingRef.current = null;
    processedStoppedGatewayRecordingsRef.current.add(previousActiveRecordingId);
    void monitorStoppedGatewayRecording(previousActiveRecordingId);
  }, [activeProjectId, gatewaySnapshot.sessions, dataCache]);

  useEffect(() => {
    document.title = activeProject ? `${activeProject.name} - Automation Studio` : "Automation Studio";
  }, [activeProject]);
  useEffect(() => {
    if (!automationActionStatus) return;
    notifyGlobalAlert({
      tone: /failed|cannot|required|could not|no .*available|not connected|read-only/i.test(automationActionStatus) ? "error" : /running|loading|generating|finalizing|normalizing|mining/i.test(automationActionStatus) ? "warning" : "info",
      title: "Automation Studio",
      message: automationActionStatus,
      id: `automation-action:${automationActionStatus}`
    });
  }, [automationActionStatus]);

  useEffect(() => {
    if (!urlProjectId || activeProjectId === urlProjectId || urlProjectOpenAttemptRef.current === urlProjectId) return;
    urlProjectOpenAttemptRef.current = urlProjectId;
    void openProject(urlProjectId, { updateUrl: false });
  }, [activeProjectId, urlProjectId]);

  useEffect(() => {
    if (!deepLink.projectId || activeProjectId !== deepLink.projectId || loadedProjectHierarchyId !== activeProjectId) return;
    const targetViewId = automationStudioDefaultViewForLink(deepLink);
    const restoreKey = [
      deepLink.projectId,
      deepLink.flowId ?? "",
      deepLink.subflowId ?? "",
      targetViewId ?? "",
      deepLink.detail ? deepLink.detail.kind + ":" + deepLink.detail.id : ""
    ].join("|");
    if (restoredDeepLinkRef.current === restoreKey) return;
    if (deepLink.flowId) {
      const parentFlowAvailable = projectFlows.some((entry: any) => {
        const flow = entry?.flow ?? entry;
        return flow?.flowId === deepLink.flowId && flow?.metadata?.subflowGraph !== true;
      });
      if (!parentFlowAvailable) return;
    }
    restoredDeepLinkRef.current = restoreKey;
    restoringDeepLinkRef.current = true;
    void (async () => {
      try {
        if (deepLink.flowId && deepLink.subflowId) {
          await openSubflowInEditor(deepLink.flowId, deepLink.subflowId, "preview");
        } else if (deepLink.flowId) {
          await loadFlowDetails(deepLink.flowId);
          setSelectionAndFollow({ kind: "flow", id: deepLink.flowId }, "preview");
        }
        if (targetViewId) openView(targetViewId, "preview", "main");
      } finally {
        restoringDeepLinkRef.current = false;
      }
    })();
  }, [
    activeProjectId,
    loadedProjectHierarchyId,
    projectFlowUrlScopeSignature,
    deepLink.projectId,
    deepLink.flowId,
    deepLink.subflowId,
    deepLink.viewId,
    deepLink.detail?.kind,
    deepLink.detail?.id
  ]);
  const selectedFlowSelectionId = selection?.kind === "flow" ? selection.id : null;
  useEffect(() => {
    if (!activeProjectId || restoringDeepLinkRef.current) return;
    const linkFlowId = selectedFlowSelectionId ?? selectedFlow?.flowId ?? lastOpenFlowId;
    if (!linkFlowId) return;
    const requestedRestorePrefix = deepLink.projectId && deepLink.flowId
      ? deepLink.projectId + "|" + deepLink.flowId + "|"
      : null;
    if (requestedRestorePrefix && !restoredDeepLinkRef.current?.startsWith(requestedRestorePrefix)) return;
    const scope = automationStudioFlowScope(linkFlowId, projectFlows);
    const currentParams = automationStudioCurrentSearchParams();
    const params = automationStudioDeepLinkParams({
      projectId: activeProjectId,
      flowId: scope.flowId,
      subflowId: scope.subflowId,
      viewId: activeViewId,
      detail: null
    }, currentParams);
    if (params.toString() === currentParams.toString()) return;
    restoredDeepLinkRef.current = [activeProjectId, scope.flowId, scope.subflowId ?? "", activeViewId, ""].join("|");
    replaceAutomationStudioBrowserUrl(pathname, params);
  }, [activeProjectId, activeViewId, selectedFlowSelectionId, selectedFlow?.flowId, lastOpenFlowId, projectFlowUrlScopeSignature, deepLink.projectId, deepLink.flowId, pathname]);
  useEffect(() => {
    if (!activeProjectId || !projectRecordings.length) return;
    setDeletedHierarchyIds((current) => {
      const cleaned = current.filter((id) => !id.startsWith("recordings-client-") && !id.startsWith("proposals-client-") && !id.startsWith("proposals-recording-"));
      return cleaned.length === current.length ? current : cleaned;
    });
  }, [activeProjectId, projectRecordings]);

  useEffect(() => {
    if (!activeProjectId || loadedProjectHierarchyId !== activeProjectId) return;
    const persistedWorkspacePrefs = persistentAutomationWorkspacePrefs(workspacePrefs);
    const signature = automationHierarchySignature(customHierarchyNodes, deletedHierarchyIds, persistedWorkspacePrefs);
    if (signature === lastSavedHierarchySignatureRef.current) return;
    const timeout = window.setTimeout(() => {
      if (signature === lastSavedHierarchySignatureRef.current) return;
      setWorkspaceSaveStatus("Saving workspace changes...");
      void api.post("save-project-hierarchy", {
        projectId: activeProjectId,
        hierarchy: { customHierarchyNodes, deletedHierarchyIds, workspacePrefs: persistedWorkspacePrefs }
      }).then((result) => {
        if (result.ok) {
          lastSavedHierarchySignatureRef.current = signature;
          setWorkspaceSaveStatus("All workspace changes saved");
          return;
        }
        const message = result.error ?? "Workspace changes could not be saved.";
        setWorkspaceSaveStatus("Save failed: " + message);
        notifyGlobalAlert({ tone: "error", title: "Workspace save failed", message, id: "automation-workspace-save-failed" });
      });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [activeProjectId, loadedProjectHierarchyId, customHierarchyNodes, deletedHierarchyIds, workspacePrefsSaveRevision, api]);

  useEffect(() => {
    const hasDirtyProposalReview = Object.values(workspacePrefs.viewStates ?? {}).some((state) => {
      const proposalReviews = state?.proposalReviews;
      return proposalReviews && typeof proposalReviews === "object" && !Array.isArray(proposalReviews)
        ? Object.values(proposalReviews as Record<string, any>).some((item) => item?.dirty === true)
        : false;
    });
    if (!hasDirtyProposalReview && !hasDirtyTaskGraph) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [workspacePrefs.viewStates, hasDirtyTaskGraph]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("automation-studio:dirty-state", { detail: { dirty: hasDirtyTaskGraph } }));
    return () => { window.dispatchEvent(new CustomEvent("automation-studio:dirty-state", { detail: { dirty: false } })); };
  }, [hasDirtyTaskGraph]);

  async function runProjectAction<T>(action: () => Promise<T>): Promise<T | null> {
    if (projectActionBusyRef.current) return null;
    projectActionBusyRef.current = true;
    setProjectActionBusy(true);
    try {
      return await action();
    } finally {
      projectActionBusyRef.current = false;
      setProjectActionBusy(false);
    }
  }
  async function createProject() {
    const name = projectName.trim();
    if (!name) {
      setProjectStatus("Project name is required.");
      return;
    }
    const result = await runProjectAction(() => api.post<{ project: AutomationStudioProject }>("create-project", { name, description: projectDescription.trim(), categoryId: categoryTarget?.id ?? null, authorizationPin: projectPin }));
    if (!result) return;
    if (!result.ok || !result.payload?.project) {
      setProjectStatus(result.error ?? "Project could not be created.");
      return;
    }
    const project = result.payload.project;
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    setActiveProjectId(project.id);
    setCustomHierarchyNodes([]);
    setDeletedHierarchyIds([]);
    setLoadedProjectHierarchyId(project.id);
    setProjectModal(null);
    setProjectTarget(null);
    setCategoryTarget(null);
    setProjectName("");
    setProjectDescription("");
    setCategoryName("");
    setProjectPin("");
    setProjectStatus("");
    setProjectUrl(project.id);
    setSelection(null);
    openView("policy-primary", "preview", "main");
    void refreshProjectRuntimeState(project.id);
  }

  async function renameProject() {
    if (!projectTarget) return;
    const name = projectName.trim();
    if (!name) {
      setProjectStatus("Project name is required.");
      return;
    }
    const result = await runProjectAction(() => api.post<{ project: AutomationStudioProject }>("update-project", { projectId: projectTarget.id, name, description: projectDescription.trim(), authorizationPin: projectPin }));
    if (!result) return;
    if (!result.ok || !result.payload?.project) {
      setProjectStatus(result.error ?? "Project could not be renamed.");
      return;
    }
    setProjects((current) => current.map((project) => project.id === projectTarget.id ? result.payload!.project : project));
    setProjectModal(null);
    setProjectTarget(null);
    setProjectName("");
    setProjectDescription("");
    setProjectPin("");
    setProjectStatus("");
  }

  async function deleteProject() {
    if (!projectTarget) return;
    const result = await runProjectAction(() => api.post<{ deletedProjectId: string }>("delete-project", { projectId: projectTarget.id, authorizationPin: projectPin }));
    if (!result) return;
    if (!result.ok) {
      setProjectStatus(result.error ?? "Project could not be deleted.");
      return;
    }
    setProjects((current) => current.filter((project) => project.id !== projectTarget.id));
    if (activeProjectId === projectTarget.id) closeProject();
    setProjectModal(null);
    setProjectTarget(null);
    setProjectPin("");
    setProjectStatus("");
  }

  async function moveProject() {
    if (!pendingProjectMove) return;
    const result = await runProjectAction(() => api.post<{ project: AutomationStudioProject }>("update-project", { projectId: pendingProjectMove.projectId, categoryId: pendingProjectMove.categoryId, authorizationPin: projectPin }));
    if (!result) return;
    if (!result.ok || !result.payload?.project) {
      setProjectStatus(result.error ?? "Project could not be moved.");
      return;
    }
    setProjects((current) => current.map((project) => project.id === pendingProjectMove.projectId ? result.payload!.project : project));
    setProjectModal(null);
    setPendingProjectMove(null);
    setProjectPin("");
    setProjectStatus("");
  }

  async function createCategory() {
    const name = categoryName.trim();
    if (!name) {
      setProjectStatus("Category name is required.");
      return;
    }
    const result = await runProjectAction(() => api.post<{ category: AutomationStudioProjectCategory }>("create-project-category", { name, authorizationPin: projectPin }));
    if (!result) return;
    if (!result.ok || !result.payload?.category) {
      setProjectStatus(result.error ?? "Category could not be created.");
      return;
    }
    setProjectCategories((current) => [...current, result.payload!.category].sort((left, right) => left.order - right.order));
    setProjectModal(null);
    setCategoryName("");
    setProjectPin("");
    setProjectStatus("");
  }

  async function renameCategory() {
    if (!categoryTarget) return;
    const name = categoryName.trim();
    if (!name) {
      setProjectStatus("Category name is required.");
      return;
    }
    const result = await runProjectAction(() => api.post<{ category: AutomationStudioProjectCategory }>("update-project-category", { categoryId: categoryTarget.id, name, authorizationPin: projectPin }));
    if (!result) return;
    if (!result.ok || !result.payload?.category) {
      setProjectStatus(result.error ?? "Category could not be renamed.");
      return;
    }
    setProjectCategories((current) => current.map((category) => category.id === categoryTarget.id ? result.payload!.category : category).sort((left, right) => left.order - right.order));
    setProjectModal(null);
    setCategoryTarget(null);
    setCategoryName("");
    setProjectPin("");
    setProjectStatus("");
  }

  async function deleteCategory() {
    if (!categoryTarget) return;
    const result = await runProjectAction(() => api.post<{ deletedCategoryId: string }>("delete-project-category", { categoryId: categoryTarget.id, authorizationPin: projectPin }));
    if (!result) return;
    if (!result.ok) {
      setProjectStatus(result.error ?? "Category could not be deleted.");
      return;
    }
    setProjectCategories((current) => current.filter((category) => category.id !== categoryTarget.id));
    setProjects((current) => current.map((project) => project.categoryId === categoryTarget.id ? { ...project, categoryId: null, updatedAt: Date.now() } : project));
    setProjectModal(null);
    setCategoryTarget(null);
    setCategoryName("");
    setProjectPin("");
    setProjectStatus("");
  }

  async function moveCategory() {
    if (!pendingCategoryMove) return;
    const orderedIds = moveCategoryId(projectCategories.map((category) => category.id), pendingCategoryMove.categoryId, pendingCategoryMove.targetCategoryId);
    const result = await runProjectAction(() => api.post<{ categories: AutomationStudioProjectCategory[] }>("reorder-project-categories", { categoryIds: orderedIds, authorizationPin: projectPin }));
    if (!result) return;
    if (!result.ok || !result.payload?.categories) {
      setProjectStatus(result.error ?? "Category could not be moved.");
      return;
    }
    setProjectCategories(result.payload.categories);
    setProjectModal(null);
    setPendingCategoryMove(null);
    setProjectPin("");
    setProjectStatus("");
  }

  function beginProjectModal(mode: Exclude<AutomationProjectModal, null>, project?: AutomationStudioProject, category?: AutomationStudioProjectCategory) {
    setProjectModal(mode);
    setProjectTarget(project ?? null);
    setCategoryTarget(category ?? null);
    setProjectName(project?.name ?? "");
    setProjectDescription(project?.description ?? "");
    setCategoryName(category?.name ?? "");
    setProjectPin("");
    setProjectStatus("");
  }

  function requestProjectDrop(projectId: string, categoryId: string | null) {
    const project = projects.find((item) => item.id === projectId);
    if (!project || (project.categoryId ?? null) === categoryId) return;
    setPendingProjectMove({ projectId, categoryId });
    setProjectTarget(project);
    setCategoryTarget(projectCategories.find((category) => category.id === categoryId) ?? null);
    setProjectModal("move");
    setProjectPin("");
    setProjectStatus("");
  }

  function requestCategoryDrop(categoryId: string, targetCategoryId: string) {
    if (categoryId === targetCategoryId) return;
    const category = projectCategories.find((item) => item.id === categoryId);
    const target = projectCategories.find((item) => item.id === targetCategoryId);
    if (!category || !target) return;
    setPendingCategoryMove({ categoryId, targetCategoryId });
    setCategoryTarget(category);
    setProjectModal("move-category");
    setProjectPin("");
    setProjectStatus("");
  }

  function handleCategoryDrop(event: DragEvent<HTMLElement>, categoryId: string | null) {
    event.preventDefault();
    setDragOverCategoryId(null);
    const projectId = event.dataTransfer.getData("application/x-fluxiq-project");
    if (projectId) {
      requestProjectDrop(projectId, categoryId);
      return;
    }
    const draggedCategoryId = event.dataTransfer.getData("application/x-fluxiq-project-category");
    if (draggedCategoryId && categoryId) requestCategoryDrop(draggedCategoryId, categoryId);
  }

  function setProjectUrl(projectId: string | null) {
    const params = automationStudioDeepLinkParams({ projectId }, automationStudioCurrentSearchParams());
    replaceAutomationStudioBrowserUrl(pathname, params);
  }
  async function openProject(projectId: string, options: { updateUrl?: boolean } = {}) {
    const [hierarchyRequest] = automationStudioProjectOpenRequests(projectId);
    const result = await runLatest("project-open", (signal) => api.post<{ hierarchy: { customHierarchyNodes: AutomationHierarchyNode[]; deletedHierarchyIds: string[]; workspacePrefs?: AutomationWorkspacePrefs } }>(hierarchyRequest.endpoint, hierarchyRequest.payload, { signal }));
    if (!result) return;
    if (!result.ok || !result.payload?.hierarchy) {
      setProjectStatus(result.error ?? "Project could not be opened.");
      if (urlProjectOpenAttemptRef.current === projectId) urlProjectOpenAttemptRef.current = null;
      return;
    }
    const loadedPrefs = normalizeAutomationWorkspacePrefs(result.payload.hierarchy.workspacePrefs ?? defaultAutomationWorkspacePrefs());
    const loadedCustomHierarchyNodes = result.payload.hierarchy.customHierarchyNodes.filter(isPersistableHierarchyNode);
    if (activeProjectId !== projectId) {
      dataCache.clear();
      setProjectRecordings([]);
      setProjectTimelines([]);
      setProjectArtifacts({ tasks: [], routines: [], configs: [], flows: [] });
      setProjectFlows([]);
      setNativeNodeDefinitions([]);
      setPublishedFlowDefinitions([]);
      setFlowPublications([]);
      setFlowDependencyInfo({ dependencies: [], usedBy: [], availableUpgrades: [] });
      setRuntimeSessions([]);
      setPipelineArtifacts(emptyPipelineArtifacts());
      setRecordingDomains([]);
      setIndexedStateSources({});
      setSelection(null);
      setTaskGraphDrafts({});
      setRecoverableTaskGraphDraft(null);
    }
    setActiveProjectId(projectId);
    setHasDirtyTaskGraph(false);
    setCustomHierarchyNodes(loadedCustomHierarchyNodes);
    setDeletedHierarchyIds(result.payload.hierarchy.deletedHierarchyIds);
    setWorkspacePrefs(loadedPrefs);
    const activeLoadedViewId = loadedPrefs.panes.find((item) => item.id === loadedPrefs.activePaneId)?.activeViewId
      ?? loadedPrefs.activeViewId;
    if (activeLoadedViewId) restoreViewState(activeLoadedViewId, loadedPrefs);
    lastSavedHierarchySignatureRef.current = automationHierarchySignature(result.payload.hierarchy.customHierarchyNodes, result.payload.hierarchy.deletedHierarchyIds, persistentAutomationWorkspacePrefs(loadedPrefs));
    setLoadedProjectHierarchyId(projectId);
    setProjectModal(null);
    setProjectStatus("");
    if (options.updateUrl !== false) setProjectUrl(projectId);
  }

  async function refreshProjectRuntimeState(projectId = activeProjectId) {
    if (!projectId) return;
    let workspaceSummaryResult = dataCache.get<any>("summary", projectId, "root", 10_000);
    if (!workspaceSummaryResult) {
      const [workspaceSummaryRequest] = automationStudioRuntimeSummaryRequests(projectId);
      workspaceSummaryResult = await runLatest("runtime-summary", (signal) => api.post<{ summary: any }>(workspaceSummaryRequest.endpoint, workspaceSummaryRequest.payload, { signal }));
      if (!workspaceSummaryResult) return;
      dataCache.set("summary", projectId, "root", workspaceSummaryResult);
    }
    const summary = workspaceSummaryResult.ok ? workspaceSummaryResult.payload?.summary : null;
    const summaryRecordingStubs = summary ? recordingSummariesToRecordingStubs(summary.recordings ?? []) : null;
    const runtimeStubs = summary ? (summary.runtime ?? []).map(runtimeSummaryToSessionStub) : null;
    if (summary) {
      setProjectRecordings((current) => mergeRecordingSummaries(current, summaryRecordingStubs ?? []));
      setPipelineArtifacts((current: any) => ({
        ...emptyPipelineArtifacts(),
        policyProposals: mergeById(
          (current?.policyProposals ?? []).filter((proposal: any) => (summary.proposals ?? []).some((item: any) => item.proposalId === proposal.proposalId)),
          proposalSummariesToPolicyArtifacts(summary.proposals ?? []),
          "proposalId"
        ),
        recordingFlowProposals: mergeById(
          (current?.recordingFlowProposals ?? []).filter((proposal: any) => (summary.proposals ?? []).some((item: any) => item.proposalId === proposal.proposalId)),
          proposalSummariesToRecordingFlowArtifacts(summary.proposals ?? []),
          "proposalId"
        )
      }));
      setProjectFlows((current) => mergeFlowDetails(
        flowSummariesToCatalogEntries(summary.flows ?? []),
        current.filter((entry: any) => entry?.flow?.metadata?.summaryOnly !== true)
      ));
      setRuntimeSessions(runtimeStubs ?? []);
    }
    return {
      workspaceSummary: summary ?? null,
      recordings: summaryRecordingStubs,
      timelines: null,
      runtimeSessions: runtimeStubs,
      pipelineArtifacts: null,
      projectArtifacts: null,
      flows: summary ? flowSummariesToCatalogEntries(summary.flows ?? []) : null,
      domains: null
    };
  }
  function notifyProjectDataChanged(scopes: Parameters<typeof dataCache.invalidateScopes>[1], resourceIds: string[] = []) {
    if (!activeProjectId) return;
    dataCache.invalidateScopes(activeProjectId, scopes, [...new Set(resourceIds)]);
    projectSyncClientRef.current?.notifyMutation();
  }

  function reconcileProjectChangeFeedInvalidations(projectId: string, invalidations: AutomationStudioScopedInvalidation[]): void {
    if (!invalidations.length) return;
    for (const invalidation of invalidations) {
      dataCache.invalidateScopes(projectId, invalidation.cacheScopes, invalidation.cacheResourceIds);
      const reason = invalidation.reconciliation.diagnostic;
      if (reason) emitAutomationStudioFeedReconciliationDiagnostic({
        projectId,
        entityKind: invalidation.entityKind,
        entityId: invalidation.entityId,
        operation: invalidation.event.operation,
        sequence: invalidation.event.sequence,
        reason
      });
    }
    const deleteEvents = invalidations
      .map((invalidation) => invalidation.event)
      .filter((event) => event.operation === "delete");
    if (!deleteEvents.length) return;
    setProjectFlows((current) => deleteEvents.reduce((next, event) => reconcileProjectFlowsFromChangeFeed(next, event).next, current));
    setCustomHierarchyNodes((current) => deleteEvents.reduce((next, event) => reconcileCustomHierarchyNodesFromChangeFeed(next, event).next, current));
    setProjectRecordings((current) => deleteEvents.reduce((next, event) => reconcileRecordingsFromChangeFeed(next, event).next, current));
    setRuntimeSessions((current) => deleteEvents.reduce((next, event) => reconcileRuntimeSessionsFromChangeFeed(next, event).next, current));
    setPipelineArtifacts((current: any) => deleteEvents.reduce((next: any, event) => reconcilePipelineArtifactsFromChangeFeed(next, event).next, current));
  }
  async function loadFlowDetails(flowId: string) {
    if (!activeProjectId || !flowId) return null;
    const cachedFlow = dataCache.get<any>("flow", activeProjectId, flowId, 60_000);
    if (cachedFlow) {
      setProjectFlows((current) => mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: cachedFlow }]));
      return cachedFlow;
    }
    const result = await runLatest("flow-detail", (signal) => api.post<{ flow: any }>(
      "get-flow",
      { projectId: activeProjectId, flowId },
      { signal }
    ));
    if (!result?.ok || !result.payload?.flow) return null;
    const flow = dataCache.set("flow", activeProjectId, flowId, result.payload.flow);
    setProjectFlows((current) => mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow }]));
    return flow;
  }

  async function openSubflowInEditor(parentFlowId: string, subflowId: string, mode: "preview" | "new-window" = "preview"): Promise<void> {
    if (!activeProjectId || !parentFlowId || !subflowId) return;
    const cacheId = parentFlowId + ":" + subflowId;
    let subflow = dataCache.get<{ graphFlowId?: string }>("subflow", activeProjectId, cacheId, 60_000);
    if (!subflow) {
      const result = await runLatest("subflow-detail", (signal) => api.post<{ subflow?: { graphFlowId?: string } }>(
        "get-flow-subflow",
        { projectId: activeProjectId, flowId: parentFlowId, subflowId },
        { signal }
      ));
      if (!result?.ok || !result.payload?.subflow?.graphFlowId) {
        setAutomationActionStatus(result?.error ?? "Subflow graph could not be resolved.");
        return;
      }
      subflow = dataCache.set("subflow", activeProjectId, cacheId, result.payload.subflow);
    }
    if (!subflow.graphFlowId) return;
    await loadFlowDetails(subflow.graphFlowId);
    setSelectionAndFollow({ kind: "flow", id: subflow.graphFlowId }, mode);
  }
  async function loadNodeDefinitions(projectId = activeProjectId) {
    if (!projectId) return;
    let results = dataCache.get<any[]>("node-definitions", projectId, "root", 60_000);
    if (!results) {
      results = await runLatest("node-definitions", (signal) => Promise.all([
        api.post<{ nodes: any[] }>("list-native-node-definitions", { projectId }, { signal }),
        api.post<{ nodes: any[] }>("list-published-flow-nodes", { projectId }, { signal })
      ]));
      if (!results) return;
      dataCache.set("node-definitions", projectId, "root", results);
    }
    const [nativeResult, publishedResult] = results;
    if (nativeResult.ok) setNativeNodeDefinitions(nativeResult.payload?.nodes ?? []);
    if (publishedResult.ok) setPublishedFlowDefinitions(publishedResult.payload?.nodes ?? []);
  }
  async function loadLatestNormalizedTimeline(recordingId: string) {
    if (!activeProjectId || !recordingId) return null;
    const summaryResult = await api.post<{ normalizedTimelines: any[] }>("list-normalized-timeline-summaries", { projectId: activeProjectId });
    if (!summaryResult.ok) return null;
    const summary = latestByGeneratedAt((summaryResult.payload?.normalizedTimelines ?? []).filter((timeline) => timeline.recordingId === recordingId));
    if (!summary?.normalizedTimelineId) return null;
    const detailResult = await api.post<{ normalizedTimeline: any }>("get-normalized-timeline", { projectId: activeProjectId, normalizedTimelineId: summary.normalizedTimelineId });
    if (!detailResult.ok || !detailResult.payload?.normalizedTimeline) return null;
    setProjectTimelines((current) => mergeById([detailResult.payload!.normalizedTimeline], current, "normalizedTimelineId"));
    return detailResult.payload.normalizedTimeline;
  }

  async function loadRecordingDetails(recordingId: string) {
    if (!activeProjectId || !recordingId) return null;
    const result = await api.post<{ recording: any }>("get-recording", { projectId: activeProjectId, recordingId });
    if (!result.ok || !result.payload?.recording) return null;
    setProjectRecordings((current) => [result.payload!.recording, ...current.filter((recording) => recording.recordingId !== recordingId)]);
    return result.payload.recording;
  }

  async function loadProposalDetails(proposalId: string, kind: "policy" | "recording_flow" | "auto" = "auto") {
    if (!activeProjectId || !proposalId) return null;
    const result = await api.post<{ proposal: any; kind: "policy" | "recording_flow" } | null>("get-proposal", { projectId: activeProjectId, proposalId, kind });
    if (!result.ok || !result.payload?.proposal) return null;
    const proposal = result.payload.proposal;
    setPipelineArtifacts((current: any) => {
      const base = { ...emptyPipelineArtifacts(), ...(current ?? {}) };
      return result.payload?.kind === "recording_flow"
        ? { ...base, recordingFlowProposals: upsertById([proposal, ...base.recordingFlowProposals], "proposalId") }
        : { ...base, policyProposals: upsertById([proposal, ...base.policyProposals], "proposalId") };
    });
    return proposal;
  }

  async function runCurrentAutomationFlow() {
    if (!activeProjectId || !runnableFlow) {
      const message = !activeProjectId ? "Open a project before running a Flow." : "Open a Flow from the project tree before running.";
      setAutomationActionStatus(message);
      setFlowRunState({ phase: "failed", message });
      emitAutomationStudioCommandStatus({ state: "Run blocked", detail: message, running: false, dirty: hasDirtyTaskGraph });
      return;
    }
    if (flowRunState.phase === "starting") return;
    if (hasDirtyTaskGraph && !window.confirm("This Flow has unsaved changes. Run the last saved version anyway?")) {
      setFlowRunState({ phase: "idle", message: "Run cancelled. Save the Flow first, or run the last saved version." });
      emitAutomationStudioCommandStatus({ state: "Run cancelled", detail: "Save the Flow first, or run the last saved version.", running: false, dirty: true });
      return;
    }
    const requestedDomainIds = runnableFlow.scope?.kind === "global" && Array.isArray(runnableFlow.executionDefaults?.authorizedDomainIds) ? runnableFlow.executionDefaults.authorizedDomainIds : [];
    if (requestedDomainIds.length && !window.confirm(`Grant this run permission to execute the following bound domains?\n\n${requestedDomainIds.join("\n")}`)) {
      setFlowRunState({ phase: "idle", message: "Run cancelled before domain permissions were granted." });
      emitAutomationStudioCommandStatus({ state: "Run cancelled", detail: "Domain permission grant was not approved.", running: false, dirty: hasDirtyTaskGraph });
      return;
    }
    const startingState: AutomationFlowRunState = {
      phase: "starting",
      message: `Starting ${runnableFlow.name ?? runnableFlow.flowId}...`,
      flowId: runnableFlow.flowId,
      startedAt: Date.now()
    };
    setFlowRunState(startingState);
    setAutomationActionStatus(startingState.message);
    emitAutomationStudioCommandStatus({ state: "Running", detail: startingState.message, running: true, dirty: hasDirtyTaskGraph });
    openView("runtime-debug", "preview", "main");
    const result = await api.post<{ runtimeSession: any }>("run-runtime-session", {
      projectId: activeProjectId,
      flowId: runnableFlow.flowId,
      authorizedDomainIds: requestedDomainIds
    });
    if (!result.ok || !result.payload?.runtimeSession) {
      const message = result.error ?? "Flow run failed before a runtime session was returned.";
      setAutomationActionStatus(message);
      setFlowRunState({ phase: "failed", message, flowId: runnableFlow.flowId, ...(startingState.startedAt !== undefined ? { startedAt: startingState.startedAt } : {}), finishedAt: Date.now() });
      emitAutomationStudioCommandStatus({ state: "Run failed", detail: message, running: false, dirty: hasDirtyTaskGraph });
      return;
    }
    const session = result.payload.runtimeSession;
    setRuntimeSessions((current) => [session, ...current.filter((item) => item.runId !== session.runId)]);
    const status = String(session.status ?? "unknown");
    const traceMessage = typeof session.trace?.message === "string" ? session.trace.message : "";
    const message = `Run ${status}${traceMessage ? `: ${traceMessage}` : "."}`;
    setAutomationActionStatus(message);
    setFlowRunState({
      phase: status === "succeeded" ? "succeeded" : "failed",
      message,
      runId: session.runId,
      flowId: runnableFlow.flowId,
      status,
      startedAt: session.startedAt ?? startingState.startedAt,
      finishedAt: session.finishedAt ?? Date.now()
    });
    emitAutomationStudioCommandStatus({ state: status === "succeeded" ? "Run complete" : "Run failed", detail: message, running: false, dirty: hasDirtyTaskGraph });
    openView("runtime-debug", "preview", "main");
  }

  useEffect(() => {
    const run = () => { void runCurrentAutomationFlow(); };
    const unavailable = (event: Event) => {
      const command = (event as CustomEvent<{ command?: string }>).detail?.command ?? "Command";
      const message = `${command} is not wired to cancellable runtime sessions yet.`;
      setAutomationActionStatus(message);
      emitAutomationStudioCommandStatus({ state: `${command} unavailable`, detail: message, running: false, dirty: hasDirtyTaskGraph });
    };
    window.addEventListener("automation-studio:run-flow", run);
    window.addEventListener("automation-studio:runtime-control", unavailable);
    return () => {
      window.removeEventListener("automation-studio:run-flow", run);
      window.removeEventListener("automation-studio:runtime-control", unavailable);
    };
  }, [activeProjectId, runnableFlow?.flowId, flowRunState.phase, hasDirtyTaskGraph]);

  useEffect(() => {
    if (activeViewId === "policy-primary") return;
    const handleBackgroundSave = (event: Event) => {
      const detail = (event as CustomEvent<{ onComplete?: (result: { ok: boolean; message: string }) => void }>).detail;
      if (!hasDirtyTaskGraph || !selectedTaskGraphDraft) {
        detail?.onComplete?.({ ok: true, message: "No unsaved Flow changes." });
        return;
      }
      void saveSelectedTaskGraph(selectedTaskGraphDraft).then((result) => detail?.onComplete?.({ ok: result.ok, message: result.message }));
    };
    window.addEventListener("automation-studio:global-save", handleBackgroundSave);
    return () => window.removeEventListener("automation-studio:global-save", handleBackgroundSave);
  }, [activeViewId, hasDirtyTaskGraph, selectedTaskGraphDraft, selectedFlow?.flowId, activeProjectId]);
  async function createProjectRecording() {
    if (!activeProjectId || !activeProject) return;
    const project = activeProject;
    const authorizationPin = window.prompt("Enter PIN to create a recording") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to create a recording.");
      return;
    }
    const recordingId = `recording.${Date.now()}`;
    const result = await api.post<{ recording: any }>("create-recording", {
      projectId: activeProjectId,
      recordingId,
      taskId: selectedPolicy?.taskId ?? "task.unspecified",
      authorizationPin,
      environment: { id: "automation-studio.local", label: project.name, kind: "studio", domainId: null },
      initialState: { timestamp: Date.now(), namespaces: {} },
      metadata: { createdFrom: "automation-studio-ui" }
    });
    if (!result.ok || !result.payload?.recording) {
      setAutomationActionStatus(result.error ?? "Recording could not be created.");
      return;
    }
    setProjectRecordings((current) => [result.payload!.recording, ...current.filter((recording) => recording.recordingId !== recordingId)]);
    setSelectionAndFollow({ kind: "recording", id: recordingId });
    setAutomationActionStatus("Recording session created.");
    notifyProjectDataChanged(["recording", "summary"], [recordingId]);
  }

  async function finalizeProjectRecording(recordingId: string, providedAuthorizationPin?: string) {
    if (!activeProjectId || !recordingId) return;
    const authorizationPin = providedAuthorizationPin ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to finalize a recording.");
      return;
    }
    setRecordingProcessing({
      recordingId,
      label: "Finalizing recording",
      detail: "Writing the final raw timeline before derived proposal data is generated.",
      progress: 8
    });
    setAutomationActionStatus("Finalizing recording...");
    const result = await api.post<{ recording: any }>("finalize-recording", { projectId: activeProjectId, recordingId, authorizationPin });
    if (!result.ok || !result.payload?.recording) {
      setAutomationActionStatus(result.error ?? "Recording could not be finalized.");
      setRecordingProcessing({
        recordingId,
        label: "Finalization failed",
        detail: result.error ?? "Recording could not be finalized.",
        progress: 100
      });
      return;
    }
    setProjectRecordings((current) => [result.payload!.recording, ...current.filter((recording) => recording.recordingId !== recordingId)]);
    setAutomationActionStatus("Recording finalized and available as optional Flow evidence.");
    setRecordingProcessing((current) => current?.recordingId === recordingId ? null : current);
    notifyProjectDataChanged(["recording", "timeline", "summary"], [recordingId]);
  }

  async function normalizeProjectRecording(recordingId: string) {
    if (!activeProjectId || !recordingId) return;
    setAutomationActionStatus("Normalizing recording timeline...");
    const result = await api.post<{ normalizedTimeline: any }>("normalize-recording", { projectId: activeProjectId, recordingId });
    if (!result.ok || !result.payload?.normalizedTimeline) {
      setAutomationActionStatus(result.error ?? "Recording could not be normalized.");
      return false;
    }
    setProjectTimelines((current) => [result.payload!.normalizedTimeline, ...current.filter((timeline) => timeline.normalizedTimelineId !== result.payload!.normalizedTimeline.normalizedTimelineId)]);
    const reviewResult = await api.post<{ review: any }>("create-normalization-review", { projectId: activeProjectId, recordingId });
    if (reviewResult.ok && reviewResult.payload?.review) {
      setPipelineArtifacts((current: any) => ({
        ...emptyPipelineArtifacts(),
        ...current,
        normalizationReviews: upsertById([reviewResult.payload!.review, ...(current.normalizationReviews ?? [])], "reviewId")
      }));
    }
    setAutomationActionStatus(reviewResult.ok ? "Recording normalized." : "Recording normalized. Normalization details could not be created.");
    notifyProjectDataChanged(["recording", "timeline", "summary"], [recordingId]);
    return true;
  }

  async function updateProjectRecording(recordingId: string, changes: JsonObject, providedAuthorizationPin?: string) {
    if (!activeProjectId || !recordingId) return;
    const authorizationPin = providedAuthorizationPin ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to update a recording.");
      return;
    }
    const result = await api.post<{ recording: any }>("update-recording", { projectId: activeProjectId, recordingId, authorizationPin, ...changes });
    setAutomationActionStatus(result.ok ? "Recording updated." : result.error ?? "Recording could not be updated.");
    notifyProjectDataChanged(["recording", "summary"], [recordingId]);
  }

  async function deleteProjectRecording(recordingId: string, authorizationPin?: string) {
    if (!activeProjectId || !recordingId) return;
    if (!authorizationPin) { setAutomationActionStatus("Use the Recording delete action to authorize deletion."); return; }
    const pin = authorizationPin;
    if (pin.length < 4) {
      setAutomationActionStatus("PIN is required to delete a recording.");
      return;
    }
    const result = await api.post<{ deletedRecordingId: string; deletedProposalIds?: string[] }>("delete-recording", { projectId: activeProjectId, recordingId, authorizationPin: pin });
    setAutomationActionStatus(result.ok ? "Recording deleted." : result.error ?? "Recording could not be deleted.");
    if (!result.ok) return;
    removeDeletedRecordingsFromWorkspace([recordingId], result.payload?.deletedProposalIds ?? []);
    notifyProjectDataChanged(["recording", "timeline", "proposal", "summary"], [recordingId, ...(result.payload?.deletedProposalIds ?? [])]);
  }

  async function deleteProjectRecordings(recordingIds: string[], authorizationPin: string) {
    if (!activeProjectId || !recordingIds.length) return true;
    const uniqueIds = [...new Set(recordingIds)];
    setAutomationActionStatus(`Deleting ${uniqueIds.length} recording${uniqueIds.length === 1 ? "" : "s"}...`);
    const result = await api.post<{ deletedRecordingIds: string[]; deletedProposalIds?: string[] }>("delete-recordings", { projectId: activeProjectId, recordingIds: uniqueIds, authorizationPin });
    if (!result.ok) {
      setAutomationActionStatus(result.error ?? "Recordings could not be deleted.");
      return false;
    }
    const deletedIds = result.payload?.deletedRecordingIds?.length ? result.payload.deletedRecordingIds : uniqueIds;
    const deletedCount = deletedIds.length;
    setAutomationActionStatus(`${deletedCount} recording${deletedCount === 1 ? "" : "s"} deleted.`);
    removeDeletedRecordingsFromWorkspace(deletedIds, result.payload?.deletedProposalIds ?? []);
    notifyProjectDataChanged(["recording", "timeline", "proposal", "summary"], [...deletedIds, ...(result.payload?.deletedProposalIds ?? [])]);
    return true;
  }

  async function deleteProjectProposals(proposalIds: string[], authorizationPin: string) {
    if (!activeProjectId || !proposalIds.length) return true;
    const uniqueIds = [...new Set(proposalIds)];
    let deletedCount = 0;
    const deletedProposalIds = new Set<string>();
    let fallbackRecordingId: string | null = null;
    for (const proposalId of uniqueIds) {
      const proposal = hierarchyProposals.find((item: any) => String(item.proposalId ?? "") === proposalId);
      fallbackRecordingId ??= proposal ? String(proposal.recordingId ?? proposal.metadata?.recordingId ?? "") || null : null;
      const result = await api.post("delete-proposal", { projectId: activeProjectId, proposalId, authorizationPin });
      if (!result.ok) {
        setAutomationActionStatus(result.error ?? `Proposal ${proposalId} could not be deleted.`);
        return false;
      }
      deletedProposalIds.add(proposalId);
      deletedCount += 1;
    }
    setAutomationActionStatus(`${deletedCount} proposal${deletedCount === 1 ? "" : "s"} deleted.`);
    setPipelineArtifacts((current: any) => removeDeletedRecordingArtifacts(current, new Set(), deletedProposalIds));
    setSnapshot((current: any) => removeDeletedRecordingSnapshotData(current, new Set(), deletedProposalIds));
    setIndexedStateSources((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => {
      const source = value.source ?? {};
      return !deletedProposalIds.has(String(source.proposalId ?? ""));
    })));
    const deletingNodes = [...deletedProposalIds].map((proposalId) => ({ id: proposalId, kind: "proposal" as const, category: "proposal" as const, label: proposalId, parentId: null, sourceId: proposalId }));
    closeDeletedHierarchyViews(deletingNodes);
    if (selection?.kind === "proposal" && deletedProposalIds.has(selection.id)) setSelection(fallbackRecordingId ? { kind: "recording", id: fallbackRecordingId } : null);
    if (selection?.kind === "proposal-step" && deletedProposalIds.has(selection.proposalId)) setSelection(fallbackRecordingId ? { kind: "recording", id: fallbackRecordingId } : null);
    notifyProjectDataChanged(["proposal", "summary"], [...deletedProposalIds]);
    return true;
  }

  function removeDeletedRecordingsFromWorkspace(recordingIds: string[], proposalIds: string[] = []) {
    const deletedRecordingIds = new Set(recordingIds);
    const deletedProposalIds = new Set([
      ...proposalIds,
      ...hierarchyProposals
      .filter((proposal: any) => deletedRecordingIds.has(String(proposal.recordingId ?? proposal.metadata?.recordingId ?? "")))
      .map((proposal: any) => String(proposal.proposalId ?? ""))
      .filter(Boolean)
    ]);
    const deletingNodes: AutomationHierarchyNode[] = [
      ...[...deletedRecordingIds].map((recordingId) => ({ id: recordingId, kind: "recording" as const, category: "recording" as const, label: recordingId, parentId: null, sourceId: recordingId })),
      ...[...deletedProposalIds].map((proposalId) => ({ id: proposalId, kind: "proposal" as const, category: "proposal" as const, label: proposalId, parentId: null, sourceId: proposalId }))
    ];
    setProjectRecordings((current) => deleteRecordingCollectionItems(current, [...deletedRecordingIds]).next);
    setProjectTimelines((current) => current.filter((timeline) => !deletedRecordingIds.has(String(timeline.recordingId ?? ""))));
    setProjectFlows((current) => removeFlowObjectReferencesFromProjectFlows(current, null, "recording", [...deletedRecordingIds]));
    setPipelineArtifacts((current: any) => removeDeletedRecordingArtifacts(current, deletedRecordingIds, deletedProposalIds));
    setSnapshot((current: any) => removeDeletedRecordingSnapshotData(current, deletedRecordingIds, deletedProposalIds));
    setIndexedStateSources((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => {
      const source = value.source ?? {};
      return !deletedRecordingIds.has(String(source.recordingId ?? "")) && !deletedProposalIds.has(String(source.proposalId ?? ""));
    })));
    setRecordingProcessing((current) => current && deletedRecordingIds.has(current.recordingId) ? null : current);
    setRecordingTreePrimaryKind((current) => current && selectionReferencesDeletedRecording(selection, deletedRecordingIds, deletedProposalIds) ? null : current);
    if (selectionReferencesDeletedRecording(selection, deletedRecordingIds, deletedProposalIds)) setSelection(null);
    closeDeletedHierarchyViews(deletingNodes);
  }

  async function appendProjectRecordingNote(recordingId: string, linkedEntryId?: string, providedText?: string, providedAuthorizationPin?: string) {
    if (!activeProjectId || !recordingId) return;
    const text = providedText ?? "";
    if (!text.trim()) return;
    const authorizationPin = providedAuthorizationPin ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to add a note.");
      return;
    }
    const result = await api.post<{ recording: any }>("append-recording-note", { projectId: activeProjectId, recordingId, text, linkedEntryIds: linkedEntryId ? [linkedEntryId] : [], authorizationPin });
    setAutomationActionStatus(result.ok ? "Note added." : result.error ?? "Note could not be added.");
    notifyProjectDataChanged(["recording", "timeline"], [recordingId]);
  }

  async function appendProjectRecordingMarker(recordingId: string, linkedEntryId?: string, monotonicOffsetMs?: number, providedLabel?: string, providedAuthorizationPin?: string) {
    if (!activeProjectId || !recordingId) return;
    const label = providedLabel ?? "";
    if (!label.trim()) return;
    const authorizationPin = providedAuthorizationPin ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to add a marker.");
      return;
    }
    const result = await api.post<{ recording: any }>("append-recording-marker", { projectId: activeProjectId, recordingId, label, linkedEntryId, monotonicOffsetMs, authorizationPin });
    setAutomationActionStatus(result.ok ? "Marker added." : result.error ?? "Marker could not be added.");
    notifyProjectDataChanged(["recording", "timeline"], [recordingId]);
  }

  function restoreSelectedTaskGraphDraft() {
    if (!recoverableTaskGraphDraft || !selectedTaskGraphDraftKey) return;
    setTaskGraphDrafts((current) => ({ ...current, [selectedTaskGraphDraftKey]: recoverableTaskGraphDraft.graph }));
    setRecoverableTaskGraphDraft(null);
    setHasDirtyTaskGraph(true);
    setAutomationActionStatus("Recovered draft restored. Review it before saving.");
  }

  function discardSelectedTaskGraphDraft() {
    if (activeProjectId && selectedTaskGraph?.flowId) removeAutomationGraphDraft(activeProjectId, selectedTaskGraph.flowId);
    if (activeProjectId && selectedTaskGraph?.flowId) void removeAutomationGraphOperationDraft(activeProjectId, selectedTaskGraph.flowId);
    setRecoverableTaskGraphDraft(null);
    setAutomationActionStatus("Recovered draft discarded.");
  }
  async function saveSelectedTaskGraph(graph: { nodes: any[]; edges: any[] }) {
    if (activeProjectId && selectedFlowEntry?.source === "canonical" && selectedFlow) {
      const authorizationPin = window.prompt("Enter PIN to save this flow") ?? "";
      if (authorizationPin.length < 4) {
        const message = "PIN is required to save a flow.";
        setAutomationActionStatus(message);
        return { ok: false, state: "failed" as const, message };
      }
      const serializedGraph = graphToTaskFlow({
        task: { taskId: selectedFlow.flowId, name: selectedFlow.name } as any,
        existingFlow: { ...selectedFlow, ownerKind: "flow", ownerId: selectedFlow.flowId } as any,
        graph
      });
      const { regions: _regions, regionHandoffs: _regionHandoffs, ...flowWithoutEditorRegions } = selectedFlow;
      const persistedDraft = loadAutomationGraphDraft(activeProjectId, selectedFlow.flowId);
      const expectedUpdatedAt = persistedDraft?.baseUpdatedAt ?? selectedFlow.updatedAt;
      const result = await api.post<{ flow: any }>("save-flow", {
        projectId: activeProjectId,
        authorizationPin,
        expectedUpdatedAt,
        flow: { ...flowWithoutEditorRegions, nodes: serializedGraph.nodes, edges: serializedGraph.edges }
      });
      if (!result.ok) {
        const conflict = String(result.error ?? "").includes("FLOW_SAVE_CONFLICT");
        const message = conflict ? "This Flow changed after your draft began. Your draft is preserved; reload the saved Flow before deciding how to merge it." : result.error ?? "Flow could not be saved.";
        setAutomationActionStatus(message);
        if (conflict) notifyGlobalAlert({ tone: "error", title: "Flow save conflict", message, id: "automation-flow-save-conflict" });
        return { ok: false, state: conflict ? "conflict" as const : "failed" as const, message };
      }
      graphDraftPersistenceRef.current = null;
      removeAutomationGraphDraft(activeProjectId, selectedFlow.flowId);
      void removeAutomationGraphOperationDraft(activeProjectId, selectedFlow.flowId);
      notifyProjectDataChanged(["flow", "summary", "flow-metadata"], [selectedFlow.flowId]);
      setTaskGraphDrafts((current) => {
        if (!selectedTaskGraphDraftKey) return current;
        const { [selectedTaskGraphDraftKey]: _saved, ...rest } = current;
        return rest;
      });
      setRecoverableTaskGraphDraft(null);
      setAutomationActionStatus("Flow saved.");
      return { ok: true, state: "saved" as const, message: "Flow graph saved." };
    }
    const message = "Legacy Task/Routine sources are read-only. Migrate this entry to a canonical Flow before editing.";
    setAutomationActionStatus(message);
    return { ok: false, state: "failed" as const, message };
  }
  function updateSelectedTaskGraphDraft(graph: { nodes: any[]; edges: any[] } | null) {
    if (graph) setRecoverableTaskGraphDraft(null);
    if (!selectedTaskGraphDraftKey) return;
    if (activeProjectId && selectedTaskGraph?.flowId) {
      if (graph && baseTaskGraphDocument) {
        const batch = diffAutomationGraphDocuments(baseTaskGraphDocument as any, graph as any, { baseRevision: String(selectedTaskGraph.graphRevision ?? selectedTaskGraph.revision ?? selectedTaskGraph.updatedAt ?? 0) });
        void saveAutomationGraphOperationDraft({ projectId: activeProjectId, flowId: selectedTaskGraph.flowId, baseRevision: batch.baseRevision, baseUpdatedAt: selectedTaskGraph.updatedAt ?? 0, savedAt: Date.now(), operations: batch.operations, estimatedBytes: batch.estimatedBytes });
      } else if (!graph) {
        void removeAutomationGraphOperationDraft(activeProjectId, selectedTaskGraph.flowId);
      }
    }
    setTaskGraphDrafts((current) => {
      if (!graph) {
        const { [selectedTaskGraphDraftKey]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [selectedTaskGraphDraftKey]: graph };
    });
  }

  async function publishSelectedFlow(version: string, changelog: string) {
    if (!activeProjectId || !selectedFlow) return false;
    const authorizationPin = window.prompt(`Enter PIN to publish ${selectedFlow.name}@${version}`) ?? "";
    if (authorizationPin.length < 4) return false;
    const result = await api.post<any>("publish-flow", { projectId: activeProjectId, flowId: selectedFlow.flowId, version, changelog, publishedBy: currentUser.displayName, authorizationPin });
    if (!result.ok) { setAutomationActionStatus(result.error ?? "Flow could not be published."); return false; }
    notifyProjectDataChanged(["flow", "summary", "flow-metadata"], [selectedFlow.flowId]); setAutomationActionStatus(`Published ${selectedFlow.name}@${version}.`); return true;
  }

  async function deprecateSelectedFlow(version: string) {
    if (!activeProjectId || !selectedFlow) return false;
    const reason = window.prompt(`Why is ${selectedFlow.name}@${version} deprecated?`) ?? "";
    if (!reason.trim()) return false;
    const authorizationPin = window.prompt("Enter PIN to deprecate this published version") ?? "";
    if (authorizationPin.length < 4) return false;
    const result = await api.post<any>("deprecate-flow-publication", { projectId: activeProjectId, flowId: selectedFlow.flowId, version, reason, authorizationPin });
    if (!result.ok) { setAutomationActionStatus(result.error ?? "Published Flow version could not be deprecated."); return false; }
    notifyProjectDataChanged(["flow", "summary", "flow-metadata"], [selectedFlow.flowId]); setAutomationActionStatus(`Deprecated ${selectedFlow.name}@${version}.`); return true;
  }

  function clearTaskGraphDraftsForFlow(flowId: string) {
    setTaskGraphDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${flowId}:`))));
  }

  function closeProject() {
    setActiveProjectId(null);
    setLoadedProjectHierarchyId(null);
    setCustomHierarchyNodes([]);
    setDeletedHierarchyIds([]);
    setProjectRecordings([]);
    setProjectTimelines([]);
    setProjectArtifacts({ tasks: [], routines: [], configs: [], flows: [] });
    setRuntimeSessions([]);
    setPipelineArtifacts({ normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [], stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
    setRecordingDomains([]);
    setAutomationActionStatus("");
    setWorkspacePrefs(defaultAutomationWorkspacePrefs());
    setLiveInspectorWidth(null);
    lastSavedHierarchySignatureRef.current = "";
    setSelection(null);
    setProjectUrl(null);
  }

  function updateWorkspacePrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs, options: { persist?: boolean } = {}) {
    const shouldPersist = options.persist !== false;
    setWorkspacePrefs((current) => {
      const candidate = updater(current);
      if (candidate === current) return current;
      const next = normalizeAutomationWorkspacePrefs(candidate);
      if (automationWorkspacePrefsSameRuntimeState(current, next)) return current;
      if (shouldPersist && next !== current) setWorkspacePrefsSaveRevision((revision) => revision + 1);
      return next;
    });
  }
  function startSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = workspacePrefs.sidebarWidth;
    let latestWidth = startWidth;
    const onMove = (moveEvent: PointerEvent) => {
      latestWidth = clampNumber(startWidth + moveEvent.clientX - startX, 220, 420, startWidth);
      setLiveSidebarWidth(latestWidth);
    };
    const onUp = () => {
      updateWorkspacePrefs((current) => ({ ...current, sidebarWidth: latestWidth }));
      setLiveSidebarWidth(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function resizeSidebarFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    const nextWidth = event.key === "Home"
      ? 280
      : clampNumber(workspacePrefs.sidebarWidth + (event.key === "ArrowLeft" ? -16 : 16), 220, 420, workspacePrefs.sidebarWidth);
    updateWorkspacePrefs((current) => ({ ...current, sidebarWidth: nextWidth }));
  }  function captureActiveViewState(current: AutomationWorkspacePrefs): AutomationWorkspacePrefs {
    return current;
  }
  function restoreViewState(viewId: string, sourcePrefs = workspacePrefs) {
    void viewId;
    void sourcePrefs;
  }
  function openView(viewId: string, mode: "preview" | "new-window" = "preview", area: AutomationWorkspaceArea = "main") {
    const region = automationWorkspaceRegionForView(viewId);
    updateWorkspacePrefs((current) => {
      current = captureActiveViewState(current);
      if (region === "bottom") {
        return {
          ...current,
          bottomDock: { ...current.bottomDock, activeViewId: "recording-action-preview", expanded: true },
          bottomTimelineCollapsed: false,
          maximizedWindowId: null
        };
      }
      if (region === "main") {
        const targetPane = chooseMainPaneForView(current, viewId);
        if (!targetPane) return current;
        if (current.activePaneId === targetPane.id && current.activeViewId === viewId && targetPane.activeViewId === viewId && targetPane.tabs.includes(viewId)) return current;
        return {
          ...current,
          activePaneId: targetPane.id,
          activeViewId: viewId,
          maximizedWindowId: null,
          panes: current.panes.map((item) => item.id === targetPane.id
            ? { ...item, activeViewId: viewId, tabs: item.tabs.includes(viewId) ? item.tabs : [...item.tabs, viewId] }
            : item)
        };
      }
      if (region === "right") {
        if (!current.rightSidebarCollapsed && current.rightSidebar.activeViewId === viewId && current.rightSidebar.tabs.includes(viewId) && current.rightSidebar.collapsed === false) return current;
        return {
          ...current,
          rightSidebarCollapsed: false,
          rightSidebar: {
            ...current.rightSidebar,
            activeViewId: viewId,
            collapsed: false,
            tabs: current.rightSidebar.tabs.includes(viewId) ? current.rightSidebar.tabs : [...current.rightSidebar.tabs, viewId]
          }
        };
      }
      return current;
    }, { persist: false });
  }
  function chooseMainPaneForView(current: AutomationWorkspacePrefs, viewId: string) {
    const existingPane = current.panes.find((item) => item.tabs.includes(viewId));
    if (existingPane) return existingPane;
    if (viewId === "policy-primary") return current.panes[0] ?? null;
    const flowFirst = current.panes[0]?.tabs.includes("policy-primary") || current.panes[0]?.activeViewId === "policy-primary";
    const prefersSecondary = viewId === "proposal-workbench" || viewId === "proposal-generator" || viewId === "state-explorer" || viewId === "runtime-debug";
    if (prefersSecondary && flowFirst && current.panes[1]) return current.panes[1];
    return current.panes.find((item) => item.id === current.activePaneId) ?? current.panes[0] ?? null;
  }
  function ensureGlobalInspectorAvailable() {
    updateWorkspacePrefs((current) => {
      return {
        ...captureActiveViewState(current),
        rightSidebarCollapsed: false,
        rightSidebar: {
          ...current.rightSidebar,
          activeViewId: "global-inspector",
          collapsed: false,
          tabs: current.rightSidebar.tabs.includes("global-inspector") ? current.rightSidebar.tabs : ["global-inspector", ...current.rightSidebar.tabs]
        }
      };
    }, { persist: false });
  }
  function addWorkspaceWindow(viewId: string, area: AutomationWorkspaceArea, targetWindowId?: string) {
    const option = viewAdderOptions.find((item) => item.view.id === viewId);
    if (!option || option.disabledReason) {
      setAutomationActionStatus(option?.disabledReason ?? "That view is not available in this workspace region.");
      setWindowAdderOpen(null);
      return;
    }
    if (targetWindowId === "right-sidebar") {
      setRightSidebarTab(viewId);
    } else if (targetWindowId && workspacePrefs.panes.some((item) => item.id === targetWindowId)) {
      setPaneTab(targetWindowId, viewId);
    } else {
      openView(viewId, "preview", area);
    }
    setWindowAdderOpen(null);
  }
  function toggleWindowAdder(area: AutomationWorkspaceArea, event: MouseEvent<HTMLButtonElement>, targetWindowId?: string) {
    const rect = event.currentTarget.getBoundingClientRect();
    setWindowAdderOpen((current) => current?.area === area && current.targetWindowId === targetWindowId ? null : {
      area,
      ...(targetWindowId ? { targetWindowId } : {}),
      anchor: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }
    });
  }
  function selectionMatchesDeletedHierarchy(selectionValue: unknown, refs: DeletedHierarchyRefs): boolean {
    if (!isAutomationSelection(selectionValue)) return false;
    if (selectionValue.kind === "policy") return refs.taskIds.has(selectionValue.id);
    if (selectionValue.kind === "flow") return refs.flowIds.has(selectionValue.id);
    if (selectionValue.kind === "recording") return refs.recordingIds.has(selectionValue.id);
    if (selectionValue.kind === "proposal") return refs.proposalIds.has(selectionValue.id) || (selectionValue.recordingId ? refs.recordingIds.has(selectionValue.recordingId) : false);
    if (selectionValue.kind === "proposal-step") return refs.proposalIds.has(selectionValue.proposalId) || (selectionValue.recordingId ? refs.recordingIds.has(selectionValue.recordingId) : false);
    if (selectionValue.kind === "timeline") return refs.timelineEntryIds.has(selectionValue.id);
    if (selectionValue.kind === "state") {
      return (selectionValue.sourceId ? [...refs.recordingIds].some((recordingId) => selectionValue.sourceId === `observed:${recordingId}:initial` || selectionValue.sourceId?.startsWith(`observed:${recordingId}:`)) : false)
        || (selectionValue.recordingId ? refs.recordingIds.has(selectionValue.recordingId) : false)
        || (selectionValue.proposalId ? refs.proposalIds.has(selectionValue.proposalId) : false)
        || (selectionValue.timelineEntryId ? refs.timelineEntryIds.has(selectionValue.timelineEntryId) : false)
        || (selectionValue.id ? [...refs.recordingIds].some((recordingId) => selectionValue.id.includes(recordingId)) : false);
    }
    return false;
  }
  function viewStateMatchesDeletedHierarchy(viewId: string, state: JsonObject | undefined, refs: DeletedHierarchyRefs): boolean {
    if (selectionMatchesDeletedHierarchy(state?.selection, refs)) return true;
    if (viewId === "policy-primary" && typeof state?.lastOpenTaskId === "string" && refs.taskIds.has(state.lastOpenTaskId)) return true;
    if (viewId === "routine-editor" && refs.routineIds.size > 0) return true;
    if (viewId === "config-default" && refs.configIds.size > 0) return true;
    return false;
  }
  function closeDeletedHierarchyViews(deletingNodes: AutomationHierarchyNode[]) {
    const refs = {
      taskIds: new Set(deletingNodes.filter((node) => node.kind === "task" && node.sourceId).map((node) => node.sourceId!)),
      routineIds: new Set(deletingNodes.filter((node) => node.kind === "routine" && node.sourceId).map((node) => node.sourceId!)),
      configIds: new Set(deletingNodes.filter((node) => node.kind === "config" && node.sourceId).map((node) => node.sourceId!)),
      flowIds: new Set([
        ...deletingNodes.filter((node) => node.kind === "flow" && node.sourceId).map((node) => node.sourceId!),
        ...deletingNodes.filter((node) => node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string").map((node) => node.metadata!.graphFlowId as string)
      ]),
      recordingIds: new Set(deletingNodes.filter((node) => node.kind === "recording" && node.sourceId).map((node) => node.sourceId!)),
      proposalIds: new Set(deletingNodes.filter((node) => node.kind === "proposal" && node.sourceId).map((node) => node.sourceId!)),
      timelineEntryIds: new Set(recordings
        .filter((recording: any) => deletingNodes.some((node) => node.kind === "recording" && node.sourceId === recording.recordingId))
        .flatMap((recording: any) => (recording.timeline ?? []).map((entry: any) => String(entry.id ?? "")).filter(Boolean)))
    };
    if (selectionMatchesDeletedHierarchy(selection, refs)) setSelection(null);
    updateWorkspacePrefs((current) => {
      const nextViewStates = Object.fromEntries(Object.entries(current.viewStates ?? {}).filter(([viewId, state]) => !viewStateMatchesDeletedHierarchy(viewId, state as JsonObject, refs)));
      const panes = current.panes.map((item) => {
        const tabs = item.tabs.filter((tabId) => !viewStateMatchesDeletedHierarchy(tabId, current.viewStates?.[tabId] as JsonObject | undefined, refs));
        const nextTabs = tabs.length ? tabs : ["policy-primary"];
        return { ...item, tabs: nextTabs, activeViewId: nextTabs.includes(item.activeViewId) ? item.activeViewId : nextTabs[0] ?? "policy-primary" };
      });
      const rightTabs = current.rightSidebar.tabs.filter((tabId) => !viewStateMatchesDeletedHierarchy(tabId, current.viewStates?.[tabId] as JsonObject | undefined, refs));
      const nextRightTabs = rightTabs.length ? rightTabs : ["global-inspector"];
      const activePane = panes.find((item) => item.id === current.activePaneId) ?? panes[0];
      return {
        ...current,
        activePaneId: activePane?.id ?? "",
        activeViewId: activePane?.activeViewId ?? "policy-primary",
        panes,
        rightSidebar: {
          ...current.rightSidebar,
          tabs: nextRightTabs,
          activeViewId: nextRightTabs.includes(current.rightSidebar.activeViewId) ? current.rightSidebar.activeViewId : nextRightTabs[0] ?? "global-inspector"
        },
        viewStates: nextViewStates
      };
    });
  }
  function setPaneTab(paneId: string, viewId: string) {
    if (workspacePrefs.activePaneId === paneId && workspacePrefs.activeViewId === viewId && workspacePrefs.panes.find((item) => item.id === paneId)?.activeViewId === viewId) return;
    restoreViewState(viewId);
    updateWorkspacePrefs((current) => ({
      ...captureActiveViewState(current),
      activePaneId: paneId,
      activeViewId: viewId,
      panes: current.panes.map((item) => item.id === paneId ? { ...item, activeViewId: viewId } : item)
    }), { persist: false });
  }
  function activatePane(paneId: string) {
    const viewId = workspacePrefs.panes.find((item) => item.id === paneId)?.activeViewId;
    if (paneId === workspacePrefs.activePaneId && (viewId ?? workspacePrefs.activeViewId) === workspacePrefs.activeViewId) return;
    if (viewId && paneId !== workspacePrefs.activePaneId) restoreViewState(viewId);
    updateWorkspacePrefs((current) => ({ ...captureActiveViewState(current), activePaneId: paneId, activeViewId: viewId ?? current.activeViewId }), { persist: false });
  }
  function closePaneTab(paneId: string, viewId: string) {
    updateWorkspacePrefs((current) => {
      current = captureActiveViewState(current);
      return { ...current, ...closeAutomationWorkspacePaneTab(current.panes, paneId, viewId, current.activePaneId, current.mainLayoutPreset) };
    });
  }
  function startPaneTabDrag(paneId: string, viewId: string, event: DragEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-fluxiq-automation-pane-tab", JSON.stringify({ paneId, viewId }));
    event.dataTransfer.setData("text/plain", viewId);
  }
  function dropPaneTab(targetPaneId: string, targetViewId: string | null, placement: "before" | "after" | "end", event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const payload = event.dataTransfer.getData("application/x-fluxiq-automation-pane-tab");
    if (!payload) return;
    const parsed = parsePaneTabDragPayload(payload);
    if (!parsed) return;
    updateWorkspacePrefs((current) => {
      current = captureActiveViewState(current);
      const moved = moveAutomationWorkspacePaneTab(current.panes, parsed.paneId, targetPaneId, parsed.viewId, current.mainLayoutPreset, targetViewId, placement);
      return moved ? { ...current, ...moved } : current;
    });
  }
  function movePaneTabByKeyboard(sourcePaneId: string, viewId: string, direction: -1 | 1) {
    updateWorkspacePrefs((current) => {
      const sourceIndex = current.panes.findIndex((pane) => pane.id === sourcePaneId);
      const targetPane = current.panes[sourceIndex + direction];
      if (!targetPane) return current;
      const moved = moveAutomationWorkspacePaneTab(current.panes, sourcePaneId, targetPane.id, viewId, current.mainLayoutPreset, null, "end");
      if (!moved) return current;
      return { ...current, ...moved };
    });
  }
  function setRightSidebarTab(viewId: string) {
    restoreViewState(viewId);
    updateWorkspacePrefs((current) => ({
      ...captureActiveViewState(current),
      rightSidebarCollapsed: false,
      rightSidebar: {
        ...current.rightSidebar,
        activeViewId: viewId,
        collapsed: false
      }
    }), { persist: false });
  }
  function closeRightSidebarTab(viewId: string) {
    updateWorkspacePrefs((current) => {
      current = captureActiveViewState(current);
      const tabs = current.rightSidebar.tabs.filter((tab) => tab !== viewId);
      const nextTabs = tabs.length ? tabs : ["global-inspector"];
      return {
        ...current,
        rightSidebar: {
          ...current.rightSidebar,
          tabs: nextTabs,
          activeViewId: current.rightSidebar.activeViewId === viewId ? nextTabs[0] ?? "global-inspector" : current.rightSidebar.activeViewId
        }
      };
    });
  }
  function arrangeWindows(preset: AutomationLayoutPreset) {
    const strictPreset = preset === "two-columns" ? "two-even"
      : preset === "main-sidebar" ? "two-main-side"
        : preset === "three-columns" || preset === "quad" ? "three-main-two"
          : preset === "two-rows" ? "two-rows"
            : "single";
    updateWorkspacePrefs((current) => ({
      ...current,
      mainLayoutPreset: strictPreset,
      mainSplitRatios: defaultAutomationMainSplitRatios(strictPreset),
      maximizedWindowId: null
    }));
    setLayoutPickerOpen(null);
  }
  function toggleLayoutPicker(area: AutomationWorkspaceArea, event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setLayoutPickerOpen((current) => current?.area === area ? null : {
      area,
      anchor: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }
    });
  }
  function startWorkspaceSectionResize(area: "right", event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = workspacePrefs.inspectorWidth;
    let latestWidth = startWidth;
    const onMove = (moveEvent: PointerEvent) => {
      latestWidth = clampNumber(startWidth + startX - moveEvent.clientX, 260, 620, startWidth);
      setLiveInspectorWidth(latestWidth);
    };
    const onUp = () => {
      updateWorkspacePrefs((current) => ({
        ...current,
        inspectorWidth: latestWidth,
        rightSidebarCollapsed: false
      }));
      setLiveInspectorWidth(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function resizeInspectorFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    const nextWidth = event.key === "Home"
      ? 320
      : clampNumber(workspacePrefs.inspectorWidth + (event.key === "ArrowLeft" ? 16 : -16), 260, 620, workspacePrefs.inspectorWidth);
    updateWorkspacePrefs((current) => ({ ...current, inspectorWidth: nextWidth, rightSidebarCollapsed: false }));
  }
  function startBottomTimelineResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = workspacePrefs.bottomTimelineHeight;
    let latestHeight = startHeight;
    const onMove = (moveEvent: PointerEvent) => {
      latestHeight = clampNumber(startHeight + startY - moveEvent.clientY, automationBottomDockMinHeight, automationBottomDockMaxHeight, startHeight);
      setLiveBottomTimelineHeight(latestHeight);
    };
    const onUp = () => {
      updateWorkspacePrefs((current) => ({
        ...current,
        bottomTimelineHeight: latestHeight,
        bottomTimelineCollapsed: false,
        bottomDock: { ...current.bottomDock, expanded: true }
      }));
      setLiveBottomTimelineHeight(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function resizeBottomTimelineFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    const nextHeight = event.key === "Home"
      ? 220
      : clampNumber(workspacePrefs.bottomTimelineHeight + (event.key === "ArrowUp" ? 16 : -16), automationBottomDockMinHeight, automationBottomDockMaxHeight, workspacePrefs.bottomTimelineHeight);
    updateWorkspacePrefs((current) => ({
      ...current,
      bottomTimelineHeight: nextHeight,
      bottomTimelineCollapsed: false,
      bottomDock: { ...current.bottomDock, expanded: true }
    }));
  }
  function startMainSplitResize(splitIndex: number, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const vertical = workspacePrefs.mainLayoutPreset === "two-rows";
    const startPoint = vertical ? event.clientY : event.clientX;
    const bounds = mainWorkspaceCanvasRef.current?.getBoundingClientRect();
    const totalSize = Math.max(1, vertical ? bounds?.height ?? 1 : bounds?.width ?? 1);
    const paneCount = automationMainPaneCount(workspacePrefs.mainLayoutPreset);
    const startRatios = (liveMainSplitRatios ?? workspacePrefs.mainSplitRatios).length === paneCount
      ? [...(liveMainSplitRatios ?? workspacePrefs.mainSplitRatios)]
      : Array.from({ length: paneCount }, () => 1 / paneCount);
    let latestRatios = startRatios;
    const onMove = (moveEvent: PointerEvent) => {
      const currentPoint = vertical ? moveEvent.clientY : moveEvent.clientX;
      const deltaRatio = (currentPoint - startPoint) / totalSize;
      latestRatios = resizeAutomationMainSplitRatios(startRatios, splitIndex, deltaRatio);
      setLiveMainSplitRatios(latestRatios);
    };
    const onUp = () => {
      updateWorkspacePrefs((current) => ({
        ...current,
        mainSplitRatios: latestRatios
      }));
      setLiveMainSplitRatios(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function resizeMainSplitFromKeyboard(splitIndex: number, event: KeyboardEvent<HTMLButtonElement>) {
    const vertical = workspacePrefs.mainLayoutPreset === "two-rows";
    const decreaseKey = vertical ? "ArrowUp" : "ArrowLeft";
    const increaseKey = vertical ? "ArrowDown" : "ArrowRight";
    if (![decreaseKey, increaseKey, "Home"].includes(event.key)) return;
    event.preventDefault();
    updateWorkspacePrefs((current) => ({
      ...current,
      mainSplitRatios: event.key === "Home"
        ? defaultAutomationMainSplitRatios(current.mainLayoutPreset)
        : resizeAutomationMainSplitRatios(current.mainSplitRatios, splitIndex, event.key === decreaseKey ? -0.04 : 0.04)
    }));
    setLiveMainSplitRatios(null);
  }
  function openAutomationProblems() {
    openView("problems-view", "preview", "right");
    if (isNarrowWorkspace) setNarrowWorkspacePanel("inspector");
  }

  function openAutomationProblem(problem: any) {
    if (problem?.source === "graph" || problem?.kind === "node" || problem?.kind === "edge" || problem?.kind === "graph") {
      openView("policy-primary", "preview", "main");
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("automation-studio:focus-graph-problem", { detail: problem }));
      }));
      return;
    }
    if (typeof problem?.viewId === "string") openView(problem.viewId, "preview");
  }
  const handleCreateSubflowFromActiveGraph = useCallback(() => {
    const subflowRoot = hierarchyNodes.find((node) => automationHierarchyNodeIsSubflowRoot(node) && node.flowId === selectedTaskGraph?.flowId);
    if (subflowRoot) requestHierarchyAction({ action: "create", category: "flow", parentId: subflowRoot.id });
  }, [hierarchyNodes, selectedTaskGraph?.flowId]);
  const handleRefreshRecordingsForRenderer = useCallback(async () => {
    await refreshProjectRuntimeState(activeProjectId);
  }, [activeProjectId]);

  function renderViewContent(view: AutomationViewInstance, viewActive: boolean) {
    return (
      <AutomationViewRenderer
        entries={selectedTimelineEntries}
        models={models}
        notes={selectedRecordingNotes}
        actionStatus={automationActionStatus}
        policies={policies}
        pipelineArtifacts={pipelineArtifacts}
        policy={view.type === "state" && selection?.kind === "state" && selection.proposalId ? selectedProposal?.policy ?? selectedPolicy : selectedPolicy}
        configs={projectArtifacts.configs ?? []}
        taskGraph={selectedTaskGraph}
        taskGraphDraft={selectedTaskGraphDraft}
        recoverableTaskGraphDraft={recoverableTaskGraphDraftView}
        flowEditable={selectedFlowEntry?.source === "canonical"}
        nativeNodeDefinitions={availableNodeDefinitions}
        flowPublications={flowPublications}
        flowDependencyInfo={flowDependencyInfo}
        proposalReview={selectedProposalReview}
        proposalTargetFlowId={proposalTargetFlowId}
        problems={problems}
        projectId={activeProjectId}
        recordings={recordings}
        runtimeSessions={runtimeSessions}
        indexedStateSources={indexedStateSourceList}
        stateLoading={view.type === "state" ? pendingStateOpen : null}
        selectedEntry={activePreviewEntry}
        selectedNode={selectedNode}
        selectedProposal={selectedProposal}
        selectedRecording={selectedRecording}
        recordingProcessing={recordingProcessing}
        selectedSignal={selectedSignal}
        selectedTimeline={selectedTimeline}
        selection={selection}
        signals={signals}
        timelines={timelines}
        view={view}
        viewActive={viewActive}
        onDeleteRecording={deleteProjectRecording}
        onFinalizeRecording={finalizeProjectRecording}
        onEnsureInspectorAvailable={ensureGlobalInspectorAvailable}
        onOpenTimelineEntryState={openTimelineEntryState}
        onOpenProblem={openAutomationProblem}
        onOpenProblems={openAutomationProblems}
        onCreateSubflow={handleCreateSubflowFromActiveGraph}
        onOpenSubflow={openSubflowInEditor}
        onOpenRecording={openRecordingTimeline}
        onOpenState={openStateView}
        onAppendRecordingMarker={appendProjectRecordingMarker}
        onAppendRecordingNote={appendProjectRecordingNote}
        onSaveTaskGraph={saveSelectedTaskGraph}
        onTaskGraphDraftChange={updateSelectedTaskGraphDraft}
        onRestoreTaskGraphDraft={restoreSelectedTaskGraphDraft}
        onDiscardTaskGraphDraft={discardSelectedTaskGraphDraft}
        onTaskGraphDirtyChange={setHasDirtyTaskGraph}
        onRefreshRecordings={handleRefreshRecordingsForRenderer}
        onUpdateRecording={updateProjectRecording}
        setSelection={setSelectionAndFollow}
      />
    );
  }
  function hierarchySubflowCategoryParent(parentId: string | null): { flowId: string; parentCategoryId: string | null } | null {
    if (!parentId) return null;
    const parent = hierarchyNodes.find((node) => node.id === parentId);
    if (!parent?.flowId) return null;
    if (automationHierarchyNodeIsSubflowRoot(parent)) return { flowId: parent.flowId, parentCategoryId: null };
    if (automationHierarchyNodeIsSubflowCategory(parent) && parent.sourceId) return { flowId: parent.flowId, parentCategoryId: parent.sourceId };
    return null;
  }

  async function createFlowSubflowFromHierarchy(name: string, flowId: string, parentCategoryId: string | null): Promise<boolean> {
    if (!activeProjectId) {
      setHierarchyStatus("Open a project before creating a subflow.");
      return false;
    }
    const result = await api.post<{ subflow: any }>("create-flow-subflow", {
      projectId: activeProjectId,
      flowId,
      authorizationPin: hierarchyPin,
      name,
      role: "utility",
      parentCategoryId
    });
    if (!result.ok || !result.payload?.subflow) {
      setHierarchyStatus(result.error ?? "Subflow could not be created.");
      return false;
    }
    window.dispatchEvent(new CustomEvent("fluxiq:subflows-changed", { detail: { flowId } }));
    notifyProjectDataChanged(["flow", "subflow", "summary"], [flowId, result.payload.subflow.subflowId]);
    const graphFlowId = result.payload.subflow.graphFlowId ?? flowId + "." + result.payload.subflow.subflowId + ".graph";
    setProjectFlows((current) => upsertSubflowSummaryIntoProjectFlows(current, flowId, result.payload!.subflow));
    void loadFlowDetails(graphFlowId);
    setSelection({ kind: "flow", id: graphFlowId });
    openView("policy-primary", "preview", "main");
    setHierarchyStatus(`${name} subflow created.`);
    return true;
  }

  async function createSubflowCategoryFolder(name: string, flowId: string, parentCategoryId: string | null): Promise<boolean> {
    if (!activeProjectId) {
      setHierarchyStatus("Open a project before creating a subflow category.");
      return false;
    }
    const flow = await loadHierarchyFlow(flowId);
    if (!flow) return false;
    const now = Date.now();
    const categories = normalizeSubflowCategories(flow.metadata?.subflowCategories);
    if (categories.some((category) => category.parentId === parentCategoryId && category.name.toLowerCase() === name.toLowerCase())) {
      setHierarchyStatus("A subflow category with that name already exists in this folder.");
      return false;
    }
    const category = {
      id: `subflow-category.${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${now}.${Math.random().toString(36).slice(2)}`}`,
      name,
      parentId: parentCategoryId,
      createdAt: now,
      updatedAt: now
    };
    const nextFlow = {
      ...flow,
      metadata: {
        ...(flow.metadata ?? {}),
        subflowCategories: [...categories, category]
      }
    };
    const result = await api.post<{ flow: any }>("save-flow", { projectId: activeProjectId, authorizationPin: hierarchyPin, flow: nextFlow });
    if (!result.ok || !result.payload?.flow) {
      setHierarchyStatus(result.error ?? "Subflow category could not be saved.");
      return false;
    }
    dataCache.set("flow", activeProjectId, flowId, result.payload.flow);
    setProjectFlows((current) => applySubflowCategoryCreate(
      mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: result.payload!.flow }]),
      flowId,
      category
    ).next);
    notifyProjectDataChanged(["flow", "subflow", "summary"], [flowId, category.id]);
    setHierarchyStatus(`${name} created under Subflows.`);
    return true;
  }

  async function loadHierarchyFlow(flowId: string): Promise<any | null> {
    const local = projectFlows.find((entry: any) => entry.source === "canonical" && entry.flow?.flowId === flowId)?.flow;
    if (local && local.metadata?.summaryOnly !== true) return local;
    if (!activeProjectId) return null;
    const result = await api.post<{ flow: any }>("get-flow", { projectId: activeProjectId, flowId });
    if (!result.ok || !result.payload?.flow) {
      setHierarchyStatus(result.error ?? "Flow details could not be loaded.");
      return null;
    }
    setProjectFlows((current) => mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: result.payload!.flow }]));
    return result.payload.flow;
  }

  function normalizeSubflowCategories(value: unknown): Array<{ id: string; name: string; parentId: string | null; createdAt?: number; updatedAt?: number }> {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.flatMap((raw: any) => {
      const id = typeof raw?.id === "string" ? raw.id.trim() : "";
      const name = typeof raw?.name === "string" ? raw.name.trim() : "";
      if (!id || !name || seen.has(id)) return [];
      seen.add(id);
      return [{ ...raw, id, name, parentId: typeof raw?.parentId === "string" && raw.parentId.trim() ? raw.parentId.trim() : null }];
    });
  }
  function requestHierarchyAction(action: NonNullable<AutomationHierarchyAction>) {
    setHierarchyAction(action);
    if (action.action === "create") {
      const parent = action.parentId ? hierarchyNodes.find((node) => node.id === action.parentId) : null;
      const category = action.category ?? parent?.category ?? "flow";
      const createsSubflowObject = parent ? automationHierarchyNodeIsSubflowRoot(parent) || automationHierarchyNodeIsSubflowCategory(parent) : false;
      setHierarchyCreateStep("type");
      setHierarchyCategory(category);
      setHierarchyKind(createsSubflowObject ? "subflow" : category === "flow" ? "flow" : "folder");
      setHierarchyName("");
      setHierarchyFlowOrigin("blank");
      setHierarchyParentId(action.parentId ?? null);
    }
    if (action.action === "delete" && action.node) {
      if (action.node.kind === "flow" || action.node.kind === "folder") setHierarchyKind(action.node.kind);
      setHierarchyCategory(action.node.category);
      setHierarchyName(action.node.label);
      setHierarchyParentId(action.node.parentId);
    }
    setHierarchyPin("");
    setHierarchyStatus("");
  }
  async function confirmHierarchyAction() {
    if (hierarchyPin.length < 4) {
      setHierarchyStatus("Enter your PIN before changing hierarchy items.");
      return;
    }
    if (!hierarchyAction) return;
    if (hierarchyAction.action === "create") {
      const label = hierarchyName.trim();
      if (!label) {
        setHierarchyStatus("Name is required.");
        return;
      }
      if (hierarchyKind === "flow") {
        if (!activeProjectId) {
          setHierarchyStatus("Open a project before creating a flow.");
          return;
        }
        const result = await api.post<{ flow: any }>("create-flow", {
          projectId: activeProjectId,
          authorizationPin: hierarchyPin,
          name: label,
          description: "Visual Flow created in Automation Studio."
        });
        if (!result.ok) {
          setHierarchyStatus(result.error ?? "Flow could not be saved.");
          return;
        }
        const createdFlow = result.payload!.flow;
        const presetFlow = automationFlowPreset(createdFlow, hierarchyFlowOrigin);
        const originResult = hierarchyFlowOrigin === "blank" ? result : await api.post<{ flow: any }>("save-flow", {
          projectId: activeProjectId,
          authorizationPin: hierarchyPin,
          flow: presetFlow
        });
        if (!originResult.ok) {
          setHierarchyStatus(originResult.error ?? "Flow was created but its preset could not be saved.");
          return;
        }
        const flow = originResult.payload?.flow ?? createdFlow;
        dataCache.set("flow", activeProjectId, flow.flowId, flow);
        setProjectFlows((current) => mergeCreatedFlowIntoProjectFlows(current, flow));
        notifyProjectDataChanged(["flow", "summary"], [flow.flowId]);
        setSelection({ kind: "flow", id: flow.flowId });
        openView("policy-primary", "preview", "main");
        setHierarchyStatus(`${label} saved.`);
      } else {
        const subflowParent = hierarchySubflowCategoryParent(hierarchyParentId);
        if (subflowParent) {
          const created = hierarchyKind === "subflow"
            ? await createFlowSubflowFromHierarchy(label, subflowParent.flowId, subflowParent.parentCategoryId)
            : await createSubflowCategoryFolder(label, subflowParent.flowId, subflowParent.parentCategoryId);
          if (!created) return;
        } else {
          const id = `custom-${hierarchyKind}-${Date.now()}`;
          const folderNode: AutomationHierarchyNode = {
            id,
            kind: hierarchyKind,
            category: hierarchyCategory,
            label,
            parentId: hierarchyParentId
          };
          setCustomHierarchyNodes((items) => applyCustomFolderCreate(items, folderNode).next);
          setHierarchyStatus(`${label} created.`);
        }
      }
    }
    if (hierarchyAction.action === "delete" && hierarchyAction.node) {
      const ids = collectHierarchyDescendantIds(hierarchyAction.node.id, hierarchyNodes);
      const deletingNodes = [hierarchyAction.node, ...ids.map((id) => hierarchyNodes.find((node) => node.id === id)).filter((node): node is AutomationHierarchyNode => Boolean(node))];
      const recordingIds = deletingNodes
        .filter((node) => node.kind === "recording" && node.sourceId)
        .map((node) => node.sourceId!);
      if ((hierarchyAction.node.kind === "recording" || hierarchyAction.node.category === "recording") && recordingIds.length) {
        setHierarchyStatus(`Deleting ${recordingIds.length} recording${recordingIds.length === 1 ? "" : "s"}...`);
        const deleted = await deleteProjectRecordings(recordingIds, hierarchyPin);
        if (!deleted) return;
        setDeletedHierarchyIds((items) => items.filter((id) => !id.startsWith("recordings-client-") && !recordingIds.includes(id)));
        setCustomHierarchyNodes((items) => applyCustomFolderDelete(items, hierarchyAction.node!.id).next.filter((item) => !ids.includes(item.id)));
        setHierarchyAction(null);
        setHierarchyPin("");
        setHierarchyName("");
        return;
      }
      const proposalIds = deletingNodes
        .filter((node) => node.kind === "proposal" && node.sourceId)
        .map((node) => node.sourceId!);
      if (hierarchyAction.node.category === "proposal" && proposalIds.length) {
        setHierarchyStatus(`Deleting ${proposalIds.length} proposal${proposalIds.length === 1 ? "" : "s"}...`);
        const deleted = await deleteProjectProposals(proposalIds, hierarchyPin);
        if (!deleted) return;
        setHierarchyAction(null);
        setHierarchyPin("");
        setHierarchyName("");
        return;
      }
      const subflowCategoryNodes = deletingNodes.filter(automationHierarchyNodeIsSubflowCategory);
      if (automationHierarchyNodeIsSubflowCategory(hierarchyAction.node) && subflowCategoryNodes.length) {
        if (!activeProjectId) {
          setHierarchyStatus("Open a project before deleting subflow categories.");
          return;
        }
        const categoriesByFlowId = new Map<string, string[]>();
        for (const node of subflowCategoryNodes) {
          if (!node.flowId || !node.sourceId) continue;
          categoriesByFlowId.set(node.flowId, [...(categoriesByFlowId.get(node.flowId) ?? []), node.sourceId]);
        }
        for (const [flowId, categoryIds] of categoriesByFlowId) {
          const flow = await loadHierarchyFlow(flowId);
          if (!flow) return;
          const nextFlow = categoryIds.reduce((currentFlow, categoryId) => flowDocumentWithoutSubflowCategory(currentFlow, categoryId), flow);
          const result = await api.post<{ flow: any }>("save-flow", { projectId: activeProjectId, authorizationPin: hierarchyPin, flow: nextFlow });
          if (!result.ok) {
            setHierarchyStatus(result.error ?? "Subflow category could not be deleted.");
            return;
          }
          const savedFlow = result.payload?.flow ?? nextFlow;
          dataCache.set("flow", activeProjectId, flowId, savedFlow);
          setProjectFlows((current) => categoryIds.reduce(
            (entries, categoryId) => applySubflowCategoryDelete(entries, flowId, categoryId).next,
            mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: savedFlow }])
          ));
        }
        closeDeletedHierarchyViews(deletingNodes);
        notifyProjectDataChanged(["flow", "subflow", "summary"], [...categoriesByFlowId.keys(), ...subflowCategoryNodes.map((node) => node.sourceId).filter((value): value is string => Boolean(value))]);
        setHierarchyAction(null);
        setHierarchyPin("");
        setHierarchyName("");
        setHierarchyStatus(`${hierarchyAction.node.label} deleted.`);
        return;
      }
      const subflowNodes = hierarchyAction.node.kind === "subflow"
        ? deletingNodes.filter((node) => node.kind === "subflow" && node.flowId && node.sourceId)
        : [];
      if (subflowNodes.length) {
        if (!activeProjectId) {
          setHierarchyStatus("Open a project before deleting subflows.");
          return;
        }
        for (const node of subflowNodes) {
          const result = await api.post("delete-flow-subflow", { projectId: activeProjectId, flowId: node.flowId, subflowId: node.sourceId, authorizationPin: hierarchyPin });
          if (!result.ok) {
            setHierarchyStatus(result.error ?? `${node.label} could not be deleted.`);
            return;
          }
          setProjectFlows((current) => applySubflowReferenceDelete(
            removeSubflowSummaryFromProjectFlows(removeDeletedFlowsFromProjectFlows(current, typeof node.metadata?.graphFlowId === "string" ? [node.metadata.graphFlowId] : []), node.flowId!, [node.sourceId!]),
            node.flowId!,
            node.sourceId!
          ).next);
          if (typeof node.metadata?.graphFlowId === "string") clearTaskGraphDraftsForFlow(node.metadata.graphFlowId);
        }
        closeDeletedHierarchyViews(deletingNodes);
        notifyProjectDataChanged(["flow", "subflow", "summary"], subflowNodes.flatMap((node) => [node.flowId!, node.sourceId!, typeof node.metadata?.graphFlowId === "string" ? node.metadata.graphFlowId : ""]).filter(Boolean));
        if (selection?.kind === "flow" && subflowNodes.some((node) => node.metadata?.graphFlowId === selection.id)) setSelection(null);
        setHierarchyAction(null);
        setHierarchyPin("");
        setHierarchyName("");
        setHierarchyStatus(`${hierarchyAction.node.label} deleted.`);
        return;
      }
      const flowObjectNodes = deletingNodes.filter((node) => node.sourceId && node.flowId && (node.kind === "instruction" || node.kind === "adaptation"));
      if (flowObjectNodes.length && (hierarchyAction.node.kind === "instruction" || hierarchyAction.node.kind === "adaptation")) {
        if (!activeProjectId) {
          setHierarchyStatus("Open a project before removing Flow objects.");
          return;
        }
        const removalsByFlowId = new Map<string, Array<{ kind: FlowObjectKind; ids: string[] }>>();
        for (const node of flowObjectNodes) {
          const kind: FlowObjectKind = node.kind === "instruction" ? "instruction" : "adaptation";
          removalsByFlowId.set(node.flowId!, [...(removalsByFlowId.get(node.flowId!) ?? []), { kind, ids: [node.sourceId!] }]);
        }
        for (const [flowId, removals] of removalsByFlowId) {
          let flow = await loadHierarchyFlow(flowId);
          if (!flow) return;
          for (const removal of removals) flow = flowDocumentWithoutFlowObjectReferences(flow, removal.kind, removal.ids);
          const result = await api.post<{ flow: any }>("save-flow", { projectId: activeProjectId, authorizationPin: hierarchyPin, flow });
          if (!result.ok) {
            setHierarchyStatus(result.error ?? "Flow object could not be removed.");
            return;
          }
          const savedFlow = result.payload?.flow ?? flow;
          dataCache.set("flow", activeProjectId, flowId, savedFlow);
          setProjectFlows((current) => removals.reduce(
            (entries, removal) => removeFlowObjectReferencesFromProjectFlows(entries, flowId, removal.kind, removal.ids),
            mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: savedFlow }])
          ));
        }
        closeDeletedHierarchyViews(deletingNodes);
        notifyProjectDataChanged(["flow", "summary"], flowObjectNodes.flatMap((node) => [node.flowId!, node.sourceId!]).filter(Boolean));
        setHierarchyAction(null);
        setHierarchyPin("");
        setHierarchyName("");
        setHierarchyStatus(`${hierarchyAction.node.label} deleted.`);
        return;
      }
      const flowNodes = deletingNodes.filter((node) => node.kind === "flow" && node.sourceId && projectFlows.some((entry: any) => entry.source === "canonical" && entry.flow?.flowId === node.sourceId));
      if (flowNodes.length) {
        if (!activeProjectId) {
          setHierarchyStatus("Open a project before deleting flows.");
          return;
        }
        for (const node of flowNodes) {
          const result = await api.post("delete-flow", { projectId: activeProjectId, flowId: node.sourceId, authorizationPin: hierarchyPin });
          if (!result.ok) {
            setHierarchyStatus(result.error ?? `${node.label} could not be deleted.`);
            return;
          }
        }
        closeDeletedHierarchyViews(flowNodes);
        const deletedFlowIds = flowNodes.map((node) => node.sourceId).filter((value): value is string => Boolean(value));
        setProjectFlows((current) => removeDeletedFlowsFromProjectFlows(current, deletedFlowIds));
        for (const flowId of deletedFlowIds) clearTaskGraphDraftsForFlow(flowId);
        notifyProjectDataChanged(["flow", "subflow", "summary"], flowNodes.map((node) => node.sourceId).filter((value): value is string => Boolean(value)));
        if (selection?.kind === "flow" && flowNodes.some((node) => node.sourceId === selection.id)) setSelection(null);
      }
      const artifactNodes = deletingNodes.filter((node) => (node.kind === "task" || node.kind === "routine" || node.kind === "config") && node.sourceId);
      if (artifactNodes.length) {
        if (!activeProjectId) {
          setHierarchyStatus("Open a project before deleting saved artifacts.");
          return;
        }
        setHierarchyStatus(`Deleting ${artifactNodes.length} saved item${artifactNodes.length === 1 ? "" : "s"}...`);
        for (const node of artifactNodes) {
          const result = await api.post<{ deleted: boolean }>("delete-project-artifact", {
            projectId: activeProjectId,
            kind: node.kind,
            artifactId: node.sourceId,
            deleteOwnedArtifacts: true,
            authorizationPin: hierarchyPin
          });
          if (!result.ok) {
            setHierarchyStatus(result.error ?? `${node.label} could not be deleted from disk.`);
            return;
          }
        }
        closeDeletedHierarchyViews(deletingNodes);
        notifyProjectDataChanged(["summary"], artifactNodes.map((node) => node.sourceId).filter((value): value is string => Boolean(value)));
        const deletedTaskIds = new Set(artifactNodes.filter((node) => node.kind === "task").map((node) => node.sourceId));
        if (selection?.kind === "policy" && deletedTaskIds.has(selection.id)) {
          const nextTask = (projectArtifacts.tasks ?? []).find((task: any) => !deletedTaskIds.has(task.taskId));
          setSelection(nextTask ? { kind: "policy", id: nextTask.taskId } : null);
        }
      }
      const artifactNodeIds = new Set([...artifactNodes, ...flowNodes].map((node) => node.id));
      const hierarchyOnlyDeletedIds = [hierarchyAction.node.id, ...ids].filter((id) => !artifactNodeIds.has(id));
      if (hierarchyOnlyDeletedIds.length) setDeletedHierarchyIds((items) => [...new Set([...items, ...hierarchyOnlyDeletedIds])]);
      setCustomHierarchyNodes((items) => applyCustomFolderDelete(items, hierarchyAction.node!.id).next.filter((item) => !ids.includes(item.id)));
      setHierarchyStatus(`${hierarchyAction.node.label} deleted.`);
    }
    setHierarchyAction(null);
    setHierarchyPin("");
    setHierarchyName("");
  }

  const renderBottomTimelineDock = (forceExpanded = false) => {
    const collapsed = forceExpanded ? false : workspacePrefs.bottomTimelineCollapsed;
    return (
      <section aria-label="Action preview timeline" className={collapsed ? "automation-bottom-timeline-region collapsed" : "automation-bottom-timeline-region"} data-workspace-region="timeline">
        <button aria-label="Resize timeline" aria-orientation="horizontal" aria-valuemax={automationBottomDockMaxHeight} aria-valuemin={automationBottomDockMinHeight} aria-valuenow={workspacePrefs.bottomTimelineHeight} className="automation-section-resize-handle bottom" disabled={collapsed} onKeyDown={resizeBottomTimelineFromKeyboard} onPointerDown={startBottomTimelineResize} role="separator" title="Resize timeline" type="button" />
        <header className="automation-bottom-timeline-header">
          <div>
            <Radio size={14} aria-hidden />
            <span><strong>Action Preview</strong><small>{selectedRecording?.metadata?.name ?? selectedRecording?.recordingId ?? "No recording selected"}</small></span>
          </div>
          <div className="automation-bottom-timeline-actions">
            {!collapsed ? <button className="button" disabled={!selectedRecording} onClick={() => selectedRecording && openRecordingTimeline(selectedRecording.recordingId)} type="button"><FileSearch size={13} aria-hidden />Full Timeline</button> : null}
            <button
              className="icon-button"
              onClick={() => updateWorkspacePrefs((current) => ({
                ...current,
                bottomTimelineCollapsed: !current.bottomTimelineCollapsed,
                bottomDock: { ...current.bottomDock, expanded: current.bottomTimelineCollapsed }
              }))}
              title={collapsed ? "Expand timeline" : "Collapse timeline"}
              aria-label={collapsed ? "Expand timeline" : "Collapse timeline"}
              type="button"
            >{collapsed ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}</button>
          </div>
        </header>
        {!collapsed ? <AutomationTimelineDock
          entries={selectedTimeline?.timeline ?? selectedRecording?.timeline ?? []}
          selectedEntryId={activePreviewEntryId}
          selectedRecording={selectedRecording}
          onSelectAction={handleBottomPreviewActionClick}
        /> : null}
      </section>
    );
  };

  const renderWorkspaceArea = (area: AutomationWorkspaceArea, label: string, ref: RefObject<HTMLDivElement | null>, forceExpanded = false) => {
    if (area === "main") {
      const configuredPaneCount = automationMainPaneCount(workspacePrefs.mainLayoutPreset);
      const configuredPanes = workspacePrefs.panes.slice(0, configuredPaneCount);
      const activeNarrowPane = configuredPanes.find((pane) => pane.id === workspacePrefs.activePaneId) ?? configuredPanes[0];
      const panes = isNarrowWorkspace && activeNarrowPane ? [activeNarrowPane] : configuredPanes;
      const paneCount = panes.length;
      const ratiosSource = isNarrowWorkspace ? [1] : liveMainSplitRatios ?? workspacePrefs.mainSplitRatios;
      const ratios = ratiosSource.length === paneCount ? ratiosSource : Array.from({ length: paneCount }, () => 1 / paneCount);
      const paneLayoutStyle = workspacePrefs.mainLayoutPreset === "two-rows"
        ? { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: ratios.map((ratio) => `minmax(0, ${ratio}fr)`).join(" ") }
        : { gridTemplateColumns: ratios.map((ratio) => `minmax(0, ${ratio}fr)`).join(" "), gridTemplateRows: "minmax(0, 1fr)" };
      let accumulatedRatio = 0;
      const splitHandles = ratios.slice(0, -1).map((ratio, index) => {
        accumulatedRatio += ratio;
        return { index, offsetPct: accumulatedRatio * 100 };
      });
      return (
        <section aria-label="Main editor" className="automation-workspace-section main strict" data-workspace-region="main">
          <header className="automation-workspace-section-header">
            <div className="automation-workspace-section-actions">
              <button className="icon-button" onClick={(event) => toggleLayoutPicker(area, event)} title={`Arrange ${label}`} aria-label={`Arrange ${label}`} type="button"><Columns3 size={13} aria-hidden /></button>
            </div>
          </header>
          <div className="automation-dock-layout" ref={ref}>
            <div className={`automation-strict-pane-layout preset-${workspacePrefs.mainLayoutPreset}`} style={paneLayoutStyle}>
              {panes.map((pane, paneIndex) => {
                const baseView = viewById.get(pane.activeViewId) ?? viewById.get("policy-primary");
                if (!baseView) return null;
                const savedActiveSelection = workspacePrefs.viewStates?.[pane.activeViewId]?.selection;
                const activeTitleSelection = workspacePrefs.activePaneId === pane.id
                  ? selection
                  : isAutomationSelection(savedActiveSelection) ? savedActiveSelection : null;
                const view = viewWithTitleData(baseView, activeTitleSelection);
                const tabViews = pane.tabs
                  .map((tabId) => {
                    const tabView = viewById.get(tabId);
                    if (!tabView || automationWorkspaceRegionForView(tabId) !== "main") return null;
                    const savedTabSelection = workspacePrefs.viewStates?.[tabId]?.selection;
                    const tabTitleSelection = tabId === pane.activeViewId
                      ? activeTitleSelection
                      : isAutomationSelection(savedTabSelection) ? savedTabSelection : null;
                    return viewWithTitleData(tabView, tabTitleSelection);
                  })
                  .filter(Boolean) as AutomationViewInstance[];
                return (
                  <div aria-label={"Editor pane " + (paneIndex + 1)} className="automation-pane-slot" key={pane.id} role="group">
                    <AutomationViewContainer
                      active={workspacePrefs.activePaneId === pane.id}
                      activeViewId={pane.activeViewId}
                      frameLabel="Pane"
                      bodyClassName={automationViewBodyClassName(view)}
                      icon={view.icon}
                      tabs={tabViews}
                      windowId={pane.id}
                      windowIndex={paneIndex}
                      subtitle={view.label}
                      title={viewTitle(view)}
                      onActivate={() => activatePane(pane.id)}
                      onClose={() => closePaneTab(pane.id, pane.activeViewId)}
                      onCloseTab={(viewId) => closePaneTab(pane.id, viewId)}
                      onMoveTab={(viewId, direction) => movePaneTabByKeyboard(pane.id, viewId, direction)}
                      onAddTab={(event) => toggleWindowAdder("main", event, pane.id)}
                      onTabDragStart={(viewId, event) => startPaneTabDrag(pane.id, viewId, event)}
                      onTabDrop={(viewId, placement, event) => dropPaneTab(pane.id, viewId, placement, event)}
                      onTabSelect={(viewId) => setPaneTab(pane.id, viewId)}
                    >
                      {renderViewContent(view, workspacePrefs.activePaneId === pane.id && pane.activeViewId === view.id)}
                    </AutomationViewContainer>
                  </div>
                );
              })}
              {splitHandles.map((handle) => (
                <button
                  className={workspacePrefs.mainLayoutPreset === "two-rows" ? "automation-main-split-handle horizontal" : "automation-main-split-handle vertical"}
                  key={`split:${handle.index}`}
                  aria-orientation={workspacePrefs.mainLayoutPreset === "two-rows" ? "horizontal" : "vertical"}
                  aria-valuemax={88}
                  aria-valuemin={12}
                  aria-valuenow={Math.round(handle.offsetPct)}
                  onKeyDown={(event) => resizeMainSplitFromKeyboard(handle.index, event)}
                  onPointerDown={(event) => startMainSplitResize(handle.index, event)}
                  role="separator"
                  style={workspacePrefs.mainLayoutPreset === "two-rows" ? { top: `${handle.offsetPct}%` } : { left: `${handle.offsetPct}%` }}
                  title="Resize panes"
                  aria-label="Resize panes"
                  type="button"
                />
              ))}
            </div>
          </div>
        </section>
      );
    }
    if (area === "right") {
      const rightSidebarCollapsed = forceExpanded ? false : workspacePrefs.rightSidebarCollapsed;
      const activeRightViewId = workspacePrefs.rightSidebar.activeViewId || "global-inspector";
      const baseView = viewById.get(activeRightViewId) ?? viewById.get("global-inspector");
      const savedActiveSelection = workspacePrefs.viewStates?.[activeRightViewId]?.selection;
      const activeTitleSelection = isAutomationSelection(savedActiveSelection) ? savedActiveSelection : selection;
      const view = baseView ? viewWithTitleData(baseView, activeTitleSelection) : null;
      const tabViews = workspacePrefs.rightSidebar.tabs
        .map((tabId) => {
          const tabView = viewById.get(tabId);
          if (!tabView || automationWorkspaceRegionForView(tabId) !== "right") return null;
          const savedTabSelection = workspacePrefs.viewStates?.[tabId]?.selection;
          return viewWithTitleData(tabView, isAutomationSelection(savedTabSelection) ? savedTabSelection : selection);
        })
        .filter(Boolean) as AutomationViewInstance[];
      return (
        <aside aria-label="Right utilities" className="automation-workspace-section right strict" data-workspace-region="inspector">
          <button aria-label="Resize right area" aria-orientation="vertical" aria-valuemax={620} aria-valuemin={260} aria-valuenow={workspacePrefs.inspectorWidth} className="automation-section-resize-handle right" onKeyDown={resizeInspectorFromKeyboard} onPointerDown={(event) => startWorkspaceSectionResize("right", event)} role="separator" title="Resize right area" type="button" />
          <header className="automation-workspace-section-header">
            <div className="automation-workspace-section-actions">
              <button
                className="icon-button"
                onClick={() => updateWorkspacePrefs((current) => ({
                  ...current,
                  rightSidebarCollapsed: !current.rightSidebarCollapsed,
                  rightSidebar: { ...current.rightSidebar, collapsed: !current.rightSidebarCollapsed }
                }))}
                title={rightSidebarCollapsed ? "Expand right area" : "Collapse right area"}
                aria-label={rightSidebarCollapsed ? "Expand right area" : "Collapse right area"}
                type="button"
              >{rightSidebarCollapsed ? <ChevronLeft size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}</button>
              <div className="automation-window-adder-anchor area-right">
                <button className="icon-button" onClick={(event) => toggleWindowAdder(area, event, "right-sidebar")} title="Add sidebar tab" aria-label="Add sidebar tab" type="button"><Plus size={13} aria-hidden /></button>
              </div>
            </div>
          </header>
          {!rightSidebarCollapsed && view ? <div className="automation-dock-layout" ref={ref}>
            <div className="automation-pane-slot">
              <AutomationViewContainer
                active
                activeViewId={activeRightViewId}
                frameLabel="Right utility"
                bodyClassName={automationViewBodyClassName(view)}
                icon={view.icon}
                tabs={tabViews}
                windowId="right-sidebar"
                windowIndex={0}
                subtitle={view.label}
                title={viewTitle(view)}
                onActivate={() => undefined}
                onClose={() => closeRightSidebarTab(activeRightViewId)}
                onCloseTab={closeRightSidebarTab}
                onAddTab={(event) => toggleWindowAdder("right", event, "right-sidebar")}
                onTabSelect={setRightSidebarTab}
              >
                {renderViewContent(view, true)}
              </AutomationViewContainer>
            </div>
          </div> : null}
        </aside>
      );
    }
    return null;
  };

  if (restoringUrlProject) {
    return (
      <section className="automation-studio-shell project-required">
        <div className="automation-project-required">
          <header className="automation-studio-workbar">
            <div className="automation-workspace-actions">
              <strong>Automation Studio</strong>
              <span>Opening project</span>
            </div>
          </header>
          <main className="automation-project-gate">
            <section className="automation-project-browser">
              <FolderOpen size={34} aria-hidden />
              <div>
                <strong>Opening project...</strong>
                <span>Restoring the project from the current URL.</span>
              </div>
            </section>
          </main>
        </div>
      </section>
    );
  }

  if (!activeProject) {
    return (
      <section className="automation-studio-shell project-required">
        <div className="automation-project-required">
          <header className="automation-studio-workbar">
            <div className="automation-workspace-actions">
              <strong>Automation Studio</strong>
              <span>Choose a project</span>
            </div>
          </header>
          <main className="automation-project-gate">
            <AutomationProjectBrowser
              categories={projectCategories}
              dragOverCategoryId={dragOverCategoryId}
              loaded={projectsLoaded}
              projects={projects}
              status={projectStatus}
              onCreateCategory={() => beginProjectModal("create-category")}
              onCreateProject={(category) => beginProjectModal("create", undefined, category)}
              onDeleteCategory={(category) => beginProjectModal("delete-category", undefined, category)}
              onDeleteProject={(project) => beginProjectModal("delete", project)}
              onDragLeaveCategory={() => setDragOverCategoryId(null)}
              onDragOverCategory={setDragOverCategoryId}
              onDrop={handleCategoryDrop}
              onOpenProject={(projectId) => void openProject(projectId)}
              onRefresh={() => {
                setProjectsLoaded(false);
                void refreshProjects();
              }}
              onRenameCategory={(category) => beginProjectModal("rename-category", undefined, category)}
              onRenameProject={(project) => beginProjectModal("rename", project)}
            />
          </main>
        </div>
        {projectModal ? <AutomationProjectModalView busy={projectActionBusy} categoryName={categoryName} categoryTarget={categoryTarget} currentUser={currentUser} description={projectDescription} mode={projectModal} name={projectName} pin={projectPin} projectTarget={projectTarget} status={projectStatus} onCategoryNameChange={setCategoryName} onClose={() => { if (!projectActionBusy) setProjectModal(null); }} onCreate={() => void createProject()} onCreateCategory={() => void createCategory()} onDelete={() => void deleteProject()} onDeleteCategory={() => void deleteCategory()} onDescriptionChange={setProjectDescription} onMove={() => void moveProject()} onMoveCategory={() => void moveCategory()} onNameChange={setProjectName} onPinChange={(value) => setProjectPin(digits(value))} onRename={() => void renameProject()} onRenameCategory={() => void renameCategory()} /> : null}
      </section>
    );
  }

  const hierarchyCollapsed = isNarrowWorkspace ? false : sidebarCollapsed;
  const projectHierarchySidebar = (
      <aside aria-label="Project hierarchy" className="automation-studio-sidebar">
        <div className="automation-studio-sidebar-heading">
          {!hierarchyCollapsed ? <strong title={activeProject.name}>{activeProject.name}</strong> : null}
          <div className="inline-actions">
            {hierarchyCollapsed ? <button className="icon-button" onClick={closeProject} title="Back to projects" aria-label="Back to projects" type="button"><FolderOpen size={15} aria-hidden /></button> : null}
            <button
              aria-expanded={!hierarchyCollapsed}
              className="icon-button"
              onClick={() => updateWorkspacePrefs((current) => ({ ...current, leftSidebarCollapsed: !current.leftSidebarCollapsed }))}
              title={hierarchyCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={hierarchyCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              {hierarchyCollapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronLeft size={14} aria-hidden />}
            </button>
          </div>
        </div>
        {!hierarchyCollapsed ? <div className="automation-sidebar-tools">
          <label className="automation-tree-search">
            <Search size={14} aria-hidden />
            <span className="sr-only">Search project hierarchy</span>
            <input aria-label="Search project hierarchy" onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search objects" type="search" value={projectSearch} />
            {projectSearch ? <button aria-label="Clear hierarchy search" className="automation-tree-search-clear" onClick={() => setProjectSearch("")} type="button"><X size={13} aria-hidden /></button> : null}
          </label>
          <div className="automation-tree-filter-row">
            <label>
              <span className="sr-only">Filter project object type</span>
              <select aria-label="Filter project object type" onChange={(event) => setProjectTypeFilter(event.target.value as typeof projectTypeFilter)} value={projectTypeFilter}>
                <option value="all">All objects</option>
                <option value="flow">Flows</option>
                <option value="folder">Folders</option>
                <option value="subflow">Subflows</option>
                <option value="flow-object">Flow objects</option>
                <option value="instruction">Instructions</option>
                <option value="adaptation">Adaptations</option>
                <option value="recording">Recordings</option>
                <option value="run">Runs</option>
              </select>
            </label>
            <small aria-live="polite">{hierarchyMatchCount} match{hierarchyMatchCount === 1 ? "" : "es"}</small>
          </div>
        </div> : null}
        {!hierarchyCollapsed ? <AutomationProjectTree
          nodes={hierarchyNodes}
          activeViewId={activeViewId}
          selection={selection}
          recordingPrimaryKind={recordingTreePrimaryKind}
          setRecordingPrimaryKind={setRecordingTreePrimaryKind}
          search={projectSearch}
          typeFilter={projectTypeFilter}
          setSelection={setSelection}
          openSubflow={(node, mode) => {
            if (node.flowId && node.sourceId) void openSubflowInEditor(node.flowId, node.sourceId, mode);
          }}
          openView={openView}
          requestAction={requestHierarchyAction}
        /> : null}
        {!hierarchyCollapsed ? <div
          aria-label="Resize project hierarchy"
          aria-orientation="vertical"
          aria-valuemax={420}
          aria-valuemin={220}
          aria-valuenow={Math.round(liveSidebarWidth ?? workspacePrefs.sidebarWidth)}
          className="automation-sidebar-resizer"
          onKeyDown={resizeSidebarFromKeyboard}
          onPointerDown={startSidebarResize}
          role="separator"
          tabIndex={0}
          title="Drag to resize. Use Left and Right arrow keys; Home resets."
        /> : null}
      </aside>
  );

  const activeRightUtility = viewById.get(workspacePrefs.rightSidebar.activeViewId) ?? viewById.get("global-inspector");
  const narrowRightUtilityLabel = activeRightUtility ? viewTitle(activeRightUtility) : "Inspector";

  return (
    <section
      className={`automation-studio-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      data-density={workspacePrefs.density}
      data-motion={workspacePrefs.motion}
      data-narrow={isNarrowWorkspace ? "true" : "false"}
      style={{ gridTemplateColumns: `${sidebarCollapsed ? 48 : workspacePrefs.sidebarWidth}px minmax(0, 1fr)` }}
    >
      {!isNarrowWorkspace ? projectHierarchySidebar : null}

      <div className="automation-studio-main">
        <header className="automation-studio-workbar">
          <div className="automation-workspace-actions">
            <button className="button" onClick={closeProject} type="button"><FolderOpen size={14} aria-hidden />Back to Projects</button>
            <div className="automation-narrow-workspace-actions">
              <button aria-expanded={narrowWorkspacePanel === "hierarchy"} className="button" onClick={() => setNarrowWorkspacePanel((current) => current === "hierarchy" ? null : "hierarchy")} type="button"><ListChecks size={14} aria-hidden />Hierarchy</button>
              <button aria-expanded={narrowWorkspacePanel === "inspector"} className="button" onClick={() => setNarrowWorkspacePanel((current) => current === "inspector" ? null : "inspector")} type="button"><SlidersHorizontal size={14} aria-hidden />{narrowRightUtilityLabel}</button>
              <button aria-expanded={narrowWorkspacePanel === "timeline"} className="button" onClick={() => setNarrowWorkspacePanel((current) => current === "timeline" ? null : "timeline")} type="button"><Radio size={14} aria-hidden />Preview</button>
            </div>
          </div>
          {workspaceBreadcrumbs.length ? <nav aria-label="Workspace location" className="automation-workspace-breadcrumbs">
            {workspaceBreadcrumbs.map((crumb, index) => <span key={crumb.kind + ":" + crumb.id}>
              {index ? <ChevronRight aria-hidden size={13} /> : null}
              {crumb.current ? <strong aria-current="page">{crumb.label}</strong> : <button onClick={() => {
                if (crumb.kind === "flow") {
                  void loadFlowDetails(crumb.id).then((flow) => { if (!flow) return; setSelection({ kind: "flow", id: crumb.id }); openView("flow-router", "preview", "main"); });
                } else if (crumb.kind === "subflow" && activeFlowScope?.flowId) void openSubflowInEditor(activeFlowScope.flowId, crumb.id);
              }} type="button">{crumb.label}</button>}
            </span>)}
          </nav> : <div className="automation-workspace-breadcrumbs empty" />}
          <div className="automation-studio-context">
            {process.env.NODE_ENV !== "production" ? <button aria-haspopup="dialog" className="icon-button" onClick={() => setDataInspectorOpen(true)} title="Open data flow inspector" type="button"><Bug size={15} aria-hidden /><span className="visually-hidden">Open data flow inspector</span></button> : null}
            <button aria-haspopup="dialog" className="button" onClick={() => setPreferencesOpen(true)} type="button"><SlidersHorizontal size={14} aria-hidden />Preferences</button>
          </div>
        </header>

        <section
          className={`automation-studio-workspace${workspacePrefs.rightSidebarCollapsed ? " right-collapsed" : ""}`}
          style={{
            gridTemplateColumns: `minmax(0, 1fr) ${workspacePrefs.rightSidebarCollapsed ? 38 : (liveInspectorWidth ?? workspacePrefs.inspectorWidth)}px`,
            gridTemplateRows: `minmax(0, 1fr) ${workspacePrefs.bottomTimelineCollapsed ? 38 : (liveBottomTimelineHeight ?? workspacePrefs.bottomTimelineHeight)}px`
          }}
        >
          {renderWorkspaceArea("main", "Main", mainWorkspaceCanvasRef)}
          {!isNarrowWorkspace ? renderWorkspaceArea("right", "Right Sidebar", rightWorkspaceCanvasRef) : null}
          {!isNarrowWorkspace ? renderBottomTimelineDock() : null}
        </section>
      </div>
      {isNarrowWorkspace && narrowWorkspacePanel === "hierarchy" ? <Drawer onClose={() => setNarrowWorkspacePanel(null)} side="left" title="Project Hierarchy">{projectHierarchySidebar}</Drawer> : null}
      {isNarrowWorkspace && narrowWorkspacePanel === "inspector" ? <Drawer onClose={() => setNarrowWorkspacePanel(null)} side="right" title={narrowRightUtilityLabel}>{renderWorkspaceArea("right", narrowRightUtilityLabel, rightWorkspaceCanvasRef, true)}</Drawer> : null}
      {isNarrowWorkspace && narrowWorkspacePanel === "timeline" ? <Drawer className="automation-preview-sheet" onClose={() => setNarrowWorkspacePanel(null)} side="right" title="Action Preview">{renderBottomTimelineDock(true)}</Drawer> : null}      {hierarchyAction ? <Modal title={
        hierarchyAction.action === "create" && hierarchyCreateStep === "type"
          ? hierarchySubflowParent ? "Add to Subflows" : "Add to " + automationHierarchyCategoryLabel(hierarchyCategory)
          : hierarchyAction.action === "create"
            ? "Create " + (hierarchySubflowParent && hierarchyKind === "folder" ? "Folder" : hierarchyKind === "subflow" ? "Subflow" : hierarchyKind)
            : "Delete item"
      } onClose={() => setHierarchyAction(null)}>
        {hierarchyAction.action === "create" && hierarchyCreateStep === "type" ? <div className="automation-hierarchy-create">
          <div className="automation-create-type-grid" role="list" aria-label="Choose item type">
            {[
              hierarchySubflowParent ? { kind: "subflow" as const, label: "Subflow", icon: Workflow, detail: "Create an executable workflow that the Router can target." } : null,
              { kind: "folder" as const, label: "Folder", icon: FolderPlus, detail: "Organize items inside " + (hierarchySubflowParent ? "Subflows" : automationHierarchyCategoryLabel(hierarchyCategory)) + "." },
              !hierarchySubflowParent && hierarchyCategory === "flow" ? { kind: "flow" as const, label: "Flow", icon: GitBranch, detail: "Create a new top-level automation Flow." } : null
            ].filter((item): item is { kind: AutomationCreatableHierarchyKind; label: string; icon: typeof Blocks; detail: string } => Boolean(item)).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.kind}
                  className="automation-create-type-card"
                  onClick={() => {
                    setHierarchyKind(item.kind);
                    setHierarchyCreateStep("details");
                  }}
                  type="button"
                >
                  <span className="automation-create-type-icon"><Icon size={19} aria-hidden /></span>
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <ChevronRight className="automation-create-type-chevron" size={17} aria-hidden />
                </button>
              );
            })}
          </div>
          <div className="modal-actions"><button className="button" onClick={() => setHierarchyAction(null)} type="button">Cancel</button></div>
        </div> : hierarchyAction.action === "create" ? <div className="automation-hierarchy-create automation-hierarchy-create-form">
          <div className="automation-hierarchy-create-heading">
            <span className="automation-create-type-icon">{hierarchyKind === "subflow" ? <Workflow size={19} aria-hidden /> : hierarchyKind === "folder" ? <FolderPlus size={19} aria-hidden /> : <GitBranch size={19} aria-hidden />}</span>
            <div>
              <strong>{hierarchyKind === "subflow" ? "New subflow" : hierarchyKind === "folder" ? "New folder" : "New Flow"}</strong>
              <span>{hierarchySubflowParent ? "Subflows" : automationHierarchyCategoryLabel(hierarchyCategory)}</span>
            </div>
          </div>
          <div className="automation-hierarchy-create-fields">
            <Field label="Name"><input autoFocus value={hierarchyName} onChange={(event) => setHierarchyName(event.target.value)} placeholder={hierarchyKind === "subflow" ? "Subflow name" : hierarchyKind === "folder" ? "Folder name" : "Flow name"} /></Field>
            {hierarchyKind === "flow" ? <Field label="Flow preset"><select value={hierarchyFlowOrigin} onChange={(event) => setHierarchyFlowOrigin(event.target.value as AutomationFlowPreset)}><option value="blank">Blank visual Flow</option><option value="deterministic">Deterministic workflow</option><option value="recorded">Recorded automation</option><option value="integration">Integration Flow</option><option value="scheduled">Scheduled Flow</option><option value="api-endpoint">API endpoint</option><option value="reusable">Reusable component</option></select></Field> : null}
            <Field label="Location"><select value={hierarchyParentId ?? ""} onChange={(event) => setHierarchyParentId(event.target.value || null)}>{hierarchySubflowParent ? null : <option value="">{automationHierarchyCategoryLabel(hierarchyCategory)}</option>}{hierarchyFolderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}</select></Field>
            <Field label="Security PIN"><input inputMode="numeric" type="password" value={hierarchyPin} onChange={(event) => setHierarchyPin(digits(event.target.value))} placeholder="Enter PIN" /></Field>
          </div>
          <StatusText value={hierarchyStatus} />
          <div className="modal-actions">
            <button className="button" onClick={() => setHierarchyCreateStep("type")} type="button">Back</button>
            <button className="button" onClick={() => setHierarchyAction(null)} type="button">Cancel</button>
            <button className="button button-primary" disabled={hierarchyPin.length < 4 || !hierarchyName.trim()} onClick={confirmHierarchyAction} type="button">Create</button>
          </div>
        </div> : <>
          {hierarchyAction.node ? <VisualAlert tone="warning" title={"Delete " + hierarchyAction.node.label + "?"} message="This removes the selected item and its contained hierarchy items." /> : null}
          <Field label="Security PIN"><input autoFocus inputMode="numeric" type="password" value={hierarchyPin} onChange={(event) => setHierarchyPin(digits(event.target.value))} /></Field>
          <StatusText value={hierarchyStatus} />
          <div className="modal-actions">
            <button className="button" onClick={() => setHierarchyAction(null)} type="button">Cancel</button>
            <button className="button danger" disabled={hierarchyPin.length < 4} onClick={confirmHierarchyAction} type="button">Delete</button>
          </div>
        </>}
      </Modal> : null}      {projectModal ? <AutomationProjectModalView busy={projectActionBusy} categoryName={categoryName} categoryTarget={categoryTarget} currentUser={currentUser} description={projectDescription} mode={projectModal} name={projectName} pin={projectPin} projectTarget={projectTarget} status={projectStatus} onCategoryNameChange={setCategoryName} onClose={() => { if (!projectActionBusy) setProjectModal(null); }} onCreate={() => void createProject()} onCreateCategory={() => void createCategory()} onDelete={() => void deleteProject()} onDeleteCategory={() => void deleteCategory()} onDescriptionChange={setProjectDescription} onMove={() => void moveProject()} onMoveCategory={() => void moveCategory()} onNameChange={setProjectName} onPinChange={(value) => setProjectPin(digits(value))} onRename={() => void renameProject()} onRenameCategory={() => void renameCategory()} /> : null}
      {preferencesOpen ? <Modal closeOnEscape description="Layout, region sizing, motion, and operational density." onClose={() => setPreferencesOpen(false)} title="Workspace Preferences"><AutomationWorkspacePreferences prefs={workspacePrefs} saveStatus={workspaceSaveStatus} setPrefs={updateWorkspacePrefs} /><div className="modal-actions"><button className="button button-primary" onClick={() => setPreferencesOpen(false)} type="button">Done</button></div></Modal> : null}      {windowAdderOpen ? <AutomationWindowAdderPalette area={windowAdderOpen.area} anchor={windowAdderOpen.anchor} {...(windowAdderOpen.targetWindowId ? { targetWindowId: windowAdderOpen.targetWindowId } : {})} options={viewAdderOptions} onAdd={addWorkspaceWindow} onClose={() => setWindowAdderOpen(null)} /> : null}
      {layoutPickerOpen ? <AutomationLayoutPicker area={layoutPickerOpen.area} anchor={layoutPickerOpen.anchor} onArrange={arrangeWindows} /> : null}
      {dataInspectorOpen && process.env.NODE_ENV !== "production" ? <AutomationStudioDataInspector api={api} cacheStats={() => dataCache.stats()} onClose={() => setDataInspectorOpen(false)} /> : null}
    </section>
  );
}



function emptyPipelineArtifacts() {
  return {
    normalizationReviews: [],
    miningRuns: [],
    evidenceFacts: [],
    evidenceObservations: [],
    stateActionCorrelations: [],
    evidenceClaims: [],
    learnedTaskModels: [],
    policyProposals: [],
    recordingFlowProposals: [],
    replayResults: []
  };
}

function recordingSummariesToRecordingStubs(summaries: any[]): any[] {
  return summaries.map((summary) => ({
    recordingId: summary.recordingId,
    ...(summary.taskId ? { taskId: summary.taskId } : {}),
    startedAt: summary.startedAt ?? 0,
    ...(summary.endedAt !== undefined ? { endedAt: summary.endedAt } : {}),
    environment: {
      id: summary.domainId ?? "environment.unspecified",
      label: summary.domainId ?? "Local Studio",
      kind: "summary",
      domainId: summary.domainId ?? null
    },
    sources: [],
    actionChannels: [],
    initialState: { timestamp: summary.startedAt ?? 0, namespaces: {} },
    timeline: [],
    notes: [],
    metadata: {
      summaryOnly: true,
      ...(summary.name ? { name: summary.name } : {}),
      eventCount: summary.eventCount ?? 0,
      actionCount: summary.actionCount ?? 0,
      stateSnapshotCount: summary.stateSnapshotCount ?? 0,
      proposalCount: summary.proposalCount ?? 0
    }
  }));
}

function proposalSummariesToPolicyArtifacts(summaries: any[]): any[] {
  return summaries
    .filter((summary) => summary.kind === "policy" || summary.kind === "direct" || summary.kind === "llm_assisted")
    .map((summary) => ({
      proposalId: summary.proposalId,
      recordingId: summary.recordingId,
      status: summary.status === "approved" ? "approved" : "proposed",
      generatedAt: summary.generatedAt,
      metadata: {
        recordingId: summary.recordingId,
        summaryOnly: true,
        ...(summary.name ? { title: summary.name } : {}),
        ...(summary.mode ? { generationMode: summary.mode } : {})
      }
    }));
}

function proposalSummariesToRecordingFlowArtifacts(summaries: any[]): any[] {
  return summaries
    .filter((summary) => summary.kind === "recording_flow")
    .map((summary) => ({
      proposalId: summary.proposalId,
      recordingId: summary.recordingId,
      status: summary.status === "generated" ? "proposed" : summary.status,
      generatedAt: summary.generatedAt,
      updatedAt: summary.updatedAt ?? summary.generatedAt,
      candidates: [],
      metadata: {
        summaryOnly: true,
        ...(summary.name ? { title: summary.name } : {})
      }
    }));
}

export function automationStudioFlowNeedsDetail(flow: any | null, activeViewId: string, selectionKind: AutomationSelection["kind"] | undefined): boolean {
  return Boolean(flow?.flowId && flow?.metadata?.summaryOnly === true && (activeViewId === "policy-primary" || selectionKind === "flow"));
}

export function automationStudioGatewayActivitySnapshot(value: any): { sessions: any[]; auditLog: any[] } {
  const sessions = Array.isArray(value?.sessions)
    ? value.sessions.map((session: any) => ({
      id: String(session?.id ?? session?.sessionId ?? ""),
      activeRecordingId: typeof session?.activeRecordingId === "string" ? session.activeRecordingId : null
    }))
    : [];
  const auditLog = (Array.isArray(value?.auditLog) ? value.auditLog : [])
    .filter((entry: any) => entry?.type === "recording.project_required")
    .slice(-20)
    .map((entry: any) => ({
      id: String(entry?.id ?? ""),
      type: "recording.project_required",
      message: typeof entry?.message === "string" ? entry.message : undefined
    }));
  return { sessions, auditLog };
}

export function flowSummariesToCatalogEntries(summaries: any[]): any[] {
  return summaries.map((summary) => ({
    source: "canonical",
    readOnly: false,
    flow: {
      flowId: summary.flowId,
      projectId: summary.projectId,
      name: summary.name ?? summary.flowId,
      ...(summary.description ? { description: summary.description } : {}),
      scope: summary.scope ?? { kind: "global" },
      visibility: "private",
      origin: "manual",
      source: { mode: summary.sourceMode ?? "visual" },
      interface: { inputs: [], outputs: [] },
      errors: [],
      variables: [],
      nodes: [],
      edges: [],
      publication: summary.publicationStatus && summary.publicationStatus !== "draft" && summary.version
        ? { status: summary.publicationStatus, version: summary.version, publishedAt: 0, interface: { inputs: [], outputs: [] }, flowDigest: "" }
        : { status: summary.publicationStatus ?? "draft" },
      createdAt: summary.updatedAt ?? Date.now(),
      updatedAt: summary.updatedAt ?? Date.now(),
      metadata: {
        summaryOnly: true,
        ...(Array.isArray(summary.hierarchySubflows) ? { hierarchySubflows: summary.hierarchySubflows.map((subflow: any) => ({ subflowId: subflow.subflowId, ...(subflow.name ? { name: subflow.name } : {}), ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}), ...(subflow.parentCategoryId ? { parentCategoryId: subflow.parentCategoryId, metadata: { subflowCategoryId: subflow.parentCategoryId } } : {}) })) } : {}),
        ...(Array.isArray(summary.subflowCategories) ? { subflowCategories: summary.subflowCategories.map((category: any) => ({ id: category.id, name: category.name, parentId: category.parentId ?? null })) } : {}),
        ...(summary.recordingProposalIds ? { recordingProposalIds: summary.recordingProposalIds } : {}),
        ...(summary.subflowGraph === true ? { subflowGraph: true } : {}),
        ...(typeof summary.parentFlowId === "string" ? { parentFlowId: summary.parentFlowId } : {}),
        ...(typeof summary.parentSubflowId === "string" ? { parentSubflowId: summary.parentSubflowId } : {})
      }
    }
  }));
}

function runtimeSummaryToSessionStub(summary: any): any {
  return {
    runId: summary.runId,
    targetKind: summary.targetKind,
    targetId: summary.targetId,
    status: summary.status,
    updatedAt: summary.updatedAt,
    metadata: { summaryOnly: true }
  };
}

function proposalArtifactKind(proposal: any): "policy" | "recording_flow" | "auto" {
  if (Array.isArray(proposal?.candidates)) return "recording_flow";
  if (proposal?.policy) return "policy";
  if (proposal?.metadata?.summaryOnly === true && proposal?.metadata?.generationMode) return "policy";
  return "auto";
}

function mergeRecordingSummaries(current: any[], incoming: any[]) {
  const loadedById = new Map(current
    .filter((recording) => recording?.recordingId && recording.metadata?.summaryOnly !== true)
    .map((recording) => [recording.recordingId, recording]));
  return incoming.map((recording) => {
    const loaded = loadedById.get(recording?.recordingId);
    return loaded && recording?.metadata?.summaryOnly === true
      ? { ...recording, ...loaded, metadata: { ...(recording.metadata ?? {}), ...(loaded.metadata ?? {}) } }
      : recording;
  });
}

function mergeFlowDetails(current: any[], incoming: any[]) {
  const incomingById = new Map(incoming
    .filter((entry) => entry?.flow?.flowId)
    .map((entry) => [entry.flow.flowId, entry]));
  const next = current.map((entry) => incomingById.get(entry?.flow?.flowId) ?? entry);
  for (const entry of incoming) {
    if (entry?.flow?.flowId && !next.some((item) => item?.flow?.flowId === entry.flow.flowId)) next.push(entry);
  }
  return next;
}

export function mergeCreatedFlowIntoProjectFlows(current: any[], flow: any): any[] {
  if (!flow?.flowId) return current;
  return mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow }]);
}

export function removeDeletedFlowsFromProjectFlows(current: any[], flowIds: readonly string[]): any[] {
  const deletedFlowIds = new Set(flowIds.filter(Boolean));
  if (!deletedFlowIds.size) return current;
  return current.filter((entry) => !deletedFlowIds.has(entry?.flow?.flowId));
}

export function upsertSubflowSummaryIntoProjectFlows(current: any[], parentFlowId: string, subflow: any): any[] {
  if (!parentFlowId || !subflow?.subflowId) return current;
  return current.map((entry) => {
    if (entry?.flow?.flowId !== parentFlowId) return entry;
    const flow = entry.flow;
    const metadata = flow.metadata && typeof flow.metadata === "object" ? flow.metadata : {};
    const existing = Array.isArray(metadata.hierarchySubflows) ? metadata.hierarchySubflows : Array.isArray(flow.expansion?.subflowIds) ? flow.expansion.subflowIds : [];
    const parentCategoryId = subflow.parentCategoryId ?? subflow.metadata?.parentCategoryId ?? subflow.metadata?.subflowCategoryId ?? subflow.metadata?.categoryId;
    const summary = {
      subflowId: subflow.subflowId,
      ...(subflow.name ? { name: subflow.name } : {}),
      ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}),
      ...(typeof parentCategoryId === "string" && parentCategoryId ? { parentCategoryId, metadata: { subflowCategoryId: parentCategoryId } } : {})
    };
    const nextHierarchySubflows = upsertById([...existing.filter((item: any) => subflowSummaryId(item) !== subflow.subflowId), summary], "subflowId");
    return { ...entry, flow: { ...flow, metadata: { ...metadata, hierarchySubflows: nextHierarchySubflows } } };
  });
}

export function removeSubflowSummaryFromProjectFlows(current: any[], parentFlowId: string, subflowIds: readonly string[]): any[] {
  const deleted = new Set(subflowIds.filter(Boolean));
  if (!parentFlowId || !deleted.size) return current;
  return current.map((entry) => {
    if (entry?.flow?.flowId !== parentFlowId) return entry;
    const flow = entry.flow;
    const metadata = flow.metadata && typeof flow.metadata === "object" ? flow.metadata : {};
    const existing = Array.isArray(metadata.hierarchySubflows) ? metadata.hierarchySubflows : Array.isArray(flow.expansion?.subflowIds) ? flow.expansion.subflowIds : [];
    return { ...entry, flow: { ...flow, metadata: { ...metadata, hierarchySubflows: existing.filter((item: any) => !deleted.has(subflowSummaryId(item))) } } };
  });
}

function subflowSummaryId(item: any): string {
  return typeof item === "string" ? item : String(item?.subflowId ?? item?.id ?? item?.sourceId ?? "");
}

export function removeFlowObjectReferencesFromProjectFlows(current: any[], flowId: string | null | undefined, kind: FlowObjectKind, objectIds: string | string[]): any[] {
  const flowIds = flowId
    ? [flowId]
    : current.map((entry) => String(entry?.flow?.flowId ?? "")).filter(Boolean);
  return flowIds.reduce((entries, targetFlowId) => applyFlowObjectReferenceDelete(entries, targetFlowId, kind, objectIds).next, current);
}

export type AutomationStudioLocalFeedReconciliation<TValue> = {
  next: TValue;
  reconciled: boolean;
  reason?: string;
};

export function reconcileProjectFlowsFromChangeFeed(current: any[], event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<any[]> {
  if (event.operation !== "delete") return { next: current, reconciled: false, reason: "Only delete feed events include enough information for local Flow reconciliation." };
  const kind = normalizedChangeEntityKind(event.entityKind);
  if (kind === "flow") return { next: removeDeletedFlowsFromProjectFlows(current, [event.entityId]), reconciled: true };
  if (kind === "subflow") return { next: removeSubflowSummaryFromProjectFlowsForFeed(current, event), reconciled: true };
  if (kind === "recording") return { next: removeFlowObjectReferencesFromProjectFlows(current, null, "recording", event.entityId), reconciled: true };
  if (kind === "instruction") return { next: removeFlowObjectReferencesFromProjectFlows(current, event.parentId, "instruction", event.entityId), reconciled: true };
  if (kind === "adaptation") return { next: removeFlowObjectReferencesFromProjectFlows(current, event.parentId, "adaptation", event.entityId), reconciled: true };
  return { next: current, reconciled: false, reason: `${event.entityKind}:delete has no local Flow reconciliation handler.` };
}

export function reconcileCustomHierarchyNodesFromChangeFeed(current: AutomationHierarchyNode[], event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<AutomationHierarchyNode[]> {
  if (event.operation !== "delete") return { next: current, reconciled: false };
  const kind = normalizedChangeEntityKind(event.entityKind);
  if (kind !== "folder" && kind !== "hierarchy") return { next: current, reconciled: false };
  if (!current.some((node) => node.id === event.entityId || node.sourceId === event.entityId)) return { next: current, reconciled: true };
  const directNode = current.find((node) => node.sourceId === event.entityId) ?? current.find((node) => node.id === event.entityId);
  return { next: directNode ? applyCustomFolderDelete(current, directNode.id).next : current, reconciled: true };
}

export function reconcileRecordingsFromChangeFeed(current: any[], event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<any[]> {
  if (event.operation !== "delete" || normalizedChangeEntityKind(event.entityKind) !== "recording") return { next: current, reconciled: false };
  return { next: deleteRecordingCollectionItems(current, event.entityId).next, reconciled: true };
}

export function reconcileRuntimeSessionsFromChangeFeed(current: any[], event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<any[]> {
  if (event.operation !== "delete" || normalizedChangeEntityKind(event.entityKind) !== "runtime") return { next: current, reconciled: false };
  return { next: current.filter((session) => String(session?.runId ?? session?.id ?? "") !== event.entityId), reconciled: true };
}

export function reconcilePipelineArtifactsFromChangeFeed(current: any, event: AutomationStudioProjectChangeEvent): AutomationStudioLocalFeedReconciliation<any> {
  const kind = normalizedChangeEntityKind(event.entityKind);
  if (event.operation !== "delete" || (kind !== "adaptation" && kind !== "proposal")) return { next: current, reconciled: false };
  const deleted = new Set([event.entityId]);
  return { next: removeDeletedRecordingArtifacts(current, new Set(), deleted), reconciled: true };
}

function removeSubflowSummaryFromProjectFlowsForFeed(current: any[], event: AutomationStudioProjectChangeEvent): any[] {
  const parentFlowId = event.parentId ?? event.hierarchyScope?.id ?? null;
  if (parentFlowId) return removeSubflowSummaryFromProjectFlows(current, parentFlowId, [event.entityId]);
  return current.map((entry) => {
    const flowId = String(entry?.flow?.flowId ?? "");
    return flowId ? removeSubflowSummaryFromProjectFlows([entry], flowId, [event.entityId])[0] ?? entry : entry;
  });
}

function normalizedChangeEntityKind(entityKind: string): "flow" | "subflow" | "folder" | "recording" | "instruction" | "adaptation" | "proposal" | "runtime" | "hierarchy" | "other" {
  const kind = entityKind.toLowerCase();
  if (kind.includes("subflow")) return "subflow";
  if (kind.includes("folder") || kind.includes("category")) return "folder";
  if (kind.includes("recording") || kind.includes("timeline")) return "recording";
  if (kind.includes("instruction")) return "instruction";
  if (kind.includes("adaptation")) return "adaptation";
  if (kind.includes("proposal")) return "proposal";
  if (kind.includes("runtime") || kind.includes("run") || kind.includes("action")) return "runtime";
  if (kind.includes("hierarchy")) return "hierarchy";
  if (kind.includes("flow") || kind.includes("graph")) return "flow";
  return "other";
}

export function flowDocumentWithoutFlowObjectReferences(flow: any, kind: FlowObjectKind, objectIds: string | string[]): any {
  if (!flow?.flowId) return flow;
  const [entry] = applyFlowObjectReferenceDelete([{ source: "canonical", readOnly: false, flow }], flow.flowId, kind, objectIds).next;
  return entry?.flow ?? flow;
}

export function flowDocumentWithoutSubflowCategory(flow: any, categoryId: string): any {
  if (!flow?.flowId) return flow;
  const [entry] = applySubflowCategoryDelete([{ source: "canonical", readOnly: false, flow }], flow.flowId, categoryId).next;
  return entry?.flow ?? flow;
}

function automationFlowPreset(flow: any, preset: AutomationFlowPreset) {
  const start = { id: "start", definitionId: "builtin.control.start", position: { x: 80, y: 140 } };
  const end = { id: "end", definitionId: "builtin.control.end", position: { x: 500, y: 140 } };
  const base = { ...flow, origin: preset === "recorded" ? "recorded" : "manual", metadata: { ...(flow.metadata ?? {}), preset } };
  if (preset === "blank") return base;
  if (preset === "recorded") return base;
  if (preset === "scheduled") return { ...base, nodes: [start, { id: "wait", definitionId: "builtin.timing.wait", position: { x: 290, y: 140 } }, end], edges: [{ id: "start.wait", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "wait", targetPortId: "in" }, { id: "wait.end", sourceNodeId: "wait", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }], metadata: { ...base.metadata, trigger: "schedule" } };
  if (preset === "api-endpoint") return { ...base, nodes: [start, end], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }], interface: { inputs: [{ id: "request", name: "Request", valueType: { kind: "json" } }], outputs: [{ id: "response", name: "Response", valueType: { kind: "json" } }] }, metadata: { ...base.metadata, trigger: "api" } };
  if (preset === "reusable") return { ...base, nodes: [start, end], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }], publication: { status: "publishable" } };
  return { ...base, nodes: [start, end], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }], metadata: { ...base.metadata, ...(preset === "integration" ? { integration: true } : {}) } };
}

function upsertById<TItem extends Record<string, any>>(items: TItem[], idKey: keyof TItem): TItem[] {
  const seen = new Set<string>();
  const merged: TItem[] = [];
  for (const item of items) {
    const id = String(item[idKey] ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}



function isAutomationSelection(value: unknown): value is AutomationSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selection = value as { kind?: unknown; id?: unknown };
  return typeof selection.kind === "string" && typeof selection.id === "string";
}

function parsePaneTabDragPayload(value: string): { paneId: string; viewId: string } | null {
  try {
    const parsed = JSON.parse(value) as { paneId?: unknown; viewId?: unknown };
    return typeof parsed.paneId === "string" && typeof parsed.viewId === "string"
      ? { paneId: parsed.paneId, viewId: parsed.viewId }
      : null;
  } catch {
    return null;
  }
}

function stateSelectionId(parts: { nodeId?: string; flowId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string }): string {
  if (parts.proposalId && parts.nodeId) return `state:${parts.proposalId}:${parts.nodeId}`;
  if (parts.flowId && parts.nodeId) return `state:${parts.flowId}:${parts.nodeId}`;
  if (parts.stateSnapshotId) return `state:snapshot:${parts.stateSnapshotId}`;
  if (parts.timelineEntryId) return `state:timeline:${parts.timelineEntryId}`;
  return `state:${parts.nodeId ?? "workspace"}`;
}

function compactStateSelectionId(value: { nodeId?: string | undefined; flowId?: string | undefined; proposalId?: string | undefined; timelineEntryId?: string | undefined; stateSnapshotId?: string | undefined }): { nodeId?: string; flowId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string } {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { nodeId?: string; flowId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string };
}

function compactStateSelection(value: { kind: "state"; id: string; nodeId?: string | undefined; sourceId?: string | undefined; phase?: NodeStatePhase | undefined; evidenceId?: string | undefined; factPath?: string | undefined; recordingId?: string | undefined; proposalId?: string | undefined; timelineEntryId?: string | undefined; stateSnapshotId?: string | undefined; stateRef?: string | undefined }): AutomationSelection {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as AutomationSelection;
}

function recordingIdFromStateSourceId(sourceId: string | undefined): string | undefined {
  const match = /^observed:([^:]+):/.exec(sourceId ?? "");
  return match?.[1];
}

function automationViewBodyClassName(view: AutomationViewInstance): string | undefined {
  if (view.type === "design") return "graph-body";
  if (view.type === "recordings") return "timeline-body";
  return undefined;
}
export function replaceAutomationStudioBrowserUrl(pathname: string, params: URLSearchParams): void {
  if (typeof window === "undefined") return;
  const query = params.toString();
  const hash = window.location.hash ?? "";
  const nextUrl = (query ? pathname + "?" + query : pathname) + hash;
  const currentUrl = window.location.pathname + window.location.search + hash;
  if (currentUrl === nextUrl) return;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function automationStudioCurrentSearchParams(searchParams?: { toString(): string }): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? searchParams?.toString() ?? "" : window.location.search);
}
function stateOpenNodeMetadata(nodeId: string | undefined, selectedNode: any): Record<string, unknown> | null {
  if (!selectedNode || typeof selectedNode !== "object" || Array.isArray(selectedNode)) return null;
  if (nodeId && typeof selectedNode.id === "string" && selectedNode.id !== nodeId) return null;
  const metadata = selectedNode.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : null;
}

export function persistentAutomationWorkspacePrefs(prefs: AutomationWorkspacePrefs): AutomationWorkspacePrefs {
  return normalizeAutomationWorkspacePrefs({
    ...prefs,
    panes: prefs.panes,
    rightSidebar: prefs.rightSidebar,
    viewStates: persistentAutomationViewStates(prefs.viewStates)
  });
}

function automationWorkspacePrefsSameRuntimeState(left: AutomationWorkspacePrefs, right: AutomationWorkspacePrefs): boolean {
  return left.activePaneId === right.activePaneId
    && left.activeViewId === right.activeViewId
    && left.maximizedWindowId === right.maximizedWindowId
    && left.sidebarWidth === right.sidebarWidth
    && left.leftSidebarCollapsed === right.leftSidebarCollapsed
    && left.inspectorWidth === right.inspectorWidth
    && left.bottomTimelineHeight === right.bottomTimelineHeight
    && left.bottomTimelineCollapsed === right.bottomTimelineCollapsed
    && left.mainLayoutPreset === right.mainLayoutPreset
    && left.rightSidebarCollapsed === right.rightSidebarCollapsed
    && left.density === right.density
    && left.motion === right.motion
    && automationWorkspacePaneListKey(left.panes) === automationWorkspacePaneListKey(right.panes)
    && automationWorkspaceRightSidebarKey(left.rightSidebar) === automationWorkspaceRightSidebarKey(right.rightSidebar)
    && automationWorkspaceBottomDockKey(left.bottomDock) === automationWorkspaceBottomDockKey(right.bottomDock)
    && JSON.stringify(left.mainSplitRatios) === JSON.stringify(right.mainSplitRatios)
    && automationWorkspaceViewStatesSameRuntimeState(left.viewStates, right.viewStates);
}

function automationWorkspaceViewStatesSameRuntimeState(left: AutomationWorkspacePrefs["viewStates"], right: AutomationWorkspacePrefs["viewStates"]): boolean {
  if (left === right) return true;
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) return false;
  const rightById = new Map(rightEntries);
  for (const [viewId, leftState] of leftEntries) {
    if (!automationWorkspaceViewStateSameRuntimeState(leftState, rightById.get(viewId))) return false;
  }
  return true;
}

function automationWorkspaceViewStateSameRuntimeState(left: Record<string, unknown> | undefined, right: Record<string, unknown> | undefined): boolean {
  if (left === right) return true;
  const leftKeys = Object.keys(left ?? {}).filter((key) => key !== "selection").sort();
  const rightKeys = Object.keys(right ?? {}).filter((key) => key !== "selection").sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index]!;
    if (key !== rightKeys[index]) return false;
    if (left?.[key] !== right?.[key]) return false;
  }
  return true;
}
function automationWorkspacePaneListKey(panes: AutomationWorkspacePrefs["panes"]): string {
  return panes.map((pane) => `${pane.id}:${pane.activeViewId}:${pane.tabs.join(",")}`).join("|");
}

function automationWorkspaceRightSidebarKey(rightSidebar: AutomationWorkspacePrefs["rightSidebar"]): string {
  return `${rightSidebar.activeViewId}:${rightSidebar.collapsed === true}:${rightSidebar.tabs.join(",")}`;
}

function automationWorkspaceBottomDockKey(bottomDock: AutomationWorkspacePrefs["bottomDock"]): string {
  return `${bottomDock.activeViewId}:${bottomDock.expanded === true}`;
}

function persistentAutomationViewStates(viewStates: AutomationWorkspacePrefs["viewStates"]): AutomationWorkspacePrefs["viewStates"] {
  return Object.fromEntries(Object.entries(viewStates ?? {}).map(([viewId, state]) => {
    const { selection: _selection, ...durableState } = state;
    return [viewId, durableState];
  }));
}

function stringRecordValue(record: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function selectedNodeActionPreviewEntryId(recordingOrTimeline: any, selectedNode: any): string | null {
  const metadata = selectedNode && typeof selectedNode === "object" && !Array.isArray(selectedNode) && selectedNode.metadata && typeof selectedNode.metadata === "object" && !Array.isArray(selectedNode.metadata)
    ? selectedNode.metadata as Record<string, unknown>
    : null;
  const directEntryId = stringRecordValue(metadata, "actionEntryId") ?? stringRecordValue(metadata, "timelineEntryId");
  const directPreviewId = resolveActionPreviewEntryId(recordingOrTimeline, directEntryId);
  if (directPreviewId) return directPreviewId;

  const stateSnapshotId = stringRecordValue(metadata, "stateSnapshotId") ?? stringRecordValue(metadata, "stateAtActionId");
  if (!stateSnapshotId) return null;
  const entries = Array.isArray(recordingOrTimeline?.timeline) ? recordingOrTimeline.timeline.filter((entry: any) => entry && typeof entry === "object") : [];
  const stateEntry = entries.find((entry: any) => timelineEntryStateSnapshotId(entry) === stateSnapshotId);
  return resolveActionPreviewEntryId(recordingOrTimeline, stateEntry?.id);
}

export function resolveObservedStateEntryId(recording: any, timelineEntryId: string): string | null {
  const entries = Array.isArray(recording?.timeline) ? recording.timeline.filter((entry: any) => entry && typeof entry === "object") : [];
  if (!entries.length) return null;
  const requested = entries.find((entry: any) => entry.id === timelineEntryId);
  if (isStateSnapshotTimelineEntry(requested)) return String(requested.id);
  const targetTiming = timelineEntryComparableTimestamp(requested);
  if (targetTiming === null) return null;
  const candidates = entries
    .filter(isStateSnapshotTimelineEntry)
    .map((entry: any) => ({ entry, delta: targetTiming - (timelineEntryComparableTimestamp(entry) ?? Number.POSITIVE_INFINITY) }))
    .filter((item: { entry: any; delta: number }) => Number.isFinite(item.delta))
    .sort((left: { entry: any; delta: number }, right: { entry: any; delta: number }) => {
      const distance = Math.abs(left.delta) - Math.abs(right.delta);
      if (distance !== 0) return distance;
      const leftBefore = left.delta >= 0;
      const rightBefore = right.delta >= 0;
      if (leftBefore !== rightBefore) return leftBefore ? -1 : 1;
      return 0;
    });
  return candidates[0]?.entry?.id ? String(candidates[0].entry.id) : null;
}

export function resolveActionPreviewEntryId(recordingOrTimeline: any, timelineEntryId: string | null | undefined): string | null {
  if (!timelineEntryId) return null;
  const entries = Array.isArray(recordingOrTimeline?.timeline) ? recordingOrTimeline.timeline.filter((entry: any) => entry && typeof entry === "object") : [];
  if (!entries.length) return timelineEntryId;
  const requested = entries.find((entry: any) => entry.id === timelineEntryId);
  if (isActionTimelineEntry(requested)) return String(requested.id);
  const metadata = requested?.payload && typeof requested.payload === "object" ? requested.payload.metadata : null;
  const metadataActionEntryId = metadata && typeof metadata === "object" && typeof metadata.actionEntryId === "string" ? metadata.actionEntryId : undefined;
  if (metadataActionEntryId && entries.some((entry: any) => entry.id === metadataActionEntryId && isActionTimelineEntry(entry))) return metadataActionEntryId;
  const targetTiming = timelineEntryComparableTimestamp(requested);
  if (targetTiming === null) return null;
  const candidates = entries
    .filter(isActionTimelineEntry)
    .map((entry: any) => ({ entry, delta: targetTiming - (timelineEntryComparableTimestamp(entry) ?? Number.POSITIVE_INFINITY) }))
    .filter((item: { entry: any; delta: number }) => Number.isFinite(item.delta))
    .sort((left: { entry: any; delta: number }, right: { entry: any; delta: number }) => {
      const distance = Math.abs(left.delta) - Math.abs(right.delta);
      if (distance !== 0) return distance;
      const leftBefore = left.delta >= 0;
      const rightBefore = right.delta >= 0;
      if (leftBefore !== rightBefore) return leftBefore ? -1 : 1;
      return 0;
    });
  return candidates[0]?.entry?.id ? String(candidates[0].entry.id) : null;
}

function isActionTimelineEntry(entry: any): boolean {
  return Boolean(entry && typeof entry === "object" && (entry.type === "action" || entry.type === "domain_event"));
}

function isStateSnapshotTimelineEntry(entry: any): boolean {
  return Boolean(entry && typeof entry === "object" && (
    entry.type === "state_checkpoint"
    || (entry.type === "observation" && entry.observationType === "client.state_snapshot")
  ));
}

function timelineEntryStateSnapshotId(entry: any): string | null {
  if (!entry || typeof entry !== "object") return null;
  const payload = entry.payload && typeof entry.payload === "object" ? entry.payload as Record<string, unknown> : null;
  const payloadMetadata = payload?.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata as Record<string, unknown> : null;
  const entryMetadata = entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata) ? entry.metadata as Record<string, unknown> : null;
  return firstNonEmptyString([
    entry.stateSnapshotId,
    payload?.stateSnapshotId,
    payload?.snapshotId,
    stringRecordValue(payloadMetadata, "stateSnapshotId"),
    stringRecordValue(payloadMetadata, "snapshotId"),
    stringRecordValue(entryMetadata, "stateSnapshotId"),
    stringRecordValue(entryMetadata, "stateAtActionId")
  ]);
}

function timelineEntryComparableTimestamp(entry: any): number | null {
  if (!entry || typeof entry !== "object") return null;
  const metadata = entry.payload && typeof entry.payload === "object" ? entry.payload.metadata : null;
  for (const value of [
    metadata && typeof metadata === "object" ? metadata.eventTimestampMs : undefined,
    metadata && typeof metadata === "object" ? metadata.stateTimestampMs : undefined,
    entry.startedAt,
    entry.completedAt,
    entry.timestamp,
    entry.monotonicOffsetMs
  ]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function latestProposalForRecordingId(recordingId: string | null | undefined, proposals: any[], recordingFlowProposals: any[]): any | undefined {
  if (!recordingId) return undefined;
  return latestByGeneratedAt<any>([
    ...proposals.filter((item: any) => item.recordingId === recordingId || item.metadata?.recordingId === recordingId),
    ...recordingFlowProposals.filter((item: any) => item.recordingId === recordingId || item.metadata?.recordingId === recordingId)
  ]);
}

function latestByGeneratedAt<TItem extends { generatedAt?: number }>(items: TItem[]): TItem | undefined {
  return [...items].sort((left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0))[0];
}

function yesNo(value: unknown): string {
  return value ? "Yes" : "No";
}

function formatTime(value: unknown): string {
  return typeof value === "number" && value > 0 ? new Date(value).toLocaleString() : "-";
}

function isSensitiveDatabaseStore(kind: string): boolean {
  return kind.trim().toLowerCase() === "identity.users";
}

function sensitiveStoreKey(kind: string, database: string): string {
  return `${database}:${kind.trim().toLowerCase()}`;
}


function formatDuration(value: unknown): string {
  if (typeof value !== "number" || value <= 0) return "-";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.round(hours / 24)} days`;
}

function formatCountdown(task: any, nowMs: number, schedulerRunning = true): string {
  if (!task?.enabled) return "Stopped";
  if (!schedulerRunning) return "Paused";
  if (!task.nextRunAtMs) return "Manual";
  const remainingSeconds = Math.max(0, Math.ceil((Number(task.nextRunAtMs) - nowMs) / 1000));
  if (remainingSeconds <= 0) return "Due now";
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function scheduleProgress(task: any, nowMs = Date.now()): string {
  if (!task?.intervalMs || !task.nextRunAtMs) return "0%";
  const remaining = Math.max(0, Number(task.nextRunAtMs) - nowMs);
  const elapsedRatio = 1 - remaining / Number(task.intervalMs);
  return `${Math.max(4, Math.min(100, elapsedRatio * 100))}%`;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function copyText(value: string): void {
  if (!value) return;
  void navigator.clipboard?.writeText(value);
}

function emptyCredentialEdit(kind: "password" | "pin") {
  return {
    kind,
    value: "",
    confirm: "",
    authorizationPassword: "",
    authorizationPin: "",
    authorizationTotp: ""
  };
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}





