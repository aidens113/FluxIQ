"use client";

import { AlertTriangle, Blocks, Bug, ChevronLeft, ChevronRight, Columns3, FolderOpen, FolderPlus, GitBranch, GripVertical, History, ListChecks, Network, Plus, Radio, Search, SlidersHorizontal, Sparkles, Trash2, Workflow } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import {
  automationHierarchyCategories,
  automationHierarchyCategoryLabel,
  automationHierarchySignature,
  collectHierarchyDescendantIds,
  pipelineHierarchyNodes,
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
  AutomationViewInstance
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

function mergeById<TItem extends Record<string, any>>(primary: TItem[], secondary: TItem[], idKey: keyof TItem): TItem[] {
  const seen = new Set<string>();
  const merged: TItem[] = [];
  for (const item of [...primary, ...secondary]) {
    const id = String(item[idKey] ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
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
  const [runtimeSessions, setRuntimeSessions] = useState<any[]>([]);
  const [pipelineArtifacts, setPipelineArtifacts] = useState<any>({ normalizationReviews: [], miningRuns: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
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
    rightSidebarCollapsed: false
  });
  const [dockTab, setDockTab] = useState<AutomationDockTab>("assistant");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [windowAdderOpen, setWindowAdderOpen] = useState<AutomationWindowAdderState | null>(null);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState<AutomationLayoutPickerState | null>(null);
  const [snapPreview, setSnapPreview] = useState<(NonNullable<ReturnType<typeof automationSnapGeometry>> & { area: AutomationWorkspaceArea }) | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pageFullscreenWindowId, setPageFullscreenWindowId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | AutomationHierarchyKind>("all");
  const [selection, setSelection] = useState<AutomationSelection | null>(null);
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
  const lastRecordingBlockedAuditRef = useRef("");

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
      setRuntimeSessions([]);
      setPipelineArtifacts({ normalizationReviews: [], miningRuns: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
      setRecordingDomains([]);
      return;
    }
    void refreshProjectData(activeProjectId).then(() => undefined);
  }, [activeProjectId, refreshProjectData]);
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
  const policies = canonical.policyGraphs ?? [];
  const problems = snapshot?.payload?.problems ?? [];
  const signals = registries.flatMap((registry: any) => (registry.definitions ?? []).map((signal: any) => ({ ...signal, registryId: registry.registryId })));
  const selectedPolicy = policies.find((policy: any) => selection?.kind === "policy" && policy.policyId === selection.id) ?? policies[0];
  const timelineSelectionRecordingId = selection?.kind === "timeline"
    ? timelines.find((timeline: any) => timeline.timeline?.some((entry: any) => entry.id === selection.id))?.recordingId
      ?? recordings.find((recording: any) => recording.timeline?.some((entry: any) => entry.id === selection.id))?.recordingId
    : null;
  const selectedRecording = recordings.find((recording: any) => selection?.kind === "recording" ? recording.recordingId === selection.id : recording.recordingId === timelineSelectionRecordingId) ?? recordings[0];
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
    { id: "pipeline-workbench", label: "Pipeline", type: "pipeline", icon: Sparkles },
    { id: "policy-primary", label: `Task: ${selectedPolicy?.taskId ?? "Draft"}`, type: "design", icon: GitBranch },
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
  const pipelineNodes = pipelineHierarchyNodes(recordings);
  const generatedRecordingOwnedHierarchyIds = new Set([...recordingNodes, ...pipelineNodes].map((node) => node.id));
  const hierarchyNodes: AutomationHierarchyNode[] = [
    ...pipelineNodes,
    ...policies.map((policy: any) => ({
      id: policy.policyId,
      label: policy.taskId ?? policy.policyId,
      kind: "task" as const,
      category: "task" as const,
      parentId: null,
      viewId: "policy-primary",
      sourceId: policy.policyId
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
    ...customHierarchyNodes
  ].filter((node) => generatedRecordingOwnedHierarchyIds.has(node.id) || !deletedHierarchyIds.includes(node.id));
  const folderOptions = hierarchyNodes.filter((node) => node.kind === "folder" && node.category === hierarchyCategory);
  const viewById = new Map(viewInstances.map((view) => [view.id, view]));
  const visibleWindows = pageFullscreenWindowId
    ? workspacePrefs.windows.filter((item) => item.id === pageFullscreenWindowId && (item.area ?? "main") === "main")
    : workspacePrefs.maximizedWindowId ? workspacePrefs.windows.filter((item) => item.id === workspacePrefs.maximizedWindowId) : workspacePrefs.windows;
  const activeWindow = workspacePrefs.windows.find((item) => item.id === workspacePrefs.activeWindowId) ?? workspacePrefs.windows[0];
  const activeViewId = activeWindow?.activeViewId ?? "policy-primary";
  const windowsByArea = (area: AutomationWorkspaceArea) => visibleWindows.filter((item) => (item.area ?? "main") === area);
  const canvasForArea = (area: AutomationWorkspaceArea) => area === "right" ? rightWorkspaceCanvasRef.current : mainWorkspaceCanvasRef.current;
  const setSelectionAndFollow = (next: AutomationSelection) => {
    setSelection(next);
    if (next.kind === "recording" || next.kind === "timeline") openView("timeline-recording", "preview");
    if (next.kind === "signal") openView("signals-web", "preview");
    if (next.kind === "policy") openView("policy-primary", "preview");
  };
  const openRecordingPipeline = (recordingId: string) => {
    setSelection({ kind: "recording", id: recordingId });
    openView("pipeline-workbench", "preview");
  };
  const openRecordingTimeline = (recordingId: string) => {
    setSelection({ kind: "recording", id: recordingId });
    openView("timeline-recording", "preview");
  };

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
    if (!activeRecordingId || activeRecordingId === lastOpenedGatewayRecordingRef.current) return;
    lastOpenedGatewayRecordingRef.current = activeRecordingId;
    void refreshProjectData(activeProjectId).then(() => {
      setSelection({ kind: "recording", id: activeRecordingId });
      openView("timeline-recording", "preview", "main");
      setAutomationActionStatus(`Recording ${activeRecordingId} is live.`);
    });
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
    const generatedIds = new Set([...recordingHierarchyNodes(projectRecordings), ...pipelineHierarchyNodes(projectRecordings)].map((node) => node.id));
    setDeletedHierarchyIds((current) => {
      const cleaned = current.filter((id) => !id.startsWith("recordings-client-") && !id.startsWith("pipelines-client-") && !generatedIds.has(id));
      return cleaned.length === current.length ? current : cleaned;
    });
  }, [activeProjectId, projectRecordings]);

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
    setActiveProjectId(projectId);
    setCustomHierarchyNodes(result.payload.hierarchy.customHierarchyNodes);
    setDeletedHierarchyIds(result.payload.hierarchy.deletedHierarchyIds);
    setWorkspacePrefs(loadedPrefs);
    lastSavedHierarchySignatureRef.current = automationHierarchySignature(result.payload.hierarchy.customHierarchyNodes, result.payload.hierarchy.deletedHierarchyIds, loadedPrefs);
    setLoadedProjectHierarchyId(projectId);
    setProjectModal(null);
    setProjectStatus("");
    if (options.updateUrl !== false) setProjectUrl(projectId);
    void refreshProjects();
  }

  async function refreshProjectRuntimeState(projectId = activeProjectId) {
    if (!projectId) return;
    const [recordingResult, timelineResult, runtimeResult, pipelineResult, domainResult] = await Promise.all([
      api.post<{ recordings: any[] }>("list-recordings", { projectId }),
      api.post<{ normalizedTimelines: any[] }>("list-normalized-timelines", { projectId }),
      api.post<{ runtimeSessions: any[] }>("list-runtime-sessions", { projectId }),
      api.post<any>("list-pipeline-artifacts", { projectId }),
      api.post<{ domains: any[] }>("list-recording-domains", { projectId })
    ]);
    if (recordingResult.ok) setProjectRecordings(recordingResult.payload?.recordings ?? []);
    if (timelineResult.ok) setProjectTimelines(timelineResult.payload?.normalizedTimelines ?? []);
    if (runtimeResult.ok) setRuntimeSessions(runtimeResult.payload?.runtimeSessions ?? []);
    if (pipelineResult.ok) setPipelineArtifacts(pipelineResult.payload ?? { normalizationReviews: [], miningRuns: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
    if (domainResult.ok) setRecordingDomains(domainResult.payload?.domains ?? []);
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
    setAutomationActionStatus("Finalizing recording...");
    const result = await api.post<{ recording: any }>("finalize-recording", { projectId: activeProjectId, recordingId, authorizationPin });
    if (!result.ok || !result.payload?.recording) {
      setAutomationActionStatus(result.error ?? "Recording could not be finalized.");
      return;
    }
    setProjectRecordings((current) => [result.payload!.recording, ...current.filter((recording) => recording.recordingId !== recordingId)]);
    setAutomationActionStatus("Recording finalized.");
    await refreshProjectRuntimeState(activeProjectId);
  }

  async function normalizeProjectRecording(recordingId: string) {
    if (!activeProjectId || !recordingId) return;
    const authorizationPin = window.prompt("Enter PIN to normalize this recording") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to normalize a recording.");
      return;
    }
    setAutomationActionStatus("Normalizing recording timeline...");
    const result = await api.post<{ normalizedTimeline: any }>("normalize-recording", { projectId: activeProjectId, recordingId, authorizationPin });
    if (!result.ok || !result.payload?.normalizedTimeline) {
      setAutomationActionStatus(result.error ?? "Recording could not be normalized.");
      return;
    }
    setProjectTimelines((current) => [result.payload!.normalizedTimeline, ...current.filter((timeline) => timeline.normalizedTimelineId !== result.payload!.normalizedTimeline.normalizedTimelineId)]);
    setAutomationActionStatus("Recording normalized.");
    await refreshProjectRuntimeState(activeProjectId);
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

  async function runRecordingPipelineStep(endpoint: string, payload: JsonObject, success: string) {
    if (!activeProjectId) return;
    const authorizationPin = window.prompt("Enter PIN for this pipeline action") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required for this pipeline action.");
      return;
    }
    setAutomationActionStatus(`${success}...`);
    const result = await api.post(endpoint, { projectId: activeProjectId, authorizationPin, ...payload });
    setAutomationActionStatus(result.ok ? success : result.error ?? "Pipeline action failed.");
    await refreshProjectRuntimeState(activeProjectId);
  }

  function processPipelineProposalWithLlm(_proposalId: string) {
    setAutomationActionStatus("LLM task processing is not connected yet.");
  }

  async function runRecordingPipeline(recordingId: string, taskId?: string) {
    if (!activeProjectId || !recordingId) return;
    const authorizationPin = window.prompt("Enter PIN to run the recording pipeline") ?? "";
    if (authorizationPin.length < 4) {
      setAutomationActionStatus("PIN is required to run the recording pipeline.");
      return;
    }
    const steps: Array<{ endpoint: string; payload: JsonObject; status: string; success: string }> = [
      { endpoint: "normalize-recording", payload: { recordingId }, status: "Normalizing recording timeline...", success: "Recording normalized." },
      { endpoint: "create-normalization-review", payload: { recordingId }, status: "Creating normalization review...", success: "Normalization review created." },
      { endpoint: "mine-recording-evidence", payload: { recordingId }, status: "Mining recording evidence...", success: "Evidence mined." },
      { endpoint: "learn-task-model", payload: { taskId: taskId ?? recordingId }, status: "Learning task model...", success: "Task model learned." },
      { endpoint: "propose-policy-from-model", payload: {}, status: "Creating task draft...", success: "Task draft proposed." },
      { endpoint: "replay-policy-against-recording", payload: { recordingId }, status: "Replaying policy against recording...", success: "Replay completed." }
    ];
    for (const step of steps) {
      setAutomationActionStatus(step.status);
      const result = await api.post<{ normalizedTimeline?: any }>(step.endpoint, { projectId: activeProjectId, authorizationPin, ...step.payload });
      if (!result.ok) {
        setAutomationActionStatus(result.error ?? `${step.endpoint} failed.`);
        await refreshProjectRuntimeState(activeProjectId);
        return;
      }
      if (step.endpoint === "normalize-recording" && result.payload?.normalizedTimeline) {
        setProjectTimelines((current) => [result.payload!.normalizedTimeline, ...current.filter((timeline) => timeline.normalizedTimelineId !== result.payload!.normalizedTimeline.normalizedTimelineId)]);
      }
      setAutomationActionStatus(step.success);
    }
    setAutomationActionStatus("Recording pipeline complete.");
    await refreshProjectRuntimeState(activeProjectId);
  }

  function closeProject() {
    setActiveProjectId(null);
    setLoadedProjectHierarchyId(null);
    setCustomHierarchyNodes([]);
    setDeletedHierarchyIds([]);
    setProjectRecordings([]);
    setProjectTimelines([]);
    setRuntimeSessions([]);
    setPipelineArtifacts({ normalizationReviews: [], miningRuns: [], learnedTaskModels: [], policyProposals: [], replayResults: [] });
    setRecordingDomains([]);
    setAutomationActionStatus("");
    setWorkspacePrefs(defaultAutomationWorkspacePrefs());
    setPageFullscreenWindowId(null);
    lastSavedHierarchySignatureRef.current = "";
    setSelection(null);
    setProjectUrl(null);
  }

  function updateWorkspacePrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs) {
    setWorkspacePrefs((current) => normalizeAutomationWorkspacePrefs(updater(current)));
  }
  function openView(viewId: string, mode: "preview" | "new-window" = "preview", area: AutomationWorkspaceArea = "main") {
    updateWorkspacePrefs((current) => {
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
        ...current,
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
      const windows = current.windows.filter((item) => item.id !== windowId);
      return { ...current, activeWindowId: windows[0]?.id ?? "", maximizedWindowId: current.maximizedWindowId === windowId ? null : current.maximizedWindowId, windows };
    });
  }
  function closeWindowTab(windowId: string, viewId: string) {
    updateWorkspacePrefs((current) => {
      const windows = current.windows.map((item) => {
        if (item.id !== windowId) return item;
        const tabs = item.tabs.filter((tab) => tab !== viewId);
        return { ...item, tabs, activeViewId: item.activeViewId === viewId ? tabs[0] ?? "" : item.activeViewId };
      }).filter((item) => item.tabs.length > 0);
      return { ...current, activeWindowId: windows[0]?.id ?? "", windows };
    });
  }
  function setWindowTab(windowId: string, viewId: string) {
    updateWorkspacePrefs((current) => ({ ...current, activeWindowId: windowId, windows: current.windows.map((item) => item.id === windowId ? { ...item, activeViewId: viewId } : item) }));
  }
  function activateWindow(windowId: string) {
    updateWorkspacePrefs((current) => ({ ...current, activeWindowId: windowId, windows: current.windows.map((item) => item.id === windowId ? { ...item, zIndex: nextAutomationZIndex(current.windows) } : item) }));
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
  function setWindowGeometry(windowId: string, geometry: Partial<AutomationWindowPixelGeometry>) {
    updateWorkspacePrefs((current) => ({
      ...current,
      windows: current.windows.map((item) => {
        if (item.id !== windowId) return item;
        const bounds = canvasForArea(item.area ?? "main")?.getBoundingClientRect();
        const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
        const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
        const currentPixels = automationWindowToPixels(item, canvasWidth, canvasHeight);
        const nextPixels = clampAutomationWindowPixelGeometry({ ...currentPixels, ...geometry }, canvasWidth, canvasHeight);
        return { ...item, ...automationPixelsToRelativeGeometry(nextPixels, canvasWidth, canvasHeight) };
      })
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
      updateWorkspacePrefs((current) => ({
        ...current,
        windows: current.windows.map((item) => {
          if (item.id === windowItem.id) {
            const geometry = clampAutomationWindowPixelGeometry({
              x: nextX,
              y: nextY,
              widthPx: nextWidth,
              heightPx: nextHeight
            }, canvasWidth, canvasHeight, 240, 210);
            return { ...item, ...automationPixelsToRelativeGeometry(geometry, canvasWidth, canvasHeight) };
          }
          const geometry = partnerGeometry.get(item.id);
          if (!geometry) return item;
          const start = windowsInArea.find((window) => window.id === item.id) ?? automationWindowToPixels(item, canvasWidth, canvasHeight);
          const nextGeometry = clampAutomationWindowPixelGeometry({ ...start, ...geometry }, canvasWidth, canvasHeight, 240, 210);
          return { ...item, ...automationPixelsToRelativeGeometry(nextGeometry, canvasWidth, canvasHeight) };
        })
      }));
    };
    const onUp = () => {
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
    if (restored !== startWindow) setWindowGeometry(windowItem.id, {
      x: restored.x,
      y: restored.y,
      widthPx: restored.widthPx,
      heightPx: restored.heightPx
    });
    const startLeft = restored.x;
    const startTop = restored.y;
    let latestSnap: ReturnType<typeof automationSnapGeometry> | null = null;
    const onMove = (moveEvent: PointerEvent) => {
      setWindowGeometry(windowItem.id, { x: startLeft + moveEvent.clientX - startX, y: startTop + moveEvent.clientY - startY });
      latestSnap = automationSnapGeometry(canvasForArea(windowItem.area ?? "main"), moveEvent.clientX, moveEvent.clientY);
      setSnapPreview(latestSnap ? { ...latestSnap, area: windowItem.area ?? "main" } : null);
    };
    const onUp = () => {
      if (latestSnap) setWindowGeometry(windowItem.id, latestSnap);
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
    const onMove = (moveEvent: PointerEvent) => {
      updateWorkspacePrefs((current) => ({
        ...current,
        inspectorWidth: clampNumber(startWidth + startX - moveEvent.clientX, 260, 620, startWidth),
        rightSidebarCollapsed: false
      }));
    };
    const onUp = () => {
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
      setCustomHierarchyNodes((items) => [...items, {
        id: `custom-${hierarchyKind}-${Date.now()}`,
        kind: hierarchyKind,
        category: hierarchyKind === "folder" ? hierarchyCategory : hierarchyKind,
        label,
        parentId: hierarchyParentId,
        viewId: hierarchyKind === "task" ? "policy-primary" : hierarchyKind === "routine" ? "routine-editor" : "config-default"
      }]);
      setHierarchyStatus(`${label} created.`);
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
      setDeletedHierarchyIds((items) => [...new Set([...items, hierarchyAction.node!.id, ...ids])]);
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
              const view = viewById.get(windowItem.activeViewId) ?? viewById.get("policy-primary");
              if (!view) return null;
              const isPageFullscreenWindow = pageFullscreenWindowId === windowItem.id && (windowItem.area ?? "main") === "main";
              const bounds = canvasForArea(area)?.getBoundingClientRect();
              const renderedWindow = automationWindowToPixels(
                windowItem,
                Math.max(1, Math.floor(bounds?.width ?? 1120)),
                Math.max(1, Math.floor(bounds?.height ?? 680)),
                1,
                1
              );
              return (
                <div
                  className="automation-window-shell"
                  key={windowItem.id}
                  style={workspacePrefs.maximizedWindowId || isPageFullscreenWindow ? { inset: 0, zIndex: windowItem.zIndex } : { left: renderedWindow.x, top: renderedWindow.y, width: renderedWindow.widthPx, height: renderedWindow.heightPx, zIndex: windowItem.zIndex }}
                >
                  <AutomationViewContainer
                    active={workspacePrefs.activeWindowId === windowItem.id}
                    canPageFullscreen={(windowItem.area ?? "main") === "main"}
                    icon={view.icon}
                    pageFullscreen={isPageFullscreenWindow}
                    tabs={windowItem.tabs.map((tabId) => viewById.get(tabId)).filter(Boolean) as AutomationViewInstance[]}
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
                      problems={problems}
                      projectId={activeProjectId}
                      recordings={recordings}
                      recordingDomains={recordingDomains}
                      runtimeSessions={runtimeSessions}
                      dockTab={dockTab}
                      selectedEntry={selectedEntry}
                      selectedNode={selectedNode}
                      selectedRecording={selectedRecording}
                      selectedSignal={selectedSignal}
                      selectedTimeline={selectedTimeline}
                      selection={selection}
                      signals={signals}
                      timelines={timelines}
                      view={view}
                      onDeleteRecording={deleteProjectRecording}
                      onFinalizeRecording={finalizeProjectRecording}
                      onOpenPipeline={openRecordingPipeline}
                      onOpenRecording={openRecordingTimeline}
                      onAppendRecordingMarker={appendProjectRecordingMarker}
                      onAppendRecordingNote={appendProjectRecordingNote}
                      onNormalizeRecording={normalizeProjectRecording}
                      onPipelineAction={runRecordingPipelineStep}
                      onRunRecordingPipeline={runRecordingPipeline}
                      onProcessProposalWithLlm={processPipelineProposalWithLlm}
                      onRefreshRecordings={() => refreshProjectRuntimeState(activeProjectId)}
                      onUpdateRecording={updateProjectRecording}
                      setDockTab={setDockTab}
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
            <option value="pipeline">Pipeline</option>
            <option value="task">Tasks</option>
            <option value="routine">Routines</option>
            <option value="config">Configs</option>
          </select>
        </div> : null}
        {!sidebarCollapsed ? <AutomationProjectTree
          nodes={hierarchyNodes}
          selection={selection}
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
            gridTemplateColumns: `minmax(0, 1fr) ${workspacePrefs.rightSidebarCollapsed ? 38 : workspacePrefs.inspectorWidth}px`,
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
