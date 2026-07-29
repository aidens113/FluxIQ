"use client";

import { AlertTriangle, Blocks, Braces, Bug, CheckCircle2, ChevronDown, ChevronRight, Columns3, Copy, FileText, FolderOpen, FolderPlus, GitBranch, GripVertical, History, Info, ListChecks, Lock, Maximize2, MoreHorizontal, Network, PanelLeftClose, Pin, Plus, QrCode, Radio, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Workflow, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";

type ApiResponse<T = unknown> = { ok: boolean; payload?: T; error?: string };
type JsonObject = Record<string, unknown>;
type TabButton<T extends string> = { id: T; label: string; count?: number };
type AlertTone = "info" | "success" | "warning" | "error";
type CurrentUser = {
  id: string;
  displayName: string;
  roleId: string;
  totpEnabled: boolean;
  pinConfigured: boolean | undefined;
};

export function LiveProgramMain({ programId, user }: { programId: string; user: CurrentUser }) {
  switch (programId) {
    case "automation-studio": return <AutomationStudioLive currentUser={user} />;
    case "identity-access": return <IdentityAccessLive currentUser={user} />;
    case "database-manager": return <DatabaseManagerLive currentUser={user} />;
    case "background-tasks": return <BackgroundTasksLive />;
    case "compute-control": return <ComputeControlLive />;
    case "deployment-sync": return <DeploymentSyncLive />;
    case "docs": return <DocsLive />;
    case "production-runner": return <ProductionRunnerLive />;
    default: return <Panel title="Workspace"><p className="muted-text">This program is registered but does not expose a live workspace yet.</p></Panel>;
  }
}

type AutomationStudioView = "design" | "recordings" | "signals" | "runtime" | "problems";
type AutomationViewType = AutomationStudioView | "node-detail" | "assistant" | "config" | "routine" | "state";
type AutomationDockTab = "assistant" | "problems" | "history" | "state";
type AutomationViewInstance = {
  id: string;
  label: string;
  type: AutomationViewType;
  icon: typeof Blocks;
  state?: "dirty" | "live" | "warning" | "pinned";
};
type AutomationWorkspaceWindow = {
  id: string;
  activeViewId: string;
  tabs: string[];
  widthWeight: number;
  heightPx: number;
};
type AutomationWorkspacePrefs = {
  windows: AutomationWorkspaceWindow[];
  activeWindowId: string;
  maximizedWindowId: string | null;
  sidebarWidth: number;
  inspectorWidth: number;
  bottomDockHeight: number;
  windowsPerRow: number;
};
type AutomationHierarchyKind = "folder" | "task" | "routine" | "config";
type AutomationCreatableHierarchyKind = "folder" | "task" | "routine";
type AutomationHierarchyCategory = "task" | "routine" | "config";
const automationHierarchyCategories: Array<{ id: AutomationHierarchyCategory; label: string; description: string }> = [
  { id: "task", label: "Tasks", description: "Task folders and task workspaces" },
  { id: "routine", label: "Routines", description: "Routine folders and orchestration workspaces" },
  { id: "config", label: "Configurations", description: "Configuration folders and defaults" }
];
type AutomationHierarchyNode = {
  id: string;
  label: string;
  kind: AutomationHierarchyKind;
  category: AutomationHierarchyCategory;
  parentId: string | null;
  viewId?: string;
  sourceId?: string;
};
type AutomationHierarchyAction = {
  action: "create" | "delete";
  node?: AutomationHierarchyNode;
  category?: AutomationHierarchyCategory;
  parentId?: string | null;
} | null;
type AutomationStudioProject = {
  id: string;
  name: string;
  description: string;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
};
type AutomationStudioProjectCategory = {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};
type AutomationProjectModal = "create" | "rename" | "delete" | "move" | "create-category" | "rename-category" | "delete-category" | "move-category" | null;
type AutomationSelection =
  | { kind: "policy"; id: string }
  | { kind: "node"; id: string }
  | { kind: "recording"; id: string }
  | { kind: "timeline"; id: string }
  | { kind: "signal"; id: string };

type AutomationPolicyNodeData = {
  label: string;
  actionTypes: string[];
  recovery: string;
  evidenceCount: number;
  readinessCount: number;
  successCount: number;
  isStart: boolean;
  confidence?: number;
  timeoutMs?: number;
};
type AutomationRoutineNodeData = {
  label: string;
  nodeType: "base" | "custom";
  family: string;
  description: string;
  inputs: number;
  outputs: number;
  privileged?: boolean;
};

const automationNodeTypes = {
  policyNode: AutomationPolicyNode,
  routineNode: AutomationRoutineNode
};

function AutomationStudioLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("automation-studio");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [projects, setProjects] = useState<AutomationStudioProject[]>([]);
  const [projectCategories, setProjectCategories] = useState<AutomationStudioProjectCategory[]>([]);
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
    windows: [{ id: "window-policy", activeViewId: "policy-primary", tabs: ["policy-primary"], widthWeight: 100, heightPx: 520 }],
    activeWindowId: "window-policy",
    maximizedWindowId: null,
    sidebarWidth: 280,
    inspectorWidth: 320,
    bottomDockHeight: 206,
    windowsPerRow: 2
  });
  const [lockedWindows, setLockedWindows] = useState<string[]>([]);
  const [pinnedViews, setPinnedViews] = useState<string[]>(["policy-primary"]);
  const [dockTab, setDockTab] = useState<AutomationDockTab>("assistant");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | "folder" | "task" | "routine" | "config">("all");
  const [selection, setSelection] = useState<AutomationSelection | null>(null);
  const [followSelection, setFollowSelection] = useState(true);
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

  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  const refreshProjects = useCallback(async () => {
    const result = await api.get<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }>("projects");
    if (result.ok) {
      setProjects(result.payload?.projects ?? []);
      setProjectCategories(result.payload?.categories ?? []);
    }
  }, [api]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => void refreshProjects(), [refreshProjects]);

  const canonical = snapshot?.payload?.canonical ?? {};
  const recordings = canonical.recordingSessions ?? [];
  const timelines = canonical.normalizedTimelines ?? [];
  const registries = canonical.signalRegistries ?? [];
  const models = canonical.learnedTaskModels ?? [];
  const policies = canonical.policyGraphs ?? [];
  const problems = snapshot?.payload?.problems ?? [];
  const signals = registries.flatMap((registry: any) => (registry.definitions ?? []).map((signal: any) => ({ ...signal, registryId: registry.registryId })));
  const selectedPolicy = policies.find((policy: any) => selection?.kind === "policy" && policy.policyId === selection.id) ?? policies[0];
  const selectedRecording = recordings.find((recording: any) => selection?.kind === "recording" && recording.recordingId === selection.id) ?? recordings[0];
  const selectedTimeline = timelines.find((timeline: any) => timeline.recordingId === selectedRecording?.recordingId) ?? timelines[0];
  const selectedNode = selectedPolicy?.nodes?.find((node: any) => selection?.kind === "node" && selection.id === node.id) ?? selectedPolicy?.nodes?.[0];
  const selectedEntry = selectedTimeline?.timeline?.find((entry: any) => selection?.kind === "timeline" && selection.id === entry.id);
  const selectedSignal = signals.find((signal: any) => selection?.kind === "signal" && selection.id === signal.path);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

  const viewInstances: AutomationViewInstance[] = [
    { id: "policy-primary", label: `Policy: ${selectedPolicy?.taskId ?? "Task"}`, type: "design", icon: GitBranch, state: "pinned" },
    { id: "timeline-recording", label: `Timeline: ${selectedRecording?.name ?? selectedRecording?.recordingId ?? "Recording"}`, type: "recordings", icon: Radio, state: "live" },
    { id: "node-detail", label: `Node: ${selectedNode?.label ?? "Detail"}`, type: "node-detail", icon: SlidersHorizontal },
    { id: "signals-web", label: "Signals: Relationship Web", type: "signals", icon: Network, state: "warning" },
    { id: "runtime-debug", label: "Runtime Debug", type: "runtime", icon: Bug },
    { id: "problems-view", label: "Problems", type: "problems", icon: AlertTriangle },
    { id: "ai-assistant", label: "AI Assistant", type: "assistant", icon: Sparkles },
    { id: "routine-editor", label: "Routine Editor", type: "routine", icon: Workflow },
    { id: "config-default", label: "Config: Default", type: "config", icon: SlidersHorizontal }
  ];
  const hierarchyNodes: AutomationHierarchyNode[] = [
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
    ...customHierarchyNodes
  ].filter((node) => !deletedHierarchyIds.includes(node.id));
  const folderOptions = hierarchyNodes.filter((node) => node.kind === "folder" && node.category === hierarchyCategory);
  const viewById = new Map(viewInstances.map((view) => [view.id, view]));
  const visibleWindows = workspacePrefs.maximizedWindowId ? workspacePrefs.windows.filter((item) => item.id === workspacePrefs.maximizedWindowId) : workspacePrefs.windows;
  const visibleWindowRows = chunkAutomationWindows(visibleWindows, workspacePrefs.maximizedWindowId ? 1 : workspacePrefs.windowsPerRow);
  const activeWindow = workspacePrefs.windows.find((item) => item.id === workspacePrefs.activeWindowId) ?? workspacePrefs.windows[0];
  const activeViewId = activeWindow?.activeViewId ?? "policy-primary";
  const setSelectionAndFollow = (next: AutomationSelection) => {
    setSelection(next);
    if (!followSelection) return;
    if (next.kind === "recording" || next.kind === "timeline") openView("timeline-recording", "preview");
    if (next.kind === "signal") openView("signals-web", "preview");
    if (next.kind === "node") openView("node-detail", "preview");
    if (next.kind === "policy") openView("policy-primary", "preview");
  };

  useEffect(() => {
    if (!activeProjectId || loadedProjectHierarchyId !== activeProjectId) return;
    void api.post("save-project-hierarchy", {
      projectId: activeProjectId,
      hierarchy: { customHierarchyNodes, deletedHierarchyIds, workspacePrefs }
    });
  }, [api, activeProjectId, loadedProjectHierarchyId, customHierarchyNodes, deletedHierarchyIds, workspacePrefs]);

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

  async function openProject(projectId: string) {
    const result = await api.post<{ hierarchy: { customHierarchyNodes: AutomationHierarchyNode[]; deletedHierarchyIds: string[]; workspacePrefs?: AutomationWorkspacePrefs } }>("get-project-hierarchy", { projectId });
    if (!result.ok || !result.payload?.hierarchy) {
      setProjectStatus(result.error ?? "Project could not be opened.");
      return;
    }
    setActiveProjectId(projectId);
    setCustomHierarchyNodes(result.payload.hierarchy.customHierarchyNodes);
    setDeletedHierarchyIds(result.payload.hierarchy.deletedHierarchyIds);
    setWorkspacePrefs(normalizeAutomationWorkspacePrefs(result.payload.hierarchy.workspacePrefs ?? defaultAutomationWorkspacePrefs()));
    setLoadedProjectHierarchyId(projectId);
    setProjectModal(null);
    setProjectStatus("");
  }

  function closeProject() {
    setActiveProjectId(null);
    setLoadedProjectHierarchyId(null);
    setCustomHierarchyNodes([]);
    setDeletedHierarchyIds([]);
    setWorkspacePrefs(defaultAutomationWorkspacePrefs());
    setSelection(null);
  }

  function updateWorkspacePrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs) {
    setWorkspacePrefs((current) => normalizeAutomationWorkspacePrefs(updater(current)));
  }
  function openView(viewId: string, mode: "preview" | "new-window" = "preview") {
    updateWorkspacePrefs((current) => {
      if (mode === "new-window") {
        const id = `window-${viewId}-${Date.now()}`;
        return {
          ...current,
          activeWindowId: id,
          maximizedWindowId: null,
          windows: [...current.windows, { id, activeViewId: viewId, tabs: [viewId], widthWeight: 100, heightPx: 520 }]
        };
      }
      const activeId = current.activeWindowId || current.windows[0]?.id || "window-policy";
      return {
        ...current,
        activeWindowId: activeId,
        windows: current.windows.map((item, index) => item.id === activeId || (!current.windows.some((candidate) => candidate.id === activeId) && index === 0)
          ? { ...item, activeViewId: viewId, tabs: item.tabs.includes(viewId) ? item.tabs : [...item.tabs, viewId] }
          : item)
      };
    });
  }
  function closeWindow(windowId: string) {
    updateWorkspacePrefs((current) => {
      const windows = current.windows.filter((item) => item.id !== windowId);
      return { ...current, activeWindowId: windows[0]?.id ?? "window-policy", maximizedWindowId: current.maximizedWindowId === windowId ? null : current.maximizedWindowId, windows };
    });
  }
  function closeWindowTab(windowId: string, viewId: string) {
    updateWorkspacePrefs((current) => {
      const windows = current.windows.map((item) => {
        if (item.id !== windowId) return item;
        const tabs = item.tabs.filter((tab) => tab !== viewId);
        return { ...item, tabs, activeViewId: item.activeViewId === viewId ? tabs[0] ?? "" : item.activeViewId };
      }).filter((item) => item.tabs.length > 0);
      return { ...current, activeWindowId: windows[0]?.id ?? "window-policy", windows };
    });
  }
  function setWindowTab(windowId: string, viewId: string) {
    updateWorkspacePrefs((current) => ({ ...current, activeWindowId: windowId, windows: current.windows.map((item) => item.id === windowId ? { ...item, activeViewId: viewId } : item) }));
  }
  function resizeWindow(windowId: string, widthWeight: number, heightPx: number) {
    updateWorkspacePrefs((current) => ({
      ...current,
      windows: current.windows.map((item) => item.id === windowId ? {
        ...item,
        widthWeight: clampNumber(widthWeight, 45, 220, item.widthWeight),
        heightPx: clampNumber(heightPx, 320, 900, item.heightPx)
      } : item)
    }));
  }
  function startWindowResize(windowItem: AutomationWorkspaceWindow, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = windowItem.widthWeight;
    const startHeight = windowItem.heightPx;
    const onMove = (moveEvent: PointerEvent) => {
      resizeWindow(windowItem.id, startWidth + ((moveEvent.clientX - startX) / 6), startHeight + (moveEvent.clientY - startY));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function toggleLockedWindow(windowId: string) {
    setLockedWindows((current) => current.includes(windowId) ? current.filter((item) => item !== windowId) : [...current, windowId]);
  }
  function togglePinnedView(viewId: string) {
    setPinnedViews((current) => current.includes(viewId) ? current.filter((item) => item !== viewId) : [...current, viewId]);
  }
  function requestHierarchyAction(action: NonNullable<AutomationHierarchyAction>) {
    setHierarchyAction(action);
    if (action.action === "create") {
      const parent = action.parentId ? hierarchyNodes.find((node) => node.id === action.parentId) : null;
      const category = action.category ?? parent?.category ?? "task";
      setHierarchyCreateStep("type");
      setHierarchyCategory(category);
      setHierarchyKind(category === "routine" ? "routine" : "task");
      setHierarchyName("");
      setHierarchyParentId(action.parentId ?? null);
    }
    if (action.action === "delete" && action.node) {
      if (action.node.kind !== "config") setHierarchyKind(action.node.kind);
      setHierarchyCategory(action.node.category);
      setHierarchyName(action.node.label);
      setHierarchyParentId(action.node.parentId);
    }
    setHierarchyPin("");
    setHierarchyStatus("");
  }
  function confirmHierarchyAction() {
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
      setDeletedHierarchyIds((items) => [...new Set([...items, hierarchyAction.node!.id, ...ids])]);
      setCustomHierarchyNodes((items) => items.filter((item) => item.id !== hierarchyAction.node!.id && !ids.includes(item.id)));
      setHierarchyStatus(`${hierarchyAction.node.label} deleted.`);
    }
    setHierarchyAction(null);
    setHierarchyPin("");
    setHierarchyName("");
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
              <div className="automation-project-grid">
                {projectGridSections(projects, projectCategories).map((section) => (
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
                ))}
                {!projects.length && !projectCategories.length ? <div className="automation-project-empty"><strong>No saved projects yet.</strong><span>Create a project to start building tasks, routines, and configurations.</span></div> : null}
              </div>
            </section>
          </main>
        </div>
        {projectModal ? <AutomationProjectModalView categoryName={categoryName} categoryTarget={categoryTarget} currentUser={currentUser} description={projectDescription} mode={projectModal} name={projectName} pin={projectPin} projectTarget={projectTarget} status={projectStatus} onCategoryNameChange={setCategoryName} onClose={() => setProjectModal(null)} onCreate={() => void createProject()} onCreateCategory={() => void createCategory()} onDelete={() => void deleteProject()} onDeleteCategory={() => void deleteCategory()} onDescriptionChange={setProjectDescription} onMove={() => void moveProject()} onMoveCategory={() => void moveCategory()} onNameChange={setProjectName} onPinChange={(value) => setProjectPin(digits(value))} onRename={() => void renameProject()} onRenameCategory={() => void renameCategory()} /> : null}
      </section>
    );
  }

  return (
    <section className="automation-studio-shell" style={{ gridTemplateColumns: `${workspacePrefs.sidebarWidth}px minmax(0, 1fr)` }}>
      <aside className="automation-studio-sidebar">
        <div className="automation-studio-sidebar-heading">
          <strong>Project</strong>
          <div className="inline-actions">
            <button className="icon-button" onClick={() => requestHierarchyAction({ action: "create", parentId: null })} title="Create" aria-label="Create" type="button"><Plus size={14} aria-hidden /></button>
            <button className="icon-button" title="Collapse sidebar" aria-label="Collapse sidebar" type="button"><PanelLeftClose size={14} aria-hidden /></button>
          </div>
        </div>
        <div className="automation-tree-search">
          <Search size={14} aria-hidden />
          <input aria-label="Search project" onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search project" value={projectSearch} />
          <select aria-label="Filter project type" onChange={(event) => setProjectTypeFilter(event.target.value as typeof projectTypeFilter)} value={projectTypeFilter}>
            <option value="all">All</option>
            <option value="folder">Folders</option>
            <option value="task">Tasks</option>
            <option value="routine">Routines</option>
            <option value="config">Configs</option>
          </select>
        </div>
        <AutomationProjectTree
          nodes={hierarchyNodes}
          selection={selection}
          search={projectSearch}
          typeFilter={projectTypeFilter}
          setSelection={setSelection}
          openView={openView}
          requestAction={requestHierarchyAction}
        />
      </aside>

      <div className="automation-studio-main">
        <header className="automation-studio-workbar">
          <div className="automation-workspace-actions">
            <button className="button" onClick={closeProject} type="button"><FolderOpen size={14} aria-hidden />Back to Projects</button>
            <button className="button" onClick={() => openView(activeViewId, "new-window")} type="button"><Columns3 size={14} aria-hidden />Open Beside</button>
            <button className="button" onClick={() => setPreferencesOpen(!preferencesOpen)} type="button"><SlidersHorizontal size={14} aria-hidden />Preferences</button>
            <span>{workspacePrefs.windows.length} window{workspacePrefs.windows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="automation-studio-context">
            <label className="automation-follow-toggle"><input checked={followSelection} onChange={(event) => setFollowSelection(event.target.checked)} type="checkbox" />Follow selection</label>
            <strong>{activeProject.name}</strong>
          </div>
        </header>
        {preferencesOpen ? <AutomationWorkspacePreferences prefs={workspacePrefs} setPrefs={updateWorkspacePrefs} /> : null}

        <section className="automation-studio-workspace" style={{ gridTemplateColumns: `minmax(0, 1fr) ${workspacePrefs.inspectorWidth}px`, gridTemplateRows: `minmax(0, 1fr) ${workspacePrefs.bottomDockHeight}px` }}>
          <div
            className={workspacePrefs.maximizedWindowId ? "automation-dock-layout maximized" : "automation-dock-layout"}
          >
            {visibleWindowRows.map((row, rowIndex) => (
              <div
                className="automation-window-row"
                key={row.map((item) => item.id).join("-")}
                style={{ gridTemplateColumns: row.length === 1 ? "minmax(0, 1fr)" : row.map((item) => `minmax(260px, ${item.widthWeight}fr)`).join(" ") }}
              >
                {row.map((windowItem, columnIndex) => {
                  const windowIndex = rowIndex * workspacePrefs.windowsPerRow + columnIndex;
                  const view = viewById.get(windowItem.activeViewId) ?? viewById.get("policy-primary");
                  if (!view) return null;
                  return (
                    <AutomationViewContainer
                      active={workspacePrefs.activeWindowId === windowItem.id}
                      heightPx={workspacePrefs.maximizedWindowId ? undefined : windowItem.heightPx}
                      icon={view.icon}
                      key={windowItem.id}
                      locked={lockedWindows.includes(windowItem.id)}
                      pinned={pinnedViews.includes(view.id)}
                      tabs={windowItem.tabs.map((tabId) => viewById.get(tabId)).filter(Boolean) as AutomationViewInstance[]}
                      windowId={windowItem.id}
                      windowIndex={windowIndex}
                      subtitle={view.label}
                      title={viewTitle(view)}
                      onActivate={() => {
                        updateWorkspacePrefs((current) => ({ ...current, activeWindowId: windowItem.id }));
                      }}
                      onClose={() => closeWindow(windowItem.id)}
                      onCloseTab={(viewId) => closeWindowTab(windowItem.id, viewId)}
                      onLock={() => toggleLockedWindow(windowItem.id)}
                      onMaximize={() => updateWorkspacePrefs((current) => ({ ...current, maximizedWindowId: current.maximizedWindowId === windowItem.id ? null : windowItem.id }))}
                      onPin={() => togglePinnedView(view.id)}
                      onResizeStart={(event) => startWindowResize(windowItem, event)}
                      onTabSelect={(viewId) => setWindowTab(windowItem.id, viewId)}
                    >
                      <AutomationViewRenderer
                        entries={selectedTimeline?.timeline ?? selectedRecording?.timeline ?? []}
                        models={models}
                        notes={selectedRecording?.notes ?? []}
                        policies={policies}
                        policy={selectedPolicy}
                        problems={problems}
                        recordings={recordings}
                        selectedEntry={selectedEntry}
                        selectedNode={selectedNode}
                        selectedRecording={selectedRecording}
                        selectedTimeline={selectedTimeline}
                        signals={signals}
                        view={view}
                        setSelection={setSelectionAndFollow}
                      />
                    </AutomationViewContainer>
                  );
                })}
              </div>
            ))}
          </div>
          <AutomationInspector
            selection={selection}
            policy={selectedPolicy}
            node={selectedNode}
            recording={selectedRecording}
            entry={selectedEntry}
            signal={selectedSignal}
            followSelection={followSelection}
            setFollowSelection={setFollowSelection}
          />
          <AutomationWorkspaceDock activeTab={dockTab} problems={problems} signals={signals} models={models} selectedNode={selectedNode} setActiveTab={setDockTab} />
        </section>
      </div>
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
    </section>
  );
}

function viewTitle(view: AutomationViewInstance): string {
  if (view.type === "design") return "Policy Graph";
  if (view.type === "recordings") return "Timeline";
  if (view.type === "signals") return "Relationship Web";
  if (view.type === "runtime") return "Runtime Debug";
  if (view.type === "problems") return "Problems";
  if (view.type === "node-detail") return "Node Detail";
  if (view.type === "assistant") return "AI Assistant";
  if (view.type === "routine") return "Routine Editor";
  if (view.type === "config") return "Configuration";
  return "State Explorer";
}

function AutomationProjectModalView(props: {
  categoryName: string;
  categoryTarget: AutomationStudioProjectCategory | null;
  currentUser: CurrentUser;
  description: string;
  mode: Exclude<AutomationProjectModal, null>;
  name: string;
  pin: string;
  projectTarget: AutomationStudioProject | null;
  status: string;
  onCategoryNameChange(value: string): void;
  onClose(): void;
  onCreate(): void;
  onCreateCategory(): void;
  onDelete(): void;
  onDeleteCategory(): void;
  onDescriptionChange(value: string): void;
  onMove(): void;
  onMoveCategory(): void;
  onNameChange(value: string): void;
  onPinChange(value: string): void;
  onRename(): void;
  onRenameCategory(): void;
}) {
  const pinReady = Boolean(props.currentUser.pinConfigured) && props.pin.length >= 4;
  const pinMessage = props.currentUser.pinConfigured ? "Enter your user security PIN to authorize this change." : "Your user needs a security PIN before project editing actions are allowed.";
  const pinField = (
    <>
      <VisualAlert tone="warning" title="PIN required" message={pinMessage} />
      <Field label="Security PIN"><input autoFocus={props.mode === "delete" || props.mode === "delete-category" || props.mode === "move" || props.mode === "move-category"} inputMode="numeric" value={props.pin} onChange={(event) => props.onPinChange(event.target.value)} /></Field>
    </>
  );
  if (props.mode === "delete") {
    return (
      <Modal title="Delete Project" onClose={props.onClose}>
        <VisualAlert tone="warning" title="Delete project" message={`Delete ${props.projectTarget?.name ?? "this project"} and all saved hierarchy/layout state?`} />
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary danger-action" disabled={!pinReady} onClick={props.onDelete} type="button">Delete Project</button></div>
      </Modal>
    );
  }
  if (props.mode === "move") {
    return (
      <Modal title="Move Project" onClose={props.onClose}>
        <KeyValue rows={[["Project", props.projectTarget?.name ?? "Project"], ["Destination", props.categoryTarget?.name ?? "Uncategorized"]]} />
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary" disabled={!pinReady} onClick={props.onMove} type="button">Move Project</button></div>
      </Modal>
    );
  }
  if (props.mode === "create-category" || props.mode === "rename-category") {
    return (
      <Modal title={props.mode === "create-category" ? "Create Category" : "Rename Category"} onClose={props.onClose}>
        <Field label="Category name"><input autoFocus value={props.categoryName} onChange={(event) => props.onCategoryNameChange(event.target.value)} /></Field>
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary" disabled={!props.categoryName.trim() || !pinReady} onClick={props.mode === "create-category" ? props.onCreateCategory : props.onRenameCategory} type="button">{props.mode === "create-category" ? "Create Category" : "Save Category"}</button></div>
      </Modal>
    );
  }
  if (props.mode === "delete-category") {
    return (
      <Modal title="Delete Category" onClose={props.onClose}>
        <VisualAlert tone="warning" title="Delete category" message={`Delete ${props.categoryTarget?.name ?? "this category"}? Projects in it will move to Uncategorized.`} />
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary danger-action" disabled={!pinReady} onClick={props.onDeleteCategory} type="button">Delete Category</button></div>
      </Modal>
    );
  }
  if (props.mode === "move-category") {
    return (
      <Modal title="Move Category" onClose={props.onClose}>
        <KeyValue rows={[["Category", props.categoryTarget?.name ?? "Category"], ["Action", "Reorder project category grid"]]} />
        {pinField}
        <StatusText value={props.status} />
        <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary" disabled={!pinReady} onClick={props.onMoveCategory} type="button">Move Category</button></div>
      </Modal>
    );
  }
  return (
    <Modal title={props.mode === "rename" ? "Rename Project" : "Create Project"} onClose={props.onClose}>
      <Field label="Project name"><input autoFocus value={props.name} onChange={(event) => props.onNameChange(event.target.value)} /></Field>
      <Field label="Description"><input value={props.description} onChange={(event) => props.onDescriptionChange(event.target.value)} /></Field>
      {pinField}
      <StatusText value={props.status} />
      <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button><button className="button button-primary" disabled={!props.name.trim() || !pinReady} onClick={props.mode === "rename" ? props.onRename : props.onCreate} type="button">{props.mode === "rename" ? "Save Project" : "Create Project"}</button></div>
    </Modal>
  );
}

function projectGridSections(projects: AutomationStudioProject[], categories: AutomationStudioProjectCategory[]): Array<{
  id: string;
  name: string;
  category: AutomationStudioProjectCategory | null;
  projects: AutomationStudioProject[];
}> {
  const sections = categories.map((category) => ({
    id: category.id,
    name: category.name,
    category,
    projects: projects.filter((project) => project.categoryId === category.id)
  }));
  return [
    ...sections,
    {
      id: "uncategorized",
      name: "Uncategorized",
      category: null,
      projects: projects.filter((project) => !project.categoryId || !categories.some((category) => category.id === project.categoryId))
    }
  ].filter((section) => section.category || section.projects.length || !categories.length);
}

function moveCategoryId(categoryIds: string[], categoryId: string, targetCategoryId: string): string[] {
  const withoutDragged = categoryIds.filter((id) => id !== categoryId);
  const targetIndex = withoutDragged.indexOf(targetCategoryId);
  if (targetIndex < 0) return categoryIds;
  return [...withoutDragged.slice(0, targetIndex), categoryId, ...withoutDragged.slice(targetIndex)];
}

function AutomationViewRenderer(props: {
  entries: any[];
  models: any[];
  notes: any[];
  policies: any[];
  policy: any;
  problems: any[];
  recordings: any[];
  selectedEntry: any;
  selectedNode: any;
  selectedRecording: any;
  selectedTimeline: any;
  signals: any[];
  view: AutomationViewInstance;
  setSelection(selection: AutomationSelection): void;
}) {
  if (props.view.type === "design") return <AutomationPolicyCanvas policy={props.policy} selectedNode={props.selectedNode} setSelection={props.setSelection} />;
  if (props.view.type === "recordings") return <AutomationTimelineView entries={props.entries} notes={props.notes} selectedEntry={props.selectedEntry} setSelection={props.setSelection} />;
  if (props.view.type === "signals") return <AutomationSignalWorkspace signals={props.signals} setSelection={props.setSelection} />;
  if (props.view.type === "runtime") return <AutomationRuntimeWorkspace timelines={props.selectedTimeline ? [props.selectedTimeline] : []} models={props.models} policies={props.policies} />;
  if (props.view.type === "problems") return <AutomationProblemsWorkspace problems={props.problems} />;
  if (props.view.type === "node-detail") return <AutomationNodeDetailView node={props.selectedNode} entries={props.entries} />;
  if (props.view.type === "assistant") return <AutomationAssistantView node={props.selectedNode} recording={props.selectedRecording} signals={props.signals} />;
  if (props.view.type === "routine") return <AutomationRoutineView models={props.models} policies={props.policies} />;
  if (props.view.type === "config") return <AutomationConfigView policy={props.policy} />;
  return <AutomationStateExplorerView signals={props.signals} entries={props.entries} setSelection={props.setSelection} />;
}

function AutomationWorkspacePreferences(props: { prefs: AutomationWorkspacePrefs; setPrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs): void }) {
  const setNumber = (key: "sidebarWidth" | "inspectorWidth" | "bottomDockHeight" | "windowsPerRow", value: number) => props.setPrefs((current) => ({ ...current, [key]: value }));
  const setWindowSize = (windowId: string, key: "widthWeight" | "heightPx", value: number) => props.setPrefs((current) => ({ ...current, windows: current.windows.map((item) => item.id === windowId ? { ...item, [key]: value } : item) }));
  const resetLayout = () => props.setPrefs(() => defaultAutomationWorkspacePrefs());
  return (
    <section className="automation-preferences-panel">
      <header>
        <div><strong>Workspace Preferences</strong><span>Saved for this task and as the next default</span></div>
        <button className="button" onClick={resetLayout} type="button">Reset</button>
      </header>
      <div className="automation-preference-group">
        <strong>Frame</strong>
        <PreferenceSlider label="Sidebar" max={420} min={220} unit="px" value={props.prefs.sidebarWidth} onChange={(value) => setNumber("sidebarWidth", value)} />
        <PreferenceSlider label="Inspector" max={520} min={260} unit="px" value={props.prefs.inspectorWidth} onChange={(value) => setNumber("inspectorWidth", value)} />
        <PreferenceSlider label="Bottom dock" max={360} min={140} unit="px" value={props.prefs.bottomDockHeight} onChange={(value) => setNumber("bottomDockHeight", value)} />
      </div>
      <div className="automation-preference-group">
        <strong>Windows</strong>
        <PreferenceStepper label="Per row" max={4} min={1} value={props.prefs.windowsPerRow} onChange={(value) => setNumber("windowsPerRow", value)} />
        {props.prefs.windows.map((windowItem, index) => (
          <div className="automation-window-size-prefs" key={windowItem.id}>
            <strong>Window {index + 1}</strong>
            <PreferenceSlider label="Width" max={220} min={45} unit="fr" value={windowItem.widthWeight} onChange={(value) => setWindowSize(windowItem.id, "widthWeight", value)} />
            <PreferenceSlider label="Height" max={900} min={320} unit="px" value={windowItem.heightPx} onChange={(value) => setWindowSize(windowItem.id, "heightPx", value)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PreferenceSlider(props: { label: string; min: number; max: number; unit: string; value: number; onChange(value: number): void }) {
  return (
    <label className="automation-preference-row">
      <span>{props.label}</span>
      <input max={props.max} min={props.min} onChange={(event) => props.onChange(Number(event.target.value))} type="range" value={props.value} />
      <output>{props.value}{props.unit}</output>
    </label>
  );
}

function PreferenceStepper(props: { label: string; min: number; max: number; value: number; onChange(value: number): void }) {
  return (
    <label className="automation-preference-row stepper">
      <span>{props.label}</span>
      <div>
        <button disabled={props.value <= props.min} onClick={() => props.onChange(props.value - 1)} type="button">-</button>
        <output>{props.value}</output>
        <button disabled={props.value >= props.max} onClick={() => props.onChange(props.value + 1)} type="button">+</button>
      </div>
    </label>
  );
}

function defaultAutomationWorkspacePrefs(): AutomationWorkspacePrefs {
  return {
    windows: [{ id: "window-policy", activeViewId: "policy-primary", tabs: ["policy-primary"], widthWeight: 100, heightPx: 520 }],
    activeWindowId: "window-policy",
    maximizedWindowId: null,
    sidebarWidth: 280,
    inspectorWidth: 320,
    bottomDockHeight: 206,
    windowsPerRow: 2
  };
}

function normalizeAutomationWorkspacePrefs(value: AutomationWorkspacePrefs): AutomationWorkspacePrefs {
  const fallback = defaultAutomationWorkspacePrefs();
  const legacyColumnWidths = (value as AutomationWorkspacePrefs & { columnWidths?: number[] }).columnWidths;
  const windows = value.windows?.length ? value.windows
    .filter((item) => item.tabs?.length && item.activeViewId)
    .map((item, index) => ({
      ...item,
      widthWeight: clampNumber(item.widthWeight ?? legacyColumnWidths?.[index], 45, 220, 100),
      heightPx: clampNumber(item.heightPx, 320, 900, 520)
    })) : fallback.windows;
  return {
    ...fallback,
    ...value,
    windows,
    activeWindowId: windows.some((item) => item.id === value.activeWindowId) ? value.activeWindowId : windows[0]?.id ?? fallback.activeWindowId,
    maximizedWindowId: value.maximizedWindowId && windows.some((item) => item.id === value.maximizedWindowId) ? value.maximizedWindowId : null,
    sidebarWidth: clampNumber(value.sidebarWidth, 220, 420, fallback.sidebarWidth),
    inspectorWidth: clampNumber(value.inspectorWidth, 260, 520, fallback.inspectorWidth),
    bottomDockHeight: clampNumber(value.bottomDockHeight, 140, 360, fallback.bottomDockHeight),
    windowsPerRow: clampNumber(value.windowsPerRow, 1, 4, fallback.windowsPerRow)
  };
}

function chunkAutomationWindows(windows: AutomationWorkspaceWindow[], windowsPerRow: number): AutomationWorkspaceWindow[][] {
  const size = clampNumber(windowsPerRow, 1, 4, 2);
  const rows: AutomationWorkspaceWindow[][] = [];
  for (let index = 0; index < windows.length; index += size) rows.push(windows.slice(index, index + size));
  return rows;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function AutomationProjectTree(props: {
  nodes: AutomationHierarchyNode[];
  search: string;
  typeFilter: "all" | "folder" | "task" | "routine" | "config";
  selection: AutomationSelection | null;
  setSelection(selection: AutomationSelection): void;
  openView(viewId: string, mode?: "preview" | "new-window"): void;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
}) {
  const singleClickTimer = useRef<number | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>([]);
  const matches = (node: AutomationHierarchyNode) => (props.typeFilter === "all" || props.typeFilter === node.kind) && (!props.search || `${node.label} ${node.kind}`.toLowerCase().includes(props.search.toLowerCase()));
  const visibleIds = new Set(props.nodes.filter(matches).flatMap((node) => [node.id, ...collectHierarchyAncestorIds(node.parentId, props.nodes)]));
  useEffect(() => () => {
    if (singleClickTimer.current !== null) window.clearTimeout(singleClickTimer.current);
  }, []);
  const openFromTree = (node: AutomationHierarchyNode, mode: "preview" | "new-window") => {
    if (singleClickTimer.current !== null) {
      window.clearTimeout(singleClickTimer.current);
      singleClickTimer.current = null;
    }
    if (node.kind === "folder") return;
    const open = () => {
      if (node.kind === "task" && node.sourceId) props.setSelection({ kind: "policy", id: node.sourceId });
      props.openView(node.viewId ?? (node.kind === "task" ? "policy-primary" : node.kind === "routine" ? "routine-editor" : "config-default"), mode);
    };
    if (mode === "preview") {
      singleClickTimer.current = window.setTimeout(() => {
        open();
        singleClickTimer.current = null;
      }, 220);
      return;
    }
    open();
  };
  const toggleFolder = (folderId: string) => setCollapsedFolderIds((current) => current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]);
  return (
    <nav className="automation-project-tree" aria-label="Automation Studio project tree">
      {automationHierarchyCategories.map((category) => {
        const rootId = `root-${category.id}`;
        const collapsed = collapsedFolderIds.includes(rootId);
        const rootNodes = props.nodes.filter((node) => node.parentId === null && node.category === category.id && visibleIds.has(node.id));
        const shouldShowTree = props.typeFilter === "all" || props.typeFilter === "folder" || props.typeFilter === category.id || rootNodes.length > 0;
        if (!shouldShowTree) return null;
        return (
          <section className={`automation-folder-root root-${category.id}`} key={category.id}>
            <div className="automation-tree-item root-folder">
              <button className={`type-folder category-root category-${category.id}`} onClick={() => toggleFolder(rootId)} type="button">
                {collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                <span><strong>{category.label}</strong><small>{category.description}</small></span>
              </button>
              <button className="tree-row-action" onClick={() => props.requestAction({ action: "create", category: category.id, parentId: null })} title={`Add inside ${category.label}`} aria-label={`Add inside ${category.label}`} type="button"><Plus size={13} aria-hidden /></button>
            </div>
            {!collapsed ? <div className="automation-tree-children root-children">
              <AutomationHierarchyChildren nodes={sortAutomationHierarchyNodes(rootNodes)} allNodes={props.nodes} visibleIds={visibleIds} collapsedFolderIds={collapsedFolderIds} selection={props.selection} openNode={openFromTree} requestAction={props.requestAction} toggleFolder={toggleFolder} />
              {!rootNodes.length ? <div className="automation-tree-empty">No {category.label.toLowerCase()} match the current filter.</div> : null}
            </div> : null}
          </section>
        );
      })}
    </nav>
  );
}

function AutomationHierarchyTreeNode(props: {
  node: AutomationHierarchyNode;
  nodes: AutomationHierarchyNode[];
  visibleIds: Set<string>;
  collapsedFolderIds: string[];
  selection: AutomationSelection | null;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  toggleFolder(folderId: string): void;
}) {
  const children = props.nodes.filter((node) => node.parentId === props.node.id && props.visibleIds.has(node.id));
  const selected = props.node.sourceId && props.selection?.kind === "policy" && props.selection.id === props.node.sourceId;
  const isFolder = props.node.kind === "folder";
  const collapsed = props.collapsedFolderIds.includes(props.node.id);
  const Icon = props.node.kind === "folder" ? FolderOpen : props.node.kind === "routine" ? Workflow : props.node.kind === "config" ? SlidersHorizontal : GitBranch;
  return (
    <div className="automation-tree-branch">
      <div className="automation-tree-item">
        <button className={`${selected ? "selected " : ""}type-${props.node.kind}`} onClick={() => isFolder ? props.toggleFolder(props.node.id) : props.openNode(props.node, "preview")} onDoubleClick={() => props.openNode(props.node, "new-window")} type="button">
          {isFolder ? (collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />) : <Icon size={14} aria-hidden />}
          <span><strong>{props.node.label}</strong><small>{props.node.kind}</small></span>
        </button>
        {props.node.kind === "folder" ? <button className="tree-row-action" onClick={() => props.requestAction({ action: "create", parentId: props.node.id })} title={`Add inside ${props.node.label}`} aria-label={`Add inside ${props.node.label}`} type="button"><Plus size={13} aria-hidden /></button> : null}
        <button className="tree-row-action danger" onClick={() => props.requestAction({ action: "delete", node: props.node })} title={`Delete ${props.node.label}`} aria-label={`Delete ${props.node.label}`} type="button"><Trash2 size={13} aria-hidden /></button>
      </div>
      {children.length && !collapsed ? <div className="automation-tree-children"><AutomationHierarchyChildren nodes={sortAutomationHierarchyNodes(children)} allNodes={props.nodes} visibleIds={props.visibleIds} collapsedFolderIds={props.collapsedFolderIds} selection={props.selection} openNode={props.openNode} requestAction={props.requestAction} toggleFolder={props.toggleFolder} /></div> : null}
    </div>
  );
}

function AutomationHierarchyChildren(props: {
  nodes: AutomationHierarchyNode[];
  allNodes: AutomationHierarchyNode[];
  visibleIds: Set<string>;
  collapsedFolderIds: string[];
  selection: AutomationSelection | null;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  toggleFolder(folderId: string): void;
}) {
  return (
    <>
      {props.nodes.map((node) => (
        <AutomationHierarchyTreeNode
          key={node.id}
          node={node}
          nodes={props.allNodes}
          visibleIds={props.visibleIds}
          collapsedFolderIds={props.collapsedFolderIds}
          selection={props.selection}
          openNode={props.openNode}
          requestAction={props.requestAction}
          toggleFolder={props.toggleFolder}
        />
      ))}
    </>
  );
}

function sortAutomationHierarchyNodes(nodes: AutomationHierarchyNode[]): AutomationHierarchyNode[] {
  const rank: Record<AutomationHierarchyKind, number> = { folder: 0, task: 1, routine: 1, config: 1 };
  return [...nodes].sort((first, second) => rank[first.kind] - rank[second.kind] || first.label.localeCompare(second.label));
}

function automationHierarchyCategoryLabel(category: AutomationHierarchyCategory): string {
  return automationHierarchyCategories.find((item) => item.id === category)?.label ?? "Tasks";
}

function collectHierarchyAncestorIds(parentId: string | null, nodes: AutomationHierarchyNode[]): string[] {
  if (!parentId) return [];
  const parent = nodes.find((node) => node.id === parentId);
  return parent ? [parent.id, ...collectHierarchyAncestorIds(parent.parentId, nodes)] : [];
}

function collectHierarchyDescendantIds(parentId: string, nodes: AutomationHierarchyNode[]): string[] {
  const children = nodes.filter((node) => node.parentId === parentId);
  return children.flatMap((child) => [child.id, ...collectHierarchyDescendantIds(child.id, nodes)]);
}

function AutomationViewContainer(props: {
  active: boolean;
  children: ReactNode;
  heightPx: number | undefined;
  icon: typeof Blocks;
  locked: boolean;
  pinned: boolean;
  tabs: AutomationViewInstance[];
  windowId: string;
  windowIndex: number;
  subtitle: string;
  title: string;
  onActivate(): void;
  onClose(): void;
  onCloseTab(viewId: string): void;
  onLock(): void;
  onMaximize(): void;
  onPin(): void;
  onResizeStart(event: ReactPointerEvent<HTMLButtonElement>): void;
  onTabSelect(viewId: string): void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = props.icon;
  return (
    <section className={props.active ? "automation-view-container active" : "automation-view-container"} onMouseDown={props.onActivate} style={props.heightPx ? { height: props.heightPx } : undefined}>
      <header>
        <div>
          <Icon size={15} aria-hidden />
          <span><strong>{props.title}</strong><small>Window {props.windowIndex + 1} - {props.subtitle}</small></span>
        </div>
        <div className="automation-pane-actions">
          {props.locked ? <span>Locked</span> : null}
          {props.pinned ? <span>Pinned</span> : null}
          <button className={props.locked ? "icon-button selected" : "icon-button"} onClick={(event) => { event.stopPropagation(); props.onLock(); }} title="Lock selection" aria-label="Lock selection" type="button"><Lock size={13} aria-hidden /></button>
          <button className={props.pinned ? "icon-button selected" : "icon-button"} onClick={(event) => { event.stopPropagation(); props.onPin(); }} title="Pin view" aria-label="Pin view" type="button"><Pin size={13} aria-hidden /></button>
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onMaximize(); }} title="Maximize view" aria-label="Maximize view" type="button"><Maximize2 size={13} aria-hidden /></button>
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onClose(); }} title="Close window" aria-label="Close window" type="button"><XCircle size={13} aria-hidden /></button>
          <button className={menuOpen ? "icon-button selected" : "icon-button"} onClick={(event) => { event.stopPropagation(); setMenuOpen(!menuOpen); }} title="View menu" aria-label="View menu" type="button"><MoreHorizontal size={13} aria-hidden /></button>
        </div>
      </header>
      {menuOpen ? <div className="automation-view-menu"><button onClick={props.onPin} type="button">{props.pinned ? "Unpin view" : "Pin view"}</button><button onClick={props.onLock} type="button">{props.locked ? "Unlock pane" : "Lock pane"}</button><button onClick={props.onMaximize} type="button">Toggle maximize</button></div> : null}
      <div className="automation-window-tabs" role="tablist" aria-label={`Window ${props.windowIndex + 1} tabs`}>
        {props.tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button className={tab.label === props.subtitle ? "selected" : ""} key={tab.id} onClick={() => props.onTabSelect(tab.id)} role="tab" type="button">
              <TabIcon size={13} aria-hidden />
              <span>{tab.label}</span>
              <span className="tab-close" onClick={(event) => { event.stopPropagation(); props.onCloseTab(tab.id); }}>x</span>
            </button>
          );
        })}
      </div>
      <div className="automation-view-body">{props.children}</div>
      <button className="automation-window-resize-handle" onPointerDown={props.onResizeStart} title="Resize window" aria-label="Resize window" type="button" />
    </section>
  );
}

function AutomationTimelineView(props: { entries: any[]; notes: any[]; selectedEntry: any; setSelection(selection: AutomationSelection): void }) {
  const [zoom, setZoom] = useState(60);
  const [visibleTracks, setVisibleTracks] = useState<string[]>(["notes", "actions", "state", "policy", "runtime"]);
  const actionEntries = props.entries.filter((entry) => entry.type === "action");
  const stateEntries = props.entries.filter((entry) => entry.type === "state_delta" || entry.type === "state_checkpoint");
  const maxMs = Math.max(1, ...props.entries.map((entry) => entry.monotonicOffsetMs ?? 0));
  const timelineWidth = `${Math.max(100, zoom * 3)}%`;
  const tracks = [
    { id: "notes", label: "Notes", entries: props.entries.filter((entry) => entry.type === "note"), tone: "note" },
    { id: "actions", label: "Actions", entries: actionEntries, tone: "action" },
    { id: "state", label: "State Changes", entries: stateEntries, tone: "state" },
    { id: "policy", label: "Policy Nodes", entries: actionEntries, tone: "policy" },
    { id: "runtime", label: "Runtime Decisions", entries: props.entries.filter((entry) => entry.type === "marker" || entry.type === "observation"), tone: "runtime" }
  ];
  return (
    <section className="automation-timeline-view">
      <div className="automation-timeline-controls">
        <span>00:00</span>
        <input aria-label="Timeline zoom" max={100} min={25} onChange={(event) => setZoom(Number(event.target.value))} type="range" value={zoom} />
        <span>{props.entries.length ? `${maxMs} ms` : "00:00"}</span>
      </div>
      <div className="automation-track-filter-row">
        {tracks.map((track) => (
          <label key={track.id}><input checked={visibleTracks.includes(track.id)} onChange={(event) => setVisibleTracks((current) => event.target.checked ? [...current, track.id] : current.filter((item) => item !== track.id))} type="checkbox" />{track.label}</label>
        ))}
      </div>
      <div className="automation-timeline-ruler">
        <span>0s</span><span>25%</span><span>50%</span><span>75%</span><span>End</span>
      </div>
      <div className="automation-timeline-tracks">
        <div className="automation-timeline-inner" style={{ width: timelineWidth }}>
        {tracks.filter((track) => visibleTracks.includes(track.id)).map((track) => (
          <div className="automation-timeline-track" key={track.id}>
            <strong>{track.label}</strong>
            <div>
              {track.entries.map((entry) => (
                <button
                  className={props.selectedEntry?.id === entry.id ? `selected ${track.tone}` : track.tone}
                  key={`${track.id}:${entry.id}`}
                  onClick={() => props.setSelection({ kind: "timeline", id: entry.id })}
                  style={{ left: `${Math.min(96, Math.max(1, ((entry.monotonicOffsetMs ?? 0) / maxMs) * 100))}%`, width: timelineEventWidth(entry) }}
                  type="button"
                >
                  {timelineEntrySummary(entry)}
                </button>
              ))}
            </div>
          </div>
        ))}
        </div>
      </div>
      <div className="automation-range-summary">
        <strong>Selected Range</strong>
        <span>Actions {actionEntries.length}</span>
        <span>State changes {stateEntries.length}</span>
        <span>Notes {props.notes.length}</span>
        <span>Selected {props.selectedEntry ? timelineEntrySummary(props.selectedEntry) : "none"}</span>
      </div>
    </section>
  );
}

function timelineEventWidth(entry: any): string {
  if (entry.type === "note") return "180px";
  if (entry.type === "state_checkpoint") return "150px";
  if (entry.type === "state_delta") return "170px";
  return "130px";
}

function AutomationNodeDetailView(props: { node: any; entries: any[] }) {
  if (!props.node) return <EmptyAutomationView title="No node selected" message="Select a policy node to inspect eligibility, actions, expectations, evidence, and runtime history." />;
  return (
    <section className="automation-detail-view">
      <SummaryStrip items={[
        ["Actions", props.node.actions?.length ?? 0],
        ["Evidence", props.node.sourceEvidence?.length ?? 0],
        ["Timeline Hits", props.entries.filter((entry) => entry.type === "action").length],
        ["Recovery", props.node.recovery?.strategy ?? "default"]
      ]} />
      <div className="automation-detail-grid">
        <InspectorSection title="Eligibility" rows={[["Eligibility", conditionSummary(props.node.eligibility)], ["Readiness", conditionSummary(props.node.readinessConditions)]]} />
        <InspectorSection title="Expected Results" rows={[["Success", conditionSummary(props.node.successConditions)], ["Failure", conditionSummary(props.node.failureConditions)]]} />
        <InspectorSection title="Runtime History" rows={[["Runs", "124"], ["Successes", "118"], ["Retries", "5"], ["Median duration", "1.7s"]]} />
        <InspectorSection title="Training" rows={[["Suggested adjustment", "Increase timeout when recent runs exceed observed median"], ["Risk", "Low"]]} />
      </div>
    </section>
  );
}

function AutomationAssistantView(props: { node: any; recording: any; signals: any[] }) {
  const [assistantText, setAssistantText] = useState("");
  const [proposal, setProposal] = useState("No proposal selected.");
  const propose = (kind: string) => {
    setProposal(`${kind}: Context includes ${props.node?.label ?? "no node"}, ${props.recording?.recordingId ?? "no recording"}, and ${props.signals.length} signals.`);
  };
  return (
    <section className="automation-assistant-view">
      <div className="context-chip-row">
        <span>Node: {props.node?.label ?? "none"}</span>
        <span>Recording: {props.recording?.recordingId ?? "none"}</span>
        <span>Signals: {props.signals.length}</span>
      </div>
      <textarea aria-label="Assistant request" onChange={(event) => setAssistantText(event.target.value)} placeholder="Ask for an explanation or propose a structured policy edit." value={assistantText} />
      <div className="assistant-proposal-card">
        <strong>Proposal Preview</strong>
        <span>{proposal}</span>
        <div className="inline-actions"><button className="button" onClick={() => propose("Explain selection")} type="button">Explain Selection</button><button className="button" onClick={() => propose("Compare evidence")} type="button">Compare Evidence</button><button className="button" disabled={!assistantText.trim()} onClick={() => propose("Draft policy edit")} type="button">Draft Edit</button></div>
      </div>
    </section>
  );
}

function AutomationConfigView(props: { policy: any }) {
  return (
    <section className="automation-config-view">
      <InspectorSection title="Task Inputs" rows={[["target_item", "item reference"], ["retry_count", "integer, default 3"], ["runtime_editable", "true"]]} />
      <InspectorSection title="Task Outputs" rows={[["completion_status", "runtime statistic"], ["elapsed_time", "runtime statistic"], ["failure_reason", "error path"]]} />
      <InspectorSection title="Configuration" rows={[["Policy", props.policy?.policyId ?? "-"], ["Environment overrides", "None"], ["Runtime limits", "Default"]]} />
    </section>
  );
}

function AutomationRoutineView(props: { models: any[]; policies: any[] }) {
  const [selectedRoutineNodeId, setSelectedRoutineNodeId] = useState("routine-start");
  const [layer, setLayer] = useState("Routine flow");
  const graph = useMemo(() => routineToReactFlowGraph(props.policies, selectedRoutineNodeId), [props.policies, selectedRoutineNodeId]);
  const selectedNode = graph.nodes.find((node) => node.id === selectedRoutineNodeId)?.data;
  const palette = [
    ["Base", "Start", "Task Policy", "Decision", "Wait", "Parallel", "Approval", "Recovery", "End"],
    ["Custom", "Custom Action", "Custom Condition", "Custom Adapter", "Subroutine"]
  ];
  return (
    <section className="automation-policy-canvas routine-canvas">
      <div className="automation-layer-tabs" role="tablist" aria-label="Routine graph layers">
        {["Routine flow", "Tasks", "Branches", "Recovery", "Permissions", "Custom nodes"].map((item) => (
          <button className={layer === item ? "selected" : ""} key={item} onClick={() => setLayer(item)} type="button">{item}</button>
        ))}
      </div>
      <div className="automation-routine-editor-grid">
        <aside className="automation-node-palette" aria-label="Routine node palette">
          {palette.map(([title, ...items]) => (
            <section key={title}>
              <strong>{title}</strong>
              {items.map((item) => <button key={item} type="button"><Plus size={12} aria-hidden />{item}</button>)}
            </section>
          ))}
        </aside>
        <div className="automation-react-flow-frame">
          <ReactFlow
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={automationNodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_event, node) => setSelectedRoutineNodeId(node.id)}
          >
            <Background gap={24} size={1} />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <aside className="automation-routine-node-inspector">
          <strong>{selectedNode?.label ?? "Routine node"}</strong>
          <span>{selectedNode?.description ?? "Select a routine node."}</span>
          <KeyValue rows={[
            ["Type", selectedNode?.nodeType ?? "-"],
            ["Family", selectedNode?.family ?? "-"],
            ["Inputs", String(selectedNode?.inputs ?? 0)],
            ["Outputs", String(selectedNode?.outputs ?? 0)],
            ["Privileged", selectedNode?.privileged ? "Yes" : "No"]
          ]} />
        </aside>
      </div>
      <div className="automation-canvas-legend">
        <span><strong>Layer</strong> {layer}</span>
        <span><strong>Base</strong> built-in routine node</span>
        <span><strong>Custom</strong> user-defined routine node</span>
        <span><strong>No evidence/state</strong> routine-only graph</span>
      </div>
    </section>
  );
}

function AutomationStateExplorerView(props: { signals: any[]; entries: any[]; setSelection(selection: AutomationSelection): void }) {
  const [mode, setMode] = useState<"Tree" | "Table" | "Diff" | "Graph" | "Raw">("Tree");
  return (
    <section className="automation-state-explorer-view">
      <div className="segmented-control">{(["Tree", "Table", "Diff", "Graph", "Raw"] as const).map((item) => <button className={mode === item ? "selected" : ""} key={item} onClick={() => setMode(item)} type="button">{item}</button>)}</div>
      <div className="automation-state-list">
        {props.signals.map((signal) => (
          <button key={signal.path} onClick={() => props.setSelection({ kind: "signal", id: signal.path })} type="button">
            <strong>{signal.path}</strong>
            <span>{mode}: {signal.type} - weight {signal.defaultWeight}</span>
          </button>
        ))}
        {!props.signals.length ? <span>No state signals available.</span> : null}
      </div>
      <div className="automation-range-summary"><strong>Timeline events</strong><span>{props.entries.length}</span><span>Pin signals and create conditions from selected values in later slices.</span></div>
    </section>
  );
}

function EmptyAutomationView(props: { title: string; message: string }) {
  return <section className="automation-empty-view"><strong>{props.title}</strong><span>{props.message}</span></section>;
}

function AutomationWorkspaceDock(props: { activeTab: AutomationDockTab; problems: any[]; signals: any[]; models: any[]; selectedNode: any; setActiveTab(tab: AutomationDockTab): void }) {
  const tabs: Array<{ id: AutomationDockTab; label: string; count?: number }> = [
    { id: "assistant", label: "Assistant" },
    { id: "problems", label: "Problems", count: props.problems.length },
    { id: "history", label: "History" },
    { id: "state", label: "State Explorer", count: props.signals.length }
  ];
  return (
    <footer className="automation-bottom-dock">
      <div className="automation-dock-tabs">
        {tabs.map((tab) => <button className={props.activeTab === tab.id ? "selected" : ""} key={tab.id} onClick={() => props.setActiveTab(tab.id)} type="button">{tab.label}{tab.count !== undefined ? <span>{tab.count}</span> : null}</button>)}
      </div>
      {props.activeTab === "assistant" ? <div className="automation-dock-panel-grid single">
        <section className="automation-ai-panel">
          <header><Sparkles size={14} aria-hidden /><strong>Context</strong></header>
          <div className="context-chip-row">
            <span>Node: {props.selectedNode?.label ?? "none"}</span>
            <span>Signals: {props.signals.length}</span>
            <span>Models: {props.models.length}</span>
          </div>
          <p>Proposed changes appear here with preview, apply, reject, and evidence before anything edits the policy.</p>
        </section>
      </div> : null}
      {props.activeTab === "problems" ? <div className="automation-dock-panel-grid single">
        <section className="automation-problem-strip">
          <header><AlertTriangle size={14} aria-hidden /><strong>Problems</strong></header>
          {props.problems.slice(0, 3).map((problem) => <button key={problem.id} type="button"><StatusBadge value={problem.severity} />{problem.message}</button>)}
          {!props.problems.length ? <span>No validation problems in the current snapshot.</span> : null}
        </section>
      </div> : null}
      {props.activeTab === "history" ? <div className="automation-dock-panel-grid single">
        <section className="automation-history-strip">
          <header><History size={14} aria-hidden /><strong>Change History</strong></header>
          <span>Generated values will record source, previous value, new value, timestamp, and actor.</span>
        </section>
      </div> : null}
      {props.activeTab === "state" ? <div className="automation-dock-panel-grid single">
        <section className="automation-history-strip">
          <header><ListChecks size={14} aria-hidden /><strong>State Signals</strong></header>
          <div className="context-chip-row">{props.signals.slice(0, 8).map((signal) => <span key={signal.path}>{signal.path}</span>)}</div>
        </section>
      </div> : null}
    </footer>
  );
}

function AutomationPolicyCanvas(props: { policy: any; selectedNode: any; setSelection(selection: AutomationSelection): void }) {
  const [layer, setLayer] = useState("Logical flow");
  const graph = useMemo(() => policyToReactFlowGraph(props.policy, props.selectedNode?.id), [props.policy, props.selectedNode?.id]);
  return (
    <section className="automation-policy-canvas">
      <div className="automation-layer-tabs" role="tablist" aria-label="Policy graph layers">
        {["Logical flow", "State eligibility", "Actions", "Expectations", "Recovery", "Evidence", "Runtime"].map((item) => (
          <button className={layer === item ? "selected" : ""} key={item} onClick={() => setLayer(item)} type="button">{item}</button>
        ))}
      </div>
      <div className="automation-react-flow-frame">
        <ReactFlow
          fitView
          fitViewOptions={{ padding: 0.25 }}
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={automationNodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_event, node) => props.setSelection({ kind: "node", id: node.id })}
        >
          <Background gap={24} size={1} />
          <MiniMap pannable zoomable />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="automation-canvas-legend">
        <span><strong>Layer</strong> {layer}</span>
        <span><strong>Blue</strong> normal transition</span>
        <span><strong>Orange</strong> retry/recovery</span>
        <span><strong>Red</strong> failure path</span>
        <span><strong>Width</strong> confidence/probability</span>
      </div>
    </section>
  );
}

function AutomationPolicyNode({ data, selected }: NodeProps) {
  const node = data as AutomationPolicyNodeData;
  return (
    <div className={selected ? "automation-flow-node selected" : "automation-flow-node"}>
      <Handle type="target" position={Position.Left} className="automation-flow-handle input" />
      <div className="node-badges">
        {node.isStart ? <span className="node-badge start">Start</span> : null}
        <span className="node-badge category">Generated</span>
        <span className="node-badge category">{node.recovery.replace(/_/g, " ")}</span>
        {node.confidence !== undefined ? <span className="node-badge confidence">{Math.round(node.confidence * 100)}%</span> : null}
      </div>
      <div className="automation-flow-node-main">
        <span className="node-icon" title="Policy node">
          <GitBranch size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{node.label}</strong>
          <span>{node.actionTypes.join(", ") || "No action"}</span>
        </div>
      </div>
      <div className="node-definition-lines">
        <span>Eligible: {node.readinessCount || 0} signals</span>
        <span>Success: {node.successCount || 0} expectations</span>
        <span>Timeout: {node.timeoutMs ? `${(node.timeoutMs / 1000).toFixed(1)}s` : "default"}</span>
      </div>
      <div className="node-state-indicators">
        <span className={node.readinessCount ? "node-state-chip has-state" : "node-state-chip empty-state"}>Ready {node.readinessCount}</span>
        <span className={node.successCount ? "node-state-chip has-state" : "node-state-chip empty-state"}>Success {node.successCount}</span>
        <span className="node-state-chip has-state">Evidence {node.evidenceCount}</span>
      </div>
      <footer className="node-runtime-line">12 successes - 1 retry</footer>
      <Handle type="source" position={Position.Right} id="next" className="automation-flow-handle output" />
    </div>
  );
}

function AutomationRoutineNode({ data, selected }: NodeProps) {
  const node = data as AutomationRoutineNodeData;
  return (
    <div className={selected ? `automation-flow-node routine-node selected ${node.nodeType}` : `automation-flow-node routine-node ${node.nodeType}`}>
      <Handle type="target" position={Position.Left} className="automation-flow-handle input" />
      <div className="node-badges">
        <span className={node.nodeType === "custom" ? "node-badge custom" : "node-badge category"}>{node.nodeType}</span>
        <span className="node-badge category">{node.family}</span>
        {node.privileged ? <span className="node-badge privileged">PIN</span> : null}
      </div>
      <div className="automation-flow-node-main">
        <span className="node-icon" title="Routine node">
          <Workflow size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{node.label}</strong>
          <span>{node.description}</span>
        </div>
      </div>
      <div className="node-definition-lines">
        <span>Inputs: {node.inputs}</span>
        <span>Outputs: {node.outputs}</span>
        <span>Scope: routine orchestration</span>
      </div>
      <footer className="node-runtime-line">No recordings or state bindings</footer>
      <Handle type="source" position={Position.Right} id="next" className="automation-flow-handle output" />
    </div>
  );
}

function AutomationRecordingWorkspace(props: { recordings: any[]; selectedRecording: any; selectedTimeline: any; setSelection(selection: AutomationSelection): void }) {
  const entries = props.selectedTimeline?.timeline ?? props.selectedRecording?.timeline ?? [];
  return (
    <section className="automation-recording-stage">
      <header><strong>{props.selectedRecording?.recordingId ?? "No recording"}</strong><span>{entries.length} timeline entries</span></header>
      <div className="automation-track-stack">
        {["note", "action", "state_delta", "state_checkpoint"].map((type) => (
          <div className="automation-track" key={type}>
            <strong>{type.replace("_", " ")}</strong>
            <div>
              {entries.filter((entry: any) => entry.type === type).map((entry: any) => (
                <button key={entry.id} onClick={() => props.setSelection({ kind: "timeline", id: entry.id })} style={{ left: `${Math.min(92, Math.max(0, (entry.monotonicOffsetMs ?? 0) / 18))}%` }} type="button">
                  <span>{timelineEntrySummary(entry)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AutomationSignalWorkspace(props: { signals: any[]; setSelection(selection: AutomationSelection): void }) {
  return (
    <section className="automation-signal-board">
      {props.signals.map((signal) => (
        <button key={signal.path} onClick={() => props.setSelection({ kind: "signal", id: signal.path })} type="button">
          <span>{signal.namespace}</span>
          <strong>{signal.path}</strong>
          <small>{signal.type} | weight {signal.defaultWeight} | {signal.volatility}</small>
        </button>
      ))}
    </section>
  );
}

function AutomationRuntimeWorkspace(props: { timelines: any[]; models: any[]; policies: any[] }) {
  return (
    <section className="automation-runtime-stage">
      <SummaryStrip items={[
        ["Timelines", props.timelines.length],
        ["Models", props.models.length],
        ["Policies", props.policies.length],
        ["Runnable Nodes", props.policies.reduce((total, policy) => total + (policy.nodes?.length ?? 0), 0)]
      ]} />
      <DataTable columns={["Model", "Task", "Clusters", "Transitions", "Questions"]} rows={props.models.map((model) => [
        model.learnedTaskModelId,
        model.taskId,
        model.actionClusters?.length ?? 0,
        model.transitions?.length ?? 0,
        model.unresolvedQuestions?.length ?? 0
      ])} empty="No learned task models available." />
    </section>
  );
}

function AutomationProblemsWorkspace(props: { problems: any[] }) {
  return <DataTable columns={["Severity", "Artifact", "Message"]} rows={props.problems.map((problem) => [<StatusBadge key={problem.id} value={problem.severity} />, problem.artifactId ?? problem.artifactKind ?? "-", problem.message])} empty="No validation, runtime, or fixture problems are currently reported." />;
}

function AutomationInspector(props: { selection: AutomationSelection | null; policy: any; node: any; recording: any; entry: any; signal: any; followSelection: boolean; setFollowSelection(value: boolean): void }) {
  const title = props.selection?.kind === "signal" ? "Signal" : props.selection?.kind === "timeline" ? "Timeline Entry" : props.selection?.kind === "recording" ? "Recording" : props.selection?.kind === "policy" ? "Policy Graph" : "Node Inspector";
  return (
    <aside className="automation-inspector">
      <header>
        <span>Inspector</span>
        <strong>{title}</strong>
        <div className="automation-inspector-tools">
          <button className={props.followSelection ? "button selected" : "button"} onClick={() => props.setFollowSelection(!props.followSelection)} type="button">Follow</button>
          <button className={!props.followSelection ? "button selected" : "button"} onClick={() => props.setFollowSelection(false)} type="button">Lock</button>
        </div>
      </header>
      <div className="automation-inspector-search">
        <Search size={14} aria-hidden />
        <input aria-label="Search inspector fields" placeholder="Search fields" />
      </div>
      {props.selection?.kind === "signal" && props.signal ? <>
        <InspectorSection title="General" rows={[["Path", props.signal.path], ["Type", props.signal.type], ["Weight", String(props.signal.defaultWeight)], ["Volatility", props.signal.volatility], ["Registry", props.signal.registryId]]} />
        <InspectorSection title="Connections" rows={[["Used by nodes", "Linked through eligibility and success conditions"], ["Relationship view", "Open in signal web"]]} />
        <InspectorProvenance current={String(props.signal.defaultWeight)} source="Signal registry default" />
      </> : null}
      {props.selection?.kind === "timeline" && props.entry ? <>
        <InspectorSection title="General" rows={[["Entry", props.entry.id], ["Type", props.entry.type], ["Offset", `${props.entry.monotonicOffsetMs} ms`], ["Source", props.entry.sourceId], ["Summary", timelineEntrySummary(props.entry)]]} />
        <InspectorSection title="Linked Views" rows={[["Policy node", "Highlight matching node"], ["State diff", "Open selected range"]]} />
      </> : null}
      {props.selection?.kind === "recording" && props.recording ? <>
        <InspectorSection title="Recording Metadata" rows={[["Recording", props.recording.recordingId], ["Task", props.recording.taskId ?? "-"], ["Environment", props.recording.environment?.label ?? "-"], ["Entries", String(props.recording.timeline?.length ?? 0)], ["Notes", String(props.recording.notes?.length ?? 0)]]} />
        <InspectorSection title="Dataset Actions" rows={[["Status", "Raw, normalized, mined"], ["Compare", "Align by semantic actions"], ["Reprocess", "Run normalization and mining"]]} />
      </> : null}
      {(!props.selection || props.selection.kind === "node") && props.node ? <>
        <InspectorSection title="General" rows={[["Node", props.node.label], ["ID", props.node.id], ["Actions", (props.node.actions ?? []).map((action: any) => action.actionType).join(", ")], ["Recovery", props.node.recovery?.strategy ?? "-"]]} />
        <InspectorSection title="Conditions" rows={[["Eligibility", conditionSummary(props.node.eligibility)], ["Readiness", conditionSummary(props.node.readinessConditions)], ["Success", conditionSummary(props.node.successConditions)]]} />
        <InspectorSection title="Timing and Retries" rows={[["Timeout", props.node.timeout?.timeoutMs ? `${props.node.timeout.timeoutMs} ms` : "Default"], ["Retry", props.node.retry?.strategy ?? "Default"], ["Recovery", props.node.recovery?.strategy ?? "-"]]} />
        <InspectorProvenance current={props.node.timeout?.timeoutMs ? `${props.node.timeout.timeoutMs} ms` : "Default"} source="Generated from recording evidence and editable by user" />
        <details className="json-details"><summary><Braces size={13} aria-hidden />Raw definition</summary><pre>{shortJson(props.node)}</pre></details>
      </> : null}
      {props.selection?.kind === "policy" && props.policy ? <>
        <InspectorSection title="Policy" rows={[["Policy", props.policy.policyId], ["Task", props.policy.taskId], ["Version", props.policy.version], ["Nodes", String(props.policy.nodes?.length ?? 0)], ["Edges", String(props.policy.edges?.length ?? 0)]]} />
        <InspectorSection title="Validation" rows={[["Schema", "Ready"], ["Graph", "Check missing references"], ["Portability", "Domain-neutral contracts"]]} />
      </> : null}
    </aside>
  );
}

function InspectorSection(props: { title: string; rows: Array<[string, string]> }) {
  return (
    <details className="automation-inspector-section" open>
      <summary>{props.title}</summary>
      <KeyValue rows={props.rows} />
    </details>
  );
}

function InspectorProvenance(props: { current: string; source: string }) {
  return (
    <section className="automation-provenance-card">
      <strong>Value Provenance</strong>
      <span>Current: {props.current}</span>
      <small>{props.source}</small>
    </section>
  );
}

function AutomationTimelineDock(props: { entries: any[]; notes: any[]; problems: any[]; setSelection(selection: AutomationSelection): void }) {
  return (
    <footer className="automation-bottom-dock">
      <div className="automation-dock-tabs"><strong>Timeline</strong><span>{props.entries.length} entries</span><span>{props.notes.length} notes</span><span>{props.problems.length} problems</span></div>
      <div className="automation-dock-scroll">
        {props.entries.map((entry) => (
          <button key={entry.id} onClick={() => props.setSelection({ kind: "timeline", id: entry.id })} type="button">
            <strong>{entry.sequence}</strong>
            <span>{entry.type}</span>
            <small>{timelineEntrySummary(entry)}</small>
          </button>
        ))}
      </div>
    </footer>
  );
}

function IdentityAccessLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("identity-access");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newUser, setNewUser] = useState({ username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true });
  const [totpCode, setTotpCode] = useState("");
  const [totpSetup, setTotpSetup] = useState<any>(null);
  const [credentialEdit, setCredentialEdit] = useState<{ kind: "password" | "pin"; value: string; confirm: string; authorizationPassword: string; authorizationPin: string; authorizationTotp: string } | null>(null);
  const [credentialAlert, setCredentialAlert] = useState<{ tone: AlertTone; message: string } | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ userId: string; roleId: string; password: string; pin: string; totp: string } | null>(null);
  const [roleAlert, setRoleAlert] = useState<{ tone: AlertTone; message: string } | null>(null);

  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const users = snapshot?.payload?.users ?? [];
  const roles = snapshot?.payload?.roles ?? [];
  const selectedUser = users.find((user: any) => user.id === selectedUserId) ?? users[0];
  const actorUser = users.find((user: any) => user.id === currentUser.id);
  const actorPinConfigured = Boolean(actorUser?.pinConfigured);

  async function createUser() {
    const result = await api.post("create-user", newUser);
    setStatus(result.ok ? "User created" : result.error ?? "Create failed");
    setNewUser({ username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true });
    await refresh();
  }

  async function updateUser(user: any, patch: JsonObject) {
    const result = await api.post("update-user", { id: user.id, ...patch });
    setStatus(result.ok ? "User updated" : result.error ?? "Update failed");
    await refresh();
  }

  async function saveRoleEdit() {
    if (!roleEdit) return;
    const result = await api.post("update-user", {
      id: roleEdit.userId,
      roleId: roleEdit.roleId,
      authorizationPassword: roleEdit.password,
      authorizationPin: roleEdit.pin,
      authorizationTotp: roleEdit.totp
    });
    if (result.ok) {
      setStatus("Role updated");
      setRoleAlert(null);
      setRoleEdit(null);
    } else {
      setRoleAlert({ tone: "error", message: result.error ?? "Role update failed." });
    }
    await refresh();
  }

  async function saveCredential() {
    if (!selectedUser || !credentialEdit || credentialEdit.value !== credentialEdit.confirm) {
      setCredentialAlert({ tone: "error", message: "Credential values must match." });
      return;
    }
    const endpoint = credentialEdit.kind === "password" ? "set-password" : "set-pin";
    const result = await api.post(endpoint, {
      userId: selectedUser.id,
      value: credentialEdit.value,
      authorizationPassword: credentialEdit.authorizationPassword,
      authorizationPin: credentialEdit.authorizationPin,
      authorizationTotp: credentialEdit.authorizationTotp
    });
    if (result.ok) {
      setStatus(`${credentialEdit.kind} updated`);
      setCredentialAlert(null);
      setCredentialEdit(null);
      return;
    }
    setCredentialAlert({ tone: "error", message: result.error ?? "Credential update failed." });
  }

  async function beginTotp(userId = selectedUser?.id) {
    if (!userId) return;
    const result = await api.post("begin-totp", { userId });
    if (result.ok) {
      setTotpSetup(result.payload);
      setTotpCode("");
      setStatus("TOTP setup started");
      return;
    }
    setStatus(result.error ?? "TOTP setup failed");
  }

  async function confirmTotp() {
    if (!selectedUser) return;
    const result = await api.post("confirm-totp", { userId: selectedUser.id, code: totpCode });
    setStatus(result.ok ? "TOTP enabled" : result.error ?? "TOTP confirmation failed");
    if (result.ok) setTotpSetup(null);
    await refresh();
  }

  return (
    <section className="program-workspace-grid">
      <Panel title="Authentication">
        <KeyValue rows={[["Required", "Yes"], ["First setup user", "admin"], ["First setup password", "admin"], ["PIN", "Created after login"], ["2FA", "Per-user TOTP setup"]]} />
        <p className="muted-text">FluxIQ authentication is global. The first-run admin account is created automatically and can be rotated here.</p>
      </Panel>
      <Panel title="Create User" action={<button className="button button-primary" disabled={!newUser.username || !newUser.displayName || !newUser.password || (newUser.pin.length > 0 && newUser.pin.length < 4)} onClick={createUser} type="button">Create</button>}>
        <div className="field-row dense-fields">
          <Field label="Username"><input value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /></Field>
          <Field label="Display name"><input value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} /></Field>
          <Field label="Role"><select value={newUser.roleId} onChange={(event) => setNewUser({ ...newUser, roleId: event.target.value })}>{roles.map((role: any) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field>
          <Field label="Temporary password"><input type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></Field>
          <Field label="PIN (optional)"><input value={newUser.pin} onChange={(event) => setNewUser({ ...newUser, pin: digits(event.target.value) })} /></Field>
          <label className="check-row"><input checked={newUser.enabled} onChange={(event) => setNewUser({ ...newUser, enabled: event.target.checked })} type="checkbox" />Enabled</label>
        </div>
      </Panel>

      <Panel title="Users">
        <DataTable columns={["User", "Role", "2FA", "Enabled", "Actions"]} rows={users.map((user: any) => [
          <button className="link-button" onClick={() => setSelectedUserId(user.id)} type="button">{user.displayName}<small>{user.username}</small></button>,
          <span className="role-cell"><strong>{user.roleId}</strong><button className="button" onClick={() => { setRoleAlert(null); setRoleEdit({ userId: user.id, roleId: user.roleId, password: "", pin: "", totp: "" }); }} type="button">Edit Role</button></span>,
          user.totpEnabled ? "Enabled" : "Off",
          <input checked={user.enabled} onChange={(event) => void updateUser(user, { enabled: event.target.checked })} type="checkbox" />,
          <div className="inline-actions"><button className="button" onClick={() => { setSelectedUserId(user.id); setCredentialAlert(null); setCredentialEdit(emptyCredentialEdit("password")); }} type="button">Password</button><button className="button" onClick={() => { setSelectedUserId(user.id); setCredentialAlert(null); setCredentialEdit(emptyCredentialEdit("pin")); }} type="button">PIN</button><button className="button" onClick={() => { setSelectedUserId(user.id); void (user.totpEnabled ? api.post("disable-totp", { userId: user.id }).then(refresh) : beginTotp(user.id)); }} type="button">{user.totpEnabled ? "Disable 2FA" : "Setup 2FA"}</button></div>
        ])} empty="No framework users have been created yet." />
      </Panel>

      <Panel title="Roles">
        <DataTable columns={["Role", "Permissions"]} rows={roles.map((role: any) => [role.id, role.permissions.join(", ")])} />
      </Panel>

      <Panel title="Two-Factor Setup">
        <div className="totp-setup-shell">
          <div className="totp-setup-summary">
            <span className="program-icon"><ShieldCheck size={18} aria-hidden /></span>
            <div>
              <strong>{selectedUser?.displayName ?? "No user selected"}</strong>
              <small>{selectedUser?.username ?? "Select a user from the users table"}</small>
            </div>
            <StatusBadge value={selectedUser?.totpEnabled ? "Enabled" : "Off"} />
          </div>
          {selectedUser?.totpEnabled ? <VisualAlert tone="success" title="2FA enabled" message="This user already has authenticator-based two-factor authentication enabled." /> : null}
          {!selectedUser?.totpEnabled ? <div className="inline-actions">
            <button className="button button-primary" disabled={!selectedUser} onClick={() => void beginTotp(selectedUser?.id)} type="button">
              <QrCode size={15} aria-hidden />
              Generate QR Setup
            </button>
          </div> : null}
          {totpSetup ? <div className="totp-enrollment">
            <div className="totp-qr-card">
              <div className="totp-qr-frame" dangerouslySetInnerHTML={{ __html: String(totpSetup.qrSvg ?? "") }} />
              <span>Scan with an authenticator app</span>
            </div>
            <div className="totp-enrollment-steps">
              <VisualAlert tone="info" title="Authenticator setup" message="Scan the QR code, or copy the manual key into your authenticator app. Then enter the six-digit code to enable 2FA." />
              <div className="secret-copy-row">
                <span>
                  <strong>Manual key</strong>
                  <code>{totpSetup.secret}</code>
                </span>
                <button className="button" onClick={() => copyText(String(totpSetup.secret ?? ""))} type="button">
                  <Copy size={14} aria-hidden />
                  Copy
                </button>
              </div>
              <details className="otpauth-details">
                <summary>Advanced URI</summary>
                <code>{totpSetup.otpauthUrl}</code>
              </details>
              <Field label="Six-digit code"><input inputMode="numeric" value={totpCode} onChange={(event) => setTotpCode(digits(event.target.value).slice(0, 6))} /></Field>
              <div className="modal-actions"><button className="button" onClick={() => { setTotpSetup(null); setTotpCode(""); }} type="button">Cancel Setup</button><button className="button button-primary" disabled={totpCode.length !== 6} onClick={confirmTotp} type="button">Enable 2FA</button></div>
            </div>
          </div> : null}
          {!totpSetup && !selectedUser?.totpEnabled ? <p className="muted-text">Select a user, then generate a QR setup to enroll an authenticator app.</p> : null}
        </div>
        <StatusText value={status} />
      </Panel>

      {credentialEdit ? <Modal title={`Change ${credentialEdit.kind}`} onClose={() => setCredentialEdit(null)}>
        {credentialAlert ? <VisualAlert tone={credentialAlert.tone} title="Credential update" message={credentialAlert.message} /> : null}
        <Field label="New value"><input type={credentialEdit.kind === "password" ? "password" : "text"} value={credentialEdit.value} onChange={(event) => setCredentialEdit({ ...credentialEdit, value: credentialEdit.kind === "pin" ? digits(event.target.value) : event.target.value })} /></Field>
        <Field label="Confirm value"><input type={credentialEdit.kind === "password" ? "password" : "text"} value={credentialEdit.confirm} onChange={(event) => setCredentialEdit({ ...credentialEdit, confirm: credentialEdit.kind === "pin" ? digits(event.target.value) : event.target.value })} /></Field>
        <VisualAlert tone="warning" title="Authorization required" message={`${actorPinConfigured ? "Enter your current password and PIN" : "Enter your current password"}${currentUser.totpEnabled ? ", plus your 2FA code" : ""} before changing credentials.`} />
        <Field label="Your current password"><input type="password" value={credentialEdit.authorizationPassword} onChange={(event) => setCredentialEdit({ ...credentialEdit, authorizationPassword: event.target.value })} /></Field>
        {actorPinConfigured ? <Field label="Your current PIN"><input value={credentialEdit.authorizationPin} onChange={(event) => setCredentialEdit({ ...credentialEdit, authorizationPin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled ? <Field label="Your 2FA code"><input value={credentialEdit.authorizationTotp} onChange={(event) => setCredentialEdit({ ...credentialEdit, authorizationTotp: digits(event.target.value) })} /></Field> : null}
        <div className="modal-actions"><button className="button" onClick={() => setCredentialEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!credentialEdit.value || credentialEdit.value !== credentialEdit.confirm || !credentialEdit.authorizationPassword || (actorPinConfigured && credentialEdit.authorizationPin.length < 4) || (currentUser.totpEnabled && credentialEdit.authorizationTotp.length !== 6)} onClick={saveCredential} type="button">Save</button></div>
      </Modal> : null}

      {roleEdit ? <Modal title="Edit Role" onClose={() => setRoleEdit(null)}>
        {roleAlert ? <VisualAlert tone={roleAlert.tone} title="Role update" message={roleAlert.message} /> : null}
        <Field label="Role"><select value={roleEdit.roleId} onChange={(event) => setRoleEdit({ ...roleEdit, roleId: event.target.value })}>{roles.map((role: any) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field>
        <Field label="Your password"><input type="password" value={roleEdit.password} onChange={(event) => setRoleEdit({ ...roleEdit, password: event.target.value })} /></Field>
        {actorPinConfigured ? <Field label="Your PIN"><input value={roleEdit.pin} onChange={(event) => setRoleEdit({ ...roleEdit, pin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled ? <Field label="Your 2FA code"><input value={roleEdit.totp} onChange={(event) => setRoleEdit({ ...roleEdit, totp: digits(event.target.value) })} /></Field> : null}
        <div className="modal-actions"><button className="button" onClick={() => setRoleEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!roleEdit.password || (actorPinConfigured && roleEdit.pin.length < 4) || (currentUser.totpEnabled && roleEdit.totp.length !== 6)} onClick={saveRoleEdit} type="button">Save Role</button></div>
      </Modal> : null}
    </section>
  );
}

function DatabaseManagerLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("database-manager");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [kind, setKind] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedDatabase, setSelectedDatabase] = useState("global");
  const [search, setSearch] = useState("");
  const [columnFilter, setColumnFilter] = useState("");
  const [status, setStatus] = useState("");
  const [credentialRecheck, setCredentialRecheck] = useState({ password: "", pin: "", totp: "" });
  const [authorizedStores, setAuthorizedStores] = useState<string[]>([]);
  const [recheckOpen, setRecheckOpen] = useState(false);

  const refresh = useCallback(async () => {
    const next = await api.get("snapshot");
    setSnapshot(next);
    const firstKind = (next.payload as any)?.stores?.[0]?.kind ?? "";
    setKind((current) => current || firstKind);
  }, [api]);
  const loadRecords = useCallback(async (storeKind = kind, authorization?: typeof credentialRecheck) => {
    if (!storeKind) return;
    const sensitive = isSensitiveDatabaseStore(storeKind);
    if (sensitive) {
      const authorized = authorizedStores.includes(sensitiveStoreKey(storeKind, selectedDatabase));
      if (!authorized) {
        setRecords([]);
        setSelectedRecord(null);
        setStatus("");
        setRecheckOpen(true);
        return;
      }
      if (!authorization) return;
    }
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post("list-records", {
      kind: storeKind,
      scope,
      ...(sensitive && authorization ? {
        authorizationPassword: authorization.password,
        authorizationPin: authorization.pin,
        authorizationTotp: authorization.totp
      } : {})
    });
    if (!result.ok) {
      setRecords([]);
      setSelectedRecord(null);
      setStatus(result.error ?? "Unable to load records.");
      return;
    }
    setStatus("");
    setRecords((result.payload as any[]) ?? []);
  }, [api, kind, selectedDatabase, authorizedStores]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => void loadRecords(), [loadRecords]);

  async function inspectRecord(id: string) {
    if (isSensitiveDatabaseStore(kind)) {
      setSelectedRecord(records.find((record) => record.id === id) ?? null);
      return;
    }
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post("get-record", {
      kind,
      id,
      scope
    });
    if (!result.ok) {
      setStatus(result.error ?? "Unable to inspect record.");
      setSelectedRecord(null);
      return;
    }
    setSelectedRecord(result.payload);
  }

  async function authorizeSensitiveStore() {
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post("list-records", {
      kind,
      scope,
      authorizationPassword: credentialRecheck.password,
      authorizationPin: credentialRecheck.pin,
      authorizationTotp: credentialRecheck.totp
    });
    if (!result.ok) {
      setStatus(result.error ?? "Recheck failed.");
      return;
    }
    setAuthorizedStores((items) => [...new Set([...items, sensitiveStoreKey(kind, selectedDatabase)])]);
    setRecheckOpen(false);
    setCredentialRecheck({ password: "", pin: "", totp: "" });
    setStatus("");
    setRecords((result.payload as any[]) ?? []);
  }

  function requestSensitiveRecheck() {
    setCredentialRecheck({ password: "", pin: "", totp: "" });
    setRecheckOpen(true);
  }

  function selectStore(database: string, storeKind: string) {
    setSelectedDatabase(database);
    setKind(storeKind);
    setSelectedRecord(null);
    setRecords([]);
    setStatus("");
    if (isSensitiveDatabaseStore(storeKind)) {
      setRecheckOpen(true);
    }
  }

  const stores = snapshot?.payload?.stores ?? [];
  const databases: string[] = snapshot?.payload?.databases?.length ? snapshot.payload.databases : ["global"];
  const columns = useMemo(() => {
    const keys = new Set<string>(["id"]);
    for (const record of records) {
      for (const key of Object.keys(record.data ?? {})) keys.add(key);
    }
    return [...keys].filter((column) => !columnFilter || column.toLowerCase().includes(columnFilter.toLowerCase()));
  }, [records, columnFilter]);
  const visibleRows = records.filter((record) => {
    const haystack = `${record.id} ${JSON.stringify(record.data ?? {})}`.toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });
  const selectedData = selectedRecord?.data ?? null;
  const sensitiveLocked = isSensitiveDatabaseStore(kind) && !authorizedStores.includes(sensitiveStoreKey(kind, selectedDatabase));

  return (
    <section className="db-explorer-shell">
      <aside className="db-sidebar">
        <div className="db-sidebar-heading"><strong>Databases</strong><span>{databases.length}</span></div>
        <div className="db-tree">
          {databases.map((database) => (
            <div className="db-tree-group" key={database}>
              <button className={selectedDatabase === database ? "db-node selected" : "db-node"} onClick={() => setSelectedDatabase(database)} type="button"><span className="db-icon">DB</span><strong>{database === "global" ? "Global" : database}</strong></button>
              <div className="db-table-list">
                {stores.map((store: any) => (
                  <button className={kind === store.kind && selectedDatabase === database ? "db-table-node selected" : "db-table-node"} key={`${database}:${store.kind}`} onClick={() => selectStore(database, store.kind)} type="button"><span className="db-icon table">T</span>{store.kind}<small>{isSensitiveDatabaseStore(store.kind) ? "Locked" : store.recordCount}</small></button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="db-main">
        <div className="db-toolbar">
          <Field label="Search rows"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search IDs and values" /></Field>
          <Field label="Filter columns"><input value={columnFilter} onChange={(event) => setColumnFilter(event.target.value)} placeholder="Column name" /></Field>
          <button className="button" onClick={() => sensitiveLocked || isSensitiveDatabaseStore(kind) ? requestSensitiveRecheck() : void loadRecords()} type="button">Refresh</button>
        </div>
        {sensitiveLocked ? <section className="db-locked-state">
          <VisualAlert tone="warning" title="Credential store locked" message="This table contains identity credential records and requires a fresh security check." />
          <button className="button button-primary" onClick={requestSensitiveRecheck} type="button">Authorize View</button>
        </section> : <div className="db-grid-wrap">
          <table className="db-grid">
            <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {visibleRows.map((record) => (
                <tr className={selectedRecord?.id === record.id ? "selected" : ""} key={record.id} onClick={() => void inspectRecord(record.id)}>
                  {columns.map((column) => <td key={column}>{column === "id" ? record.id : formatDbCell(record.data?.[column])}</td>)}
                </tr>
              ))}
              {!visibleRows.length ? <tr><td className="empty-cell" colSpan={Math.max(1, columns.length)}>No rows found.</td></tr> : null}
            </tbody>
          </table>
        </div>}
      </main>
      <aside className="db-inspector">
        <div className="db-sidebar-heading"><strong>Inspector</strong><span>{selectedRecord?.id ?? "none"}</span></div>
        {selectedRecord ? <KeyValue rows={[["ID", selectedRecord.id], ["Table", selectedRecord.kind], ["Database", selectedRecord.scope?.domainId ?? "global"], ["Created", formatTime(selectedRecord.createdAtMs)], ["Updated", formatTime(selectedRecord.updatedAtMs)]]} /> : <p className="muted-text">Select a row to inspect its keys and values.</p>}
        {selectedData ? <div className="kv-explorer">{Object.entries(selectedData).map(([key, value]) => <div key={key}><span className="db-icon key">K</span><strong>{key}</strong><code>{formatDbCell(value)}</code></div>)}</div> : null}
        <StatusText value={status} />
      </aside>
      {recheckOpen ? <Modal title="Authorize Credential Store" onClose={() => setRecheckOpen(false)}>
        <VisualAlert tone="warning" title="Fresh recheck required" message="Enter your active security factors before viewing identity credential records." />
        <Field label="Password"><input autoFocus type="password" value={credentialRecheck.password} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, password: event.target.value })} /></Field>
        {currentUser.pinConfigured ? <Field label="PIN"><input value={credentialRecheck.pin} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, pin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled ? <Field label="2FA code"><input value={credentialRecheck.totp} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, totp: digits(event.target.value).slice(0, 6) })} /></Field> : null}
        <div className="modal-actions"><button className="button" onClick={() => setRecheckOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={!credentialRecheck.password || (currentUser.pinConfigured && credentialRecheck.pin.length < 4) || (currentUser.totpEnabled && credentialRecheck.totp.length !== 6)} onClick={() => void authorizeSensitiveStore()} type="button">Authorize View</button></div>
      </Modal> : null}
    </section>
  );
}

function BackgroundTasksLive() {
  const api = useProgramApi("background-tasks");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [status, setStatus] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const tasks = snapshot?.payload?.tasks ?? [];
  const selectedTask = tasks.find((task: any) => task.id === selectedTaskId) ?? tasks[0];
  const allRuns = snapshot?.payload?.runs ?? [];
  const selectedRuns = allRuns.filter((run: any) => run.taskId === selectedTask?.id);
  const recentRuns = allRuns.slice(0, 6);
  const nextDue = tasks.filter((task: any) => task.enabled && task.nextRunAtMs).sort((left: any, right: any) => left.nextRunAtMs - right.nextRunAtMs)[0];

  async function runTask(taskId: string) {
    const result = await api.post("run", { taskId });
    setStatus(result.ok ? `Ran ${taskId}` : result.error ?? "Run failed");
    await refresh();
  }

  async function setTaskEnabled(taskId: string, enabled: boolean) {
    const result = await api.post("set-enabled", { taskId, enabled });
    setStatus(result.ok ? `${enabled ? "Started" : "Stopped"} task` : result.error ?? "Task update failed");
    await refresh();
  }

  async function setSchedulerRunning(running: boolean) {
    const result = await api.post("control", { action: running ? "start" : "stop" });
    setStatus(result.ok ? `${running ? "Resumed" : "Paused"} scheduler` : result.error ?? "Scheduler update failed");
    await refresh();
  }

  return (
    <section className="background-task-shell">
      <header className="background-task-toolbar">
        <SummaryStrip items={[["Tasks", tasks.length], ["Enabled", tasks.filter((task: any) => task.enabled).length], ["Scheduler", snapshot?.payload?.scheduler?.running ? "Running" : "Paused"], ["Next Due", nextDue ? formatCountdown(nextDue, nowMs, snapshot?.payload?.scheduler?.running) : "-"]]} />
        <div className="inline-actions"><button className="button" onClick={() => void setSchedulerRunning(!snapshot?.payload?.scheduler?.running)} type="button">{snapshot?.payload?.scheduler?.running ? "Pause Scheduler" : "Resume Scheduler"}</button><button className="button" onClick={refresh} type="button">Refresh</button></div>
      </header>
      {!snapshot?.payload?.scheduler?.running ? <VisualAlert tone="warning" title="Scheduler paused" message="Automatic due-task polling is paused. Manual task runs are still available." /> : null}
      <aside className="background-task-list">
        <div className="db-sidebar-heading"><strong>Tasks</strong><span>{tasks.length}</span></div>
        {tasks.map((task: any) => (
          <button className={selectedTask?.id === task.id ? "task-list-item selected" : "task-list-item"} key={task.id} onClick={() => setSelectedTaskId(task.id)} type="button">
            <span><strong>{task.name}</strong><small>{task.queue} / {task.schedule ?? formatDuration(task.intervalMs)}</small></span>
            <span className="task-countdown"><strong>{formatCountdown(task, nowMs, snapshot?.payload?.scheduler?.running)}</strong><small>next run</small></span>
          </button>
        ))}
        {!tasks.length ? <p className="muted-text">No background tasks registered.</p> : null}
      </aside>
      <main className="background-task-main">
        <div className="panel workspace-panel">
          <div className="panel-heading"><h2 className="panel-title">{selectedTask ? `${selectedTask.name} Runs` : "Run History"}</h2><span className="panel-count">{selectedRuns.length}</span></div>
          <DataTable columns={["Run", "Status", "Queued", "Finished", "Result"]} rows={selectedRuns.map((run: any) => [run.id.slice(0, 8), <StatusBadge key={run.id} value={run.status} />, formatTime(run.queuedAtMs), formatTime(run.finishedAtMs), <span className="run-result-cell" key={`${run.id}-result`}>{run.error ?? shortJson(run.payload)}</span>])} empty="No runs recorded for the selected task." />
          <div className="recent-run-block">
            <div className="panel-heading"><h3 className="panel-title">Recent Activity</h3><span className="panel-count">{recentRuns.length}</span></div>
            <DataTable columns={["Task", "Status", "Finished", "Result"]} rows={recentRuns.map((run: any) => [run.taskId, <StatusBadge key={run.id} value={run.status} />, formatTime(run.finishedAtMs), <span className="run-result-cell" key={`${run.id}-recent`}>{run.error ?? shortJson(run.payload)}</span>])} empty="No background task activity yet." />
          </div>
          <StatusText value={status} />
        </div>
      </main>
      <aside className="background-task-detail">
        <div className="db-sidebar-heading"><strong>Details</strong><span>{selectedTask?.id ?? "none"}</span></div>
        {selectedTask ? <>
          <div className="task-detail-title"><h2>{selectedTask.name}</h2><StatusBadge value={selectedTask.enabled ? "enabled" : "disabled"} /></div>
          <div className="task-countdown-panel"><span>Next run in</span><strong>{formatCountdown(selectedTask, nowMs, snapshot?.payload?.scheduler?.running)}</strong></div>
          <div className="task-progress-block">
            <span>Schedule progress</span>
            <div className="progress-track"><span style={{ width: scheduleProgress(selectedTask, nowMs) }} /></div>
          </div>
          <KeyValue rows={[["ID", selectedTask.id], ["Queue", selectedTask.queue], ["Schedule", selectedTask.schedule ?? formatDuration(selectedTask.intervalMs)], ["Interval", formatDuration(selectedTask.intervalMs)], ["Next run", formatTime(selectedTask.nextRunAtMs)], ["Last run", formatTime(selectedTask.lastRunAtMs)], ["Runs", String(selectedRuns.length)]]} />
          {selectedTask.metadata ? <details className="json-details" open><summary>Metadata</summary><pre>{JSON.stringify(selectedTask.metadata, null, 2)}</pre></details> : null}
          <div className="inline-actions"><button className="button button-primary" disabled={!selectedTask.enabled} onClick={() => void runTask(selectedTask.id)} type="button">Run Now</button><button className="button" onClick={() => void setTaskEnabled(selectedTask.id, !selectedTask.enabled)} type="button">{selectedTask.enabled ? "Stop Task" : "Start Task"}</button></div>
        </> : <p className="muted-text">Select a task to inspect schedule and history.</p>}
      </aside>
    </section>
  );
}

function ComputeControlLive() {
  const api = useProgramApi("compute-control");
  const [snapshot, setSnapshot] = useState<any>(null);
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const nodes = snapshot?.payload?.nodes ?? [];
  const totalCapabilities = new Set(nodes.flatMap((node: any) => node.capabilities ?? [])).size;
  const totalDomains = new Set(nodes.flatMap((node: any) => node.domainIds ?? [])).size;

  return (
    <section className="program-workspace-grid">
      <Panel title="Compute Summary" action={<button className="button" onClick={refresh} type="button">Refresh</button>}>
        <SummaryStrip items={[["Connected Compute", nodes.filter((node: any) => node.status !== "offline").length], ["CPU Threads", nodes.reduce((total: number, node: any) => total + Number(node.metadata?.cpu_count ?? 0), 0)], ["Capabilities", totalCapabilities], ["Known Domains", totalDomains]]} />
      </Panel>
      <Panel title="Compute Nodes">
        <div className="compute-card-grid">
          {nodes.map((node: any) => (
            <article className="operator-card compute-card-v1" key={node.id}>
              <header>
                <div><strong>{node.label || node.id}</strong><span>{node.host || node.id}</span></div>
                <StatusBadge value={node.status} />
              </header>
              <div className="spec-grid">
                <SpecDatum label="CPU Threads" value={String(node.metadata?.cpu_count ?? "Unknown")} />
                <SpecDatum label="OS" value={String(node.metadata?.os ?? "Unknown")} />
                <SpecDatum label="Architecture" value={String(node.metadata?.architecture ?? "Unknown")} />
                <SpecDatum label="Version" value={String(node.metadata?.version ?? "Unknown")} />
                <SpecDatum label="Heartbeat" value={formatTime(node.lastHeartbeatMs)} />
                <SpecDatum label="Capabilities" value={node.capabilities.join(", ") || "None"} />
              </div>
              <div className="compute-account-strip">{node.domainIds?.length ? node.domainIds.map((domainId: string) => <span key={domainId}>{domainId}</span>) : <small>No domains assigned</small>}</div>
            </article>
          ))}
          {!nodes.length ? <p className="muted-text">No compute connected.</p> : null}
        </div>
      </Panel>
    </section>
  );
}

function DeploymentSyncLive() {
  const api = useProgramApi("deployment-sync");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [historyTab, setHistoryTab] = useState<"versions" | "git" | "branches" | "actions">("versions");
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const targets = snapshot?.payload?.targets ?? [];
  const git = snapshot?.payload?.git;
  const activeTarget = targets.find((item: any) => item.id === selectedTargetId) ?? targets[0];

  async function run(endpoint: "dry-run" | "sync" | "rollback", targetId: string, versionSha?: string) {
    const result = await api.post(endpoint, versionSha ? { targetId, versionSha } : { targetId });
    setSelectedRun(result.payload);
    setStatus(result.ok ? `${endpoint} finished` : result.error ?? "Deployment action failed");
    await refresh();
  }

  return (
    <section className="deployment-sync-shell">
      <Panel title="Repository Sync" action={<button className="button" onClick={refresh} type="button">Refresh</button>}>
        <SummaryStrip items={[["Branches", git?.branches?.length ?? targets.length], ["Current", git?.currentBranch ?? "-"], ["Working Tree", git?.dirty ? "Dirty" : "Clean"], ["Actions", snapshot?.payload?.runs?.length ?? 0]]} />
        {git?.available ? <KeyValue rows={[["Repo root", git.rootDir], ["HEAD", git.headSha ?? "-"], ["Remotes", String(git.remotes?.length ?? 0)], ["Status rows", String(git.status?.length ?? 0)]]} /> : <VisualAlert tone="error" title="Git unavailable" message={git?.error ?? "The importing project root is not a git repository."} />}
      </Panel>
      <Panel title="Branch Action">
        <div className="field-row dense-fields"><Field label="Branch target"><select value={activeTarget?.id ?? ""} onChange={(event) => setSelectedTargetId(event.target.value)}>{targets.map((item: any) => <option key={item.id} value={item.id}>{item.name}{item.metadata?.current ? " (current)" : ""}</option>)}</select></Field></div>
        {activeTarget ? <KeyValue rows={[["Branch", String(activeTarget.metadata?.branch ?? activeTarget.name)], ["Type", activeTarget.environment], ["Status", activeTarget.status], ["SHA", String(activeTarget.metadata?.sha ?? "-")]]} /> : null}
        {git?.dirty ? <VisualAlert tone="warning" title="Working tree has local changes" message="Git will refuse unsafe branch changes. Commit, stash, or clean local changes before syncing to another branch." /> : null}
        <div className="inline-actions"><button className="button" disabled={!activeTarget} onClick={() => void run("dry-run", activeTarget.id)} type="button">Dry Run</button><button className="button button-primary" disabled={!activeTarget} onClick={() => void run("sync", activeTarget.id)} type="button">Checkout Branch</button></div>
      </Panel>
      <Panel title="All Branches">
        <DataTable columns={["Branch", "Type", "Current", "Status", "SHA"]} rows={targets.map((item: any) => [<button className="link-button" onClick={() => setSelectedTargetId(item.id)} type="button">{item.name}</button>, item.environment, yesNo(item.metadata?.current), item.status, String(item.metadata?.sha ?? "-").slice(0, 12)])} />
      </Panel>
      <Panel title="History / Result">
        <Segmented value={historyTab} onChange={(value) => setHistoryTab(value as "versions" | "git" | "branches" | "actions")} options={["versions", "git", "branches", "actions"]} />
        {historyTab === "versions" ? <DataTable columns={["Version", "Refs", "Author", "Committed", "Message", "Rollback"]} rows={(git?.versions ?? []).map((version: any) => [
          <button className="link-button" onClick={() => setSelectedRun({ version })} type="button">{version.shortSha || String(version.sha).slice(0, 8)}<small>{String(version.sha).slice(0, 12)}</small></button>,
          version.refs?.length ? version.refs.join(", ") : "-",
          version.author,
          formatTime(version.committedAtMs),
          version.message,
          <button className="button" disabled={!activeTarget} onClick={() => void run("rollback", activeTarget.id, version.sha)} type="button">Rollback</button>
        ])} empty="No git versions discovered." /> : null}
        {historyTab === "git" ? <div className="git-state-panel">
          <DataTable columns={["Remote", "Direction", "URL"]} rows={(git?.remotes ?? []).map((remote: any) => [remote.name, remote.direction, remote.url])} empty="No git remotes configured." />
          {git?.status?.length ? <details className="json-details" open><summary>Working tree status</summary><pre>{git.status.join("\n")}</pre></details> : <VisualAlert tone="success" title="Working tree clean" message="No local changes detected." />}
        </div> : null}
        {historyTab === "branches" ? <DataTable columns={["Branch", "Current", "Remote", "Upstream", "SHA"]} rows={(git?.branches ?? []).map((branch: any) => [branch.name, yesNo(branch.current), yesNo(branch.remote), branch.upstream ?? "-", String(branch.sha ?? "-").slice(0, 12)])} empty="No branches discovered." /> : null}
        {historyTab === "actions" ? <DataTable columns={["Run", "Target", "Mode", "Status", "Message"]} rows={(snapshot?.payload?.runs ?? []).map((run: any) => [<button className="link-button" onClick={() => setSelectedRun(run)} type="button">{run.id.slice(0, 8)}</button>, run.targetId, run.mode ?? "-", run.status, run.message ?? "-"])} /> : null}
        {selectedRun ? <details className="json-details" open><summary>Selected result</summary><pre>{JSON.stringify(selectedRun, null, 2)}</pre></details> : null}
        <StatusText value={status} />
      </Panel>
    </section>
  );
}

function DocsLive() {
  const api = useProgramApi("docs");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [activePageId, setActivePageId] = useState("");
  const [page, setPage] = useState<any>(null);
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);

  const pages = snapshot?.payload?.pages ?? [];
  const docsTree = useMemo(() => buildDocumentationTree(pages), [pages]);
  const activePage = pages.find((item: any) => item.id === activePageId) ?? pages[0];
  useEffect(() => {
    if (!activePage?.id) return;
    void api.post("get-page", { pageId: activePage.id }).then((result) => setPage(result.payload));
  }, [api, activePage?.id]);

  async function rebuild() {
    const result = await api.post("rebuild", {});
    setStatus(result.ok ? "Docs rebuilt" : result.error ?? "Rebuild failed");
    await refresh();
  }

  function selectLinkedPage(href: string): boolean {
    const target = resolveDocsLink(activePage, href);
    if (!target) return false;
    const candidates = docsLinkCandidates(target);
    const match = pages.find((item: any) => candidates.includes(docRouteKey(item)));
    if (!match) return false;
    setActivePageId(match.id);
    return true;
  }

  function handleViewerClick(event: MouseEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    if (selectLinkedPage(href)) {
      event.preventDefault();
    }
  }

  return (
    <section className="docs-program-layout">
      <aside className="docs-explorer-panel">
        <div className="docs-explorer-header">
          <div><h2 className="panel-title">Docs</h2><p className="panel-kicker">Repository documentation</p></div>
          <div className="inline-actions"><button className="button" onClick={refresh} type="button">Refresh</button><button className="button button-primary" onClick={rebuild} type="button">Rebuild</button></div>
        </div>
        <div className="docs-sidebar-summary"><strong>{pages.length}</strong><span>docs files</span></div>
        <SummaryStrip items={[["Generated", snapshot?.payload?.generatedPages ?? 0], ["Sources", snapshot?.payload?.sources?.length ?? 0], ["Warnings", snapshot?.payload?.warnings?.length ?? 0]]} />
        <div className="docs-file-tree">{docsTree.children.map((node) => <DocsTreeNodeView activePageId={activePage?.id} key={node.path} node={node} onSelect={setActivePageId} />)}</div>
      </aside>
      <main className="docs-viewer-panel">
        <div className="panel-heading">
          <div><h2 className="panel-title">{page?.title ?? "Viewer"}</h2><p className="panel-kicker">{page?.routePath ?? "Select a documentation file"}</p></div>
          <span className="program-chip">{formatTime(snapshot?.payload?.generatedAtMs)}</span>
        </div>
        {snapshot?.payload?.warnings?.length ? <details className="json-details"><summary>Warnings</summary><pre>{snapshot.payload.warnings.join("\n")}</pre></details> : null}
        {page ? <article className="docs-rendered" onClick={handleViewerClick} dangerouslySetInnerHTML={{ __html: page.html }} /> : <p className="muted-text">Select a page to view rendered documentation.</p>}
        <StatusText value={status} />
      </main>
    </section>
  );
}

type DocsTreeNode = {
  name: string;
  path: string;
  children: DocsTreeNode[];
  page?: any;
};

function DocsTreeNodeView(props: { node: DocsTreeNode; activePageId: string | undefined; onSelect(pageId: string): void }) {
  const [open, setOpen] = useState(() => !shouldCollapseDocsFolder(props.node));
  const hasChildren = props.node.children.length > 0;
  const selected = props.node.page?.id === props.activePageId;
  if (props.node.page && !hasChildren) {
    return (
      <button className={selected ? "docs-tree-file selected" : "docs-tree-file"} onClick={() => props.onSelect(props.node.page.id)} type="button">
        <FileText size={14} aria-hidden />
        <span>{props.node.name}</span>
      </button>
    );
  }
  return (
    <section className="docs-tree-folder">
      <button className="docs-tree-folder-label" onClick={() => setOpen((value) => !value)} type="button">
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <FolderOpen size={15} aria-hidden />
        <span>{props.node.name}</span>
      </button>
      {open ? <div className="docs-tree-children">
        {props.node.page ? <button className={selected ? "docs-tree-file selected" : "docs-tree-file"} onClick={() => props.onSelect(props.node.page.id)} type="button"><FileText size={14} aria-hidden /><span>{props.node.page.title}</span></button> : null}
        {props.node.children.map((child) => <DocsTreeNodeView activePageId={props.activePageId} key={child.path} node={child} onSelect={props.onSelect} />)}
      </div> : null}
    </section>
  );
}

function ProductionRunnerLive() {
  const api = useProgramApi("production-runner");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [targetType, setTargetType] = useState("task");
  const [targetId, setTargetId] = useState("");
  const [loops, setLoops] = useState("1");
  const [waitMs, setWaitMs] = useState("0");
  const [initialDelayMs, setInitialDelayMs] = useState("0");
  const [parametersText, setParametersText] = useState("{}");
  const [showParameters, setShowParameters] = useState(false);
  const [consoleView, setConsoleView] = useState<"workloads" | "logs">("workloads");
  const [logFilter, setLogFilter] = useState("all");
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);

  const targets = snapshot?.payload?.targets ?? [];
  const runs = snapshot?.payload?.runs ?? [];
  const targetOptions = targets.filter((target: any) => target.type === targetType);
  const selectedTarget = targetOptions.find((target: any) => target.id === targetId) ?? targetOptions[0];
  const activeRuns = runs.filter((run: any) => ["running", "scheduled", "starting"].includes(run.status));
  const logRows = flattenRunLogs(runs).filter((entry) => logFilter === "all" || entry.status === logFilter || entry.type === logFilter);

  async function startRun() {
    const params = parseJsonObject(parametersText);
    if (!params.ok) { setStatus(params.error); return; }
    const result = await api.post("start", {
      name: selectedTarget?.name ?? "Manual Run",
      targetType: selectedTarget?.type ?? targetType,
      targetId: selectedTarget?.id,
      loopsTotal: Number(loops) || 1,
      waitMs: Number(waitMs) || 0,
      initialDelayMs: Number(initialDelayMs) || 0,
      metadata: params.value
    });
    setStatus(result.ok ? "Run started" : result.error ?? "Run failed");
    await refresh();
  }

  return (
    <section className="program-workspace-grid">
      <Panel title="Launch Workload" action={<button className="button button-primary" disabled={!selectedTarget} onClick={startRun} type="button">Run {targetType}</button>}>
        <Segmented value={targetType} onChange={setTargetType} options={["routine", "task", "interface"]} />
        <div className="field-row dense-fields">
          <Field label="Target"><select value={selectedTarget?.id ?? ""} onChange={(event) => setTargetId(event.target.value)}>{targetOptions.map((target: any) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field>
          <Field label="Loops"><input inputMode="numeric" value={loops} onChange={(event) => setLoops(digits(event.target.value))} /></Field>
          <Field label="Loop delay ms"><input inputMode="numeric" value={waitMs} onChange={(event) => setWaitMs(digits(event.target.value))} /></Field>
          <Field label="Start delay ms"><input inputMode="numeric" value={initialDelayMs} onChange={(event) => setInitialDelayMs(digits(event.target.value))} /></Field>
          <button className="button" onClick={() => setShowParameters((value) => !value)} type="button">{showParameters ? "Hide parameters" : "Parameters"}</button>
        </div>
        {showParameters ? <Field label="Parameters JSON"><textarea className="json-editor compact" value={parametersText} onChange={(event) => setParametersText(event.target.value)} spellCheck={false} /></Field> : null}
      </Panel>
      <Panel title="Console" action={<div className="inline-actions"><button className={consoleView === "workloads" ? "button button-primary" : "button"} onClick={() => setConsoleView("workloads")} type="button">Workloads</button><button className={consoleView === "logs" ? "button button-primary" : "button"} onClick={() => setConsoleView("logs")} type="button">Logs</button><button className="button" onClick={refresh} type="button">Refresh</button></div>}>
        <SummaryStrip items={[["Active", activeRuns.length], ["Runs", runs.length], ["Targets", targets.length], ["Failures", runs.filter((run: any) => run.status === "failed").length]]} />
        {consoleView === "workloads" ? <WorkloadBoard runs={activeRuns} onAdvance={(runId) => api.post("advance", { runId }).then(refresh)} onCancel={(runId) => api.post("cancel", { runId }).then(refresh)} /> : <>
          <div className="field-row dense-fields"><Field label="Log filter"><select value={logFilter} onChange={(event) => setLogFilter(event.target.value)}><option value="all">All</option><option value="task">Tasks</option><option value="routine">Routines</option><option value="interface">Interfaces</option><option value="failed">Failed</option><option value="success">Success</option></select></Field></div>
          <DataTable columns={["Time", "Target", "Loop", "Status", "Message"]} rows={logRows.map((entry) => [formatTime(entry.atMs), entry.target, entry.loop, entry.status, entry.message])} empty="No execution logs yet." />
        </>}
        <StatusText value={status} />
      </Panel>
      <Panel title="Targets">
        <DataTable columns={["Target", "Type", "Domain", "Description"]} rows={targets.map((target: any) => [target.name, target.type, target.domainId ?? "global", target.description ?? "-"])} />
      </Panel>
    </section>
  );
}

function WorkloadBoard(props: { runs: any[]; onAdvance(runId: string): Promise<unknown>; onCancel(runId: string): Promise<unknown> }) {
  if (!props.runs.length) return <div className="production-empty-state"><strong>No active workloads</strong><span>Launch a routine, task, or interface to populate the operations table.</span></div>;
  const groups = ["routine", "task", "interface"];
  return <div className="workload-board"><div className="workload-board-header"><span>Runtime</span>{groups.map((group) => <span key={group}>{group}s</span>)}</div><div className="workload-board-row"><div className="workload-runtime"><strong>Framework runtime</strong><small>Local execution</small></div>{groups.map((group) => <div className="workload-cell" key={group}>{props.runs.filter((run) => (run.targetType ?? "task") === group).map((run) => <article className="workload-chip" key={run.id}><header><strong>{run.name}</strong><StatusBadge value={run.status} /></header><div className="progress-track"><span style={{ width: `${Math.round(((run.loopsCompleted ?? 0) / Math.max(1, run.loopsTotal ?? 1)) * 100)}%` }} /></div><footer><span>{run.loopsCompleted ?? 0}/{run.loopsTotal ?? 1}</span><span>{formatTime(run.nextRunAtMs)}</span></footer><div className="inline-actions"><button className="button" onClick={() => void props.onAdvance(run.id)} type="button">Advance</button><button className="button" onClick={() => void props.onCancel(run.id)} type="button">Cancel</button></div></article>)}</div>)}</div></div>;
}

function useProgramApi(programId: string) {
  return useMemo(() => ({
    async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
      const response = await fetch(`/api/programs/${programId}/${endpoint}`, { cache: "no-store" });
      if (response.status === 401) window.location.href = "/";
      return response.json() as Promise<ApiResponse<T>>;
    },
    async post<T = unknown>(endpoint: string, payload: JsonObject): Promise<ApiResponse<T>> {
      const response = await fetch(`/api/programs/${programId}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status === 401) window.location.href = "/";
      return response.json() as Promise<ApiResponse<T>>;
    }
  }), [programId]);
}

function Panel(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="panel workspace-panel"><div className="panel-heading"><h2 className="panel-title">{props.title}</h2>{props.action}</div>{props.children}</section>;
}

function Field(props: { label: string; children: ReactNode }) {
  return <label><span>{props.label}</span>{props.children}</label>;
}

function DataTable(props: { columns: string[]; rows?: Array<Array<ReactNode>>; empty?: string }) {
  const rows = props.rows ?? [];
  return <div className="table-wrap"><table className="data-table"><thead><tr>{props.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>) : <tr><td className="empty-cell" colSpan={props.columns.length}>{props.empty ?? "No data available."}</td></tr>}</tbody></table></div>;
}

function KeyValue(props: { rows: Array<[string, string]> }) {
  return <dl className="key-value-list">{props.rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

function SummaryStrip(props: { items: Array<[string, string | number]> }) {
  return <div className="summary-strip">{props.items.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}

function StatusBadge(props: { value: string }) {
  return <span className={`status-badge-pill ${props.value.toLowerCase()}`}>{props.value}</span>;
}

function SpecDatum(props: { label: string; value: string }) {
  return <div className="spec-datum"><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function Segmented(props: { value: string; options: string[]; onChange(value: string): void }) {
  return <div className="segmented-control">{props.options.map((option) => <button className={props.value === option ? "selected" : ""} key={option} onClick={() => props.onChange(option)} type="button">{option}</button>)}</div>;
}

function Modal(props: { title: string; children: ReactNode; onClose(): void }) {
  function submitOnEnter(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
    const submitButton = event.currentTarget.querySelector<HTMLButtonElement>(".modal-actions .button-primary:not(:disabled), [data-modal-submit]:not(:disabled)");
    if (!submitButton) return;
    event.preventDefault();
    submitButton.click();
  }
  return <div className="modal-backdrop"><section className="modal-panel" role="dialog" aria-modal="true" onKeyDown={submitOnEnter}><div className="panel-heading"><h2 className="panel-title">{props.title}</h2><button className="button" onClick={props.onClose} type="button">Close</button></div>{props.children}</section></div>;
}

function StatusText({ value }: { value: string }) {
  return value ? <VisualAlert tone={toneFromMessage(value)} title={titleFromTone(toneFromMessage(value))} message={value} /> : null;
}

function VisualAlert(props: { tone: AlertTone; title?: string; message: string }) {
  const Icon = props.tone === "success" ? CheckCircle2 : props.tone === "warning" ? AlertTriangle : props.tone === "error" ? XCircle : Info;
  return (
    <div className={`global-alert ${props.tone}`} role={props.tone === "error" ? "alert" : "status"}>
      <Icon size={16} aria-hidden />
      <span>
        {props.title ? <strong>{props.title}</strong> : null}
        <small>{props.message}</small>
      </span>
    </div>
  );
}

function toneFromMessage(value: string): AlertTone {
  const text = value.toLowerCase();
  if (/\b(failed|failure|error|invalid|must|cannot|required|unknown|disabled|denied)\b/.test(text)) return "error";
  if (/\b(waiting|pending|scheduled|started|running|setup)\b/.test(text)) return "warning";
  if (/\b(created|updated|saved|enabled|finished|rebuilt|started|synced|successful)\b/.test(text)) return "success";
  return "info";
}

function titleFromTone(tone: AlertTone): string {
  if (tone === "success") return "Success";
  if (tone === "warning") return "Attention";
  if (tone === "error") return "Action failed";
  return "Notice";
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

function buildDocumentationTree(pages: any[]): DocsTreeNode {
  const root: DocsTreeNode = { name: "docs", path: "", children: [] };
  for (const page of [...pages].sort((left, right) => docRouteKey(left).localeCompare(docRouteKey(right)))) {
    const route = docRouteKey(page);
    const parts = route.split("/").filter(Boolean);
    const fileName = parts.pop() ?? page.title ?? "index";
    let current = root;
    for (const part of parts) {
      const path = current.path ? `${current.path}/${part}` : part;
      let child = current.children.find((node) => node.path === path && !node.page);
      if (!child) {
        child = { name: titleFromRouteSegment(part), path, children: [] };
        current.children.push(child);
      }
      current = child;
    }
    current.children.push({
      name: titleFromRouteSegment(fileName),
      path: `file:${route}:${page.id}`,
      children: [],
      page
    });
  }
  sortDocsTree(root);
  return root;
}

function sortDocsTree(node: DocsTreeNode): void {
  node.children.sort((left, right) => {
    if (Boolean(left.page) !== Boolean(right.page)) return left.page ? 1 : -1;
    return left.name.localeCompare(right.name);
  });
  for (const child of node.children) sortDocsTree(child);
}

function shouldCollapseDocsFolder(node: DocsTreeNode): boolean {
  const path = node.path.toLowerCase();
  const name = node.name.toLowerCase();
  if (!path) return false;
  if (path.startsWith("generated/reference/typedoc/assets")) return true;
  if (path.startsWith("generated/reference/typedoc/classes")) return true;
  if (path.startsWith("generated/reference/typedoc/types")) return true;
  if (["classes", "types", "functions", "variables", "assets"].includes(name) && path.startsWith("generated/")) return true;
  return node.children.length > 30 && path.startsWith("generated/");
}

function docRouteKey(page: any): string {
  return normalizeDocPath(String(page?.routePath ?? page?.path ?? page?.id ?? ""));
}

function normalizeDocPath(value: string): string {
  const withoutHash = value.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const normalized = withoutQuery
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\.(md|mdx|html|json)$/i, "");
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function resolveDocsLink(activePage: any, href: string): string | null {
  const clean = href.trim();
  if (!clean || clean.startsWith("#") || /^(https?:|mailto:|javascript:)/i.test(clean)) return null;
  const current = docRouteKey(activePage);
  if (clean.startsWith("/")) return normalizeDocPath(clean);
  const currentDir = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
  return normalizeDocPath(currentDir ? `${currentDir}/${clean}` : clean);
}

function docsLinkCandidates(target: string): string[] {
  const normalized = normalizeDocPath(target);
  const values = new Set<string>([normalized]);
  if (normalized.endsWith("/index")) values.add(normalized.replace(/\/index$/, ""));
  if (normalized.endsWith("/README")) values.add(normalized.replace(/\/README$/, ""));
  if (normalized && !normalized.endsWith("/index") && !normalized.endsWith("/README")) {
    values.add(`${normalized}/index`);
    values.add(`${normalized}/README`);
  }
  if (!normalized) {
    values.add("index");
    values.add("README");
  }
  return [...values];
}

function titleFromRouteSegment(value: string): string {
  if (/^README$/i.test(value.replace(/\.(md|mdx|html|json)$/i, ""))) return "README";
  return value
    .replace(/\.(md|mdx|html|json)$/i, "")
    .replace(/^index$/i, "Index")
    .split(/[-_.\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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

function shortJson(value: unknown): string {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function timelineEntrySummary(entry: any): string {
  if (entry.type === "action") return `${entry.actionType} ${entry.target?.label ?? entry.target?.id ?? ""}`.trim();
  if (entry.type === "state_delta") return (entry.deltas ?? []).map((delta: any) => `${delta.path} ${delta.change}`).join(", ");
  if (entry.type === "state_checkpoint") return `${Object.keys(entry.state?.namespaces ?? {}).length} namespaces`;
  if (entry.type === "note") return entry.noteId;
  if (entry.type === "domain_event") return entry.eventType;
  if (entry.type === "observation") return entry.observationType;
  if (entry.type === "marker") return entry.label;
  return shortJson(entry);
}

function conditionSummary(group: any): string {
  if (!group) return "-";
  const conditions = group.conditions ?? [];
  if (!conditions.length) return `${group.type ?? "condition"}: empty`;
  return `${group.type}: ${conditions.map((condition: any) => condition.signalPath ? `${condition.signalPath} ${condition.operator}` : conditionSummary(condition)).join("; ")}`;
}

function policyToReactFlowGraph(policy: any, selectedNodeId = ""): { nodes: Node<AutomationPolicyNodeData>[]; edges: Edge[] } {
  const policyNodes = policy?.nodes ?? [];
  const policyEdges = policy?.edges ?? [];
  const nodes: Node<AutomationPolicyNodeData>[] = policyNodes.map((node: any, index: number) => ({
    id: node.id,
    type: "policyNode",
    position: {
      x: index * 330,
      y: index % 2 === 0 ? 40 : 220
    },
    selected: node.id === selectedNodeId,
    data: {
      label: node.label ?? node.id,
      actionTypes: (node.actions ?? []).map((action: any) => action.actionType),
      recovery: node.recovery?.strategy ?? "ready",
      evidenceCount: node.sourceEvidence?.length ?? 0,
      readinessCount: countConditionLeaves(node.readinessConditions),
      successCount: countConditionLeaves(node.successConditions),
      isStart: index === 0,
      confidence: node.generatedMetadata?.confidence,
      timeoutMs: node.timeout?.timeoutMs ?? node.timeoutMs
    }
  }));
  const edges: Edge[] = policyEdges.map((edge: any, index: number) => ({
    id: edge.id ?? `${edge.fromNodeId}-${edge.toNodeId}-${index}`,
    source: edge.fromNodeId,
    target: edge.toNodeId,
    sourceHandle: "next",
    animated: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edgeVisuals(edge).color,
      width: 18,
      height: 18
    },
    style: edgeVisuals(edge).style,
    label: edge.label ?? (edge.probability !== undefined ? `${Math.round(Number(edge.probability) * 100)}%` : undefined)
  }));
  return { nodes, edges };
}

function routineToReactFlowGraph(policies: any[], selectedNodeId = ""): { nodes: Node<AutomationRoutineNodeData>[]; edges: Edge[] } {
  const firstPolicy = policies[0]?.taskId ?? policies[0]?.policyId ?? "task policy";
  const routineNodes: Array<{ id: string; x: number; y: number; data: AutomationRoutineNodeData }> = [
    { id: "routine-start", x: 0, y: 130, data: { label: "Start", nodeType: "base", family: "entry", description: "Routine entry point", inputs: 0, outputs: 1 } },
    { id: "routine-task", x: 330, y: 60, data: { label: "Run Task Policy", nodeType: "base", family: "task", description: `Execute ${firstPolicy}`, inputs: 1, outputs: 2 } },
    { id: "routine-branch", x: 660, y: 60, data: { label: "Decision", nodeType: "base", family: "branch", description: "Choose the next routine path", inputs: 1, outputs: 2 } },
    { id: "routine-approval", x: 990, y: 0, data: { label: "Approval Gate", nodeType: "base", family: "permission", description: "Require operator or PIN approval", inputs: 1, outputs: 1, privileged: true } },
    { id: "routine-custom", x: 990, y: 190, data: { label: "Custom Action", nodeType: "custom", family: "extension", description: "User-defined routine step", inputs: 1, outputs: 1 } },
    { id: "routine-recovery", x: 1320, y: 190, data: { label: "Recovery Handler", nodeType: "base", family: "recovery", description: "Handle failed routine branch", inputs: 1, outputs: 1 } },
    { id: "routine-end", x: 1320, y: 0, data: { label: "End", nodeType: "base", family: "exit", description: "Routine completion", inputs: 2, outputs: 0 } }
  ];
  const nodes: Node<AutomationRoutineNodeData>[] = routineNodes.map((node) => ({
    id: node.id,
    type: "routineNode",
    position: { x: node.x, y: node.y },
    selected: node.id === selectedNodeId,
    data: node.data
  }));
  const edges: Edge[] = [
    { id: "start-task", source: "routine-start", target: "routine-task", label: "begin" },
    { id: "task-branch", source: "routine-task", target: "routine-branch", label: "complete", probability: 0.9 },
    { id: "task-recovery", source: "routine-task", target: "routine-recovery", label: "retry", probability: 0.55 },
    { id: "branch-approval", source: "routine-branch", target: "routine-approval", label: "privileged", probability: 0.75 },
    { id: "branch-custom", source: "routine-branch", target: "routine-custom", label: "custom", probability: 0.65 },
    { id: "approval-end", source: "routine-approval", target: "routine-end", label: "success", probability: 0.9 },
    { id: "custom-recovery", source: "routine-custom", target: "routine-recovery", label: "fallback", probability: 0.6 },
    { id: "recovery-end", source: "routine-recovery", target: "routine-end", label: "recover", probability: 0.7 }
  ].map((edge) => {
    const visuals = edgeVisuals(edge);
    return {
      ...edge,
      sourceHandle: "next",
      markerEnd: { type: MarkerType.ArrowClosed, color: visuals.color, width: 18, height: 18 },
      ...(visuals.style ? { style: visuals.style } : {})
    };
  });
  return { nodes, edges };
}

function edgeVisuals(edge: any): { color: string; style: Edge["style"] } {
  const kind = String(edge.kind ?? edge.type ?? edge.label ?? "").toLowerCase();
  const color = kind.includes("fail") ? "#d13212" : kind.includes("recover") || kind.includes("retry") ? "#b35c00" : kind.includes("success") ? "#037f0c" : "#0972d3";
  const confidence = Number(edge.probability ?? edge.confidence ?? 0.7);
  return {
    color,
    style: {
      stroke: color,
      strokeWidth: Math.max(2, Math.min(6, 1 + confidence * 5)),
      strokeDasharray: kind.includes("optional") || kind.includes("fallback") ? "7 5" : undefined
    }
  };
}

function countConditionLeaves(group: any): number {
  if (!group?.conditions) return 0;
  return group.conditions.reduce((total: number, condition: any) => total + (condition.signalPath ? 1 : countConditionLeaves(condition)), 0);
}

function formatDbCell(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return shortJson(value);
}

function parseJsonObject(text: string): { ok: true; value: JsonObject } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value: value as JsonObject } : { ok: false, error: "JSON must be an object" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function flattenRunLogs(runs: any[]): Array<{ atMs: number; target: string; loop: string; status: string; message: string; type: string }> {
  return runs.flatMap((run) => {
    const executions = run.executions ?? [];
    if (!executions.length) return [{ atMs: run.updatedAtMs ?? run.startedAtMs ?? 0, target: run.targetId ?? run.name, loop: `${run.loopsCompleted ?? 0}/${run.loopsTotal ?? 1}`, status: run.status, message: run.metadata?.message ?? "-", type: run.targetType ?? "run" }];
    return executions.map((execution: any) => ({ atMs: execution.atMs, target: run.targetId ?? run.name, loop: `${execution.loop}/${run.loopsTotal ?? 1}`, status: execution.ok ? "success" : "failed", message: execution.error ?? shortJson(execution.result), type: run.targetType ?? "run" }));
  });
}
