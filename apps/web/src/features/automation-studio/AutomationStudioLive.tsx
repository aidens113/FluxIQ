"use client";

import { AlertTriangle, Blocks, Bug, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, FileSearch, FolderOpen, FolderPlus, GitBranch, GripVertical, History, ListChecks, Network, Plus, Radio, Search, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import type { NodeStatePhase } from "fluxiq/automation-studio";
import {
  automationHierarchyCategories,
  automationHierarchyCategoryLabel,
  automationHierarchyNodeIsGeneratedFlowStructure,
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
import { AutomationProjectModalView, moveCategoryId, projectGridSections } from "./hierarchy/ProjectModal";
import { AutomationProjectTree } from "./hierarchy/ProjectTree";
import type {
  AutomationDockTab,
  AutomationSelection,
  AutomationViewInstance,
  RecordingProcessingStatus
} from "./types";
import {
  automationLayoutPresetOptions,
  automationBottomDockMaxHeight,
  automationBottomDockMinHeight,
  defaultAutomationMainSplitRatios,
  automationPixelsToRelativeGeometry,
  automationRangesOverlap,
  automationSnapGeometry,
  automationWindowFillsCanvas,
  automationWindowGeometrySignature,
  automationWorkspaceRegionForView,
  automationMainPaneCount,
  automationWindowToPixels,
  clampAutomationWindowPixelGeometry,
  clampNumber,
  closeAutomationWorkspacePaneTab,
  constrainAutomationResizeDelta,
  defaultAutomationWorkspacePrefs,
  findAutomationSharedResizePartners,
  fullAutomationWindowGeometry,
  layoutAutomationWindowsInPreset,
  moveAutomationWorkspacePaneTab,
  nextAutomationZIndex,
  normalizeAutomationWorkspacePrefs,
  placeAutomationWindow,
  restoreAutomationWindowFromFullscreen,
  type AutomationLayoutPickerState,
  type AutomationLayoutPreset,
  type AutomationWindowAdderState,
  type AutomationWindowPixelGeometry,
  type AutomationWindowResizeEdge,
  type AutomationWorkspaceArea,
  type AutomationWorkspacePrefs,
  type AutomationWorkspaceWindow
} from "./workspace/layout";
import {
  AutomationLayoutPicker,
  AutomationViewContainer,
  AutomationWindowAdderPalette,
  AutomationWorkspacePreferences,
  automationAreaLabel,
  automationWindowDescription,
  automationWindowAdderPanelStyle,
  automationFloatingPanelStyle,
  automationLayoutOptionsForArea,
  viewTitle
} from "./workspace/components";
import { AutomationTimelineDock, AutomationViewRenderer } from "./views";
import { removeDeletedRecordingArtifacts, removeDeletedRecordingSnapshotData, selectionReferencesDeletedRecording } from "./model/deletion";
import { flowToTaskPolicy, graphToTaskFlow, isPersistableHierarchyNode, mergeById } from "./model/project-artifacts";
import { useProgramApi, type JsonObject } from "../programs/program-api";
import type { CurrentUser } from "../programs/types";
import {
  Field,
  KeyValue,
  Modal,
  notifyGlobalAlert,
  StatusText,
  VisualAlert
} from "../programs/shared-ui";

type TabButton<T extends string> = { id: T; label: string; count?: number };
type AutomationFlowPreset = "blank" | "deterministic" | "recorded" | "integration" | "scheduled" | "api-endpoint" | "reusable";
type DeletedHierarchyRefs = { taskIds: Set<string>; routineIds: Set<string>; configIds: Set<string>; flowIds: Set<string>; recordingIds: Set<string>; proposalIds: Set<string>; timelineEntryIds: Set<string> };
type AutomationFlowRunState = {
  phase: "idle" | "starting" | "succeeded" | "failed";
  message: string;
  runId?: string;
  flowId?: string;
  status?: string;
  startedAt?: number;
  finishedAt?: number;
};
type AutomationStudioApiRequest = { endpoint: string; payload: JsonObject };

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

export function automationStudioProjectOpenRequests(projectId: string): [AutomationStudioApiRequest] {
  return [{ endpoint: "get-project-hierarchy", payload: { projectId } }];
}

export function automationStudioRuntimeSummaryRequests(projectId: string): [
  AutomationStudioApiRequest,
  AutomationStudioApiRequest,
  AutomationStudioApiRequest,
  AutomationStudioApiRequest
] {
  return [
    { endpoint: "get-project-workspace-summary", payload: { projectId } },
    { endpoint: "list-recordings", payload: { projectId, summaries: true } },
    { endpoint: "list-runtime-sessions", payload: { projectId, summaries: true, limit: 25, offset: 0 } },
    { endpoint: "list-recording-domains", payload: { projectId } }
  ];
}

function shortAutomationId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function emitAutomationStudioCommandStatus(detail: { state: string; detail: string; running?: boolean; dirty?: boolean }) {
  window.dispatchEvent(new CustomEvent("automation-studio:command-status", { detail }));
}

export function AutomationStudioLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("automation-studio");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [projectRecordings, setProjectRecordings] = useState<any[]>([]);
  const [projectTimelines, setProjectTimelines] = useState<any[]>([]);
  const [projectArtifacts, setProjectArtifacts] = useState<any>({ tasks: [], routines: [], configs: [], flows: [] });
  const [projectFlows, setProjectFlows] = useState<any[]>([]);
  const [nativeNodeDefinitions, setNativeNodeDefinitions] = useState<any[]>([]);
  const [publishedFlowDefinitions, setPublishedFlowDefinitions] = useState<any[]>([]);
  const [flowPublications, setFlowPublications] = useState<any[]>([]);
  const [flowDependencyInfo, setFlowDependencyInfo] = useState<any>({ dependencies: [], usedBy: [], availableUpgrades: [] });
  const [runtimeSessions, setRuntimeSessions] = useState<any[]>([]);
  const [indexedStateSources, setIndexedStateSources] = useState<Record<string, { source: any; snapshot: any; raw?: any }>>({});
  const [pipelineArtifacts, setPipelineArtifacts] = useState<any>({ normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [], stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
  const [recordingDomains, setRecordingDomains] = useState<any[]>([]);
  const [automationActionStatus, setAutomationActionStatus] = useState("");
  const [flowRunState, setFlowRunState] = useState<AutomationFlowRunState>({ phase: "idle", message: "Ready." });
  const [projects, setProjects] = useState<AutomationStudioProject[]>([]);
  const [projectCategories, setProjectCategories] = useState<AutomationStudioProjectCategory[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [hasDirtyTaskGraph, setHasDirtyTaskGraph] = useState(false);
  const [taskGraphDrafts, setTaskGraphDrafts] = useState<Record<string, { nodes: any[]; edges: any[] }>>({});
  const [projectModal, setProjectModal] = useState<AutomationProjectModal>(null);
  const [projectTarget, setProjectTarget] = useState<AutomationStudioProject | null>(null);
  const [categoryTarget, setCategoryTarget] = useState<AutomationStudioProjectCategory | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [projectPin, setProjectPin] = useState("");
  const [projectStatus, setProjectStatus] = useState("");
  const [pendingProjectMove, setPendingProjectMove] = useState<{ projectId: string; categoryId: string | null } | null>(null);
  const [pendingCategoryMove, setPendingCategoryMove] = useState<{ categoryId: string; targetCategoryId: string } | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [loadedProjectHierarchyId, setLoadedProjectHierarchyId] = useState<string | null>(null);
  const [workspacePrefs, setWorkspacePrefs] = useState<AutomationWorkspacePrefs>(() => defaultAutomationWorkspacePrefs());
  const [dockTab, setDockTab] = useState<AutomationDockTab>("assistant");
  const [liveWindowGeometries, setLiveWindowGeometries] = useState<Record<string, AutomationWindowPixelGeometry>>({});
  const [liveInspectorWidth, setLiveInspectorWidth] = useState<number | null>(null);
  const [liveBottomTimelineHeight, setLiveBottomTimelineHeight] = useState<number | null>(null);
  const [liveMainSplitRatios, setLiveMainSplitRatios] = useState<number[] | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [windowAdderOpen, setWindowAdderOpen] = useState<AutomationWindowAdderState | null>(null);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState<AutomationLayoutPickerState | null>(null);
  const [snapPreview, setSnapPreview] = useState<(NonNullable<ReturnType<typeof automationSnapGeometry>> & { area: AutomationWorkspaceArea }) | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pageFullscreenWindowId, setPageFullscreenWindowId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | AutomationHierarchyKind>("all");
  const [selection, setSelection] = useState<AutomationSelection | null>(null);
  const [pendingStateOpen, setPendingStateOpen] = useState<{ key: string; recordingId?: string; timelineEntryId?: string; stateSnapshotId?: string; phase: NodeStatePhase } | null>(null);
  const [bottomPreviewEntryId, setBottomPreviewEntryId] = useState<string | null>(null);
  const [recordingTreePrimaryKind, setRecordingTreePrimaryKind] = useState<"recording" | "proposal" | null>(null);
  const [recordingProcessing, setRecordingProcessing] = useState<RecordingProcessingStatus | null>(null);
  const [gatewaySnapshot, setGatewaySnapshot] = useState<any>({ enabled: false, sessions: [], pairings: [], auditLog: [] });
  const [hierarchyAction, setHierarchyAction] = useState<AutomationHierarchyAction>(null);
  const [hierarchyCreateStep, setHierarchyCreateStep] = useState<"type" | "details">("type");
  const [hierarchyPin, setHierarchyPin] = useState("");
  const [hierarchyName, setHierarchyName] = useState("");
  const [hierarchyFlowOrigin, setHierarchyFlowOrigin] = useState<AutomationFlowPreset>("blank");
  const [hierarchyKind, setHierarchyKind] = useState<AutomationCreatableHierarchyKind>("flow");
  const [hierarchyCategory, setHierarchyCategory] = useState<AutomationHierarchyCategory>("flow");
  const [hierarchyParentId, setHierarchyParentId] = useState<string | null>(null);
  const [hierarchyStatus, setHierarchyStatus] = useState("");
  const [customHierarchyNodes, setCustomHierarchyNodes] = useState<AutomationHierarchyNode[]>([]);
  const [deletedHierarchyIds, setDeletedHierarchyIds] = useState<string[]>([]);
  const urlProjectOpenAttemptRef = useRef<string | null>(null);
  const mainWorkspaceCanvasRef = useRef<HTMLDivElement>(null);
  const rightWorkspaceCanvasRef = useRef<HTMLDivElement>(null);
  const lastSavedHierarchySignatureRef = useRef("");
  const lastOpenedGatewayRecordingRef = useRef("");
  const lastActiveGatewayRecordingRef = useRef<string | null>(null);
  const processedStoppedGatewayRecordingsRef = useRef<Set<string>>(new Set());
  const lastRecordingBlockedAuditRef = useRef("");
  const pendingStateOpenKeyRef = useRef<string | null>(null);
  const windowShellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingLiveWindowGeometriesRef = useRef<Record<string, AutomationWindowPixelGeometry>>({});
  const liveWindowGeometryFrameRef = useRef<number | null>(null);
  const windowMoveFrameRef = useRef<number | null>(null);
  const snapPreviewSignatureRef = useRef("");

  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  const refreshProjectData = useCallback(async (projectId: string) => {
    const result = await api.post<{ summary: any }>("get-project-workspace-summary", { projectId });
    if (!result.ok || !result.payload?.summary) return;
    const summary = result.payload.summary;
    setProjectRecordings((current) => mergeRecordingSummaries(current, recordingSummariesToRecordingStubs(summary.recordings ?? [])));
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
    setProjectFlows((current) => mergeFlowDetails(flowSummariesToCatalogEntries(summary.flows ?? []), current.filter((entry: any) => entry?.flow?.metadata?.summaryOnly !== true)));
    setRuntimeSessions((summary.runtime ?? []).map(runtimeSummaryToSessionStub));
  }, [api]);
  const refreshProjects = useCallback(async () => {
    setProjectStatus("");
    const result = await api.get<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }>("projects");
    if (result.ok) {
      setProjects(result.payload?.projects ?? []);
      setProjectCategories(result.payload?.categories ?? []);
    } else {
      setProjectStatus(result.error ?? "Projects could not be loaded.");
    }
    setProjectsLoaded(true);
  }, [api]);
  useEffect(() => void refresh(), [refresh]);
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
    let cancelled = false;
    async function publishContext() {
      await fetch("/api/client-gateway/automation-studio-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeProjectId })
      }).catch(() => undefined);
    }
    void publishContext();
    const interval = window.setInterval(() => {
      if (!cancelled) void publishContext();
    }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void fetch("/api/client-gateway/automation-studio-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeProjectId: null })
      }).catch(() => undefined);
    };
  }, [activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    async function refreshGatewaySnapshot() {
      const response = await fetch("/api/client-gateway/snapshot", { cache: "no-store" }).catch(() => null);
      if (!response) return;
      if (response.status === 401) {
        cancelled = true;
        window.location.href = "/";
        return;
      }
      const result = await response.json().catch(() => null);
      if (!cancelled && result?.ok) setGatewaySnapshot(result.payload ?? { enabled: false, sessions: [], pairings: [], auditLog: [] });
    }
    void refreshGatewaySnapshot();
    const interval = window.setInterval(() => void refreshGatewaySnapshot(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const canonical = snapshot?.payload?.canonical ?? {};
  const recordings = mergeById(projectRecordings, canonical.recordingSessions ?? [], "recordingId");
  const timelines = mergeById(projectTimelines, canonical.normalizedTimelines ?? [], "normalizedTimelineId");
  const registries = canonical.signalRegistries ?? [];
  const models = mergeById(pipelineArtifacts.learnedTaskModels ?? [], canonical.learnedTaskModels ?? [], "learnedTaskModelId");
  const proposals = pipelineArtifacts.policyProposals ?? [];
  const recordingFlowProposals = pipelineArtifacts.recordingFlowProposals ?? [];
  const hierarchyProposals = [...proposals, ...recordingFlowProposals];
  const policies: any[] = canonical.policyGraphs ?? [];
  const problems = snapshot?.payload?.problems ?? [];
  const signals = registries.flatMap((registry: any) => (registry.definitions ?? []).map((signal: any) => ({ ...signal, registryId: registry.registryId })));
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
    if (!activeProjectId || !selectedFlow?.flowId || selectedFlowEntry?.source !== "canonical") { setFlowPublications([]); setFlowDependencyInfo({ dependencies: [], usedBy: [], availableUpgrades: [] }); return; }
    let cancelled = false;
    void Promise.all([
      api.post<any>("list-flow-publications", { projectId: activeProjectId, flowId: selectedFlow.flowId }),
      api.post<any>("inspect-flow-dependencies", { projectId: activeProjectId, flowId: selectedFlow.flowId })
    ]).then(([publicationResult, dependencyResult]) => {
      if (cancelled) return;
      if (publicationResult.ok) setFlowPublications(publicationResult.payload?.publications ?? []);
      if (dependencyResult.ok) setFlowDependencyInfo(dependencyResult.payload ?? { dependencies: [], usedBy: [], availableUpgrades: [] });
    });
    return () => { cancelled = true; };
  }, [activeProjectId, selectedFlow?.flowId, selectedFlow?.updatedAt, selectedFlowEntry?.source, api]);
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
  const selectedTaskGraph = selectedFlow ?? selectedTask?.graph ?? selectedTaskFlow;
  const selectedTaskGraphDraftKey = taskGraphDraftKey(selectedTaskGraph);
  const selectedTaskGraphDraft = selectedTaskGraphDraftKey ? taskGraphDrafts[selectedTaskGraphDraftKey] ?? null : null;
  const selectedCanonicalPolicy = selectedTask
    ? policies.find((policy: any) => selectedTask.metadata?.policyId && policy.policyId === selectedTask.metadata.policyId)
      ?? policies.find((policy: any) => policy.taskId === selectedTask.taskId)
      ?? null
    : selection?.kind === "policy"
    ? policies.find((policy: any) => policy.policyId === selection.id)
      ?? null
    : policies[0] ?? null;
  const selectedPolicy = selectedTaskGraph ? flowToTaskPolicy(selectedTaskGraph, selectedTask) : selectedCanonicalPolicy;
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
    { id: "proposal-generator", label: `Proposal Generator: ${selectedRecording?.metadata?.name ?? selectedRecording?.recordingId ?? "Recording"}`, type: "proposal-generator", icon: Sparkles },
    { id: "proposal-workbench", label: `Proposal: ${selectedProposal?.policy?.taskId ?? selectedProposal?.proposalId ?? "Proposal"}`, type: "proposal", icon: Sparkles },
    { id: "policy-primary", label: selectedFlow ? `Flow: ${selectedFlow.name}` : "Flow: None", type: "design", icon: GitBranch },
    { id: "flow-router", label: "Router", type: "router", icon: GitBranch },
    { id: "flow-instructions", label: "Instructions", type: "instructions", icon: ListChecks },
    { id: "adaptations", label: "Adaptations", type: "adaptations", icon: FileSearch },
    { id: "flow-settings", label: "Settings", type: "settings", icon: SlidersHorizontal },
    { id: "state-explorer", label: selectedNode?.label ? `State: ${selectedNode.label}` : "State View", type: "state", icon: ListChecks },
    { id: "runs-history", label: "Runs", type: "runs", icon: History },
    { id: "signals-web", label: "Signals: Relationship Web", type: "signals", icon: Network, state: "warning" },
    { id: "runtime-debug", label: "Runtime Debug", type: "runtime", icon: Bug },
    { id: "problems-view", label: "Problems", type: "problems", icon: AlertTriangle },
    { id: "ai-assistant", label: "AI Assistant", type: "assistant", icon: Sparkles },
    { id: "global-inspector", label: "Inspector", type: "inspector", icon: SlidersHorizontal },
    { id: "workspace-dock", label: "Dock: Assistant / Problems / State", type: "dock", icon: ListChecks }
  ];
  const flowNodes = flowHierarchyNodes(projectFlows, { recordings, proposals: hierarchyProposals });
  const generatedHierarchyIds = new Set(flowNodes.map((node) => node.id));
  const hierarchyNodes: AutomationHierarchyNode[] = [
    ...flowNodes,
    ...customHierarchyNodes.filter((node) => isPersistableHierarchyNode(node) && node.category === "flow")
  ].filter((node) => !deletedHierarchyIds.includes(node.id) || (generatedHierarchyIds.has(node.id) && automationHierarchyNodeIsGeneratedFlowStructure(node)));
  const folderOptions = hierarchyNodes.filter((node) => node.kind === "folder" && node.category === hierarchyCategory);
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
    if (view.id === "proposal-generator") return `Proposal Generator: ${recording?.metadata?.name ?? recording?.name ?? recording?.recordingId ?? "Recording"}`;
    if (view.id === "proposal-workbench") return `Proposal: ${proposal?.policy?.taskId ?? proposal?.proposalId ?? "Proposal"}`;
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
  const visibleWindows = (pageFullscreenWindowId
    ? workspacePrefs.windows.filter((item) => item.id === pageFullscreenWindowId && (item.area ?? "main") === "main")
    : workspacePrefs.maximizedWindowId ? workspacePrefs.windows.filter((item) => item.id === workspacePrefs.maximizedWindowId) : workspacePrefs.windows)
    .filter((item) => automationWorkspaceRegionForView(item.activeViewId) !== "bottom" && item.tabs.some((tab) => automationWorkspaceRegionForView(tab) !== "bottom"));
  const activeWindow = workspacePrefs.windows.find((item) => item.id === workspacePrefs.activeWindowId) ?? workspacePrefs.windows[0];
  const activePane = workspacePrefs.panes.find((item) => item.id === workspacePrefs.activePaneId) ?? workspacePrefs.panes[0];
  const activeViewId = activePane?.activeViewId ?? workspacePrefs.activeViewId ?? activeWindow?.activeViewId ?? "policy-primary";
  useEffect(() => {
    if (!activeProjectId || !selectedFlow?.flowId || selectedFlowEntry?.source !== "canonical" || selectedFlow.metadata?.summaryOnly !== true) return;
    if (activeViewId !== "policy-primary" && selection?.kind !== "flow") return;
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
  const windowsByArea = (area: AutomationWorkspaceArea) => visibleWindows.filter((item) => (item.area ?? "main") === area);
  const canvasForArea = (area: AutomationWorkspaceArea) => area === "right" ? rightWorkspaceCanvasRef.current : mainWorkspaceCanvasRef.current;
  const showRecordingActionPreview = () => {
    updateWorkspacePrefs((current) => ({
      ...current,
      bottomDock: { ...current.bottomDock, activeViewId: "recording-action-preview", expanded: true },
      bottomTimelineCollapsed: false
    }));
  };
  const setSelectionAndFollow = (next: AutomationSelection) => {
    if (hasDirtyTaskGraph && next.kind === "flow" && next.id !== selectedFlow?.flowId && !window.confirm("This Flow has unsaved changes. Discard them and open another Flow?")) return;
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
    if (next.kind === "signal") openView("signals-web", "preview");
    if (next.kind === "state") openView("state-explorer", "preview", "main");
    if (next.kind === "policy") openView("policy-primary", "preview");
    if (next.kind === "flow") {
      const flowEntry = projectFlows.find((entry: any) => entry.source === "canonical" && entry.flow?.flowId === next.id);
      if (flowEntry) {
        if (flowEntry.flow?.metadata?.summaryOnly === true) void loadFlowDetails(next.id);
        if (!nativeNodeDefinitions.length && !publishedFlowDefinitions.length && activeProjectId) void loadNodeDefinitions(activeProjectId);
        updateWorkspacePrefs((current) => {
          const currentState = current.viewStates?.["policy-primary"] ?? {};
          return normalizeAutomationWorkspacePrefs({
            ...current,
            viewStates: {
              ...(current.viewStates ?? {}),
              "policy-primary": {
                ...currentState,
                lastOpenFlowId: next.id
              }
            }
          });
        });
      }
      openView("policy-primary", "preview");
    }
  };
  const openRecordingProposal = (recordingId: string) => {
    const proposal = latestByGeneratedAt<any>([
      ...proposals.filter((item: any) => item.metadata?.recordingId === recordingId),
      ...recordingFlowProposals.filter((item: any) => item.recordingId === recordingId)
    ]);
    if (!proposal) {
      setSelection({ kind: "recording", id: recordingId });
      void loadRecordingDetails(recordingId);
      setRecordingTreePrimaryKind("recording");
      setAutomationActionStatus("No proposal exists for this recording yet. Use Generate Proposal to create one.");
      return;
    }
    if (proposal.metadata?.summaryOnly === true) void loadProposalDetails(proposal.proposalId, proposalArtifactKind(proposal));
    setSelection({ kind: "proposal", id: proposal.proposalId, recordingId });
    setRecordingTreePrimaryKind("proposal");
    openView("proposal-workbench", "preview");
  };
  const openRecordingProposalGenerator = (recordingId: string) => {
    setSelection({ kind: "recording", id: recordingId });
    void loadRecordingDetails(recordingId);
    setRecordingTreePrimaryKind("recording");
    openView("proposal-generator", "preview", "main");
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
        setAutomationActionStatus(reason);
        if (!request.repairAttempted && window.confirm(`${reason}\n\nRepair this recording's state index and retry?`)) {
          const authorizationPin = window.prompt("Enter PIN to repair this recording state index") ?? "";
          if (authorizationPin.length >= 4) {
            const repair = await api.post<{ warnings?: string[] }>("repair-recording-state-index", {
              projectId: activeProjectId,
              recordingId,
              mode: "write",
              authorizationPin
            });
            if (repair.ok) {
              setAutomationActionStatus((repair.payload?.warnings ?? []).length ? `State index repaired with warnings: ${(repair.payload?.warnings ?? []).join("; ")}` : "State index repaired.");
              await openStateView({ ...request, repairAttempted: true });
              return;
            }
            setAutomationActionStatus(repair.error ?? "State index repair failed.");
          } else {
            setAutomationActionStatus("PIN is required to repair the recording state index.");
          }
        }
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
  useEffect(() => {
    function handleOpenNodeState(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId) openStateView({ nodeId: detail.nodeId });
    }
    window.addEventListener("automation-studio:open-node-state", handleOpenNodeState);
    return () => window.removeEventListener("automation-studio:open-node-state", handleOpenNodeState);
  });

  async function monitorStoppedGatewayRecording(recordingId: string) {
    if (!activeProjectId) return;
    setSelection({ kind: "recording", id: recordingId });
    setRecordingTreePrimaryKind("recording");
    openView("timeline-recording", "preview", "main");
    setRecordingProcessing({
      recordingId,
      label: "Recording stopped",
      detail: "Loading the finalized timeline. Open Proposal Generator when you are ready to create proposals.",
      progress: 12
    });
    setAutomationActionStatus("Recording stopped. Loading final timeline...");
    await refreshProjectRuntimeState(activeProjectId);
    setRecordingProcessing((current) => current?.recordingId === recordingId ? null : current);
    setAutomationActionStatus("Recording stopped. Open Proposal Generator when ready.");
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
      void refreshProjectData(activeProjectId).then(() => {
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
  }, [activeProjectId, gatewaySnapshot.sessions, refreshProjectData]);

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
    if (pageFullscreenWindowId && !workspacePrefs.windows.some((item) => item.id === pageFullscreenWindowId && (item.area ?? "main") === "main")) setPageFullscreenWindowId(null);
  }, [pageFullscreenWindowId, workspacePrefs.windows]);

  useEffect(() => {
    const resize = () => window.dispatchEvent(new Event("resize"));
    const restoreNodeViewport = () => window.dispatchEvent(new Event("automation-studio:restore-node-viewport"));
    const firstFrame = window.requestAnimationFrame(() => {
      resize();
      restoreNodeViewport();
      window.requestAnimationFrame(() => {
        resize();
        restoreNodeViewport();
      });
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [pageFullscreenWindowId]);

  useEffect(() => {
    if (!urlProjectId || activeProjectId === urlProjectId || urlProjectOpenAttemptRef.current === urlProjectId) return;
    urlProjectOpenAttemptRef.current = urlProjectId;
    void openProject(urlProjectId, { updateUrl: false });
  }, [activeProjectId, urlProjectId]);

  useEffect(() => {
    if (!activeProjectId || !projectRecordings.length) return;
    setDeletedHierarchyIds((current) => {
      const cleaned = current.filter((id) => !id.startsWith("recordings-client-") && !id.startsWith("proposals-client-") && !id.startsWith("proposals-recording-"));
      return cleaned.length === current.length ? current : cleaned;
    });
  }, [activeProjectId, projectRecordings]);

  useEffect(() => {
    if (!activeProjectId || loadedProjectHierarchyId !== activeProjectId) return;
    const signature = automationHierarchySignature(customHierarchyNodes, deletedHierarchyIds, workspacePrefs);
    if (signature === lastSavedHierarchySignatureRef.current) return;
    const timeout = window.setTimeout(() => {
      if (signature === lastSavedHierarchySignatureRef.current) return;
      void api.post("save-project-hierarchy", {
        projectId: activeProjectId,
        hierarchy: { customHierarchyNodes, deletedHierarchyIds, workspacePrefs }
      }).then((result) => {
        if (result.ok) lastSavedHierarchySignatureRef.current = signature;
      });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [activeProjectId, loadedProjectHierarchyId, customHierarchyNodes, deletedHierarchyIds, workspacePrefs, api]);

  useEffect(() => {
    if (!activeProjectId || loadedProjectHierarchyId !== activeProjectId) return;
    setWorkspacePrefs((current) => {
      const activeViewId = current.windows.find((item) => item.id === current.activeWindowId)?.activeViewId;
      if (!activeViewId) return current;
      const currentState = current.viewStates?.[activeViewId] ?? {};
      const nextState = {
        ...currentState,
        ...(selection ? { selection } : {}),
        ...(activeViewId === "workspace-dock" ? { dockTab } : {})
      };
      if (JSON.stringify(currentState) === JSON.stringify(nextState)) return current;
      return normalizeAutomationWorkspacePrefs({
        ...current,
        viewStates: {
          ...(current.viewStates ?? {}),
          [activeViewId]: nextState
        }
      });
    });
  }, [activeProjectId, loadedProjectHierarchyId, selection, dockTab]);

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

  useEffect(() => {
    if (!activeProjectId || selection?.kind !== "flow") return;
    const flowEntry = projectFlows.find((entry: any) => entry.source === "canonical" && entry.flow?.flowId === selection.id);
    if (!flowEntry) return;
    setWorkspacePrefs((current) => {
      const currentState = current.viewStates?.["policy-primary"] ?? {};
      if (currentState.lastOpenFlowId === selection.id) return current;
      return normalizeAutomationWorkspacePrefs({
        ...current,
        viewStates: {
          ...(current.viewStates ?? {}),
          "policy-primary": {
            ...currentState,
            lastOpenFlowId: selection.id
          }
        }
      });
    });
  }, [activeProjectId, projectFlows, selection]);

  useEffect(() => {
    if (!selectedTask?.taskId || !projectArtifacts.tasks?.some((task: any) => task.taskId === selectedTask.taskId)) return;
    setWorkspacePrefs((current) => {
      const currentState = current.viewStates?.["proposal-workbench"] ?? {};
      if (currentState.lastOpenTaskId === selectedTask.taskId) return current;
      return normalizeAutomationWorkspacePrefs({
        ...current,
        viewStates: {
          ...(current.viewStates ?? {}),
          "proposal-workbench": {
            ...currentState,
            lastOpenTaskId: selectedTask.taskId
          }
        }
      });
    });
  }, [projectArtifacts.tasks, selectedTask?.taskId]);

  useEffect(() => {
    if (!activeProjectId) return;
    const clampWindows = () => {
      setWorkspacePrefs((current) => {
        const windows = current.windows.map((item) => {
          const area = item.area ?? "main";
          if (area === "right" && current.rightSidebarCollapsed) return item;
          const canvas = canvasForArea(item.area ?? "main");
          if (!canvas) return item;
          const bounds = canvas.getBoundingClientRect();
          if (bounds.width < 24 || bounds.height < 24) return item;
          const canvasWidth = Math.max(1, Math.floor(bounds.width));
          const canvasHeight = Math.max(1, Math.floor(bounds.height));
          const geometry = automationWindowToPixels(item, canvasWidth, canvasHeight, 240, 210);
          return { ...item, ...automationPixelsToRelativeGeometry(geometry, canvasWidth, canvasHeight) };
        });
        return automationWindowGeometrySignature(windows) === automationWindowGeometrySignature(current.windows) ? current : { ...current, windows };
      });
    };
    clampWindows();
    const observer = new ResizeObserver(clampWindows);
    [mainWorkspaceCanvasRef.current, rightWorkspaceCanvasRef.current].forEach((canvas) => {
      if (canvas) observer.observe(canvas);
    });
    return () => observer.disconnect();
  }, [activeProjectId, loadedProjectHierarchyId]);

  async function createProject() {
    const name = projectName.trim();
    if (!name) {
      setProjectStatus("Project name is required.");
      return;
    }
    const result = await api.post<{ project: AutomationStudioProject }>("create-project", { name, description: projectDescription.trim(), categoryId: categoryTarget?.id ?? null, authorizationPin: projectPin });
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
    await refreshProjectRuntimeState(project.id);
    setSelection(null);
    openView("policy-primary", "preview", "main");
  }

  async function renameProject() {
    if (!projectTarget) return;
    const name = projectName.trim();
    if (!name) {
      setProjectStatus("Project name is required.");
      return;
    }
    const result = await api.post<{ project: AutomationStudioProject }>("update-project", { projectId: projectTarget.id, name, description: projectDescription.trim(), authorizationPin: projectPin });
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
    const result = await api.post<{ deletedProjectId: string }>("delete-project", { projectId: projectTarget.id, authorizationPin: projectPin });
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
    const result = await api.post<{ project: AutomationStudioProject }>("update-project", { projectId: pendingProjectMove.projectId, categoryId: pendingProjectMove.categoryId, authorizationPin: projectPin });
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
    const result = await api.post<{ category: AutomationStudioProjectCategory }>("create-project-category", { name, authorizationPin: projectPin });
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
    const result = await api.post<{ category: AutomationStudioProjectCategory }>("update-project-category", { categoryId: categoryTarget.id, name, authorizationPin: projectPin });
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
    const result = await api.post<{ deletedCategoryId: string }>("delete-project-category", { categoryId: categoryTarget.id, authorizationPin: projectPin });
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
    const result = await api.post<{ categories: AutomationStudioProjectCategory[] }>("reorder-project-categories", { categoryIds: orderedIds, authorizationPin: projectPin });
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
    const params = new URLSearchParams(searchParams.toString());
    if (projectId) params.set("project", projectId);
    else params.delete("project");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function openProject(projectId: string, options: { updateUrl?: boolean } = {}) {
    if (projectId !== activeProjectId && hasDirtyTaskGraph && !window.confirm("This Flow has unsaved whiteboard changes. Discard them and switch projects?")) return;
    const [hierarchyRequest] = automationStudioProjectOpenRequests(projectId);
    const result = await api.post<{ hierarchy: { customHierarchyNodes: AutomationHierarchyNode[]; deletedHierarchyIds: string[]; workspacePrefs?: AutomationWorkspacePrefs } }>(hierarchyRequest.endpoint, hierarchyRequest.payload);
    if (!result.ok || !result.payload?.hierarchy) {
      setProjectStatus(result.error ?? "Project could not be opened.");
      if (urlProjectOpenAttemptRef.current === projectId) urlProjectOpenAttemptRef.current = null;
      return;
    }
    const loadedPrefs = normalizeAutomationWorkspacePrefs(result.payload.hierarchy.workspacePrefs ?? defaultAutomationWorkspacePrefs());
    const loadedCustomHierarchyNodes = result.payload.hierarchy.customHierarchyNodes.filter(isPersistableHierarchyNode);
    setActiveProjectId(projectId);
    setHasDirtyTaskGraph(false);
    setCustomHierarchyNodes(loadedCustomHierarchyNodes);
    setDeletedHierarchyIds(result.payload.hierarchy.deletedHierarchyIds);
    setWorkspacePrefs(loadedPrefs);
    const activeLoadedViewId = loadedPrefs.windows.find((item) => item.id === loadedPrefs.activeWindowId)?.activeViewId;
    if (activeLoadedViewId) restoreViewState(activeLoadedViewId, loadedPrefs);
    lastSavedHierarchySignatureRef.current = automationHierarchySignature(result.payload.hierarchy.customHierarchyNodes, result.payload.hierarchy.deletedHierarchyIds, loadedPrefs);
    setLoadedProjectHierarchyId(projectId);
    setProjectModal(null);
    setProjectStatus("");
    if (options.updateUrl !== false) setProjectUrl(projectId);
    void refreshProjects();
  }

  async function refreshProjectRuntimeState(projectId = activeProjectId) {
    if (!projectId) return;
    const [workspaceSummaryRequest, recordingRequest, runtimeRequest, domainRequest] = automationStudioRuntimeSummaryRequests(projectId);
    const workspaceSummaryPromise = api.post<{ summary: any }>(workspaceSummaryRequest.endpoint, workspaceSummaryRequest.payload);
    const recordingPromise = api.post<{ recordings: any[] }>(recordingRequest.endpoint, recordingRequest.payload);
    const runtimePromise = api.post<{ runtimeSessions: any[]; page?: any }>(runtimeRequest.endpoint, runtimeRequest.payload);
    const domainPromise = api.post<{ domains: any[] }>(domainRequest.endpoint, domainRequest.payload);
    void workspaceSummaryPromise.then((result) => {
      if (!result.ok || !result.payload?.summary) return;
      const summary = result.payload.summary;
      setProjectRecordings((current) => mergeRecordingSummaries(current, recordingSummariesToRecordingStubs(summary.recordings ?? [])));
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
      setProjectFlows((current) => mergeFlowDetails(flowSummariesToCatalogEntries(summary.flows ?? []), current.filter((entry: any) => entry?.flow?.metadata?.summaryOnly !== true)));
      setRuntimeSessions((summary.runtime ?? []).map(runtimeSummaryToSessionStub));
    });
    void recordingPromise.then((result) => { if (result.ok) setProjectRecordings((current) => mergeRecordingSummaries(current, result.payload?.recordings ?? [])); });
    void runtimePromise.then((result) => { if (result.ok) setRuntimeSessions(result.payload?.runtimeSessions ?? []); });
    void domainPromise.then((result) => { if (result.ok) setRecordingDomains(result.payload?.domains ?? []); });
    const [workspaceSummaryResult, recordingResult, runtimeResult, domainResult] = await Promise.all([
      workspaceSummaryPromise,
      recordingPromise,
      runtimePromise,
      domainPromise
    ]);
    return {
      workspaceSummary: workspaceSummaryResult.ok ? workspaceSummaryResult.payload?.summary ?? null : null,
      recordings: recordingResult.ok ? recordingResult.payload?.recordings ?? [] : null,
      timelines: null,
      runtimeSessions: runtimeResult.ok ? runtimeResult.payload?.runtimeSessions ?? [] : null,
      pipelineArtifacts: null,
      projectArtifacts: null,
      flows: workspaceSummaryResult.ok ? flowSummariesToCatalogEntries(workspaceSummaryResult.payload?.summary?.flows ?? []) : null,
      domains: domainResult.ok ? domainResult.payload?.domains ?? [] : null
    };
  }

  async function loadFlowDetails(flowId: string) {
    if (!activeProjectId || !flowId) return null;
    const result = await api.post<{ flow: any }>("get-flow", { projectId: activeProjectId, flowId });
    if (!result.ok || !result.payload?.flow) return null;
    setProjectFlows((current) => mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: result.payload!.flow }]));
    return result.payload.flow;
  }

  async function loadNodeDefinitions(projectId = activeProjectId) {
    if (!projectId) return;
    const [nativeResult, publishedResult] = await Promise.all([
      api.post<{ nodes: any[] }>("list-native-node-definitions", { projectId }),
      api.post<{ nodes: any[] }>("list-published-flow-nodes", { projectId })
    ]);
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
    await refreshProjectRuntimeState(activeProjectId);
  }

  async function finalizeProjectRecording(recordingId: string) {
    if (!activeProjectId || !recordingId) return;
    const authorizationPin = window.prompt("Enter PIN to finalize this recording") ?? "";
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
    setAutomationActionStatus("Recording finalized. Open Proposal Generator when ready.");
    setRecordingProcessing((current) => current?.recordingId === recordingId ? null : current);
    await refreshProjectRuntimeState(activeProjectId);
  }

  function selectProposalForRecording(recordingId: string, artifacts = pipelineArtifacts) {
    const proposal = latestByGeneratedAt<any>([
      ...(artifacts?.policyProposals ?? []).filter((item: any) => item.metadata?.recordingId === recordingId),
      ...(artifacts?.recordingFlowProposals ?? []).filter((item: any) => item.recordingId === recordingId)
    ]);
    if (!proposal) return false;
    setSelection({ kind: "proposal", id: proposal.proposalId, recordingId });
    setRecordingTreePrimaryKind("proposal");
    openView("proposal-workbench", "preview");
    return true;
  }

  async function processFinalizedRecording(recordingId: string, force = false, _providedAuthorizationPin?: string) {
    if (!activeProjectId || !recordingId) return false;
    if (!force && selectProposalForRecording(recordingId)) {
      setAutomationActionStatus("Proposal already current.");
      return true;
    }
    setRecordingProcessing({
      recordingId,
      label: force ? "Regenerating mapped proposal" : "Generating mapped proposal",
      detail: "Checking registered extension mappers before running evidence mining.",
      progress: 18
    });
    setAutomationActionStatus(force ? "Regenerating Recording Flow proposal..." : "Generating Recording Flow proposal...");
    const fastRecordingFlowResult = await api.post<{ proposals: any[]; issues?: string[] }>("create-recording-flow-proposals", { projectId: activeProjectId, recordingId, force });
    if (fastRecordingFlowResult.ok && fastRecordingFlowResult.payload?.proposals?.length) {
      applyPipelineActionPayload("create-recording-flow-proposals", fastRecordingFlowResult.payload);
      const proposal = fastRecordingFlowResult.payload.proposals[0]!;
      setSelection({ kind: "proposal", id: proposal.proposalId, recordingId });
      setRecordingTreePrimaryKind("proposal");
      openView("proposal-workbench", "preview");
      setRecordingProcessing({
        recordingId,
        label: "Mapped proposal ready",
        detail: "Extension mapper proposals were generated and are waiting for review.",
        progress: 100
      });
      setAutomationActionStatus("Recording Flow proposal generated.");
      window.setTimeout(() => setRecordingProcessing((current) => current?.recordingId === recordingId && current.progress >= 100 ? null : current), 1_200);
      void refreshProjectRuntimeState(activeProjectId);
      return true;
    }
    setRecordingProcessing({
      recordingId,
      label: force ? "Regenerating proposal" : "Generating proposal",
      detail: "Normalizing the raw recording into stable timeline events.",
      progress: 18
    });
    setAutomationActionStatus(force ? "Regenerating Policy Flow proposal..." : "Generating Policy Flow proposal...");
    const normalizeResult = await api.post<{ normalizedTimeline: any }>("normalize-recording", { projectId: activeProjectId, recordingId });
    if (!normalizeResult.ok || !normalizeResult.payload?.normalizedTimeline) {
      setAutomationActionStatus(normalizeResult.error ?? "Recording could not be normalized.");
      setRecordingProcessing({
        recordingId,
        label: "Proposal generation failed",
        detail: normalizeResult.error ?? "Recording could not be normalized.",
        progress: 100
      });
      return false;
    }
    setProjectTimelines((current) => [normalizeResult.payload!.normalizedTimeline, ...current.filter((timeline) => timeline.normalizedTimelineId !== normalizeResult.payload!.normalizedTimeline.normalizedTimelineId)]);
    setRecordingProcessing({
      recordingId,
      label: "Reviewing normalized timeline",
      detail: "Writing normalization details and raw-to-normalized mappings.",
      progress: 36
    });
    const reviewResult = await api.post<{ review: any }>("create-normalization-review", { projectId: activeProjectId, recordingId });
    if (reviewResult.ok && reviewResult.payload?.review) applyPipelineActionPayload("create-normalization-review", reviewResult.payload);
    setRecordingProcessing({
      recordingId,
      label: "Mining evidence",
      detail: "Extracting facts, observations, state-action correlations, and claims.",
      progress: 58
    });
    const miningResult = await api.post<{ miningRun: any }>("mine-recording-evidence", { projectId: activeProjectId, recordingId });
    if (!miningResult.ok || !miningResult.payload?.miningRun) {
      setAutomationActionStatus(miningResult.error ?? "Evidence could not be mined.");
      setRecordingProcessing({
        recordingId,
        label: "Proposal generation failed",
        detail: miningResult.error ?? "Evidence could not be mined.",
        progress: 100
      });
      await refreshProjectRuntimeState(activeProjectId);
      return false;
    }
    applyPipelineActionPayload("mine-recording-evidence", miningResult.payload);
    setRecordingProcessing({
      recordingId,
      label: "Creating Policy Flow proposal",
      detail: "Converting mined evidence into a Policy Flow proposal. The proposal will not be applied automatically.",
      progress: 82
    });
    const proposalResult = await api.post<{ proposal: any }>("propose-policy-from-model", { projectId: activeProjectId, recordingId, miningRunId: miningResult.payload.miningRun.miningRunId });
    if (proposalResult.ok && proposalResult.payload?.proposal) {
      applyPipelineActionPayload("propose-policy-from-model", proposalResult.payload);
      setSelection({ kind: "proposal", id: proposalResult.payload.proposal.proposalId, recordingId });
      setRecordingTreePrimaryKind("proposal");
      openView("proposal-workbench", "preview");
      setRecordingProcessing({
        recordingId,
        label: "Proposal ready",
        detail: "The Policy Flow proposal has been generated and is waiting for review.",
        progress: 100
      });
      setAutomationActionStatus("Policy Flow proposal generated.");
      window.setTimeout(() => setRecordingProcessing((current) => current?.recordingId === recordingId && current.progress >= 100 ? null : current), 1_200);
      void refreshProjectRuntimeState(activeProjectId);
      return true;
    }
    setRecordingProcessing({
      recordingId,
      label: "Creating mapped Flow proposals",
      detail: "No direct Policy Flow graph was generated. Checking registered extension mappers for reviewable Flow actions.",
      progress: 90
    });
    const recordingFlowResult = await api.post<{ proposals: any[]; issues?: string[] }>("create-recording-flow-proposals", { projectId: activeProjectId, recordingId, force });
    if (recordingFlowResult.ok && recordingFlowResult.payload?.proposals?.length) {
      applyPipelineActionPayload("create-recording-flow-proposals", recordingFlowResult.payload);
      const proposal = recordingFlowResult.payload.proposals[0]!;
      setSelection({ kind: "proposal", id: proposal.proposalId, recordingId });
      setRecordingTreePrimaryKind("proposal");
      openView("proposal-workbench", "preview");
      setRecordingProcessing({
        recordingId,
        label: "Mapped proposal ready",
        detail: "Extension mapper proposals were generated and are waiting for review.",
        progress: 100
      });
      setAutomationActionStatus("Recording Flow proposal generated.");
      window.setTimeout(() => setRecordingProcessing((current) => current?.recordingId === recordingId && current.progress >= 100 ? null : current), 1_200);
      void refreshProjectRuntimeState(activeProjectId);
      return true;
    }
    const importerRuntimeHint = recordingFlowResult.error?.includes("bound importer runtime")
      ? " The web runtime has no importer runtime bound. Restart the web panel after setting FLUXIQ_HOST_MODULE, and ensure registerFluxIQHost() calls fluxiq.bindAutomationStudioNativeNodeRuntime(nativeRuntime)."
      : "";
    const recordingFlowError = recordingFlowResult.error ? `${recordingFlowResult.error}${importerRuntimeHint}` : undefined;
    const recordingFlowIssue = recordingFlowError
      ?? recordingFlowResult.payload?.issues?.filter(Boolean).join(" ")
      ?? (recordingFlowResult.ok ? "No registered extension mapper emitted valid action candidates for this recording." : undefined);
    if (!proposalResult.ok || !proposalResult.payload?.proposal) {
      setAutomationActionStatus(recordingFlowIssue ?? proposalResult.error ?? "No proposal could be generated from this recording.");
      setRecordingProcessing({
        recordingId,
        label: "Proposal generation failed",
        detail: recordingFlowIssue ?? proposalResult.error ?? "No output-bound policy actions or extension mapper proposals were found.",
        progress: 100
      });
      await refreshProjectRuntimeState(activeProjectId);
      return false;
    }
    return false;
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
    void refreshProjectRuntimeState(activeProjectId);
    return true;
  }

  async function updateProjectRecording(recordingId: string, changes: JsonObject) {
    if (!activeProjectId || !recordingId) return;
    const authorizationPin = window.prompt("Enter PIN to update this recording") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to update a recording.");
      return;
    }
    const result = await api.post<{ recording: any }>("update-recording", { projectId: activeProjectId, recordingId, authorizationPin, ...changes });
    setAutomationActionStatus(result.ok ? "Recording updated." : result.error ?? "Recording could not be updated.");
    await refreshProjectRuntimeState(activeProjectId);
  }

  async function deleteProjectRecording(recordingId: string, authorizationPin?: string) {
    if (!activeProjectId || !recordingId) return;
    if (!authorizationPin && !window.confirm("Delete this recording? This removes the raw session from this project.")) return;
    const pin = authorizationPin ?? window.prompt("Enter PIN to delete this recording") ?? "";
    if (pin.length < 4) {
      setAutomationActionStatus("PIN is required to delete a recording.");
      return;
    }
    const result = await api.post<{ deletedRecordingId: string; deletedProposalIds?: string[] }>("delete-recording", { projectId: activeProjectId, recordingId, authorizationPin: pin });
    setAutomationActionStatus(result.ok ? "Recording deleted." : result.error ?? "Recording could not be deleted.");
    if (!result.ok) return;
    removeDeletedRecordingsFromWorkspace([recordingId], result.payload?.deletedProposalIds ?? []);
    await refreshProjectRuntimeState(activeProjectId);
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
    await refreshProjectRuntimeState(activeProjectId);
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
    await refreshProjectRuntimeState(activeProjectId);
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
    setProjectRecordings((current) => current.filter((recording) => !deletedRecordingIds.has(String(recording.recordingId ?? ""))));
    setProjectTimelines((current) => current.filter((timeline) => !deletedRecordingIds.has(String(timeline.recordingId ?? ""))));
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

  async function appendProjectRecordingNote(recordingId: string, linkedEntryId?: string) {
    if (!activeProjectId || !recordingId) return;
    const text = window.prompt("Note text") ?? "";
    if (!text.trim()) return;
    const authorizationPin = window.prompt("Enter PIN to add this note") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to add a note.");
      return;
    }
    const result = await api.post<{ recording: any }>("append-recording-note", { projectId: activeProjectId, recordingId, text, linkedEntryIds: linkedEntryId ? [linkedEntryId] : [], authorizationPin });
    setAutomationActionStatus(result.ok ? "Note added." : result.error ?? "Note could not be added.");
    await refreshProjectRuntimeState(activeProjectId);
  }

  async function appendProjectRecordingMarker(recordingId: string, linkedEntryId?: string, monotonicOffsetMs?: number) {
    if (!activeProjectId || !recordingId) return;
    const label = window.prompt("Marker label") ?? "";
    if (!label.trim()) return;
    const authorizationPin = window.prompt("Enter PIN to add this marker") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to add a marker.");
      return;
    }
    const result = await api.post<{ recording: any }>("append-recording-marker", { projectId: activeProjectId, recordingId, label, linkedEntryId, monotonicOffsetMs, authorizationPin });
    setAutomationActionStatus(result.ok ? "Marker added." : result.error ?? "Marker could not be added.");
    await refreshProjectRuntimeState(activeProjectId);
  }

  async function saveSelectedTaskGraph(graph: { nodes: any[]; edges: any[] }) {
    if (activeProjectId && selectedFlowEntry?.source === "canonical" && selectedFlow) {
      const authorizationPin = window.prompt("Enter PIN to save this flow") ?? "";
      if (authorizationPin.length < 4) {
        setAutomationActionStatus("PIN is required to save a flow.");
        return false;
      }
      // The canvas uses React Flow's presentation shape; canonical Flow storage
      // uses the neutral node/edge artifact shape shared with legacy adapters.
      const serializedGraph = graphToTaskFlow({
        task: { taskId: selectedFlow.flowId, name: selectedFlow.name } as any,
        existingFlow: { ...selectedFlow, ownerKind: "flow", ownerId: selectedFlow.flowId } as any,
        graph
      });
      const { regions: _regions, regionHandoffs: _regionHandoffs, ...flowWithoutEditorRegions } = selectedFlow;
      const result = await api.post<{ flow: any }>("save-flow", {
        projectId: activeProjectId,
        authorizationPin,
        flow: { ...flowWithoutEditorRegions, nodes: serializedGraph.nodes, edges: serializedGraph.edges }
      });
      if (!result.ok) {
        setAutomationActionStatus(result.error ?? "Flow could not be saved.");
        return false;
      }
      await refreshProjectRuntimeState(activeProjectId);
      setTaskGraphDrafts((current) => {
        if (!selectedTaskGraphDraftKey) return current;
        const { [selectedTaskGraphDraftKey]: _saved, ...rest } = current;
        return rest;
      });
      setAutomationActionStatus("Flow saved.");
      return true;
    }
    setAutomationActionStatus("Legacy Task/Routine sources are read-only. Migrate this entry to a canonical Flow before editing.");
    return false;
  }

  function updateSelectedTaskGraphDraft(graph: { nodes: any[]; edges: any[] } | null) {
    if (!selectedTaskGraphDraftKey) return;
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
    await refreshProjectRuntimeState(activeProjectId); setAutomationActionStatus(`Published ${selectedFlow.name}@${version}.`); return true;
  }

  async function deprecateSelectedFlow(version: string) {
    if (!activeProjectId || !selectedFlow) return false;
    const reason = window.prompt(`Why is ${selectedFlow.name}@${version} deprecated?`) ?? "";
    if (!reason.trim()) return false;
    const authorizationPin = window.prompt("Enter PIN to deprecate this published version") ?? "";
    if (authorizationPin.length < 4) return false;
    const result = await api.post<any>("deprecate-flow-publication", { projectId: activeProjectId, flowId: selectedFlow.flowId, version, reason, authorizationPin });
    if (!result.ok) { setAutomationActionStatus(result.error ?? "Published Flow version could not be deprecated."); return false; }
    await refreshProjectRuntimeState(activeProjectId); setAutomationActionStatus(`Deprecated ${selectedFlow.name}@${version}.`); return true;
  }

  function applyPipelineActionPayload(endpoint: string, payload: any) {
    setPipelineArtifacts((current: any) => {
      const base = { ...emptyPipelineArtifacts(), ...current };
      if (endpoint === "create-normalization-review" && payload.review) {
        return { ...base, normalizationReviews: upsertById([payload.review, ...base.normalizationReviews], "reviewId") };
      }
      if (endpoint === "mine-recording-evidence" && payload.miningRun) {
        const miningRun = payload.miningRun;
        return {
          ...base,
          miningRuns: upsertById([miningRun, ...base.miningRuns], "miningRunId"),
          evidenceFacts: upsertById([...(miningRun.facts ?? []), ...base.evidenceFacts], "factId"),
          evidenceObservations: upsertById([...(miningRun.observations ?? []), ...base.evidenceObservations], "observationId"),
          stateActionCorrelations: upsertById([...(miningRun.correlations ?? []), ...base.stateActionCorrelations], "correlationId"),
          evidenceClaims: upsertById([...(miningRun.claims ?? []), ...base.evidenceClaims], "claimId")
        };
      }
      if (endpoint === "learn-task-model" && payload.learnedTaskModel) {
        return { ...base, learnedTaskModels: upsertById([payload.learnedTaskModel, ...base.learnedTaskModels], "learnedTaskModelId") };
      }
      if (endpoint === "propose-policy-from-model" && payload.proposal) {
        return { ...base, policyProposals: upsertById([payload.proposal, ...base.policyProposals], "proposalId") };
      }
      if (endpoint === "generate-recording-proposal") {
        return {
          ...base,
          policyProposals: payload.proposal ? upsertById([payload.proposal, ...base.policyProposals], "proposalId") : base.policyProposals,
          recordingFlowProposals: payload.recordingFlowProposals ? upsertById([...payload.recordingFlowProposals, ...base.recordingFlowProposals], "proposalId") : base.recordingFlowProposals
        };
      }
      if (endpoint === "approve-policy-proposal" && payload.proposal) {
        return { ...base, policyProposals: upsertById([payload.proposal, ...base.policyProposals], "proposalId") };
      }
      if (endpoint === "create-recording-flow-proposals" && payload.proposals) {
        return { ...base, recordingFlowProposals: upsertById([...payload.proposals, ...base.recordingFlowProposals], "proposalId") };
      }
      if (endpoint === "review-recording-flow-proposal" && payload.proposal) {
        return { ...base, recordingFlowProposals: upsertById([payload.proposal, ...base.recordingFlowProposals], "proposalId") };
      }
      return base;
    });
  }

  async function runRecordingPipelineStep(endpoint: string, payload: JsonObject, success: string) {
    if (!activeProjectId) return;
    const requiresPin = !isProposalGenerationEndpoint(endpoint);
    const authorizationPin = requiresPin ? window.prompt("Enter PIN for this pipeline action") ?? "" : "";
    if (requiresPin && authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required for this pipeline action.");
      return false;
    }
    setAutomationActionStatus(pipelineActionRunningMessage(endpoint));
    const result = await api.post<any>(endpoint, { projectId: activeProjectId, ...(requiresPin ? { authorizationPin } : {}), ...payload });
    if (result.ok && result.payload) {
      applyPipelineActionPayload(endpoint, result.payload);
      if (endpoint === "approve-policy-proposal" && result.payload.proposal?.policy?.policyId) {
        const approvedPolicy = result.payload.proposal.policy;
        const approvedFlowId = result.payload.proposal.metadata?.approvedFlowId;
        updateWorkspacePrefs((current) => {
          const policyPrimaryState = current.viewStates?.["policy-primary"] ?? {};
          const { draftGraph: _draftGraph, ...policyPrimaryWithoutDraft } = policyPrimaryState;
          return {
            ...current,
            viewStates: {
              ...(current.viewStates ?? {}),
              "policy-primary": policyPrimaryWithoutDraft
            }
          };
        });
        setSnapshot((current: any) => current ? {
          ...current,
          payload: {
            ...(current.payload ?? {}),
            canonical: {
              ...(current.payload?.canonical ?? {}),
              policyGraphs: upsertById([approvedPolicy, ...(current.payload?.canonical?.policyGraphs ?? [])], "policyId")
            }
          }
        } : current);
        await refreshProjectRuntimeState(activeProjectId);
        if (typeof approvedFlowId === "string") clearTaskGraphDraftsForFlow(approvedFlowId);
        setSelection(typeof approvedFlowId === "string" ? { kind: "flow", id: approvedFlowId } : { kind: "policy", id: approvedPolicy.taskId });
        openView("policy-primary", "preview", "main");
        setAutomationActionStatus("Proposal applied and Flow opened.");
        return true;
      }
      if (endpoint === "review-recording-flow-proposal" && result.payload.flow?.flowId) {
        const flowId = String(result.payload.flow.flowId);
        await refreshProjectRuntimeState(activeProjectId);
        clearTaskGraphDraftsForFlow(flowId);
        setSelection({ kind: "flow", id: flowId });
        updateWorkspacePrefs((current) => {
          const policyPrimaryState = current.viewStates?.["policy-primary"] ?? {};
          return normalizeAutomationWorkspacePrefs({
            ...current,
            viewStates: {
              ...(current.viewStates ?? {}),
              "policy-primary": {
                ...policyPrimaryState,
                lastOpenFlowId: flowId
              }
            }
          });
        });
        openView("policy-primary", "preview", "main");
        setAutomationActionStatus("Recording proposal approved and Flow opened.");
        return true;
      }
    }
    setAutomationActionStatus(result.ok ? success : result.error ?? "Pipeline action failed.");
    void refreshProjectRuntimeState(activeProjectId);
    return result.ok;
  }

  function processPipelineProposalWithLlm(_proposalId: string) {
    setAutomationActionStatus("LLM task processing is not connected yet.");
  }

  async function generateDirectProposal(recordingId: string, replaceProposalId?: string) {
    return await generateRecordingProposal(recordingId, { mode: "direct", ...(replaceProposalId ? { replaceProposalId } : {}) });
  }

  async function generateAssistedProposal(recordingId: string, input: { title?: string; instructions?: string; constraints?: string }) {
    return await generateRecordingProposal(recordingId, { mode: "llm_assisted", ...input });
  }

  async function generateRecordingProposal(recordingId: string, input: { mode: "direct" | "llm_assisted"; title?: string; instructions?: string; constraints?: string; replaceProposalId?: string }) {
    if (!activeProjectId || !recordingId) return false;
    setRecordingProcessing({
      recordingId,
      label: input.mode === "llm_assisted" ? "Generating assisted proposal" : "Generating direct proposal",
      detail: "Loading the finalized recording timeline.",
      progress: 12
    });
    setAutomationActionStatus(input.mode === "llm_assisted" ? "Generating assisted proposal..." : "Generating direct proposal...");
    window.setTimeout(() => setRecordingProcessing((current) => current?.recordingId === recordingId && current.progress < 45 ? {
      ...current,
      detail: input.mode === "llm_assisted" ? "Applying instructions and preparing generation context." : "Checking registered mappers and compacted action evidence.",
      progress: 36
    } : current), 250);
    window.setTimeout(() => setRecordingProcessing((current) => current?.recordingId === recordingId && current.progress < 75 ? {
      ...current,
      detail: input.mode === "llm_assisted" ? "Creating a reviewable assisted proposal attempt." : "Creating a reviewable direct proposal attempt.",
      progress: 68
    } : current), 900);
    const result = await api.post<{ result: any }>("generate-recording-proposal", { projectId: activeProjectId, recordingId, ...input });
    if (!result.ok || !result.payload?.result) {
      setAutomationActionStatus(result.error ?? "Proposal could not be generated.");
      setRecordingProcessing({ recordingId, label: "Proposal generation failed", detail: result.error ?? "Proposal could not be generated.", progress: 100 });
      return false;
    }
    setRecordingProcessing({
      recordingId,
      label: input.mode === "llm_assisted" ? "Generating assisted proposal" : "Generating direct proposal",
      detail: "Writing proposal artifacts and updating the project hierarchy.",
      progress: 88
    });
    applyPipelineActionPayload("generate-recording-proposal", result.payload.result);
    const proposal = result.payload.result.proposal ?? result.payload.result.recordingFlowProposals?.[0];
    if (!proposal?.proposalId) {
      const issues = Array.isArray(result.payload.result.issues) ? result.payload.result.issues.filter((issue: unknown) => typeof issue === "string" && issue.trim()) : [];
      const blockingIssues = issues.filter((issue: string) => !issue.startsWith("Compacted "));
      const detail = blockingIssues[0] ?? issues[0] ?? (result.payload.result.status === "skipped" ? "No proposal artifact was produced for this recording." : "Generation completed without returning a proposal artifact.");
      setRecordingProcessing({
        recordingId,
        label: "No proposal generated",
        detail,
        progress: 100
      });
      setAutomationActionStatus((blockingIssues.length || issues.length) ? `No proposal generated: ${(blockingIssues.length ? blockingIssues : issues).join(" ")}` : detail);
      void refreshProjectRuntimeState(activeProjectId);
      return false;
    }
    if (proposal?.proposalId) {
      setSelection({ kind: "proposal", id: proposal.proposalId, recordingId });
      setRecordingTreePrimaryKind("proposal");
      openView("proposal-workbench", "preview", "main");
    }
    setRecordingProcessing({
      recordingId,
      label: "Proposal ready",
      detail: "The proposal attempt has been generated and is waiting for review.",
      progress: 100
    });
    setAutomationActionStatus("Proposal generated.");
    window.setTimeout(() => setRecordingProcessing((current) => current?.recordingId === recordingId && current.progress >= 100 ? null : current), 1_200);
    void refreshProjectRuntimeState(activeProjectId);
    return true;
  }

  function clearTaskGraphDraftsForFlow(flowId: string) {
    setTaskGraphDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${flowId}:`))));
  }

  async function runRecordingPipeline(recordingId: string) {
    if (!activeProjectId || !recordingId) return;
    const steps: Array<{ endpoint: string; payload: JsonObject; status: string; success: string }> = [
      { endpoint: "normalize-recording", payload: { recordingId }, status: "Normalizing recording timeline...", success: "Recording normalized." },
      { endpoint: "mine-recording-evidence", payload: { recordingId }, status: "Mining recording evidence...", success: "Evidence mined." },
      { endpoint: "propose-policy-from-model", payload: { recordingId }, status: "Creating proposal...", success: "Proposal created." },
      { endpoint: "create-recording-flow-proposals", payload: { recordingId }, status: "Mapping recording actions...", success: "Recording Flow proposals created." }
    ];
    let miningRunId: string | null = null;
    for (const step of steps) {
      setAutomationActionStatus(step.status);
      const stepPayload: JsonObject = step.endpoint === "propose-policy-from-model" && miningRunId ? { ...step.payload, miningRunId } : step.payload;
      const result: { ok: boolean; payload?: any; error?: string } = await api.post<any>(step.endpoint, { projectId: activeProjectId, ...stepPayload });
      if (!result.ok) {
        setAutomationActionStatus(result.error ?? `${step.endpoint} failed.`);
        await refreshProjectRuntimeState(activeProjectId);
        return;
      }
      applyPipelineActionPayload(step.endpoint, result.payload ?? {});
      if (step.endpoint === "normalize-recording" && result.payload?.normalizedTimeline) {
        setProjectTimelines((current) => [result.payload!.normalizedTimeline, ...current.filter((timeline) => timeline.normalizedTimelineId !== result.payload!.normalizedTimeline.normalizedTimelineId)]);
        const reviewResult = await api.post<{ review: any }>("create-normalization-review", { projectId: activeProjectId, recordingId });
        if (reviewResult.ok && reviewResult.payload?.review) applyPipelineActionPayload("create-normalization-review", reviewResult.payload);
      }
      if (step.endpoint === "mine-recording-evidence" && result.payload?.miningRun?.miningRunId) {
        miningRunId = result.payload.miningRun.miningRunId;
      }
      setAutomationActionStatus(step.success);
    }
    setAutomationActionStatus("Recording pipeline complete.");
    void refreshProjectRuntimeState(activeProjectId);
  }

  function closeProject() {
    if (hasDirtyTaskGraph && !window.confirm("This Flow has unsaved changes. Discard them and return to projects?")) return;
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
    setLiveWindowGeometries({});
    setLiveInspectorWidth(null);
    setPageFullscreenWindowId(null);
    lastSavedHierarchySignatureRef.current = "";
    setSelection(null);
    setProjectUrl(null);
  }

  function updateWorkspacePrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs) {
    setWorkspacePrefs((current) => normalizeAutomationWorkspacePrefs(updater(current)));
  }
  function captureActiveViewState(current: AutomationWorkspacePrefs): AutomationWorkspacePrefs {
    const activeViewId = current.panes.find((item) => item.id === current.activePaneId)?.activeViewId
      ?? current.rightSidebar.activeViewId
      ?? current.windows.find((item) => item.id === current.activeWindowId)?.activeViewId;
    if (!activeViewId) return current;
    return {
      ...current,
      viewStates: {
        ...(current.viewStates ?? {}),
        [activeViewId]: {
          ...(current.viewStates?.[activeViewId] ?? {}),
          ...(selection ? { selection } : {}),
          ...(activeViewId === "workspace-dock" ? { dockTab } : {})
        }
      }
    };
  }
  function restoreViewState(viewId: string, sourcePrefs = workspacePrefs) {
    const saved = sourcePrefs.viewStates?.[viewId];
    const savedSelection = saved?.selection;
    if (isAutomationSelection(savedSelection)) setSelection(savedSelection);
    if (viewId === "workspace-dock" && isAutomationDockTab(saved?.dockTab)) setDockTab(saved.dockTab);
  }
  function setDockTabAndPersist(tab: AutomationDockTab) {
    setDockTab(tab);
    updateWorkspacePrefs((current) => ({
      ...captureActiveViewState(current),
      viewStates: {
        ...(current.viewStates ?? {}),
        "workspace-dock": {
          ...(current.viewStates?.["workspace-dock"] ?? {}),
          ...(selection ? { selection } : {}),
          dockTab: tab
        }
      }
    }));
  }
  function updateProposalReview(proposalId: string, review: JsonObject) {
    updateWorkspacePrefs((current) => {
      const proposalState = current.viewStates?.["proposal-workbench"] ?? {};
      const reviewsSource = proposalState.proposalReviews;
      const reviews = reviewsSource && typeof reviewsSource === "object" && !Array.isArray(reviewsSource)
        ? reviewsSource as Record<string, unknown>
        : {};
      return {
        ...current,
        viewStates: {
          ...(current.viewStates ?? {}),
          "proposal-workbench": {
            ...proposalState,
            proposalReviews: {
              ...reviews,
              [proposalId]: review
            }
          }
        }
      };
    });
  }
  function scheduleLiveWindowGeometry(geometries: Record<string, AutomationWindowPixelGeometry>) {
    pendingLiveWindowGeometriesRef.current = geometries;
    if (liveWindowGeometryFrameRef.current !== null) return;
    liveWindowGeometryFrameRef.current = window.requestAnimationFrame(() => {
      liveWindowGeometryFrameRef.current = null;
      setLiveWindowGeometries(pendingLiveWindowGeometriesRef.current);
    });
  }
  function paintWindowShellGeometry(windowId: string, geometry: AutomationWindowPixelGeometry) {
    const shell = windowShellRefs.current.get(windowId);
    if (!shell) return;
    shell.style.left = `${geometry.x}px`;
    shell.style.top = `${geometry.y}px`;
    shell.style.width = `${geometry.widthPx}px`;
    shell.style.height = `${geometry.heightPx}px`;
  }
  function setWindowShellRef(windowId: string, element: HTMLDivElement | null) {
    if (element) windowShellRefs.current.set(windowId, element);
    else windowShellRefs.current.delete(windowId);
  }
  function commitWindowPixelGeometries(area: AutomationWorkspaceArea, geometries: Record<string, AutomationWindowPixelGeometry>) {
    if (!Object.keys(geometries).length) return;
    updateWorkspacePrefs((current) => ({
      ...current,
      windows: current.windows.map((item) => {
        const geometry = geometries[item.id];
        if (!geometry) return item;
        const bounds = canvasForArea(area)?.getBoundingClientRect();
        const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
        const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
        return { ...item, ...automationPixelsToRelativeGeometry(geometry, canvasWidth, canvasHeight) };
      })
    }));
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
      if (mode === "new-window") {
        const id = `window-${viewId}-${Date.now()}`;
        const bounds = canvasForArea(area)?.getBoundingClientRect();
        const geometry = area === "main"
          ? placeAutomationWindow(current.windows.filter((item) => (item.area ?? "main") === area), bounds)
          : fullAutomationWindowGeometry();
        return {
          ...current,
          activeWindowId: id,
          maximizedWindowId: null,
          windows: [...current.windows, { id, activeViewId: viewId, tabs: [viewId], area, ...geometry, zIndex: nextAutomationZIndex(current.windows) }]
        };
      }
      const existingViewWindow = current.windows.find((item) => (item.area ?? "main") === area && item.tabs.includes(viewId));
      const activeWindowInArea = current.windows.find((item) => item.id === current.activeWindowId && (item.area ?? "main") === area);
      const targetWindow = existingViewWindow ?? activeWindowInArea ?? current.windows.find((item) => (item.area ?? "main") === area);
      if (!targetWindow) {
        const id = `window-${viewId}-${Date.now()}`;
        const bounds = canvasForArea(area)?.getBoundingClientRect();
        const geometry = placeAutomationWindow([], bounds);
        return {
          ...current,
          activeWindowId: id,
          maximizedWindowId: null,
          windows: [...current.windows, { id, activeViewId: viewId, tabs: [viewId], area, ...geometry, zIndex: nextAutomationZIndex(current.windows) }]
        };
      }
      return {
        ...current,
        activeWindowId: targetWindow.id,
        windows: current.windows.map((item) => item.id === targetWindow.id
          ? { ...item, activeViewId: viewId, tabs: item.tabs.includes(viewId) ? item.tabs : [...item.tabs, viewId] }
          : item)
      };
    });
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
    });
  }
  function addWorkspaceWindow(viewId: string, area: AutomationWorkspaceArea, targetWindowId?: string) {
    if (targetWindowId) {
      if (targetWindowId === "right-sidebar") {
        updateWorkspacePrefs((current) => ({
          ...captureActiveViewState(current),
          rightSidebarCollapsed: false,
          rightSidebar: {
            ...current.rightSidebar,
            activeViewId: viewId,
            collapsed: false,
            tabs: current.rightSidebar.tabs.includes(viewId) ? current.rightSidebar.tabs : [...current.rightSidebar.tabs, viewId]
          }
        }));
        setWindowAdderOpen(null);
        return;
      }
      if (workspacePrefs.panes.some((item) => item.id === targetWindowId)) {
        updateWorkspacePrefs((current) => ({
          ...captureActiveViewState(current),
          activePaneId: targetWindowId,
          activeViewId: viewId,
          panes: current.panes.map((item) => item.id === targetWindowId
            ? { ...item, activeViewId: viewId, tabs: item.tabs.includes(viewId) ? item.tabs : [...item.tabs, viewId] }
            : item)
        }));
        setWindowAdderOpen(null);
        return;
      }
      updateWorkspacePrefs((current) => ({
        ...captureActiveViewState(current),
        activeWindowId: targetWindowId,
        windows: current.windows.map((item) => item.id === targetWindowId
          ? { ...item, activeViewId: viewId, tabs: item.tabs.includes(viewId) ? item.tabs : [...item.tabs, viewId] }
          : item)
      }));
    } else {
      openView(viewId, "new-window", area);
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
  function closeWindow(windowId: string) {
    if (pageFullscreenWindowId === windowId) setPageFullscreenWindowId(null);
    updateWorkspacePrefs((current) => {
      current = captureActiveViewState(current);
      const windows = current.windows.filter((item) => item.id !== windowId);
      return { ...current, activeWindowId: windows[0]?.id ?? "", maximizedWindowId: current.maximizedWindowId === windowId ? null : current.maximizedWindowId, windows };
    });
  }
  function closeWindowTab(windowId: string, viewId: string) {
    updateWorkspacePrefs((current) => {
      current = captureActiveViewState(current);
      const windows = current.windows.map((item) => {
        if (item.id !== windowId) return item;
        const tabs = item.tabs.filter((tab) => tab !== viewId);
        return { ...item, tabs, activeViewId: item.activeViewId === viewId ? tabs[0] ?? "" : item.activeViewId };
      }).filter((item) => item.tabs.length > 0);
      return { ...current, activeWindowId: windows[0]?.id ?? "", windows };
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
      flowIds: new Set(deletingNodes.filter((node) => node.kind === "flow" && node.sourceId).map((node) => node.sourceId!)),
      recordingIds: new Set(deletingNodes.filter((node) => node.kind === "recording" && node.sourceId).map((node) => node.sourceId!)),
      proposalIds: new Set(deletingNodes.filter((node) => node.kind === "proposal" && node.sourceId).map((node) => node.sourceId!)),
      timelineEntryIds: new Set(recordings
        .filter((recording: any) => deletingNodes.some((node) => node.kind === "recording" && node.sourceId === recording.recordingId))
        .flatMap((recording: any) => (recording.timeline ?? []).map((entry: any) => String(entry.id ?? "")).filter(Boolean)))
    };
    if (selectionMatchesDeletedHierarchy(selection, refs)) setSelection(null);
    updateWorkspacePrefs((current) => {
      const nextViewStates = Object.fromEntries(Object.entries(current.viewStates ?? {}).filter(([viewId, state]) => !viewStateMatchesDeletedHierarchy(viewId, state as JsonObject, refs)));
      const windows = current.windows
        .map((item) => {
          const tabs = item.tabs.filter((tabId) => {
            const activeTabHasDeletedSelection = item.id === current.activeWindowId && tabId === item.activeViewId && selectionMatchesDeletedHierarchy(selection, refs);
            return !activeTabHasDeletedSelection && !viewStateMatchesDeletedHierarchy(tabId, current.viewStates?.[tabId] as JsonObject | undefined, refs);
          });
          return { ...item, tabs, activeViewId: tabs.includes(item.activeViewId) ? item.activeViewId : tabs[0] ?? "" };
        })
        .filter((item) => item.tabs.length > 0);
      const panes = current.panes.map((item) => {
        const tabs = item.tabs.filter((tabId) => !viewStateMatchesDeletedHierarchy(tabId, current.viewStates?.[tabId] as JsonObject | undefined, refs));
        const nextTabs = tabs.length ? tabs : ["policy-primary"];
        return { ...item, tabs: nextTabs, activeViewId: nextTabs.includes(item.activeViewId) ? item.activeViewId : nextTabs[0] ?? "policy-primary" };
      });
      const rightTabs = current.rightSidebar.tabs.filter((tabId) => !viewStateMatchesDeletedHierarchy(tabId, current.viewStates?.[tabId] as JsonObject | undefined, refs));
      const nextRightTabs = rightTabs.length ? rightTabs : ["global-inspector"];
      const activeWindowId = windows.some((item) => item.id === current.activeWindowId) ? current.activeWindowId : windows[0]?.id ?? "";
      const activePane = panes.find((item) => item.id === current.activePaneId) ?? panes[0];
      return {
        ...current,
        activeWindowId,
        activePaneId: activePane?.id ?? "",
        activeViewId: activePane?.activeViewId ?? "policy-primary",
        maximizedWindowId: current.maximizedWindowId && windows.some((item) => item.id === current.maximizedWindowId) ? current.maximizedWindowId : null,
        windows,
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
  function setWindowTab(windowId: string, viewId: string) {
    restoreViewState(viewId);
    updateWorkspacePrefs((current) => ({ ...captureActiveViewState(current), activeWindowId: windowId, windows: current.windows.map((item) => item.id === windowId ? { ...item, activeViewId: viewId } : item) }));
  }
  function setPaneTab(paneId: string, viewId: string) {
    restoreViewState(viewId);
    updateWorkspacePrefs((current) => ({
      ...captureActiveViewState(current),
      activePaneId: paneId,
      activeViewId: viewId,
      panes: current.panes.map((item) => item.id === paneId ? { ...item, activeViewId: viewId } : item)
    }));
  }
  function activatePane(paneId: string) {
    const viewId = workspacePrefs.panes.find((item) => item.id === paneId)?.activeViewId;
    if (viewId && paneId !== workspacePrefs.activePaneId) restoreViewState(viewId);
    updateWorkspacePrefs((current) => ({ ...captureActiveViewState(current), activePaneId: paneId, activeViewId: viewId ?? current.activeViewId }));
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
    }));
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
  function activateWindow(windowId: string) {
    const viewId = workspacePrefs.windows.find((item) => item.id === windowId)?.activeViewId;
    if (viewId) restoreViewState(viewId);
    updateWorkspacePrefs((current) => ({ ...captureActiveViewState(current), activeWindowId: windowId, windows: current.windows.map((item) => item.id === windowId ? { ...item, zIndex: nextAutomationZIndex(current.windows) } : item) }));
  }
  function togglePageFullscreenWindow(windowItem: AutomationWorkspaceWindow) {
    if ((windowItem.area ?? "main") !== "main") return;
    window.dispatchEvent(new Event("automation-studio:capture-node-viewport"));
    setPageFullscreenWindowId((current) => current === windowItem.id ? null : windowItem.id);
    updateWorkspacePrefs((current) => ({
      ...current,
      activeWindowId: windowItem.id,
      maximizedWindowId: current.maximizedWindowId === windowItem.id ? null : current.maximizedWindowId,
      windows: current.windows.map((item) => item.id === windowItem.id ? { ...item, zIndex: nextAutomationZIndex(current.windows) } : item)
    }));
  }
  function startWindowResize(windowItem: AutomationWorkspaceWindow, edge: AutomationWindowResizeEdge, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const bounds = canvasForArea(windowItem.area ?? "main")?.getBoundingClientRect();
    const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
    const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
    const startWindow = automationWindowToPixels(windowItem, canvasWidth, canvasHeight);
    const startLeft = startWindow.x;
    const startTop = startWindow.y;
    const startWidth = startWindow.widthPx;
    const startHeight = startWindow.heightPx;
    const windowsInArea = workspacePrefs.windows
      .filter((item) => (item.area ?? "main") === (windowItem.area ?? "main"))
      .map((item) => automationWindowToPixels(item, canvasWidth, canvasHeight));
    const sharedPartners = findAutomationSharedResizePartners(startWindow, edge, windowsInArea);
    let latestGeometries: Record<string, AutomationWindowPixelGeometry> = {};
    const onMove = (moveEvent: PointerEvent) => {
      const west = edge.includes("west");
      const east = edge.includes("east");
      const north = edge.includes("north");
      const south = edge.includes("south");
      const deltaX = constrainAutomationResizeDelta(
        moveEvent.clientX - startX,
        "x",
        edge,
        startWindow,
        sharedPartners,
        canvasWidth
      );
      const deltaY = constrainAutomationResizeDelta(
        moveEvent.clientY - startY,
        "y",
        edge,
        startWindow,
        sharedPartners,
        canvasHeight
      );
      const nextX = west ? startLeft + deltaX : startLeft;
      const nextY = north ? startTop + deltaY : startTop;
      const nextWidth = west ? startWidth - deltaX : east ? startWidth + deltaX : startWidth;
      const nextHeight = north ? startHeight - deltaY : south ? startHeight + deltaY : startHeight;
      const partnerGeometry = new Map<string, Partial<AutomationWindowPixelGeometry>>();
      for (const partner of sharedPartners) {
        const geometry = partnerGeometry.get(partner.id) ?? {};
        if (partner.side === "west") {
          geometry.x = partner.start.x + deltaX;
          geometry.widthPx = partner.start.widthPx - deltaX;
        }
        if (partner.side === "east") geometry.widthPx = partner.start.widthPx + deltaX;
        if (partner.side === "north") {
          geometry.y = partner.start.y + deltaY;
          geometry.heightPx = partner.start.heightPx - deltaY;
        }
        if (partner.side === "south") geometry.heightPx = partner.start.heightPx + deltaY;
        partnerGeometry.set(partner.id, geometry);
      }
      latestGeometries = {
        [windowItem.id]: clampAutomationWindowPixelGeometry({
          x: nextX,
          y: nextY,
          widthPx: nextWidth,
          heightPx: nextHeight
        }, canvasWidth, canvasHeight, 240, 210)
      };
      for (const [partnerId, geometry] of partnerGeometry) {
        const start = windowsInArea.find((window) => window.id === partnerId);
        if (!start) continue;
        latestGeometries[partnerId] = clampAutomationWindowPixelGeometry({ ...start, ...geometry }, canvasWidth, canvasHeight, 240, 210);
      }
      scheduleLiveWindowGeometry(latestGeometries);
    };
    const onUp = () => {
      commitWindowPixelGeometries(windowItem.area ?? "main", latestGeometries);
      setLiveWindowGeometries({});
      pendingLiveWindowGeometriesRef.current = {};
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function startWindowMove(windowItem: AutomationWorkspaceWindow, event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;
    event.preventDefault();
    event.stopPropagation();
    activateWindow(windowItem.id);
    if (pageFullscreenWindowId === windowItem.id) {
      window.dispatchEvent(new Event("automation-studio:capture-node-viewport"));
      setPageFullscreenWindowId(null);
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const canvas = canvasForArea(windowItem.area ?? "main");
    const bounds = canvas?.getBoundingClientRect();
    const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
    const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
    const startWindow = automationWindowToPixels(windowItem, canvasWidth, canvasHeight);
    const restored = automationWindowFillsCanvas(startWindow, canvasWidth, canvasHeight)
      ? restoreAutomationWindowFromFullscreen(startWindow, startX - (bounds?.left ?? 0), startY - (bounds?.top ?? 0), canvasWidth, canvasHeight)
      : startWindow;
    const startLeft = restored.x;
    const startTop = restored.y;
    let latestSnap: ReturnType<typeof automationSnapGeometry> | null = null;
    let latestGeometries: Record<string, AutomationWindowPixelGeometry> = restored !== startWindow ? { [windowItem.id]: restored } : {};
    let pendingGeometry = latestGeometries[windowItem.id];
    const applyPendingGeometry = () => {
      windowMoveFrameRef.current = null;
      if (!pendingGeometry) return;
      paintWindowShellGeometry(windowItem.id, pendingGeometry);
    };
    if (pendingGeometry) {
      if (windowMoveFrameRef.current !== null) window.cancelAnimationFrame(windowMoveFrameRef.current);
      windowMoveFrameRef.current = window.requestAnimationFrame(applyPendingGeometry);
    }
    const onMove = (moveEvent: PointerEvent) => {
      latestGeometries = {
        [windowItem.id]: clampAutomationWindowPixelGeometry({
          ...restored,
          x: startLeft + moveEvent.clientX - startX,
          y: startTop + moveEvent.clientY - startY
        }, canvasWidth, canvasHeight)
      };
      pendingGeometry = latestGeometries[windowItem.id];
      if (windowMoveFrameRef.current === null) windowMoveFrameRef.current = window.requestAnimationFrame(applyPendingGeometry);
      latestSnap = automationSnapGeometry(canvasForArea(windowItem.area ?? "main"), moveEvent.clientX, moveEvent.clientY);
      const nextSnapSignature = latestSnap ? `${latestSnap.x}:${latestSnap.y}:${latestSnap.widthPx}:${latestSnap.heightPx}` : "";
      if (snapPreviewSignatureRef.current !== nextSnapSignature) {
        snapPreviewSignatureRef.current = nextSnapSignature;
        setSnapPreview(latestSnap ? { ...latestSnap, area: windowItem.area ?? "main" } : null);
      }
    };
    const onUp = () => {
      const finalGeometries = latestSnap ? { [windowItem.id]: latestSnap } : latestGeometries;
      if (windowMoveFrameRef.current !== null) {
        window.cancelAnimationFrame(windowMoveFrameRef.current);
        windowMoveFrameRef.current = null;
      }
      const finalGeometry = finalGeometries[windowItem.id];
      if (finalGeometry) paintWindowShellGeometry(windowItem.id, finalGeometry);
      commitWindowPixelGeometries(windowItem.area ?? "main", finalGeometries);
      setLiveWindowGeometries({});
      pendingLiveWindowGeometriesRef.current = {};
      snapPreviewSignatureRef.current = "";
      setSnapPreview(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function resetWindowSize(windowId: string) {
    updateWorkspacePrefs((current) => ({
      ...current,
      maximizedWindowId: current.maximizedWindowId === windowId ? null : current.maximizedWindowId,
      windows: current.windows.map((item) => {
        if (item.id !== windowId) return item;
      const bounds = canvasForArea(item.area ?? "main")?.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds?.width ?? 1120));
      const height = Math.max(1, Math.floor(bounds?.height ?? 680));
        return {
          ...item,
          ...automationPixelsToRelativeGeometry({
            x: 0,
            y: 0,
            widthPx: width,
            heightPx: height
          }, width, height),
          zIndex: nextAutomationZIndex(current.windows)
        };
      })
    }));
  }
  function arrangeWindows(preset: AutomationLayoutPreset, area: AutomationWorkspaceArea = "main") {
    const option = automationLayoutPresetOptions.find((item) => item.id === preset) ?? automationLayoutPresetOptions[0]!;
    if (area === "main") {
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
      return;
    }
    updateWorkspacePrefs((current) => {
      const bounds = canvasForArea(area)?.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds?.width ?? 1120));
      const height = Math.max(1, Math.floor(bounds?.height ?? 680));
      const targetWindows = current.windows.filter((item) => (item.area ?? "main") === area).sort((left, right) => left.zIndex - right.zIndex);
      const arranged = new Map(layoutAutomationWindowsInPreset(targetWindows, option, width, height).map((item) => [item.id, item]));
      const windows = current.windows.map((item) => arranged.get(item.id) ?? item);
      return { ...current, maximizedWindowId: null, activeWindowId: windows.at(-1)?.id ?? current.activeWindowId, windows };
    });
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
      const left = startRatios[splitIndex] ?? 0;
      const right = startRatios[splitIndex + 1] ?? 0;
      const pairTotal = left + right;
      const minRatio = Math.min(0.24, Math.max(0.12, pairTotal * 0.22));
      const nextLeft = clampNumber(left + deltaRatio, minRatio, pairTotal - minRatio, left);
      latestRatios = startRatios.map((ratio, index) => {
        if (index === splitIndex) return nextLeft;
        if (index === splitIndex + 1) return pairTotal - nextLeft;
        return ratio;
      });
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
  function renderViewContent(view: AutomationViewInstance, viewActive: boolean) {
    return (
      <AutomationViewRenderer
        entries={selectedTimeline?.timeline ?? selectedRecording?.timeline ?? []}
        models={models}
        notes={selectedRecording?.notes ?? []}
        actionStatus={automationActionStatus}
        policies={policies}
        pipelineArtifacts={pipelineArtifacts}
        policy={view.type === "state" && selection?.kind === "state" && selection.proposalId ? selectedProposal?.policy ?? selectedPolicy : selectedPolicy}
        configs={projectArtifacts.configs ?? []}
        taskGraph={selectedTaskGraph}
        taskGraphDraft={selectedTaskGraphDraft}
        flowEditable={selectedFlowEntry?.source === "canonical"}
        nativeNodeDefinitions={[...nativeNodeDefinitions, ...publishedFlowDefinitions]}
        flowPublications={flowPublications}
        flowDependencyInfo={flowDependencyInfo}
        proposalReview={selectedProposalReview}
        proposalTargetFlowId={proposalTargetFlowId}
        problems={problems}
        projectId={activeProjectId}
        recordings={recordings}
        recordingDomains={recordingDomains}
        runtimeSessions={runtimeSessions}
        indexedStateSources={Object.values(indexedStateSources)}
        stateLoading={view.type === "state" ? pendingStateOpen : null}
        dockTab={dockTab}
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
        onOpenPipeline={openRecordingProposal}
        onOpenProposal={openRecordingProposal}
        onOpenProposalGenerator={openRecordingProposalGenerator}
        onOpenRecording={openRecordingTimeline}
        onOpenState={openStateView}
        onAppendRecordingMarker={appendProjectRecordingMarker}
        onAppendRecordingNote={appendProjectRecordingNote}
        onNormalizeRecording={normalizeProjectRecording}
        onPipelineAction={runRecordingPipelineStep}
        onProposalReviewChange={updateProposalReview}
        onSaveTaskGraph={saveSelectedTaskGraph}
        onTaskGraphDraftChange={updateSelectedTaskGraphDraft}
        onPublishFlow={publishSelectedFlow}
        onDeprecateFlow={deprecateSelectedFlow}
        onTaskGraphDirtyChange={setHasDirtyTaskGraph}
        onProcessFinalizedRecording={processFinalizedRecording}
        onGenerateDirectProposal={generateDirectProposal}
        onGenerateAssistedProposal={generateAssistedProposal}
        onRunRecordingPipeline={runRecordingPipeline}
        onProcessProposalWithLlm={processPipelineProposalWithLlm}
        onRefreshRecordings={async () => {
          await refreshProjectRuntimeState(activeProjectId);
        }}
        onUpdateRecording={updateProjectRecording}
        setDockTab={setDockTabAndPersist}
        setSelection={setSelectionAndFollow}
      />
    );
  }
  function requestHierarchyAction(action: NonNullable<AutomationHierarchyAction>) {
    setHierarchyAction(action);
    if (action.action === "create") {
      const parent = action.parentId ? hierarchyNodes.find((node) => node.id === action.parentId) : null;
      const category = action.category ?? parent?.category ?? "flow";
      setHierarchyCreateStep("type");
      setHierarchyCategory(category);
      setHierarchyKind(category === "flow" ? "flow" : "folder");
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
        await refreshProjectRuntimeState(activeProjectId);
        setSelection({ kind: "flow", id: createdFlow.flowId });
        openView("policy-primary", "preview", "main");
        setHierarchyStatus(`${label} saved.`);
      } else {
        const id = `custom-${hierarchyKind}-${Date.now()}`;
        setCustomHierarchyNodes((items) => [...items, {
          id,
          kind: hierarchyKind,
          category: hierarchyCategory,
          label,
          parentId: hierarchyParentId
        }]);
        setHierarchyStatus(`${label} created.`);
      }
    }
    if (hierarchyAction.action === "delete" && hierarchyAction.node) {
      const ids = collectHierarchyDescendantIds(hierarchyAction.node.id, hierarchyNodes);
      const deletingNodes = [hierarchyAction.node, ...ids.map((id) => hierarchyNodes.find((node) => node.id === id)).filter((node): node is AutomationHierarchyNode => Boolean(node))];
      const recordingIds = deletingNodes
        .filter((node) => node.kind === "recording" && node.sourceId)
        .map((node) => node.sourceId!);
      if (hierarchyAction.node.category === "recording" && recordingIds.length) {
        setHierarchyStatus(`Deleting ${recordingIds.length} recording${recordingIds.length === 1 ? "" : "s"}...`);
        const deleted = await deleteProjectRecordings(recordingIds, hierarchyPin);
        if (!deleted) return;
        setDeletedHierarchyIds((items) => items.filter((id) => !id.startsWith("recordings-client-") && !recordingIds.includes(id)));
        setCustomHierarchyNodes((items) => items.filter((item) => item.id !== hierarchyAction.node!.id && !ids.includes(item.id)));
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
        await refreshProjectRuntimeState(activeProjectId);
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
        await refreshProjectRuntimeState(activeProjectId);
        const deletedTaskIds = new Set(artifactNodes.filter((node) => node.kind === "task").map((node) => node.sourceId));
        if (selection?.kind === "policy" && deletedTaskIds.has(selection.id)) {
          const nextTask = (projectArtifacts.tasks ?? []).find((task: any) => !deletedTaskIds.has(task.taskId));
          setSelection(nextTask ? { kind: "policy", id: nextTask.taskId } : null);
        }
      }
      const artifactNodeIds = new Set([...artifactNodes, ...flowNodes].map((node) => node.id));
      const hierarchyOnlyDeletedIds = [hierarchyAction.node.id, ...ids].filter((id) => !artifactNodeIds.has(id));
      if (hierarchyOnlyDeletedIds.length) setDeletedHierarchyIds((items) => [...new Set([...items, ...hierarchyOnlyDeletedIds])]);
      setCustomHierarchyNodes((items) => items.filter((item) => item.id !== hierarchyAction.node!.id && !ids.includes(item.id)));
      setHierarchyStatus(`${hierarchyAction.node.label} deleted.`);
    }
    setHierarchyAction(null);
    setHierarchyPin("");
    setHierarchyName("");
  }

  const renderBottomTimelineDock = () => {
    const collapsed = workspacePrefs.bottomTimelineCollapsed;
    return (
      <section className={collapsed ? "automation-bottom-timeline-region collapsed" : "automation-bottom-timeline-region"}>
        <button className="automation-section-resize-handle bottom" disabled={collapsed} onPointerDown={startBottomTimelineResize} title="Resize timeline" aria-label="Resize timeline" type="button" />
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

  const renderWorkspaceArea = (area: AutomationWorkspaceArea, label: string, ref: RefObject<HTMLDivElement | null>) => {
    if (area === "main") {
      const paneCount = automationMainPaneCount(workspacePrefs.mainLayoutPreset);
      const panes = workspacePrefs.panes.slice(0, paneCount);
      const ratiosSource = liveMainSplitRatios ?? workspacePrefs.mainSplitRatios;
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
        <section className="automation-workspace-section main strict">
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
                  <div className="automation-pane-slot" key={pane.id}>
                    <AutomationViewContainer
                      active={workspacePrefs.activePaneId === pane.id}
                      activeViewId={pane.activeViewId}
                      canPageFullscreen={false}
                      frameLabel="Pane"
                      icon={view.icon}
                      movable={false}
                      pageFullscreen={false}
                      resizable={false}
                      showResetSize={false}
                      tabs={tabViews}
                      windowId={pane.id}
                      windowIndex={paneIndex}
                      subtitle={view.label}
                      title={viewTitle(view)}
                      onActivate={() => activatePane(pane.id)}
                      onClose={() => closePaneTab(pane.id, pane.activeViewId)}
                      onCloseTab={(viewId) => closePaneTab(pane.id, viewId)}
                      onAddTab={(event) => toggleWindowAdder("main", event, pane.id)}
                      onTabDragStart={(viewId, event) => startPaneTabDrag(pane.id, viewId, event)}
                      onTabDrop={(viewId, placement, event) => dropPaneTab(pane.id, viewId, placement, event)}
                      onMoveStart={() => undefined}
                      onPageFullscreen={() => undefined}
                      onResetSize={() => undefined}
                      onResizeStart={() => undefined}
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
                  onPointerDown={(event) => startMainSplitResize(handle.index, event)}
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
        <section className="automation-workspace-section right strict">
          <button className="automation-section-resize-handle right" onPointerDown={(event) => startWorkspaceSectionResize("right", event)} title="Resize right area" aria-label="Resize right area" type="button" />
          <header className="automation-workspace-section-header">
            <div className="automation-workspace-section-actions">
              <button
                className="icon-button"
                onClick={() => updateWorkspacePrefs((current) => ({
                  ...current,
                  rightSidebarCollapsed: !current.rightSidebarCollapsed,
                  rightSidebar: { ...current.rightSidebar, collapsed: !current.rightSidebarCollapsed }
                }))}
                title={workspacePrefs.rightSidebarCollapsed ? "Expand right area" : "Collapse right area"}
                aria-label={workspacePrefs.rightSidebarCollapsed ? "Expand right area" : "Collapse right area"}
                type="button"
              >{workspacePrefs.rightSidebarCollapsed ? <ChevronLeft size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}</button>
              <div className="automation-window-adder-anchor area-right">
                <button className="icon-button" onClick={(event) => toggleWindowAdder(area, event, "right-sidebar")} title="Add sidebar tab" aria-label="Add sidebar tab" type="button"><Plus size={13} aria-hidden /></button>
              </div>
            </div>
          </header>
          {!workspacePrefs.rightSidebarCollapsed && view ? <div className="automation-dock-layout" ref={ref}>
            <div className="automation-pane-slot">
              <AutomationViewContainer
                active
                activeViewId={activeRightViewId}
                canPageFullscreen={false}
                frameLabel="Sidebar"
                icon={view.icon}
                movable={false}
                pageFullscreen={false}
                resizable={false}
                showResetSize={false}
                tabs={tabViews}
                windowId="right-sidebar"
                windowIndex={0}
                subtitle={view.label}
                title={viewTitle(view)}
                onActivate={() => undefined}
                onClose={() => closeRightSidebarTab(activeRightViewId)}
                onCloseTab={closeRightSidebarTab}
                onAddTab={(event) => toggleWindowAdder("right", event, "right-sidebar")}
                onMoveStart={() => undefined}
                onPageFullscreen={() => undefined}
                onResetSize={() => undefined}
                onResizeStart={() => undefined}
                onTabSelect={setRightSidebarTab}
              >
                {renderViewContent(view, true)}
              </AutomationViewContainer>
            </div>
          </div> : null}
        </section>
      );
    }
    const areaWindows = windowsByArea(area);
    return (
      <section className={`automation-workspace-section ${area}`}>
        {area === "right" ? <button className="automation-section-resize-handle right" onPointerDown={(event) => startWorkspaceSectionResize("right", event)} title="Resize right area" aria-label="Resize right area" type="button" /> : null}
        <header className="automation-workspace-section-header">
          <div className="automation-workspace-section-actions">
            {area === "right" ? <button
              className="icon-button"
              onClick={() => updateWorkspacePrefs((current) => ({ ...current, rightSidebarCollapsed: !current.rightSidebarCollapsed }))}
              title={workspacePrefs.rightSidebarCollapsed ? "Expand right area" : "Collapse right area"}
              aria-label={workspacePrefs.rightSidebarCollapsed ? "Expand right area" : "Collapse right area"}
              type="button"
            >{workspacePrefs.rightSidebarCollapsed ? <ChevronLeft size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}</button> : null}
            <button className="icon-button" onClick={(event) => toggleLayoutPicker(area, event)} title={`Arrange ${label}`} aria-label={`Arrange ${label}`} type="button"><Columns3 size={13} aria-hidden /></button>
            <div className={`automation-window-adder-anchor area-${area}`}>
              <button className="icon-button" onClick={(event) => toggleWindowAdder(area, event)} title={`Add window to ${label}`} aria-label={`Add window to ${label}`} type="button"><Plus size={13} aria-hidden /></button>
            </div>
          </div>
        </header>
        <div
          className={workspacePrefs.maximizedWindowId ? "automation-dock-layout maximized" : "automation-dock-layout"}
          ref={ref}
        >
          <div className="automation-window-canvas">
            {areaWindows.map((windowItem, windowIndex) => {
              const baseView = viewById.get(windowItem.activeViewId) ?? viewById.get("policy-primary");
              if (!baseView) return null;
              const savedActiveSelection = workspacePrefs.viewStates?.[windowItem.activeViewId]?.selection;
              const activeTitleSelection = workspacePrefs.activeWindowId === windowItem.id
                ? selection
                : isAutomationSelection(savedActiveSelection) ? savedActiveSelection : null;
              const view = viewWithTitleData(baseView, activeTitleSelection);
              const tabViews = windowItem.tabs
                .map((tabId) => {
                  const tabView = viewById.get(tabId);
                  if (!tabView) return null;
                  const savedTabSelection = workspacePrefs.viewStates?.[tabId]?.selection;
                  const tabTitleSelection = tabId === windowItem.activeViewId
                    ? activeTitleSelection
                    : isAutomationSelection(savedTabSelection) ? savedTabSelection : null;
                  return viewWithTitleData(tabView, tabTitleSelection);
                })
                .filter(Boolean) as AutomationViewInstance[];
              const isPageFullscreenWindow = pageFullscreenWindowId === windowItem.id && (windowItem.area ?? "main") === "main";
              const bounds = canvasForArea(area)?.getBoundingClientRect();
              const renderedWindow = automationWindowToPixels(
                windowItem,
                Math.max(1, Math.floor(bounds?.width ?? 1120)),
                Math.max(1, Math.floor(bounds?.height ?? 680)),
                1,
                1
              );
              const liveGeometry = liveWindowGeometries[windowItem.id];
              return (
                <div
                  className="automation-window-shell"
                  data-automation-window-id={windowItem.id}
                  key={windowItem.id}
                  ref={(element) => setWindowShellRef(windowItem.id, element)}
                  style={workspacePrefs.maximizedWindowId || isPageFullscreenWindow ? { inset: 0, zIndex: windowItem.zIndex } : { left: liveGeometry?.x ?? renderedWindow.x, top: liveGeometry?.y ?? renderedWindow.y, width: liveGeometry?.widthPx ?? renderedWindow.widthPx, height: liveGeometry?.heightPx ?? renderedWindow.heightPx, zIndex: windowItem.zIndex }}
                >
                  <AutomationViewContainer
                    active={workspacePrefs.activeWindowId === windowItem.id}
                    activeViewId={windowItem.activeViewId}
                    canPageFullscreen={(windowItem.area ?? "main") === "main"}
                    icon={view.icon}
                    pageFullscreen={isPageFullscreenWindow}
                    tabs={tabViews}
                    windowId={windowItem.id}
                    windowIndex={windowIndex}
                    subtitle={view.label}
                    title={viewTitle(view)}
                    onActivate={() => activateWindow(windowItem.id)}
                    onClose={() => closeWindow(windowItem.id)}
                    onCloseTab={(viewId) => closeWindowTab(windowItem.id, viewId)}
                    onAddTab={(event) => toggleWindowAdder(windowItem.area ?? "main", event, windowItem.id)}
                    onMoveStart={(event) => startWindowMove(windowItem, event)}
                    onPageFullscreen={() => togglePageFullscreenWindow(windowItem)}
                    onResetSize={() => resetWindowSize(windowItem.id)}
                    onResizeStart={(edge, event) => startWindowResize(windowItem, edge, event)}
                    onTabSelect={(viewId) => setWindowTab(windowItem.id, viewId)}
                  >
                    {renderViewContent(view, workspacePrefs.activeWindowId === windowItem.id && windowItem.activeViewId === view.id)}
                  </AutomationViewContainer>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
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
              <span>No project open</span>
            </div>
            <div className="automation-studio-context">
              <button className="button" onClick={() => { setProjectsLoaded(false); void refreshProjects(); }} type="button">Refresh</button>
              <button className="button" onClick={() => beginProjectModal("create-category")} type="button">New Category</button>
              <button className="button button-primary" onClick={() => beginProjectModal("create")} type="button">New Project</button>
            </div>
          </header>
          <main className="automation-project-gate">
            <section className="automation-project-browser">
              <FolderOpen size={34} aria-hidden />
              <div>
                <strong>Projects</strong>
                <span>Automation Studio projects save hierarchy, editor layout, routines, tasks, and configurations together.</span>
              </div>
              <StatusText value={projectStatus} />
              <div className="automation-project-grid">
                {projectsLoaded ? projectGridSections(projects, projectCategories).map((section) => (
                  <section
                    className={dragOverCategoryId === section.id ? "automation-project-category-section drag-over" : "automation-project-category-section"}
                    key={section.id}
                    onDragLeave={() => setDragOverCategoryId(null)}
                    onDragOver={(event) => { event.preventDefault(); setDragOverCategoryId(section.id); }}
                    onDrop={(event) => handleCategoryDrop(event, section.category?.id ?? null)}
                  >
                    <header
                      draggable={Boolean(section.category)}
                      onDragStart={(event) => {
                        if (!section.category) return;
                        event.dataTransfer.setData("application/x-fluxiq-project-category", section.category.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <div><strong>{section.category ? <GripVertical size={13} aria-hidden /> : null}{section.name}</strong><span>{section.projects.length} project{section.projects.length === 1 ? "" : "s"}</span></div>
                      <div className="inline-actions">
                        <button className="icon-button" onClick={() => beginProjectModal("create", undefined, section.category ?? undefined)} title={`Create project in ${section.name}`} aria-label={`Create project in ${section.name}`} type="button"><Plus size={13} aria-hidden /></button>
                        {section.category ? <>
                        <button className="icon-button" onClick={() => beginProjectModal("rename-category", undefined, section.category ?? undefined)} title={`Rename ${section.name}`} aria-label={`Rename ${section.name}`} type="button"><SlidersHorizontal size={13} aria-hidden /></button>
                        <button className="icon-button" onClick={() => beginProjectModal("delete-category", undefined, section.category ?? undefined)} title={`Delete ${section.name}`} aria-label={`Delete ${section.name}`} type="button"><Trash2 size={13} aria-hidden /></button>
                        </> : null}
                      </div>
                    </header>
                    <div className="automation-project-tile-grid">
                      {section.projects.map((project) => (
                        <article
                          className="automation-project-tile"
                          draggable
                          key={project.id}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            event.dataTransfer.setData("application/x-fluxiq-project", project.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                        >
                          <button className="project-tile-main" onClick={() => void openProject(project.id)} type="button">
                            <span className="project-tile-icon"><FolderOpen size={18} aria-hidden /></span>
                            <strong>{project.name}</strong>
                            <small>{project.description || "No description"}</small>
                            <span>Updated {formatTime(project.updatedAt)}</span>
                          </button>
                          <div className="project-tile-actions">
                            <button className="icon-button" onClick={() => beginProjectModal("rename", project)} title={`Rename ${project.name}`} aria-label={`Rename ${project.name}`} type="button"><SlidersHorizontal size={13} aria-hidden /></button>
                            <button className="icon-button" onClick={() => beginProjectModal("delete", project)} title={`Delete ${project.name}`} aria-label={`Delete ${project.name}`} type="button"><Trash2 size={13} aria-hidden /></button>
                          </div>
                        </article>
                      ))}
                      {!section.projects.length ? <div className="automation-project-empty compact"><span>No projects in this category.</span></div> : null}
                    </div>
                  </section>
                )) : null}
                {!projectsLoaded ? <div className="automation-project-empty"><strong>Loading projects...</strong><span>Reading Automation Studio projects from .fluxiq.</span></div> : null}
                {projectsLoaded && !projects.length && !projectCategories.length ? <div className="automation-project-empty"><strong>No saved projects yet.</strong><span>Create a project to start building tasks, routines, and configurations.</span></div> : null}
              </div>
            </section>
          </main>
        </div>
        {projectModal ? <AutomationProjectModalView categoryName={categoryName} categoryTarget={categoryTarget} currentUser={currentUser} description={projectDescription} mode={projectModal} name={projectName} pin={projectPin} projectTarget={projectTarget} status={projectStatus} onCategoryNameChange={setCategoryName} onClose={() => setProjectModal(null)} onCreate={() => void createProject()} onCreateCategory={() => void createCategory()} onDelete={() => void deleteProject()} onDeleteCategory={() => void deleteCategory()} onDescriptionChange={setProjectDescription} onMove={() => void moveProject()} onMoveCategory={() => void moveCategory()} onNameChange={setProjectName} onPinChange={(value) => setProjectPin(digits(value))} onRename={() => void renameProject()} onRenameCategory={() => void renameCategory()} /> : null}
      </section>
    );
  }

  return (
    <section
      className={`automation-studio-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${pageFullscreenWindowId ? " page-window-fullscreen" : ""}`}
      style={{ gridTemplateColumns: `${sidebarCollapsed ? 48 : workspacePrefs.sidebarWidth}px minmax(0, 1fr)` }}
    >
      <aside className="automation-studio-sidebar">
        <div className="automation-studio-sidebar-heading">
          {!sidebarCollapsed ? <strong>{activeProject.name}</strong> : null}
          <div className="inline-actions">
            <button className="icon-button" onClick={() => setSidebarCollapsed((value) => !value)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} type="button">{sidebarCollapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronLeft size={14} aria-hidden />}</button>
          </div>
        </div>
        {!sidebarCollapsed ? <div className="automation-tree-search">
          <Search size={14} aria-hidden />
          <input aria-label="Search project" onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search project" value={projectSearch} />
          <select aria-label="Filter project type" onChange={(event) => setProjectTypeFilter(event.target.value as typeof projectTypeFilter)} value={projectTypeFilter}>
            <option value="all">All</option>
            <option value="folder">Folders</option>
            <option value="recording">Recordings</option>
            <option value="proposal">Proposals</option>
          </select>
        </div> : null}
        {!sidebarCollapsed ? <AutomationProjectTree
          nodes={hierarchyNodes}
          activeViewId={activeViewId}
          selection={selection}
          recordingPrimaryKind={recordingTreePrimaryKind}
          setRecordingPrimaryKind={setRecordingTreePrimaryKind}
          search={projectSearch}
          typeFilter={projectTypeFilter}
          setSelection={setSelection}
          openView={openView}
          requestAction={requestHierarchyAction}
        /> : null}
      </aside>

      <div className="automation-studio-main">
        <header className="automation-studio-workbar">
          <div className="automation-workspace-actions">
            <button className="button" onClick={closeProject} type="button"><FolderOpen size={14} aria-hidden />Back to Projects</button>
            <span>{workspacePrefs.windows.length} window{workspacePrefs.windows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="automation-studio-context">
            <div className="automation-preferences-anchor">
              <button className="button" onClick={() => setPreferencesOpen(!preferencesOpen)} type="button"><SlidersHorizontal size={14} aria-hidden />Preferences</button>
              {preferencesOpen ? <AutomationWorkspacePreferences prefs={workspacePrefs} setPrefs={updateWorkspacePrefs} /> : null}
            </div>
          </div>
        </header>

        <section
          className={`automation-studio-workspace${workspacePrefs.rightSidebarCollapsed ? " right-collapsed" : ""}${pageFullscreenWindowId ? " page-window-fullscreen" : ""}`}
          style={{
            gridTemplateColumns: `minmax(0, 1fr) ${workspacePrefs.rightSidebarCollapsed ? 38 : (liveInspectorWidth ?? workspacePrefs.inspectorWidth)}px`,
            gridTemplateRows: pageFullscreenWindowId ? "minmax(0, 1fr)" : `minmax(0, 1fr) ${workspacePrefs.bottomTimelineCollapsed ? 38 : (liveBottomTimelineHeight ?? workspacePrefs.bottomTimelineHeight)}px`
          }}
        >
          {renderWorkspaceArea("main", "Main", mainWorkspaceCanvasRef)}
          {renderWorkspaceArea("right", "Right Sidebar", rightWorkspaceCanvasRef)}
          {!pageFullscreenWindowId ? renderBottomTimelineDock() : null}
        </section>
      </div>
      {hierarchyAction ? <Modal title={hierarchyAction.action === "create" && hierarchyCreateStep === "type" ? "Add To Hierarchy" : "Authorize Hierarchy Change"} onClose={() => setHierarchyAction(null)}>
        {hierarchyAction.action === "create" && hierarchyCreateStep === "type" ? <>
          <div className="automation-create-type-grid" role="list" aria-label="Choose item type">
            {[
              { kind: "folder" as const, label: "Folder", icon: FolderPlus, detail: `Add a container inside ${automationHierarchyCategoryLabel(hierarchyCategory)}.` },
              hierarchyCategory === "flow" ? { kind: "flow" as const, label: "Flow", icon: GitBranch, detail: "Add a visual, recorded, or programmatic flow." } : null
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
                  <Icon size={18} aria-hidden />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>
              );
            })}
          </div>
          <div className="modal-actions"><button className="button" onClick={() => setHierarchyAction(null)} type="button">Cancel</button></div>
        </> : <>
          <VisualAlert tone="warning" title="PIN required" message={`${hierarchyAction.action === "create" ? `Creating a ${hierarchyKind}` : "Deleting hierarchy items"} is privileged and requires your PIN.`} />
          {hierarchyAction.action === "create" ? <>
            <Field label="Name"><input autoFocus value={hierarchyName} onChange={(event) => setHierarchyName(event.target.value)} /></Field>
            {hierarchyKind === "flow" ? <Field label="Flow preset"><select value={hierarchyFlowOrigin} onChange={(event) => setHierarchyFlowOrigin(event.target.value as AutomationFlowPreset)}><option value="blank">Blank visual Flow</option><option value="deterministic">Deterministic workflow</option><option value="recorded">Recorded automation</option><option value="integration">Integration Flow</option><option value="scheduled">Scheduled Flow</option><option value="api-endpoint">API endpoint</option><option value="reusable">Reusable component</option></select></Field> : null}
            <Field label="Location"><select value={hierarchyParentId ?? ""} onChange={(event) => setHierarchyParentId(event.target.value || null)}><option value="">{automationHierarchyCategoryLabel(hierarchyCategory)}</option>{folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}</select></Field>
            <KeyValue rows={[["Type", hierarchyKind], ["Tree", automationHierarchyCategoryLabel(hierarchyCategory)], ["Parent", folderOptions.find((folder) => folder.id === hierarchyParentId)?.label ?? automationHierarchyCategoryLabel(hierarchyCategory)]]} />
          </> : null}
          {hierarchyAction.action === "delete" && hierarchyAction.node ? <KeyValue rows={[["Action", "delete"], ["Item", hierarchyAction.node.label], ["Type", hierarchyAction.node.kind], ["User", currentUser.displayName]]} /> : null}
          <Field label="PIN"><input autoFocus inputMode="numeric" value={hierarchyPin} onChange={(event) => setHierarchyPin(digits(event.target.value))} /></Field>
          <StatusText value={hierarchyStatus} />
          <div className="modal-actions">
            {hierarchyAction.action === "create" ? <button className="button" onClick={() => setHierarchyCreateStep("type")} type="button">Back</button> : null}
            <button className="button" onClick={() => setHierarchyAction(null)} type="button">Cancel</button>
            <button className="button button-primary" disabled={hierarchyPin.length < 4 || (hierarchyAction.action === "create" && !hierarchyName.trim())} onClick={confirmHierarchyAction} type="button">{hierarchyAction.action === "create" ? `Create ${hierarchyKind}` : "Delete"}</button>
          </div>
        </>}
      </Modal> : null}
      {projectModal ? <AutomationProjectModalView categoryName={categoryName} categoryTarget={categoryTarget} currentUser={currentUser} description={projectDescription} mode={projectModal} name={projectName} pin={projectPin} projectTarget={projectTarget} status={projectStatus} onCategoryNameChange={setCategoryName} onClose={() => setProjectModal(null)} onCreate={() => void createProject()} onCreateCategory={() => void createCategory()} onDelete={() => void deleteProject()} onDeleteCategory={() => void deleteCategory()} onDescriptionChange={setProjectDescription} onMove={() => void moveProject()} onMoveCategory={() => void moveCategory()} onNameChange={setProjectName} onPinChange={(value) => setProjectPin(digits(value))} onRename={() => void renameProject()} onRenameCategory={() => void renameCategory()} /> : null}
      {windowAdderOpen ? <AutomationWindowAdderPalette area={windowAdderOpen.area} anchor={windowAdderOpen.anchor} {...(windowAdderOpen.targetWindowId ? { targetWindowId: windowAdderOpen.targetWindowId } : {})} views={viewInstances} onAdd={addWorkspaceWindow} /> : null}
      {layoutPickerOpen ? <AutomationLayoutPicker area={layoutPickerOpen.area} anchor={layoutPickerOpen.anchor} onArrange={arrangeWindows} /> : null}
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

function flowSummariesToCatalogEntries(summaries: any[]): any[] {
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
      metadata: { summaryOnly: true, ...(summary.recordingProposalIds ? { recordingProposalIds: summary.recordingProposalIds } : {}) }
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

function isAutomationDockTab(value: unknown): value is AutomationDockTab {
  return value === "assistant" || value === "problems" || value === "history" || value === "state";
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

function stateOpenNodeMetadata(nodeId: string | undefined, selectedNode: any): Record<string, unknown> | null {
  if (!selectedNode || typeof selectedNode !== "object" || Array.isArray(selectedNode)) return null;
  if (nodeId && typeof selectedNode.id === "string" && selectedNode.id !== nodeId) return null;
  const metadata = selectedNode.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : null;
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

function pipelineActionRunningMessage(endpoint: string): string {
  if (endpoint === "mine-recording-evidence") return "Mining evidence: writing facts, observations, correlations, and claims...";
  if (endpoint === "propose-policy-from-model") return "Creating proposal from mined evidence...";
  if (endpoint === "approve-policy-proposal") return "Applying proposal...";
  return "Running pipeline action...";
}

function isProposalGenerationEndpoint(endpoint: string): boolean {
  return endpoint === "process-finalized-recording"
    || endpoint === "normalize-recording"
    || endpoint === "create-normalization-review"
    || endpoint === "mine-recording-evidence"
    || endpoint === "learn-task-model"
    || endpoint === "propose-policy-from-model"
    || endpoint === "create-recording-flow-proposals";
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

function taskGraphDraftKey(graph: any): string {
  if (!graph) return "";
  const id = graph.flowId ?? graph.graphId ?? graph.taskId ?? "";
  if (!id) return "";
  const shape = JSON.stringify({
    nodes: (graph.nodes ?? []).map((node: any) => ({ id: node.id, definitionId: node.definitionId, label: node.label, position: node.position, parameterValues: node.parameterValues })),
    edges: (graph.edges ?? []).map((edge: any) => ({ id: edge.id, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, sourcePortId: edge.sourcePortId, targetPortId: edge.targetPortId, label: edge.label }))
  });
  return `${id}:${graph.updatedAt ?? graph.createdAt ?? graph.metadata?.savedAt ?? "draft"}:${stableStringHash(shape)}`;
}

function stableStringHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash.toString(36);
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
