"use client";

import { AlertTriangle, Blocks, Bug, ChevronLeft, ChevronRight, Columns3, FolderOpen, FolderPlus, GitBranch, GripVertical, History, ListChecks, Network, Plus, Radio, Search, SlidersHorizontal, Sparkles, Trash2, Workflow } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import {
  automationHierarchyCategories,
  automationHierarchyCategoryLabel,
  automationHierarchySignature,
  collectHierarchyDescendantIds,
  proposalHierarchyNodes,
  recordingHierarchyNodes,
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
  automationPixelsToRelativeGeometry,
  automationRangesOverlap,
  automationSnapGeometry,
  automationWindowFillsCanvas,
  automationWindowGeometrySignature,
  automationWindowToPixels,
  clampAutomationWindowPixelGeometry,
  clampNumber,
  constrainAutomationResizeDelta,
  defaultAutomationWorkspacePrefs,
  defaultAutomationWorkspaceWindows,
  findAutomationSharedResizePartners,
  fullAutomationWindowGeometry,
  layoutAutomationWindowsInPreset,
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
import { createStudioSmokeFlow } from "./runtime/smoke-flow";
import { createManualRoutineId, createManualTaskId, flowToTaskPolicy, graphToTaskFlow, isPersistableHierarchyNode, mergeById, taskFlowId } from "./model/project-artifacts";
import { useProgramApi, type JsonObject } from "../programs/program-api";
import type { CurrentUser } from "../programs/types";
import {
  Field,
  KeyValue,
  Modal,
  StatusText,
  VisualAlert
} from "../programs/shared-ui";

type TabButton<T extends string> = { id: T; label: string; count?: number };

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
  const [runtimeSessions, setRuntimeSessions] = useState<any[]>([]);
  const [pipelineArtifacts, setPipelineArtifacts] = useState<any>({ normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [], stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
  const [recordingDomains, setRecordingDomains] = useState<any[]>([]);
  const [automationActionStatus, setAutomationActionStatus] = useState("");
  const [projects, setProjects] = useState<AutomationStudioProject[]>([]);
  const [projectCategories, setProjectCategories] = useState<AutomationStudioProjectCategory[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
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
  const [workspacePrefs, setWorkspacePrefs] = useState<AutomationWorkspacePrefs>({
    windows: defaultAutomationWorkspaceWindows(),
    activeWindowId: "window-policy",
    maximizedWindowId: null,
    sidebarWidth: 280,
    inspectorWidth: 320,
    utilityWindowsMigrated: true,
    rightSidebarCollapsed: false,
    viewStates: {}
  });
  const [dockTab, setDockTab] = useState<AutomationDockTab>("assistant");
  const [liveWindowGeometries, setLiveWindowGeometries] = useState<Record<string, AutomationWindowPixelGeometry>>({});
  const [liveInspectorWidth, setLiveInspectorWidth] = useState<number | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [windowAdderOpen, setWindowAdderOpen] = useState<AutomationWindowAdderState | null>(null);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState<AutomationLayoutPickerState | null>(null);
  const [snapPreview, setSnapPreview] = useState<(NonNullable<ReturnType<typeof automationSnapGeometry>> & { area: AutomationWorkspaceArea }) | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pageFullscreenWindowId, setPageFullscreenWindowId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | AutomationHierarchyKind>("all");
  const [selection, setSelection] = useState<AutomationSelection | null>(null);
  const [recordingTreePrimaryKind, setRecordingTreePrimaryKind] = useState<"recording" | "proposal" | null>(null);
  const [recordingProcessing, setRecordingProcessing] = useState<RecordingProcessingStatus | null>(null);
  const [gatewaySnapshot, setGatewaySnapshot] = useState<any>({ enabled: false, sessions: [], pairings: [], auditLog: [] });
  const [recordingBlockedAlert, setRecordingBlockedAlert] = useState<{ message: string; clientId?: string; timestamp: number } | null>(null);
  const [hierarchyAction, setHierarchyAction] = useState<AutomationHierarchyAction>(null);
  const [hierarchyCreateStep, setHierarchyCreateStep] = useState<"type" | "details">("type");
  const [hierarchyPin, setHierarchyPin] = useState("");
  const [hierarchyName, setHierarchyName] = useState("");
  const [hierarchyKind, setHierarchyKind] = useState<AutomationCreatableHierarchyKind>("task");
  const [hierarchyCategory, setHierarchyCategory] = useState<AutomationHierarchyCategory>("task");
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
  const windowShellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingLiveWindowGeometriesRef = useRef<Record<string, AutomationWindowPixelGeometry>>({});
  const liveWindowGeometryFrameRef = useRef<number | null>(null);
  const windowMoveFrameRef = useRef<number | null>(null);
  const snapPreviewSignatureRef = useRef("");

  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  const refreshProjectData = useCallback(async (projectId: string) => {
    const [recordingResult, timelineResult, runtimeResult] = await Promise.all([
      api.post<{ recordings: any[] }>("list-recordings", { projectId }),
      api.post<{ normalizedTimelines: any[] }>("list-normalized-timelines", { projectId }),
      api.post<{ runtimeSessions: any[] }>("list-runtime-sessions", { projectId })
    ]);
    if (recordingResult.ok) setProjectRecordings(recordingResult.payload?.recordings ?? []);
    if (timelineResult.ok) setProjectTimelines(timelineResult.payload?.normalizedTimelines ?? []);
    if (runtimeResult.ok) setRuntimeSessions(runtimeResult.payload?.runtimeSessions ?? []);
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
  const policies: any[] = canonical.policyGraphs ?? [];
  const problems = snapshot?.payload?.problems ?? [];
  const signals = registries.flatMap((registry: any) => (registry.definitions ?? []).map((signal: any) => ({ ...signal, registryId: registry.registryId })));
  const projectTasks = projectArtifacts.tasks ?? [];
  const projectRoutines = projectArtifacts.routines ?? [];
  const proposalViewState = workspacePrefs.viewStates?.["proposal-workbench"] ?? {};
  const proposalReviewsSource = proposalViewState.proposalReviews;
  const proposalReviews = proposalReviewsSource && typeof proposalReviewsSource === "object" && !Array.isArray(proposalReviewsSource) ? proposalReviewsSource as Record<string, any> : {};
  const lastOpenTaskId = typeof proposalViewState.lastOpenTaskId === "string" ? proposalViewState.lastOpenTaskId : null;
  const validLastOpenTask = lastOpenTaskId ? projectTasks.find((task: any) => task.taskId === lastOpenTaskId) : null;
  const selectedProposal = proposals.find((proposal: any) => selection?.kind === "proposal" && proposal.proposalId === selection.id)
    ?? proposals.find((proposal: any) => selection?.kind === "recording" && proposal.metadata?.recordingId === selection.id)
    ?? proposals[0];
  const selectedTask = projectTasks.find((task: any) => selection?.kind === "policy" && (task.metadata?.policyId === selection.id || task.taskId === selection.id))
    ?? validLastOpenTask
    ?? projectTasks[0]
    ?? null;
  const selectedTaskFlow = selectedTask
    ? (projectArtifacts.flows ?? []).find((flow: any) => (selectedTask.graphId || selectedTask.policyFlowId) && flow.flowId === (selectedTask.graphId ?? selectedTask.policyFlowId))
      ?? (projectArtifacts.flows ?? []).find((flow: any) => flow.ownerKind === "task" && flow.ownerId === selectedTask.taskId)
      ?? null
    : null;
  const selectedTaskGraph = selectedTask?.graph ?? selectedTaskFlow;
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
    : null;
  const proposalSelectionRecordingId = selection?.kind === "proposal" ? selection.recordingId ?? selectedProposal?.metadata?.recordingId : null;
  const selectedRecording = recordings.find((recording: any) => selection?.kind === "recording" ? recording.recordingId === selection.id : recording.recordingId === (timelineSelectionRecordingId ?? proposalSelectionRecordingId)) ?? recordings[0];
  const selectedTimeline = selectedRecording ? timelines.find((timeline: any) => timeline.recordingId === selectedRecording.recordingId) : timelines[0];
  const selectedNode = selection?.kind === "editor-node"
    ? { id: selection.id, ...selection.node, actions: (selection.node.actionTypes ?? []).map((actionType) => ({ actionType })), recovery: { strategy: selection.node.family } }
    : selectedPolicy?.nodes?.find((node: any) => selection?.kind === "node" && selection.id === node.id) ?? selectedPolicy?.nodes?.[0];
  const selectedEntry = selectedTimeline?.timeline?.find((entry: any) => selection?.kind === "timeline" && selection.id === entry.id) ?? selectedRecording?.timeline?.find((entry: any) => selection?.kind === "timeline" && selection.id === entry.id);
  const selectedSignal = signals.find((signal: any) => selection?.kind === "signal" && selection.id === signal.path);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const restoringUrlProject = Boolean(urlProjectId && !activeProject && !projectStatus && (!projectsLoaded || activeProjectId === urlProjectId || urlProjectOpenAttemptRef.current === urlProjectId));

  const viewInstances: AutomationViewInstance[] = [
    { id: "client-gateway", label: "Connected Clients", type: "clients", icon: Radio, state: "live" },
    { id: "timeline-recording", label: `Timeline: ${selectedRecording?.name ?? selectedRecording?.recordingId ?? "Recording"}`, type: "recordings", icon: Radio, state: "live" },
    { id: "proposal-workbench", label: `Proposal: ${selectedProposal?.policy?.taskId ?? selectedProposal?.proposalId ?? "Proposal"}`, type: "proposal", icon: Sparkles },
    { id: "timeline-evidence-inspector", label: `Evidence: ${selectedEntry?.id ?? "Timeline Item"}`, type: "timeline-inspector", icon: Search },
    { id: "policy-primary", label: projectTasks.length ? `Task: ${selectedTask?.name ?? selectedPolicy?.taskId ?? "Unselected"}` : "Task: None", type: "design", icon: GitBranch },
    { id: "runs-history", label: "Runs", type: "runs", icon: History },
    { id: "signals-web", label: "Signals: Relationship Web", type: "signals", icon: Network, state: "warning" },
    { id: "runtime-debug", label: "Runtime Debug", type: "runtime", icon: Bug },
    { id: "problems-view", label: "Problems", type: "problems", icon: AlertTriangle },
    { id: "ai-assistant", label: "AI Assistant", type: "assistant", icon: Sparkles },
    { id: "global-inspector", label: "Inspector", type: "inspector", icon: SlidersHorizontal },
    { id: "workspace-dock", label: "Dock: Assistant / Problems / State", type: "dock", icon: ListChecks },
    { id: "routine-editor", label: "Routine Editor", type: "routine", icon: Workflow },
    { id: "config-default", label: "Config: Default", type: "config", icon: SlidersHorizontal }
  ];
  const recordingNodes = recordingHierarchyNodes(recordings);
  const proposalNodes = proposalHierarchyNodes(recordings, proposals);
  const generatedRecordingOwnedHierarchyIds = new Set([...recordingNodes, ...proposalNodes].map((node) => node.id));
  const hierarchyNodes: AutomationHierarchyNode[] = [
    ...proposalNodes,
    ...projectTasks.map((task: any) => ({
      id: `task-${task.taskId}`,
      label: task.name ?? task.taskId,
      kind: "task" as const,
      category: "task" as const,
      parentId: typeof task.metadata?.parentId === "string" ? task.metadata.parentId : null,
      viewId: "policy-primary",
      sourceId: task.taskId
    })),
    ...projectRoutines.map((routine: any) => ({
      id: `routine-${routine.routineId}`,
      label: routine.name ?? routine.routineId,
      kind: "routine" as const,
      category: "routine" as const,
      parentId: typeof routine.metadata?.parentId === "string" ? routine.metadata.parentId : null,
      viewId: "routine-editor",
      sourceId: routine.routineId
    })),
    {
      id: "config-default",
      label: "Default configuration",
      kind: "config",
      category: "config",
      parentId: null,
      viewId: "config-default"
    },
    ...recordingNodes,
    ...customHierarchyNodes.filter(isPersistableHierarchyNode)
  ].filter((node) => generatedRecordingOwnedHierarchyIds.has(node.id) || !deletedHierarchyIds.includes(node.id));
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
    const entryId = source?.kind === "timeline" ? source.id : selectedEntry?.id;
    if (view.id === "timeline-recording") return `Timeline: ${recording?.name ?? recording?.recordingId ?? "Recording"}`;
    if (view.id === "proposal-workbench") return `Proposal: ${proposal?.policy?.taskId ?? proposal?.proposalId ?? "Proposal"}`;
    if (view.id === "timeline-evidence-inspector") return `Evidence: ${entryId ?? "Timeline Item"}`;
    if (view.id === "policy-primary") return projectTasks.length ? `Task: ${task?.name ?? policy?.taskId ?? "Unselected"}` : "Task: None";
    return view.label;
  }
  function recordingForSelection(source: AutomationSelection | null | undefined) {
    const timelineRecordingId = source?.kind === "timeline"
      ? timelines.find((timeline: any) => timeline.timeline?.some((entry: any) => entry.id === source.id))?.recordingId
        ?? recordings.find((recording: any) => recording.timeline?.some((entry: any) => entry.id === source.id))?.recordingId
      : null;
    const proposalRecordingId = source?.kind === "proposal"
      ? source.recordingId ?? proposals.find((proposal: any) => proposal.proposalId === source.id)?.metadata?.recordingId
      : null;
    if (source?.kind === "recording") return recordings.find((recording: any) => recording.recordingId === source.id) ?? selectedRecording;
    return recordings.find((recording: any) => recording.recordingId === (timelineRecordingId ?? proposalRecordingId)) ?? selectedRecording;
  }
  function proposalForSelection(source: AutomationSelection | null | undefined) {
    return proposals.find((proposal: any) => source?.kind === "proposal" && proposal.proposalId === source.id)
      ?? proposals.find((proposal: any) => source?.kind === "recording" && proposal.metadata?.recordingId === source.id)
      ?? selectedProposal;
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
  const visibleWindows = pageFullscreenWindowId
    ? workspacePrefs.windows.filter((item) => item.id === pageFullscreenWindowId && (item.area ?? "main") === "main")
    : workspacePrefs.maximizedWindowId ? workspacePrefs.windows.filter((item) => item.id === workspacePrefs.maximizedWindowId) : workspacePrefs.windows;
  const activeWindow = workspacePrefs.windows.find((item) => item.id === workspacePrefs.activeWindowId) ?? workspacePrefs.windows[0];
  const activeViewId = activeWindow?.activeViewId ?? "policy-primary";
  const selectedProposalReview = selectedProposal?.proposalId ? proposalReviews[selectedProposal.proposalId] ?? null : null;
  const proposalTargetTaskId = typeof selectedProposalReview?.targetTaskId === "string" && projectTasks.some((task: any) => task.taskId === selectedProposalReview.targetTaskId)
    ? selectedProposalReview.targetTaskId
    : validLastOpenTask?.taskId ?? null;
  const windowsByArea = (area: AutomationWorkspaceArea) => visibleWindows.filter((item) => (item.area ?? "main") === area);
  const canvasForArea = (area: AutomationWorkspaceArea) => area === "right" ? rightWorkspaceCanvasRef.current : mainWorkspaceCanvasRef.current;
  const setSelectionAndFollow = (next: AutomationSelection) => {
    setSelection(next);
    if (next.kind === "recording" || next.kind === "timeline") {
      setRecordingTreePrimaryKind("recording");
      openView("timeline-recording", "preview");
    }
    if (next.kind === "signal") openView("signals-web", "preview");
    if (next.kind === "policy") openView("policy-primary", "preview");
  };
  const openRecordingProposal = (recordingId: string) => {
    const proposal = latestByGeneratedAt<any>(proposals.filter((item: any) => item.metadata?.recordingId === recordingId));
    setSelection(proposal ? { kind: "proposal", id: proposal.proposalId, recordingId } : { kind: "recording", id: recordingId });
    setRecordingTreePrimaryKind("proposal");
    openView("proposal-workbench", "preview");
  };
  const openRecordingTimeline = (recordingId: string) => {
    setSelection({ kind: "recording", id: recordingId });
    setRecordingTreePrimaryKind("recording");
    openView("timeline-recording", "preview");
  };
  const openTimelineEvidenceInspector = (recordingId: string, entryId: string) => {
    setSelection({ kind: "timeline", id: entryId });
    setRecordingTreePrimaryKind("recording");
    openView("timeline-evidence-inspector", "preview");
  };

  async function monitorStoppedGatewayRecording(recordingId: string) {
    if (!activeProjectId) return;
    setSelection({ kind: "recording", id: recordingId });
    setRecordingTreePrimaryKind("recording");
    openView("timeline-recording", "preview", "main");
    setRecordingProcessing({
      recordingId,
      label: "Recording stopped",
      detail: "Loading the finalized timeline and waiting for generated proposal data.",
      progress: 12
    });
    setAutomationActionStatus("Recording stopped. Loading final timeline...");
    for (let attempt = 0; attempt < 75; attempt += 1) {
      const refreshed = await refreshProjectRuntimeState(activeProjectId);
      const artifacts = refreshed?.pipelineArtifacts;
      const proposal = latestByGeneratedAt<any>((artifacts?.policyProposals ?? []).filter((item: any) => item.metadata?.recordingId === recordingId));
      if (proposal) {
        setSelection({ kind: "proposal", id: proposal.proposalId, recordingId });
        setRecordingTreePrimaryKind("proposal");
        openView("proposal-workbench", "preview");
        setRecordingProcessing({
          recordingId,
          label: "Proposal ready",
          detail: "The recording was normalized, evidence was mined, and a proposal is ready for review.",
          progress: 100
        });
        setAutomationActionStatus("Task proposal generated.");
        window.setTimeout(() => setRecordingProcessing((current) => current?.recordingId === recordingId && current.progress >= 100 ? null : current), 1_200);
        return;
      }
      const progress = Math.min(90, 18 + attempt);
      const detail = attempt < 10
        ? "Loading the final recording timeline."
        : attempt < 35
          ? "Waiting for normalization and evidence mining artifacts."
          : "Waiting for the task proposal artifact.";
      setRecordingProcessing({
        recordingId,
        label: "Generating proposal",
        detail,
        progress
      });
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    }
    setRecordingProcessing({
      recordingId,
      label: "Proposal still pending",
      detail: "The final timeline loaded, but no generated proposal artifact was found yet.",
      progress: 100
    });
    setAutomationActionStatus("Proposal generation is still pending. Refresh or regenerate the proposal if it does not appear.");
  }

  useEffect(() => {
    const blocked = [...(gatewaySnapshot.auditLog ?? [])].reverse().find((entry: any) => entry.type === "recording.project_required");
    if (!blocked || blocked.id === lastRecordingBlockedAuditRef.current) return;
    lastRecordingBlockedAuditRef.current = blocked.id;
    setRecordingBlockedAlert({
      message: blocked.message ?? "Recording cannot start because Automation Studio does not have an open project.",
      clientId: String(blocked.metadata?.clientId ?? blocked.sessionId ?? ""),
      timestamp: blocked.timestamp ?? Date.now()
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
    const generatedIds = new Set([...recordingHierarchyNodes(projectRecordings), ...proposalHierarchyNodes(projectRecordings, proposals)].map((node) => node.id));
    setDeletedHierarchyIds((current) => {
      const cleaned = current.filter((id) => !id.startsWith("recordings-client-") && !id.startsWith("proposals-client-") && !generatedIds.has(id));
      return cleaned.length === current.length ? current : cleaned;
    });
  }, [activeProjectId, projectRecordings, proposals]);

  useEffect(() => {
    if (!activeProjectId || loadedProjectHierarchyId !== activeProjectId) return;
    const signature = automationHierarchySignature(customHierarchyNodes, deletedHierarchyIds, workspacePrefs);
    if (signature === lastSavedHierarchySignatureRef.current) return;
    const timeout = window.setTimeout(() => {
      if (signature === lastSavedHierarchySignatureRef.current) return;
      lastSavedHierarchySignatureRef.current = signature;
      void api.post("save-project-hierarchy", {
      projectId: activeProjectId,
      hierarchy: { customHierarchyNodes, deletedHierarchyIds, workspacePrefs }
      });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [activeProjectId, loadedProjectHierarchyId, customHierarchyNodes, deletedHierarchyIds, workspacePrefs]);

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
    if (!hasDirtyProposalReview) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [workspacePrefs.viewStates]);

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
    setSelection({ kind: "policy", id: "task.unnamed_task" });
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
    const result = await api.post<{ hierarchy: { customHierarchyNodes: AutomationHierarchyNode[]; deletedHierarchyIds: string[]; workspacePrefs?: AutomationWorkspacePrefs } }>("get-project-hierarchy", { projectId });
    if (!result.ok || !result.payload?.hierarchy) {
      setProjectStatus(result.error ?? "Project could not be opened.");
      if (urlProjectOpenAttemptRef.current === projectId) urlProjectOpenAttemptRef.current = null;
      return;
    }
    const loadedPrefs = normalizeAutomationWorkspacePrefs(result.payload.hierarchy.workspacePrefs ?? defaultAutomationWorkspacePrefs());
    const loadedCustomHierarchyNodes = result.payload.hierarchy.customHierarchyNodes.filter(isPersistableHierarchyNode);
    setActiveProjectId(projectId);
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
    const [recordingResult, timelineResult, runtimeResult, pipelineResult, artifactResult, domainResult] = await Promise.all([
      api.post<{ recordings: any[] }>("list-recordings", { projectId }),
      api.post<{ normalizedTimelines: any[] }>("list-normalized-timelines", { projectId }),
      api.post<{ runtimeSessions: any[] }>("list-runtime-sessions", { projectId }),
      api.post<any>("list-pipeline-artifacts", { projectId }),
      api.post<{ artifacts: any }>("list-project-artifacts", { projectId }),
      api.post<{ domains: any[] }>("list-recording-domains", { projectId })
    ]);
    if (recordingResult.ok) setProjectRecordings(recordingResult.payload?.recordings ?? []);
    if (timelineResult.ok) setProjectTimelines(timelineResult.payload?.normalizedTimelines ?? []);
    if (runtimeResult.ok) setRuntimeSessions(runtimeResult.payload?.runtimeSessions ?? []);
    if (pipelineResult.ok) setPipelineArtifacts(pipelineResult.payload ?? { normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [], stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
    if (artifactResult.ok) setProjectArtifacts(artifactResult.payload?.artifacts ?? { tasks: [], routines: [], configs: [], flows: [] });
    if (!pipelineResult.ok) setAutomationActionStatus(pipelineResult.error ?? "Pipeline artifacts could not be loaded.");
    if (domainResult.ok) setRecordingDomains(domainResult.payload?.domains ?? []);
    return {
      recordings: recordingResult.ok ? recordingResult.payload?.recordings ?? [] : null,
      timelines: timelineResult.ok ? timelineResult.payload?.normalizedTimelines ?? [] : null,
      runtimeSessions: runtimeResult.ok ? runtimeResult.payload?.runtimeSessions ?? [] : null,
      pipelineArtifacts: pipelineResult.ok ? pipelineResult.payload ?? emptyPipelineArtifacts() : null,
      projectArtifacts: artifactResult.ok ? artifactResult.payload?.artifacts ?? { tasks: [], routines: [], configs: [], flows: [] } : null,
      domains: domainResult.ok ? domainResult.payload?.domains ?? [] : null
    };
  }

  async function runCurrentAutomationFlow() {
    if (!activeProjectId || !activeProject) return;
    const project = activeProject;
    setAutomationActionStatus("Running flow...");
    const result = await api.post<{ runtimeSession: any }>("run-runtime-session", {
      projectId: activeProjectId,
      flow: createStudioSmokeFlow(activeProjectId, project.name)
    });
    if (!result.ok || !result.payload?.runtimeSession) {
      setAutomationActionStatus(result.error ?? "Run failed.");
      return;
    }
    setRuntimeSessions((current) => [result.payload!.runtimeSession, ...current.filter((session) => session.runId !== result.payload!.runtimeSession.runId)]);
    setAutomationActionStatus(`Run ${result.payload.runtimeSession.status}.`);
    openView("runtime-debug", "preview", "main");
  }

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
    setAutomationActionStatus("Recording finalized. Generating proposal...");
    await processFinalizedRecording(recordingId, false, authorizationPin);
    await refreshProjectRuntimeState(activeProjectId);
  }

  function selectProposalForRecording(recordingId: string, artifacts = pipelineArtifacts) {
    const proposal = latestByGeneratedAt<any>((artifacts?.policyProposals ?? []).filter((item: any) => item.metadata?.recordingId === recordingId));
    if (!proposal) return false;
    setSelection({ kind: "proposal", id: proposal.proposalId, recordingId });
    setRecordingTreePrimaryKind("proposal");
    openView("proposal-workbench", "preview");
    return true;
  }

  async function processFinalizedRecording(recordingId: string, force = false, providedAuthorizationPin?: string) {
    if (!activeProjectId || !recordingId) return false;
    if (!force && selectProposalForRecording(recordingId)) {
      setAutomationActionStatus("Proposal already current.");
      return true;
    }
    const authorizationPin = providedAuthorizationPin ?? window.prompt(force ? "Enter PIN to regenerate this proposal" : "Enter PIN to generate this proposal") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to generate a proposal.");
      return false;
    }
    setRecordingProcessing({
      recordingId,
      label: force ? "Regenerating proposal" : "Generating proposal",
      detail: "Normalizing the raw recording into stable timeline events.",
      progress: 18
    });
    setAutomationActionStatus(force ? "Regenerating task proposal..." : "Generating task proposal...");
    const normalizeResult = await api.post<{ normalizedTimeline: any }>("normalize-recording", { projectId: activeProjectId, recordingId, authorizationPin });
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
    const reviewResult = await api.post<{ review: any }>("create-normalization-review", { projectId: activeProjectId, recordingId, authorizationPin });
    if (reviewResult.ok && reviewResult.payload?.review) applyPipelineActionPayload("create-normalization-review", reviewResult.payload);
    setRecordingProcessing({
      recordingId,
      label: "Mining evidence",
      detail: "Extracting facts, observations, state-action correlations, and claims.",
      progress: 58
    });
    const miningResult = await api.post<{ miningRun: any }>("mine-recording-evidence", { projectId: activeProjectId, recordingId, authorizationPin });
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
      label: "Creating task proposal",
      detail: "Converting mined evidence into a task proposal. The proposal will not be applied automatically.",
      progress: 82
    });
    const proposalResult = await api.post<{ proposal: any }>("propose-policy-from-model", { projectId: activeProjectId, recordingId, miningRunId: miningResult.payload.miningRun.miningRunId, authorizationPin });
    if (!proposalResult.ok || !proposalResult.payload?.proposal) {
      setAutomationActionStatus(proposalResult.error ?? "Task proposal could not be generated.");
      setRecordingProcessing({
        recordingId,
        label: "Proposal generation failed",
        detail: proposalResult.error ?? "Task proposal could not be generated.",
        progress: 100
      });
      await refreshProjectRuntimeState(activeProjectId);
      return false;
    }
    applyPipelineActionPayload("propose-policy-from-model", proposalResult.payload);
    setSelection({ kind: "proposal", id: proposalResult.payload.proposal.proposalId, recordingId });
    setRecordingTreePrimaryKind("proposal");
    openView("proposal-workbench", "preview");
    setRecordingProcessing({
      recordingId,
      label: "Proposal ready",
      detail: "The task proposal has been generated and is waiting for review.",
      progress: 100
    });
    setAutomationActionStatus("Task proposal generated.");
    window.setTimeout(() => setRecordingProcessing((current) => current?.recordingId === recordingId && current.progress >= 100 ? null : current), 1_200);
    void refreshProjectRuntimeState(activeProjectId);
    return true;
  }

  async function normalizeProjectRecording(recordingId: string) {
    if (!activeProjectId || !recordingId) return;
    const authorizationPin = window.prompt("Enter PIN to normalize this recording") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to normalize a recording.");
      return false;
    }
    setAutomationActionStatus("Normalizing recording timeline...");
    const result = await api.post<{ normalizedTimeline: any }>("normalize-recording", { projectId: activeProjectId, recordingId, authorizationPin });
    if (!result.ok || !result.payload?.normalizedTimeline) {
      setAutomationActionStatus(result.error ?? "Recording could not be normalized.");
      return false;
    }
    setProjectTimelines((current) => [result.payload!.normalizedTimeline, ...current.filter((timeline) => timeline.normalizedTimelineId !== result.payload!.normalizedTimeline.normalizedTimelineId)]);
    const reviewResult = await api.post<{ review: any }>("create-normalization-review", { projectId: activeProjectId, recordingId, authorizationPin });
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
    const result = await api.post("delete-recording", { projectId: activeProjectId, recordingId, authorizationPin: pin });
    setAutomationActionStatus(result.ok ? "Recording deleted." : result.error ?? "Recording could not be deleted.");
    if (selection?.kind === "recording" && selection.id === recordingId) setSelection(null);
    await refreshProjectRuntimeState(activeProjectId);
  }

  async function deleteProjectRecordings(recordingIds: string[], authorizationPin: string) {
    if (!activeProjectId || !recordingIds.length) return true;
    const uniqueIds = [...new Set(recordingIds)];
    let deletedCount = 0;
    for (const recordingId of uniqueIds) {
      const result = await api.post("delete-recording", { projectId: activeProjectId, recordingId, authorizationPin });
      if (!result.ok) {
        setAutomationActionStatus(result.error ?? `Recording ${recordingId} could not be deleted.`);
        return false;
      }
      deletedCount += 1;
    }
    setAutomationActionStatus(`${deletedCount} recording${deletedCount === 1 ? "" : "s"} deleted.`);
    if (selection?.kind === "recording" && uniqueIds.includes(selection.id)) setSelection(null);
    await refreshProjectRuntimeState(activeProjectId);
    return true;
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
    if (!activeProjectId || !selectedTask?.taskId) {
      setAutomationActionStatus("Open a saved task before saving the task graph.");
      return false;
    }
    const authorizationPin = window.prompt("Enter PIN to save this task") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to save a task.");
      return false;
    }
    const flow = graphToTaskFlow({ task: selectedTask, existingFlow: selectedTaskGraph, graph, policy: selectedPolicy });
    const flowResult = await api.post<{ artifact: any }>("save-project-artifact", {
      projectId: activeProjectId,
      kind: "flow",
      authorizationPin,
      artifact: flow
    });
    if (!flowResult.ok || !flowResult.payload?.artifact) {
      setAutomationActionStatus(flowResult.error ?? "Task flow could not be saved.");
      return false;
    }
    const taskResult = await api.post<{ artifact: any }>("save-project-artifact", {
      projectId: activeProjectId,
      kind: "task",
      authorizationPin,
      artifact: {
        ...selectedTask,
        graphId: flow.flowId,
        policyFlowId: flow.flowId,
        graph: flow,
        updatedAt: Date.now(),
        metadata: {
          ...(selectedTask.metadata ?? {}),
          status: "saved",
          graphId: flow.flowId,
          policyFlowId: flow.flowId,
          policyId: flow.metadata?.policyId,
          savedAt: flow.updatedAt
        }
      }
    });
    if (!taskResult.ok) {
      setAutomationActionStatus(taskResult.error ?? "Task metadata could not be saved.");
      return false;
    }
    await refreshProjectRuntimeState(activeProjectId);
    setSelection({ kind: "policy", id: selectedTask.taskId });
    setAutomationActionStatus("Task saved.");
    return true;
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
      if (endpoint === "approve-policy-proposal" && payload.proposal) {
        return { ...base, policyProposals: upsertById([payload.proposal, ...base.policyProposals], "proposalId") };
      }
      return base;
    });
  }

  async function runRecordingPipelineStep(endpoint: string, payload: JsonObject, success: string) {
    if (!activeProjectId) return;
    const authorizationPin = window.prompt("Enter PIN for this pipeline action") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required for this pipeline action.");
      return false;
    }
    setAutomationActionStatus(pipelineActionRunningMessage(endpoint));
    const result = await api.post<any>(endpoint, { projectId: activeProjectId, authorizationPin, ...payload });
    if (result.ok && result.payload) {
      applyPipelineActionPayload(endpoint, result.payload);
      if (endpoint === "approve-policy-proposal" && result.payload.proposal?.policy?.policyId) {
        const approvedPolicy = result.payload.proposal.policy;
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
        setSelection({ kind: "policy", id: approvedPolicy.taskId });
        openView("policy-primary", "preview", "main");
        setAutomationActionStatus("Proposal applied and task opened.");
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

  async function runRecordingPipeline(recordingId: string) {
    if (!activeProjectId || !recordingId) return;
    const authorizationPin = window.prompt("Enter PIN to run the recording pipeline") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to run the recording pipeline.");
      return;
    }
    const steps: Array<{ endpoint: string; payload: JsonObject; status: string; success: string }> = [
      { endpoint: "normalize-recording", payload: { recordingId }, status: "Normalizing recording timeline...", success: "Recording normalized." },
      { endpoint: "mine-recording-evidence", payload: { recordingId }, status: "Mining recording evidence...", success: "Evidence mined." },
      { endpoint: "propose-policy-from-model", payload: { recordingId }, status: "Creating proposal...", success: "Proposal created." }
    ];
    let miningRunId: string | null = null;
    for (const step of steps) {
      setAutomationActionStatus(step.status);
      const stepPayload: JsonObject = step.endpoint === "propose-policy-from-model" && miningRunId ? { ...step.payload, miningRunId } : step.payload;
      const result: { ok: boolean; payload?: any; error?: string } = await api.post<any>(step.endpoint, { projectId: activeProjectId, authorizationPin, ...stepPayload });
      if (!result.ok) {
        setAutomationActionStatus(result.error ?? `${step.endpoint} failed.`);
        await refreshProjectRuntimeState(activeProjectId);
        return;
      }
      applyPipelineActionPayload(step.endpoint, result.payload ?? {});
      if (step.endpoint === "normalize-recording" && result.payload?.normalizedTimeline) {
        setProjectTimelines((current) => [result.payload!.normalizedTimeline, ...current.filter((timeline) => timeline.normalizedTimelineId !== result.payload!.normalizedTimeline.normalizedTimelineId)]);
        const reviewResult = await api.post<{ review: any }>("create-normalization-review", { projectId: activeProjectId, recordingId, authorizationPin });
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
    const activeViewId = current.windows.find((item) => item.id === current.activeWindowId)?.activeViewId;
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
    updateWorkspacePrefs((current) => {
      current = captureActiveViewState(current);
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
  function addWorkspaceWindow(viewId: string, area: AutomationWorkspaceArea, targetWindowId?: string) {
    if (targetWindowId) {
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
  function selectionMatchesDeletedHierarchy(selectionValue: unknown, refs: { taskIds: Set<string>; routineIds: Set<string>; configIds: Set<string>; recordingIds: Set<string>; proposalIds: Set<string> }): boolean {
    if (!isAutomationSelection(selectionValue)) return false;
    if (selectionValue.kind === "policy") return refs.taskIds.has(selectionValue.id);
    if (selectionValue.kind === "recording") return refs.recordingIds.has(selectionValue.id);
    if (selectionValue.kind === "proposal" || selectionValue.kind === "proposal-step") return refs.proposalIds.has(selectionValue.id) || (selectionValue.recordingId ? refs.recordingIds.has(selectionValue.recordingId) : false);
    return false;
  }
  function viewStateMatchesDeletedHierarchy(viewId: string, state: JsonObject | undefined, refs: { taskIds: Set<string>; routineIds: Set<string>; configIds: Set<string>; recordingIds: Set<string>; proposalIds: Set<string> }): boolean {
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
      recordingIds: new Set(deletingNodes.filter((node) => node.kind === "recording" && node.sourceId).map((node) => node.sourceId!)),
      proposalIds: new Set(deletingNodes.filter((node) => node.kind === "proposal" && node.sourceId).map((node) => node.sourceId!))
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
      const activeWindowId = windows.some((item) => item.id === current.activeWindowId) ? current.activeWindowId : windows[0]?.id ?? "";
      return {
        ...current,
        activeWindowId,
        maximizedWindowId: current.maximizedWindowId && windows.some((item) => item.id === current.maximizedWindowId) ? current.maximizedWindowId : null,
        windows,
        viewStates: nextViewStates
      };
    });
  }
  function setWindowTab(windowId: string, viewId: string) {
    restoreViewState(viewId);
    updateWorkspacePrefs((current) => ({ ...captureActiveViewState(current), activeWindowId: windowId, windows: current.windows.map((item) => item.id === windowId ? { ...item, activeViewId: viewId } : item) }));
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
  function requestHierarchyAction(action: NonNullable<AutomationHierarchyAction>) {
    setHierarchyAction(action);
    if (action.action === "create") {
      const parent = action.parentId ? hierarchyNodes.find((node) => node.id === action.parentId) : null;
      const category = action.category ?? parent?.category ?? "task";
      setHierarchyCreateStep("type");
      setHierarchyCategory(category);
      setHierarchyKind(category === "routine" ? "routine" : category === "task" ? "task" : "folder");
      setHierarchyName("");
      setHierarchyParentId(action.parentId ?? null);
    }
    if (action.action === "delete" && action.node) {
      if (action.node.kind === "task" || action.node.kind === "routine" || action.node.kind === "folder") setHierarchyKind(action.node.kind);
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
      if (hierarchyKind === "task" || hierarchyKind === "routine") {
        if (!activeProjectId) {
          setHierarchyStatus(`Open a project before creating a ${hierarchyKind}.`);
          return;
        }
        const now = Date.now();
        const artifactId = hierarchyKind === "task" ? createManualTaskId(label) : createManualRoutineId(label);
        const taskGraph = hierarchyKind === "task" ? {
          schemaVersion: "0.1",
          flowId: taskFlowId(artifactId),
          ownerKind: "task",
          ownerId: artifactId,
          name: label,
          description: `Task graph for ${label}.`,
          nodes: [],
          edges: [],
          createdAt: now,
          updatedAt: now,
          metadata: { source: "automation-studio-sidebar" }
        } : null;
        const result = await api.post<{ artifact: any }>("save-project-artifact", {
          projectId: activeProjectId,
          kind: hierarchyKind,
          authorizationPin: hierarchyPin,
          artifact: hierarchyKind === "task"
            ? {
              schemaVersion: "0.1",
              taskId: artifactId,
              name: label,
              graphId: taskGraph!.flowId,
              graph: taskGraph,
              recordingIds: [],
              createdAt: now,
              updatedAt: now,
              metadata: {
                createdFrom: "automation-studio-sidebar",
                status: "empty",
                ...(hierarchyParentId ? { parentId: hierarchyParentId } : {})
              }
            }
            : {
              schemaVersion: "0.1",
              routineId: artifactId,
              name: label,
              taskIds: [],
              createdAt: now,
              updatedAt: now,
              metadata: {
                createdFrom: "automation-studio-sidebar",
                status: "empty",
                ...(hierarchyParentId ? { parentId: hierarchyParentId } : {})
              }
            }
        });
        if (!result.ok) {
          setHierarchyStatus(result.error ?? `${hierarchyKind === "task" ? "Task" : "Routine"} could not be saved.`);
          return;
        }
        await refreshProjectRuntimeState(activeProjectId);
        if (hierarchyKind === "task") {
          setSelection({ kind: "policy", id: artifactId });
          openView("policy-primary", "preview", "main");
        } else {
          openView("routine-editor", "preview", "main");
        }
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
        const refreshed = await refreshProjectRuntimeState(activeProjectId);
        const deletedTaskIds = new Set(artifactNodes.filter((node) => node.kind === "task").map((node) => node.sourceId));
        if (selection?.kind === "policy" && deletedTaskIds.has(selection.id)) {
          const nextTask = (refreshed?.projectArtifacts?.tasks ?? []).find((task: any) => !deletedTaskIds.has(task.taskId));
          setSelection(nextTask ? { kind: "policy", id: nextTask.taskId } : null);
        }
      }
      const artifactNodeIds = new Set(artifactNodes.map((node) => node.id));
      const hierarchyOnlyDeletedIds = [hierarchyAction.node.id, ...ids].filter((id) => !artifactNodeIds.has(id));
      if (hierarchyOnlyDeletedIds.length) setDeletedHierarchyIds((items) => [...new Set([...items, ...hierarchyOnlyDeletedIds])]);
      setCustomHierarchyNodes((items) => items.filter((item) => item.id !== hierarchyAction.node!.id && !ids.includes(item.id)));
      setHierarchyStatus(`${hierarchyAction.node.label} deleted.`);
    }
    setHierarchyAction(null);
    setHierarchyPin("");
    setHierarchyName("");
  }

  const renderWorkspaceArea = (area: AutomationWorkspaceArea, label: string, ref: RefObject<HTMLDivElement | null>) => {
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
                    <AutomationViewRenderer
                      entries={selectedTimeline?.timeline ?? selectedRecording?.timeline ?? []}
                      models={models}
                      notes={selectedRecording?.notes ?? []}
                      actionStatus={automationActionStatus}
                      policies={policies}
                      pipelineArtifacts={pipelineArtifacts}
                      policy={selectedPolicy}
                      taskGraph={selectedTaskGraph}
                      proposalReview={selectedProposalReview}
                      proposalTargetTaskId={proposalTargetTaskId}
                      problems={problems}
                      projectId={activeProjectId}
                      recordings={recordings}
                      recordingDomains={recordingDomains}
                      runtimeSessions={runtimeSessions}
                      dockTab={dockTab}
                      selectedEntry={selectedEntry}
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
                      viewActive={workspacePrefs.activeWindowId === windowItem.id && windowItem.activeViewId === view.id}
                      onDeleteRecording={deleteProjectRecording}
                      onFinalizeRecording={finalizeProjectRecording}
                      onInspectTimelineEntry={openTimelineEvidenceInspector}
                      onOpenPipeline={openRecordingProposal}
                      onOpenProposal={openRecordingProposal}
                      onOpenRecording={openRecordingTimeline}
                      onAppendRecordingMarker={appendProjectRecordingMarker}
                      onAppendRecordingNote={appendProjectRecordingNote}
                      onNormalizeRecording={normalizeProjectRecording}
                      onPipelineAction={runRecordingPipelineStep}
                      onProposalReviewChange={updateProposalReview}
                      onSaveTaskGraph={saveSelectedTaskGraph}
                      onProcessFinalizedRecording={processFinalizedRecording}
                      onRunRecordingPipeline={runRecordingPipeline}
                      onProcessProposalWithLlm={processPipelineProposalWithLlm}
                      onRefreshRecordings={async () => {
                        await refreshProjectRuntimeState(activeProjectId);
                      }}
                      onUpdateRecording={updateProjectRecording}
                      setDockTab={setDockTabAndPersist}
                      setSelection={setSelectionAndFollow}
                    />
                  </AutomationViewContainer>
                </div>
              );
            })}
            {snapPreview && area === snapPreview.area ? <div className="automation-window-snap-preview" style={{ left: snapPreview.x, top: snapPreview.y, width: snapPreview.widthPx, height: snapPreview.heightPx }} /> : null}
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
            <option value="task">Tasks</option>
            <option value="routine">Routines</option>
            <option value="config">Configs</option>
          </select>
        </div> : null}
        {!sidebarCollapsed ? <AutomationProjectTree
          nodes={hierarchyNodes}
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
            {automationActionStatus ? <span>{automationActionStatus}</span> : null}
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
            gridTemplateRows: "minmax(0, 1fr)"
          }}
        >
          {renderWorkspaceArea("main", "Main", mainWorkspaceCanvasRef)}
          {renderWorkspaceArea("right", "Right Sidebar", rightWorkspaceCanvasRef)}
        </section>
      </div>
      {recordingBlockedAlert ? <Modal title="Recording Cannot Start" onClose={() => setRecordingBlockedAlert(null)}>
        <VisualAlert
          tone="warning"
          title="Open a project first"
          message={recordingBlockedAlert.message}
        />
        <div className="automation-modal-actions">
          <button className="button primary" onClick={() => setRecordingBlockedAlert(null)} type="button">OK</button>
        </div>
      </Modal> : null}
      {hierarchyAction ? <Modal title={hierarchyAction.action === "create" && hierarchyCreateStep === "type" ? "Add To Hierarchy" : "Authorize Hierarchy Change"} onClose={() => setHierarchyAction(null)}>
        {hierarchyAction.action === "create" && hierarchyCreateStep === "type" ? <>
          <div className="automation-create-type-grid" role="list" aria-label="Choose item type">
            {[
              { kind: "folder" as const, label: "Folder", icon: FolderPlus, detail: `Add a container inside ${automationHierarchyCategoryLabel(hierarchyCategory)}.` },
              hierarchyCategory === "task" ? { kind: "task" as const, label: "Task", icon: GitBranch, detail: "Add a task workspace under the selected folder." } : null,
              hierarchyCategory === "routine" ? { kind: "routine" as const, label: "Routine", icon: Workflow, detail: "Add an orchestration routine under the selected folder." } : null
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
    replayResults: []
  };
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

function pipelineActionRunningMessage(endpoint: string): string {
  if (endpoint === "mine-recording-evidence") return "Mining evidence: writing facts, observations, correlations, and claims...";
  if (endpoint === "propose-policy-from-model") return "Creating proposal from mined evidence...";
  if (endpoint === "approve-policy-proposal") return "Applying proposal...";
  return "Running pipeline action...";
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
