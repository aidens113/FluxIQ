"use client";

import { AlertTriangle, Blocks, Braces, Bug, Calculator, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDot, Clock, Columns3, Copy, Database, Dice5, FileText, FolderOpen, FolderPlus, GitBranch, GripVertical, History, Info, ListChecks, Merge, Network, Plus, QrCode, Radio, RefreshCcw, Repeat, Search, ShieldCheck, Shuffle, SlidersHorizontal, Sparkles, Split, Trash2, Waves, Workflow, XCircle, Zap } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import { automationNodeClassGroups, getAutomationNodeDefinition, getAutomationNodeDefinitions, type AutomationNodeDefinition, type AutomationNodeParameter, type AutomationNodePort } from "fluxiq/automation-studio/nodes";

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
type AutomationViewType = AutomationStudioView | "assistant" | "config" | "routine" | "state" | "inspector" | "dock";
type AutomationDockTab = "assistant" | "problems" | "history" | "state";
type AutomationViewInstance = {
  id: string;
  label: string;
  type: AutomationViewType;
  icon: typeof Blocks;
  state?: "dirty" | "live" | "warning";
};
type AutomationWorkspaceWindow = {
  id: string;
  activeViewId: string;
  tabs: string[];
  area: AutomationWorkspaceArea;
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  zIndex: number;
};
type AutomationWorkspaceArea = "main" | "right" | "bottom";
type AutomationWindowAdderState = {
  area: AutomationWorkspaceArea;
  targetWindowId?: string;
  anchor: { top: number; right: number; bottom: number; left: number };
};
type AutomationLayoutPickerState = {
  area: AutomationWorkspaceArea;
  anchor: { top: number; right: number; bottom: number; left: number };
};
type AutomationWindowResizeEdge = "north" | "east" | "south" | "west" | "north-east" | "north-west" | "south-east" | "south-west";
type AutomationSharedResizePartner = {
  id: string;
  side: "north" | "east" | "south" | "west";
  start: AutomationWorkspaceWindow;
};
type AutomationSnapRegion = "left" | "right" | "top" | "bottom";
type AutomationLayoutPreset = "single" | "two-columns" | "two-rows" | "main-sidebar" | "three-columns" | "quad";
type AutomationLayoutPresetOption = {
  id: AutomationLayoutPreset;
  label: string;
  title: string;
  cells: Array<{ x: number; y: number; w: number; h: number }>;
};
type AutomationWorkspacePrefs = {
  windows: AutomationWorkspaceWindow[];
  activeWindowId: string;
  maximizedWindowId: string | null;
  sidebarWidth: number;
  inspectorWidth: number;
  bottomDockHeight: number;
  utilityWindowsMigrated: boolean;
  rightSidebarCollapsed: boolean;
  bottomBarCollapsed: boolean;
};
type AutomationEditorNodeSpec = {
  id: string;
  label: string;
  description: string;
  family: string;
  scope: "policy" | "routine" | "both";
  nodeType: "base" | "custom" | "generated";
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  icon?: string;
  privileged?: boolean;
  actionTypes?: string[];
};
type AutomationEditorPaletteGroup = {
  title: string;
  nodes: AutomationEditorNodeSpec[];
};
type AutomationHierarchyKind = "folder" | "task" | "routine" | "config";
type AutomationCreatableHierarchyKind = "folder" | "task" | "routine";
type AutomationHierarchyCategory = "task" | "routine" | "config";
const automationHierarchyCategories: Array<{ id: AutomationHierarchyCategory; label: string; description: string }> = [
  { id: "task", label: "Tasks", description: "Task folders and task workspaces" },
  { id: "routine", label: "Routines", description: "Routine folders and orchestration workspaces" },
  { id: "config", label: "Configurations", description: "Configuration folders and defaults" }
];
const automationLayoutPresetOptions: AutomationLayoutPresetOption[] = [
  { id: "single", label: "Full", title: "Full stack", cells: [{ x: 0, y: 0, w: 1, h: 1 }] },
  { id: "two-columns", label: "Halves", title: "Two equal columns", cells: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }] },
  { id: "two-rows", label: "1:1", title: "Two equal rows", cells: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
  { id: "main-sidebar", label: "2/3", title: "Main plus side stack", cells: [{ x: 0, y: 0, w: 0.67, h: 1 }, { x: 0.67, y: 0, w: 0.33, h: 1 }] },
  { id: "three-columns", label: "Thirds", title: "Three equal columns", cells: [{ x: 0, y: 0, w: 1 / 3, h: 1 }, { x: 1 / 3, y: 0, w: 1 / 3, h: 1 }, { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }] },
  { id: "quad", label: "Grid", title: "Four quadrant grid", cells: [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }] }
];
const automationEditorPalette: AutomationEditorPaletteGroup[] = automationNodeClassGroups
  .map((group) => ({
    title: group.label,
    nodes: getAutomationNodeDefinitions()
      .filter((node) => node.class === group.id)
      .map(automationNodeDefinitionToEditorSpec)
  }))
  .filter((group) => group.nodes.length > 0);

function automationNodeDefinitionToEditorSpec(definition: AutomationNodeDefinition): AutomationEditorNodeSpec {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    family: definition.class,
    scope: definition.scope,
    nodeType: definition.origin === "custom" ? "custom" : "base",
    inputs: definition.inputs,
    outputs: definition.outputs,
    parameters: definition.parameters,
    ...(definition.icon !== undefined ? { icon: definition.icon } : {}),
    ...(definition.privileged !== undefined ? { privileged: definition.privileged } : {}),
    ...(definition.class === "policy" && definition.id === "builtin.policy.action" ? { actionTypes: ["action"] } : {})
  };
}

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
  | { kind: "editor-node"; id: string; node: { label: string; nodeType: string; family: string; description: string; customDescription?: string; nodeDefinitionId?: string; icon?: string; inputs: AutomationNodePort[]; outputs: AutomationNodePort[]; parameters: AutomationNodeParameter[]; parameterValues: JsonObject; privileged?: boolean; actionTypes?: string[] } }
  | { kind: "recording"; id: string }
  | { kind: "timeline"; id: string }
  | { kind: "signal"; id: string };

type AutomationPolicyNodeData = {
  nodeDefinitionId?: string;
  label: string;
  description: string;
  customDescription?: string;
  icon?: string;
  actionTypes: string[];
  recovery: string;
  evidenceCount: number;
  readinessCount: number;
  successCount: number;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  parameterValues: JsonObject;
  isStart: boolean;
  confidence?: number;
  timeoutMs?: number;
};
type AutomationRoutineNodeData = {
  nodeDefinitionId?: string;
  label: string;
  nodeType: "base" | "custom";
  family: string;
  description: string;
  customDescription?: string;
  icon?: string;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  parameterValues: JsonObject;
  privileged?: boolean;
};

const automationNodeTypes = {
  policyNode: AutomationPolicyNode,
  routineNode: AutomationRoutineNode
};
const automationEdgeTypes = {
  automationEdge: AutomationFlowEdge
};

function AutomationStudioLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("automation-studio");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project");
  const [snapshot, setSnapshot] = useState<any>(null);
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
    bottomDockHeight: 206,
    utilityWindowsMigrated: true,
    rightSidebarCollapsed: false,
    bottomBarCollapsed: false
  });
  const [dockTab, setDockTab] = useState<AutomationDockTab>("assistant");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [windowAdderOpen, setWindowAdderOpen] = useState<AutomationWindowAdderState | null>(null);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState<AutomationLayoutPickerState | null>(null);
  const [snapPreview, setSnapPreview] = useState<(NonNullable<ReturnType<typeof automationSnapGeometry>> & { area: AutomationWorkspaceArea }) | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | "folder" | "task" | "routine" | "config">("all");
  const [selection, setSelection] = useState<AutomationSelection | null>(null);
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
  const bottomWorkspaceCanvasRef = useRef<HTMLDivElement>(null);
  const lastSavedHierarchySignatureRef = useRef("");

  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
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
  const selectedNode = selection?.kind === "editor-node"
    ? { id: selection.id, ...selection.node, actions: (selection.node.actionTypes ?? []).map((actionType) => ({ actionType })), recovery: { strategy: selection.node.family } }
    : selectedPolicy?.nodes?.find((node: any) => selection?.kind === "node" && selection.id === node.id) ?? selectedPolicy?.nodes?.[0];
  const selectedEntry = selectedTimeline?.timeline?.find((entry: any) => selection?.kind === "timeline" && selection.id === entry.id);
  const selectedSignal = signals.find((signal: any) => selection?.kind === "signal" && selection.id === signal.path);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const restoringUrlProject = Boolean(urlProjectId && !activeProject && !projectStatus && (!projectsLoaded || activeProjectId === urlProjectId || urlProjectOpenAttemptRef.current === urlProjectId));

  const viewInstances: AutomationViewInstance[] = [
    { id: "policy-primary", label: `Policy: ${selectedPolicy?.taskId ?? "Task"}`, type: "design", icon: GitBranch },
    { id: "timeline-recording", label: `Timeline: ${selectedRecording?.name ?? selectedRecording?.recordingId ?? "Recording"}`, type: "recordings", icon: Radio, state: "live" },
    { id: "signals-web", label: "Signals: Relationship Web", type: "signals", icon: Network, state: "warning" },
    { id: "runtime-debug", label: "Runtime Debug", type: "runtime", icon: Bug },
    { id: "problems-view", label: "Problems", type: "problems", icon: AlertTriangle },
    { id: "ai-assistant", label: "AI Assistant", type: "assistant", icon: Sparkles },
    { id: "global-inspector", label: "Inspector", type: "inspector", icon: SlidersHorizontal },
    { id: "workspace-dock", label: "Dock: Assistant / Problems / State", type: "dock", icon: ListChecks },
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
  const activeWindow = workspacePrefs.windows.find((item) => item.id === workspacePrefs.activeWindowId) ?? workspacePrefs.windows[0];
  const activeViewId = activeWindow?.activeViewId ?? "policy-primary";
  const windowsByArea = (area: AutomationWorkspaceArea) => visibleWindows.filter((item) => (item.area ?? "main") === area);
  const canvasForArea = (area: AutomationWorkspaceArea) => area === "right" ? rightWorkspaceCanvasRef.current : area === "bottom" ? bottomWorkspaceCanvasRef.current : mainWorkspaceCanvasRef.current;
  const setSelectionAndFollow = (next: AutomationSelection) => {
    setSelection(next);
    if (next.kind === "recording" || next.kind === "timeline") openView("timeline-recording", "preview");
    if (next.kind === "signal") openView("signals-web", "preview");
    if (next.kind === "policy") openView("policy-primary", "preview");
  };

  useEffect(() => {
    document.title = activeProject ? `${activeProject.name} - Automation Studio` : "Automation Studio";
  }, [activeProject]);

  useEffect(() => {
    if (!urlProjectId || activeProjectId === urlProjectId || urlProjectOpenAttemptRef.current === urlProjectId) return;
    urlProjectOpenAttemptRef.current = urlProjectId;
    void openProject(urlProjectId, { updateUrl: false });
  }, [activeProjectId, urlProjectId]);

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
          if ((area === "right" && current.rightSidebarCollapsed) || (area === "bottom" && current.bottomBarCollapsed)) return item;
          const canvas = canvasForArea(item.area ?? "main");
          if (!canvas) return item;
          const bounds = canvas.getBoundingClientRect();
          if (bounds.width < 24 || bounds.height < 24) return item;
          return clampAutomationWindowGeometry(item, Math.max(1, Math.floor(bounds.width)), Math.max(1, Math.floor(bounds.height)), 240, 210);
        });
        return automationWindowGeometrySignature(windows) === automationWindowGeometrySignature(current.windows) ? current : { ...current, windows };
      });
    };
    clampWindows();
    const observer = new ResizeObserver(clampWindows);
    [mainWorkspaceCanvasRef.current, rightWorkspaceCanvasRef.current, bottomWorkspaceCanvasRef.current].forEach((canvas) => {
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

  function closeProject() {
    setActiveProjectId(null);
    setLoadedProjectHierarchyId(null);
    setCustomHierarchyNodes([]);
    setDeletedHierarchyIds([]);
    setWorkspacePrefs(defaultAutomationWorkspacePrefs());
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
          : fullAutomationWindowGeometry(bounds);
        return {
          ...current,
          activeWindowId: id,
          maximizedWindowId: null,
          windows: [...current.windows, { id, activeViewId: viewId, tabs: [viewId], area, ...geometry, zIndex: nextAutomationZIndex(current.windows) }]
        };
      }
      const activeWindowInArea = current.windows.find((item) => item.id === current.activeWindowId && (item.area ?? "main") === area);
      const targetWindow = activeWindowInArea ?? current.windows.find((item) => (item.area ?? "main") === area);
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
  function setWindowGeometry(windowId: string, geometry: Partial<Pick<AutomationWorkspaceWindow, "x" | "y" | "widthPx" | "heightPx">>) {
    updateWorkspacePrefs((current) => ({
      ...current,
      windows: current.windows.map((item) => {
        if (item.id !== windowId) return item;
        const bounds = canvasForArea(item.area ?? "main")?.getBoundingClientRect();
        return clampAutomationWindowGeometry({
          ...item,
          ...geometry
        }, Math.max(1, Math.floor(bounds?.width ?? 1120)), Math.max(1, Math.floor(bounds?.height ?? 680)));
      })
    }));
  }
  function startWindowResize(windowItem: AutomationWorkspaceWindow, edge: AutomationWindowResizeEdge, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = windowItem.x;
    const startTop = windowItem.y;
    const startWidth = windowItem.widthPx;
    const startHeight = windowItem.heightPx;
    const bounds = canvasForArea(windowItem.area ?? "main")?.getBoundingClientRect();
    const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
    const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
    const sharedPartners = findAutomationSharedResizePartners(windowItem, edge, workspacePrefs.windows.filter((item) => (item.area ?? "main") === (windowItem.area ?? "main")));
    const onMove = (moveEvent: PointerEvent) => {
      const west = edge.includes("west");
      const east = edge.includes("east");
      const north = edge.includes("north");
      const south = edge.includes("south");
      const deltaX = constrainAutomationResizeDelta(
        moveEvent.clientX - startX,
        "x",
        edge,
        windowItem,
        sharedPartners,
        canvasWidth
      );
      const deltaY = constrainAutomationResizeDelta(
        moveEvent.clientY - startY,
        "y",
        edge,
        windowItem,
        sharedPartners,
        canvasHeight
      );
      const nextX = west ? startLeft + deltaX : startLeft;
      const nextY = north ? startTop + deltaY : startTop;
      const nextWidth = west ? startWidth - deltaX : east ? startWidth + deltaX : startWidth;
      const nextHeight = north ? startHeight - deltaY : south ? startHeight + deltaY : startHeight;
      const partnerGeometry = new Map<string, Partial<Pick<AutomationWorkspaceWindow, "x" | "y" | "widthPx" | "heightPx">>>();
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
            return clampAutomationWindowGeometry({
              ...item,
              x: nextX,
              y: nextY,
              widthPx: nextWidth,
              heightPx: nextHeight
            }, canvasWidth, canvasHeight, 240, 210);
          }
          const geometry = partnerGeometry.get(item.id);
          return geometry ? clampAutomationWindowGeometry({ ...item, ...geometry }, canvasWidth, canvasHeight, 240, 210) : item;
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
    const startX = event.clientX;
    const startY = event.clientY;
    const canvas = canvasForArea(windowItem.area ?? "main");
    const bounds = canvas?.getBoundingClientRect();
    const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
    const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
    const restored = automationWindowFillsCanvas(windowItem, canvasWidth, canvasHeight)
      ? restoreAutomationWindowFromFullscreen(windowItem, startX - (bounds?.left ?? 0), startY - (bounds?.top ?? 0), canvasWidth, canvasHeight)
      : windowItem;
    if (restored !== windowItem) setWindowGeometry(windowItem.id, {
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
        return clampAutomationWindowGeometry({
          ...item,
          x: 0,
          y: 0,
          widthPx: width,
          heightPx: height,
          zIndex: nextAutomationZIndex(current.windows)
        }, width, height);
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
  function startWorkspaceSectionResize(area: "right" | "bottom", event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = workspacePrefs.inspectorWidth;
    const startHeight = workspacePrefs.bottomDockHeight;
    const onMove = (moveEvent: PointerEvent) => {
      updateWorkspacePrefs((current) => area === "right"
        ? { ...current, inspectorWidth: clampNumber(startWidth + startX - moveEvent.clientX, 260, 620, startWidth), rightSidebarCollapsed: false }
        : { ...current, bottomDockHeight: clampNumber(startHeight + startY - moveEvent.clientY, 140, 460, startHeight), bottomBarCollapsed: false });
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

  const renderWorkspaceArea = (area: AutomationWorkspaceArea, label: string, ref: RefObject<HTMLDivElement | null>) => {
    const areaWindows = windowsByArea(area);
    return (
      <section className={`automation-workspace-section ${area}`}>
        {area === "right" ? <button className="automation-section-resize-handle right" onPointerDown={(event) => startWorkspaceSectionResize("right", event)} title="Resize right area" aria-label="Resize right area" type="button" /> : null}
        {area === "bottom" ? <button className="automation-section-resize-handle bottom" onPointerDown={(event) => startWorkspaceSectionResize("bottom", event)} title="Resize bottom area" aria-label="Resize bottom area" type="button" /> : null}
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
            {area === "bottom" ? <button
              className="icon-button"
              onClick={() => updateWorkspacePrefs((current) => ({ ...current, bottomBarCollapsed: !current.bottomBarCollapsed }))}
              title={workspacePrefs.bottomBarCollapsed ? "Expand bottom area" : "Collapse bottom area"}
              aria-label={workspacePrefs.bottomBarCollapsed ? "Expand bottom area" : "Collapse bottom area"}
              type="button"
            >{workspacePrefs.bottomBarCollapsed ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}</button> : null}
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
              const bounds = canvasForArea(area)?.getBoundingClientRect();
              const renderedWindow = clampAutomationWindowGeometry(
                windowItem,
                Math.max(1, Math.floor(bounds?.width ?? windowItem.widthPx)),
                Math.max(1, Math.floor(bounds?.height ?? windowItem.heightPx)),
                1,
                1
              );
              return (
                <div
                  className="automation-window-shell"
                  key={windowItem.id}
                  style={workspacePrefs.maximizedWindowId ? { inset: 0, zIndex: windowItem.zIndex } : { left: renderedWindow.x, top: renderedWindow.y, width: renderedWindow.widthPx, height: renderedWindow.heightPx, zIndex: windowItem.zIndex }}
                >
                  <AutomationViewContainer
                    active={workspacePrefs.activeWindowId === windowItem.id}
                    icon={view.icon}
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
                    onResetSize={() => resetWindowSize(windowItem.id)}
                    onResizeStart={(edge, event) => startWindowResize(windowItem, edge, event)}
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
                      dockTab={dockTab}
                      selectedEntry={selectedEntry}
                      selectedNode={selectedNode}
                      selectedRecording={selectedRecording}
                      selectedSignal={selectedSignal}
                      selectedTimeline={selectedTimeline}
                      selection={selection}
                      signals={signals}
                      view={view}
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
    <section className={sidebarCollapsed ? "automation-studio-shell sidebar-collapsed" : "automation-studio-shell"} style={{ gridTemplateColumns: `${sidebarCollapsed ? 48 : workspacePrefs.sidebarWidth}px minmax(0, 1fr)` }}>
      <aside className="automation-studio-sidebar">
        <div className="automation-studio-sidebar-heading">
          {!sidebarCollapsed ? <strong>{activeProject.name}</strong> : null}
          <div className="inline-actions">
            {!sidebarCollapsed ? <button className="icon-button" onClick={() => requestHierarchyAction({ action: "create", parentId: null })} title="Create" aria-label="Create" type="button"><Plus size={14} aria-hidden /></button> : null}
            <button className="icon-button" onClick={() => setSidebarCollapsed((value) => !value)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} type="button">{sidebarCollapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronLeft size={14} aria-hidden />}</button>
          </div>
        </div>
        {!sidebarCollapsed ? <div className="automation-tree-search">
          <Search size={14} aria-hidden />
          <input aria-label="Search project" onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search project" value={projectSearch} />
          <select aria-label="Filter project type" onChange={(event) => setProjectTypeFilter(event.target.value as typeof projectTypeFilter)} value={projectTypeFilter}>
            <option value="all">All</option>
            <option value="folder">Folders</option>
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
          </div>
          <div className="automation-studio-context">
            <div className="automation-preferences-anchor">
              <button className="button" onClick={() => setPreferencesOpen(!preferencesOpen)} type="button"><SlidersHorizontal size={14} aria-hidden />Preferences</button>
              {preferencesOpen ? <AutomationWorkspacePreferences prefs={workspacePrefs} setPrefs={updateWorkspacePrefs} /> : null}
            </div>
          </div>
        </header>

        <section
          className={`automation-studio-workspace${workspacePrefs.rightSidebarCollapsed ? " right-collapsed" : ""}${workspacePrefs.bottomBarCollapsed ? " bottom-collapsed" : ""}`}
          style={{
            gridTemplateColumns: `minmax(0, 1fr) ${workspacePrefs.rightSidebarCollapsed ? 38 : workspacePrefs.inspectorWidth}px`,
            gridTemplateRows: `minmax(0, 1fr) ${workspacePrefs.bottomBarCollapsed ? 38 : workspacePrefs.bottomDockHeight}px`
          }}
        >
          {renderWorkspaceArea("main", "Main", mainWorkspaceCanvasRef)}
          {renderWorkspaceArea("right", "Right Sidebar", rightWorkspaceCanvasRef)}
          {renderWorkspaceArea("bottom", "Bottom Bar", bottomWorkspaceCanvasRef)}
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
      {windowAdderOpen ? <AutomationWindowAdderPalette area={windowAdderOpen.area} anchor={windowAdderOpen.anchor} {...(windowAdderOpen.targetWindowId ? { targetWindowId: windowAdderOpen.targetWindowId } : {})} views={viewInstances} onAdd={addWorkspaceWindow} /> : null}
      {layoutPickerOpen ? <AutomationLayoutPicker area={layoutPickerOpen.area} anchor={layoutPickerOpen.anchor} onArrange={arrangeWindows} /> : null}
    </section>
  );
}

function viewTitle(view: AutomationViewInstance): string {
  if (view.type === "design") return "Policy Graph";
  if (view.type === "recordings") return "Timeline";
  if (view.type === "signals") return "Relationship Web";
  if (view.type === "runtime") return "Runtime Debug";
  if (view.type === "problems") return "Problems";
  if (view.type === "assistant") return "AI Assistant";
  if (view.type === "inspector") return "Inspector";
  if (view.type === "dock") return "Workspace Dock";
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

function AutomationWindowAdderPalette(props: { area: AutomationWorkspaceArea; anchor: AutomationWindowAdderState["anchor"]; targetWindowId?: string; views: AutomationViewInstance[]; onAdd(viewId: string, area: AutomationWorkspaceArea, targetWindowId?: string): void }) {
  const groups = [
    { title: "Editors", ids: ["policy-primary", "routine-editor", "config-default"] },
    { title: "Evidence", ids: ["timeline-recording", "signals-web", "runtime-debug", "problems-view"] },
    { title: "Tools", ids: ["global-inspector", "workspace-dock", "ai-assistant"] }
  ];
  const byId = new Map(props.views.map((view) => [view.id, view]));
  return (
    <section className="automation-window-adder-panel" style={automationWindowAdderPanelStyle(props.area, props.anchor)}>
      <header><strong>{props.targetWindowId ? "Add Tab" : "Add Window"}</strong><span>{props.targetWindowId ? "Open a new tab in this inner window" : "Open a new inner window in the workspace"}</span></header>
      {groups.map((group) => (
        <section key={group.title}>
          <strong>{group.title}</strong>
          <div>
            {group.ids.map((id) => {
              const view = byId.get(id);
              if (!view) return null;
              const Icon = view.icon;
              return (
                <button key={view.id} onClick={() => props.onAdd(view.id, props.area, props.targetWindowId)} type="button">
                  <Icon size={16} aria-hidden />
                  <span><strong>{viewTitle(view)}</strong><small>{automationWindowDescription(view)}</small></span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

function automationWindowAdderPanelStyle(area: AutomationWorkspaceArea, anchor: AutomationWindowAdderState["anchor"]) {
  const gap = 8;
  const margin = 12;
  const width = Math.min(420, window.innerWidth - 48);
  const height = Math.min(620, window.innerHeight - 126);
  const left = area === "right" || area === "bottom"
    ? Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.right - width))
    : Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.left));
  const top = area === "bottom"
    ? Math.max(margin, anchor.top - height - gap)
    : Math.max(margin, Math.min(window.innerHeight - height - margin, anchor.bottom + gap));
  return { left, top, width };
}

function AutomationLayoutPicker(props: { area: AutomationWorkspaceArea; anchor: AutomationLayoutPickerState["anchor"]; onArrange(preset: AutomationLayoutPreset, area: AutomationWorkspaceArea): void }) {
  const options = automationLayoutOptionsForArea(props.area);
  return (
    <section className="automation-layout-picker-panel" style={automationFloatingPanelStyle(props.area, props.anchor, 320, 280)}>
      <header><strong>Arrange Windows</strong><span>{automationAreaLabel(props.area)}</span></header>
      <div className="automation-layout-picker-grid">
        {options.map((preset) => (
          <button key={preset.id} onClick={() => props.onArrange(preset.id, props.area)} title={preset.title} type="button">
            <span className="automation-layout-icon" aria-hidden>
              {preset.cells.map((cell, index) => <i key={index} style={{ left: `${cell.x * 100}%`, top: `${cell.y * 100}%`, width: `${cell.w * 100}%`, height: `${cell.h * 100}%` }} />)}
            </span>
            <span><strong>{preset.label}</strong><small>{preset.title}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function automationLayoutOptionsForArea(area: AutomationWorkspaceArea): AutomationLayoutPresetOption[] {
  if (area === "right") return automationLayoutPresetOptions.filter((item) => item.id === "single" || item.id === "two-rows");
  if (area === "bottom") return automationLayoutPresetOptions.filter((item) => item.id === "single" || item.id === "two-columns");
  return automationLayoutPresetOptions.filter((item) => item.id !== "two-rows");
}

function automationAreaLabel(area: AutomationWorkspaceArea): string {
  if (area === "right") return "Right Sidebar";
  if (area === "bottom") return "Bottom Bar";
  return "Main";
}

function automationFloatingPanelStyle(area: AutomationWorkspaceArea, anchor: AutomationWindowAdderState["anchor"], maxWidth: number, maxHeight: number) {
  const gap = 8;
  const margin = 12;
  const width = Math.min(maxWidth, window.innerWidth - 48);
  const height = Math.min(maxHeight, window.innerHeight - 126);
  const left = area === "right" || area === "bottom"
    ? Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.right - width))
    : Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.left));
  const top = area === "bottom"
    ? Math.max(margin, anchor.top - height - gap)
    : Math.max(margin, Math.min(window.innerHeight - height - margin, anchor.bottom + gap));
  return { left, top, width };
}

function automationWindowDescription(view: AutomationViewInstance): string {
  if (view.type === "design") return "Edit task policy nodes and edges.";
  if (view.type === "routine") return "Build routine orchestration graphs.";
  if (view.type === "config") return "Edit project configuration values.";
  if (view.type === "recordings") return "Review timeline evidence and notes.";
  if (view.type === "signals") return "Browse mined state signals.";
  if (view.type === "runtime") return "Inspect live/debug execution state.";
  if (view.type === "problems") return "Review validation and authoring issues.";
  if (view.type === "inspector") return "Inspect the current global selection.";
  if (view.type === "dock") return "Assistant, problems, history, and state panels.";
  if (view.type === "assistant") return "Work with AI proposals and context.";
  return "Open this workspace view.";
}

function AutomationViewRenderer(props: {
  entries: any[];
  models: any[];
  notes: any[];
  policies: any[];
  policy: any;
  problems: any[];
  recordings: any[];
  dockTab: AutomationDockTab;
  selectedEntry: any;
  selectedNode: any;
  selectedRecording: any;
  selectedSignal: any;
  selectedTimeline: any;
  selection: AutomationSelection | null;
  signals: any[];
  view: AutomationViewInstance;
  setDockTab(tab: AutomationDockTab): void;
  setSelection(selection: AutomationSelection): void;
}) {
  if (props.view.type === "design") return <AutomationPolicyCanvas policy={props.policy} selectedNode={props.selectedNode} setSelection={props.setSelection} />;
  if (props.view.type === "recordings") return <AutomationTimelineView entries={props.entries} notes={props.notes} selectedEntry={props.selectedEntry} setSelection={props.setSelection} />;
  if (props.view.type === "signals") return <AutomationSignalWorkspace signals={props.signals} setSelection={props.setSelection} />;
  if (props.view.type === "runtime") return <AutomationRuntimeWorkspace timelines={props.selectedTimeline ? [props.selectedTimeline] : []} models={props.models} policies={props.policies} />;
  if (props.view.type === "problems") return <AutomationProblemsWorkspace problems={props.problems} />;
  if (props.view.type === "assistant") return <AutomationAssistantView node={props.selectedNode} recording={props.selectedRecording} signals={props.signals} />;
  if (props.view.type === "inspector") return <AutomationInspector selection={props.selection} policy={props.policy} node={props.selectedNode} recording={props.selectedRecording} entry={props.selectedEntry} signal={props.selectedSignal} setSelection={props.setSelection} />;
  if (props.view.type === "dock") return <AutomationWorkspaceDock activeTab={props.dockTab} problems={props.problems} signals={props.signals} models={props.models} selectedNode={props.selectedNode} setActiveTab={props.setDockTab} />;
  if (props.view.type === "routine") return <AutomationRoutineView models={props.models} policies={props.policies} setSelection={props.setSelection} />;
  if (props.view.type === "config") return <AutomationConfigView policy={props.policy} />;
  return <AutomationStateExplorerView signals={props.signals} entries={props.entries} setSelection={props.setSelection} />;
}

function AutomationWorkspacePreferences(props: { prefs: AutomationWorkspacePrefs; setPrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs): void }) {
  const setNumber = (key: "sidebarWidth" | "inspectorWidth" | "bottomDockHeight", value: number) => props.setPrefs((current) => ({ ...current, [key]: value }));
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
        <PreferenceSlider label="Right area" max={620} min={260} unit="px" value={props.prefs.inspectorWidth} onChange={(value) => setNumber("inspectorWidth", value)} />
        <PreferenceSlider label="Bottom area" max={460} min={140} unit="px" value={props.prefs.bottomDockHeight} onChange={(value) => setNumber("bottomDockHeight", value)} />
      </div>
      <div className="automation-preference-group">
        <strong>Window Canvas</strong>
        <p className="muted-text">Drag window title bars to move panes. Drag edges or corners to resize them. Reset restores the default single-window layout.</p>
      </div>
    </section>
  );
}

function PreferenceSlider(props: { label: string; min: number; max: number; unit: string; value: number; note?: string; onChange(value: number): void }) {
  return (
    <label className="automation-preference-row">
      <span>{props.label}</span>
      <input max={props.max} min={props.min} onChange={(event) => props.onChange(Number(event.target.value))} type="range" value={props.value} />
      <output>{props.note ?? `${props.value}${props.unit}`}</output>
    </label>
  );
}

function defaultAutomationWorkspaceWindows(): AutomationWorkspaceWindow[] {
  return [
    { id: "window-policy", activeViewId: "policy-primary", tabs: ["policy-primary"], area: "main", x: 0, y: 0, widthPx: 1040, heightPx: 640, zIndex: 1 },
    { id: "window-inspector", activeViewId: "global-inspector", tabs: ["global-inspector"], area: "right", x: 0, y: 0, widthPx: 320, heightPx: 520, zIndex: 2 },
    { id: "window-dock", activeViewId: "workspace-dock", tabs: ["workspace-dock"], area: "bottom", x: 0, y: 0, widthPx: 960, heightPx: 206, zIndex: 3 }
  ];
}

function defaultAutomationWorkspacePrefs(): AutomationWorkspacePrefs {
  return {
    windows: defaultAutomationWorkspaceWindows(),
    activeWindowId: "window-policy",
    maximizedWindowId: null,
    sidebarWidth: 280,
    inspectorWidth: 320,
    bottomDockHeight: 206,
    utilityWindowsMigrated: true,
    rightSidebarCollapsed: false,
    bottomBarCollapsed: false
  };
}

function normalizeAutomationWorkspacePrefs(value: AutomationWorkspacePrefs): AutomationWorkspacePrefs {
  const fallback = defaultAutomationWorkspacePrefs();
  const legacyColumnWidths = (value as AutomationWorkspacePrefs & { columnWidths?: number[] }).columnWidths;
  const sourceWindows = Array.isArray(value.windows) ? value.windows : fallback.windows;
  const normalizedWindows = sourceWindows
    .filter((item) => item.tabs?.length && item.activeViewId)
    .map((item, index) => {
      const tabs = item.tabs.map((tab) => tab === "node-detail" ? "global-inspector" : tab).filter((tab, tabIndex, allTabs) => allTabs.indexOf(tab) === tabIndex);
      const activeViewId = item.activeViewId === "node-detail" ? "global-inspector" : item.activeViewId;
      return {
        ...item,
        activeViewId,
        tabs: tabs.length ? tabs : [activeViewId],
        area: (["main", "right", "bottom"] as const).includes((item as AutomationWorkspaceWindow).area) ? (item as AutomationWorkspaceWindow).area : "main",
        x: clampNumber(item.x, 0, 6000, 10 + index * 32),
        y: clampNumber(item.y, 0, 6000, 10 + index * 32),
        widthPx: clampNumber(item.widthPx ?? ((item as AutomationWorkspaceWindow & { widthWeight?: number }).widthWeight ? Number((item as AutomationWorkspaceWindow & { widthWeight?: number }).widthWeight) * 8 : legacyColumnWidths?.[index]), 360, 1800, 1040),
        heightPx: clampNumber(item.heightPx, 320, 1400, 640),
        zIndex: clampNumber(item.zIndex, 1, 9999, index + 1)
      };
    });
  const utilityWindowsMigrated = Boolean(value.utilityWindowsMigrated);
  const hasInspectorWindow = normalizedWindows.some((item) => item.tabs.includes("global-inspector") || item.activeViewId === "global-inspector");
  const hasDockWindow = normalizedWindows.some((item) => item.tabs.includes("workspace-dock") || item.activeViewId === "workspace-dock");
  const utilityMigrationWindows = !utilityWindowsMigrated
    ? defaultAutomationWorkspaceWindows().filter((item) => (item.activeViewId === "global-inspector" && !hasInspectorWindow) || (item.activeViewId === "workspace-dock" && !hasDockWindow))
    : [];
  const windows = utilityMigrationWindows.length
    ? [
      ...normalizedWindows,
      ...utilityMigrationWindows.map((item, index) => ({ ...item, zIndex: nextAutomationZIndex(normalizedWindows) + index }))
    ]
    : normalizedWindows;
  return {
    ...fallback,
    ...value,
    windows,
    activeWindowId: windows.some((item) => item.id === value.activeWindowId) ? value.activeWindowId : windows[0]?.id ?? "",
    maximizedWindowId: value.maximizedWindowId && windows.some((item) => item.id === value.maximizedWindowId) ? value.maximizedWindowId : null,
    sidebarWidth: clampNumber(value.sidebarWidth, 220, 420, fallback.sidebarWidth),
    inspectorWidth: clampNumber(value.inspectorWidth, 260, 620, fallback.inspectorWidth),
    bottomDockHeight: clampNumber(value.bottomDockHeight, 140, 460, fallback.bottomDockHeight),
    utilityWindowsMigrated: true,
    rightSidebarCollapsed: Boolean(value.rightSidebarCollapsed),
    bottomBarCollapsed: Boolean(value.bottomBarCollapsed)
  };
}

function nextAutomationZIndex(windows: AutomationWorkspaceWindow[]): number {
  return Math.max(0, ...windows.map((item) => item.zIndex ?? 0)) + 1;
}

function automationWindowGeometrySignature(windows: AutomationWorkspaceWindow[]): string {
  return windows.map((item) => `${item.id}:${item.area}:${item.x},${item.y},${item.widthPx},${item.heightPx}`).join("|");
}

function automationWindowFillsCanvas(windowItem: AutomationWorkspaceWindow, canvasWidth: number, canvasHeight: number): boolean {
  return windowItem.x <= 2
    && windowItem.y <= 2
    && Math.abs(windowItem.widthPx - canvasWidth) <= 3
    && Math.abs(windowItem.heightPx - canvasHeight) <= 3;
}

function restoreAutomationWindowFromFullscreen(
  windowItem: AutomationWorkspaceWindow,
  pointerX: number,
  pointerY: number,
  canvasWidth: number,
  canvasHeight: number
): AutomationWorkspaceWindow {
  const widthPx = Math.min(Math.max(360, Math.round(canvasWidth * 0.62)), Math.min(860, canvasWidth));
  const heightPx = Math.min(Math.max(260, Math.round(canvasHeight * 0.62)), Math.min(560, canvasHeight));
  const ratioX = clampNumber(pointerX / Math.max(1, canvasWidth), 0.15, 0.85, 0.5);
  const x = pointerX - widthPx * ratioX;
  const y = Math.max(0, pointerY - 24);
  return clampAutomationWindowGeometry({ ...windowItem, x, y, widthPx, heightPx }, canvasWidth, canvasHeight, 240, 210);
}

function clampAutomationWindowGeometry(
  windowItem: AutomationWorkspaceWindow,
  maxWidth: number,
  maxHeight: number,
  minWidth = 360,
  minHeight = 320
): AutomationWorkspaceWindow {
  const effectiveMinWidth = Math.min(minWidth, maxWidth);
  const effectiveMinHeight = Math.min(minHeight, maxHeight);
  const widthPx = clampNumber(windowItem.widthPx, effectiveMinWidth, maxWidth, Math.min(1040, maxWidth));
  const heightPx = clampNumber(windowItem.heightPx, effectiveMinHeight, maxHeight, Math.min(640, maxHeight));
  return {
    ...windowItem,
    widthPx,
    heightPx,
    x: clampNumber(windowItem.x, 0, Math.max(0, maxWidth - widthPx), 0),
    y: clampNumber(windowItem.y, 0, Math.max(0, maxHeight - heightPx), 0)
  };
}

function layoutAutomationWindowsInPreset(
  windows: AutomationWorkspaceWindow[],
  preset: AutomationLayoutPresetOption,
  canvasWidth: number,
  canvasHeight: number
): AutomationWorkspaceWindow[] {
  const assignments = new Map<number, AutomationWorkspaceWindow[]>();
  windows.forEach((windowItem, index) => {
    const cellIndex = preset.id === "main-sidebar" && index > 0 ? 1 : index % preset.cells.length;
    const bucket = assignments.get(cellIndex) ?? [];
    bucket.push(windowItem);
    assignments.set(cellIndex, bucket);
  });

  return windows.map((windowItem, index) => {
    const cellIndex = preset.id === "main-sidebar" && index > 0 ? 1 : index % preset.cells.length;
    const cell = preset.cells[cellIndex] ?? preset.cells[0]!;
    const bucket = assignments.get(cellIndex) ?? [windowItem];
    const bucketIndex = bucket.findIndex((item) => item.id === windowItem.id);
    const splitCount = Math.max(1, bucket.length);
    const cellWidth = Math.max(240, Math.round(cell.w * canvasWidth));
    const cellHeight = Math.max(210, Math.floor((cell.h * canvasHeight) / splitCount));
    return clampAutomationWindowGeometry({
      ...windowItem,
      x: Math.round(cell.x * canvasWidth),
      y: Math.round(cell.y * canvasHeight) + bucketIndex * cellHeight,
      widthPx: cellWidth,
      heightPx: cellHeight,
      zIndex: index + 1
    }, canvasWidth, canvasHeight, Math.min(360, cellWidth), Math.min(320, cellHeight));
  });
}

function findAutomationSharedResizePartners(
  windowItem: AutomationWorkspaceWindow,
  edge: AutomationWindowResizeEdge,
  windows: AutomationWorkspaceWindow[]
): AutomationSharedResizePartner[] {
  const threshold = 14;
  const partners = new Map<string, AutomationSharedResizePartner>();
  const left = windowItem.x;
  const right = windowItem.x + windowItem.widthPx;
  const top = windowItem.y;
  const bottom = windowItem.y + windowItem.heightPx;
  for (const item of windows) {
    if (item.id === windowItem.id) continue;
    const itemRight = item.x + item.widthPx;
    const itemBottom = item.y + item.heightPx;
    if (edge.includes("east") && Math.abs(item.x - right) <= threshold && automationRangesOverlap(top, bottom, item.y, itemBottom)) {
      partners.set(`${item.id}:west`, { id: item.id, side: "west", start: item });
    }
    if (edge.includes("west") && Math.abs(itemRight - left) <= threshold && automationRangesOverlap(top, bottom, item.y, itemBottom)) {
      partners.set(`${item.id}:east`, { id: item.id, side: "east", start: item });
    }
    if (edge.includes("south") && Math.abs(item.y - bottom) <= threshold && automationRangesOverlap(left, right, item.x, itemRight)) {
      partners.set(`${item.id}:north`, { id: item.id, side: "north", start: item });
    }
    if (edge.includes("north") && Math.abs(itemBottom - top) <= threshold && automationRangesOverlap(left, right, item.x, itemRight)) {
      partners.set(`${item.id}:south`, { id: item.id, side: "south", start: item });
    }
  }
  return [...partners.values()];
}

function constrainAutomationResizeDelta(
  value: number,
  axis: "x" | "y",
  edge: AutomationWindowResizeEdge,
  windowItem: AutomationWorkspaceWindow,
  partners: AutomationSharedResizePartner[],
  canvasSize: number
): number {
  const minSize = axis === "x" ? 240 : 210;
  const startPosition = axis === "x" ? windowItem.x : windowItem.y;
  const startSize = axis === "x" ? windowItem.widthPx : windowItem.heightPx;
  let minDelta = Number.NEGATIVE_INFINITY;
  let maxDelta = Number.POSITIVE_INFINITY;

  if ((axis === "x" && edge.includes("east")) || (axis === "y" && edge.includes("south"))) {
    minDelta = Math.max(minDelta, minSize - startSize);
    maxDelta = Math.min(maxDelta, canvasSize - (startPosition + startSize));
  }
  if ((axis === "x" && edge.includes("west")) || (axis === "y" && edge.includes("north"))) {
    minDelta = Math.max(minDelta, -startPosition);
    maxDelta = Math.min(maxDelta, startSize - minSize);
  }

  for (const partner of partners) {
    const partnerStart = axis === "x" ? partner.start.x : partner.start.y;
    const partnerSize = axis === "x" ? partner.start.widthPx : partner.start.heightPx;
    if ((axis === "x" && partner.side === "west") || (axis === "y" && partner.side === "north")) {
      minDelta = Math.max(minDelta, -partnerStart);
      maxDelta = Math.min(maxDelta, partnerSize - minSize);
    }
    if ((axis === "x" && partner.side === "east") || (axis === "y" && partner.side === "south")) {
      minDelta = Math.max(minDelta, minSize - partnerSize);
      maxDelta = Math.min(maxDelta, canvasSize - (partnerStart + partnerSize));
    }
  }

  if (!Number.isFinite(minDelta)) minDelta = value;
  if (!Number.isFinite(maxDelta)) maxDelta = value;
  return Math.min(maxDelta, Math.max(minDelta, value));
}

function automationRangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.min(endA, endB) - Math.max(startA, startB) > 24;
}

function fullAutomationWindowGeometry(bounds: DOMRect | undefined): Pick<AutomationWorkspaceWindow, "x" | "y" | "widthPx" | "heightPx"> {
  return {
    x: 0,
    y: 0,
    widthPx: Math.max(1, Math.floor(bounds?.width ?? 420)),
    heightPx: Math.max(1, Math.floor(bounds?.height ?? 320))
  };
}

function placeAutomationWindow(windows: AutomationWorkspaceWindow[], bounds: DOMRect | undefined): Pick<AutomationWorkspaceWindow, "x" | "y" | "widthPx" | "heightPx"> {
  const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
  const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
  const gap = 8;
  const active = windows.reduce<AutomationWorkspaceWindow | null>((latest, item) => !latest || item.zIndex > latest.zIndex ? item : latest, null);
  if (active) {
    const rightX = active.x + active.widthPx + gap;
    const rightSpace = canvasWidth - rightX;
    if (rightSpace >= 420) return { x: rightX, y: active.y, widthPx: rightSpace, heightPx: Math.min(active.heightPx, canvasHeight - active.y) };
    const belowY = active.y + active.heightPx + gap;
    const belowSpace = canvasHeight - belowY;
    if (belowSpace >= 340) return { x: active.x, y: belowY, widthPx: Math.min(active.widthPx, canvasWidth - active.x), heightPx: belowSpace };
  }
  const offset = windows.length * 34;
  const placed = { id: "", activeViewId: "", tabs: [""], area: "main" as const, x: offset, y: offset, widthPx: Math.min(1040, canvasWidth), heightPx: Math.min(640, canvasHeight), zIndex: 1 };
  const clamped = clampAutomationWindowGeometry(placed, canvasWidth, canvasHeight);
  return { x: clamped.x, y: clamped.y, widthPx: clamped.widthPx, heightPx: clamped.heightPx };
}

function automationSnapGeometry(canvasElement: HTMLDivElement | null, clientX: number, clientY: number): Pick<AutomationWorkspaceWindow, "x" | "y" | "widthPx" | "heightPx"> | null {
  if (!canvasElement) return null;
  const bounds = canvasElement.getBoundingClientRect();
  const threshold = 64;
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const left = clientX - bounds.left <= threshold;
  const right = bounds.right - clientX <= threshold;
  const top = clientY - bounds.top <= threshold;
  const bottom = bounds.bottom - clientY <= threshold;
  if ((left || right) && (top || bottom)) return { x: 0, y: 0, widthPx: width, heightPx: height };
  if (left) return { x: 0, y: 0, widthPx: Math.floor(width / 2), heightPx: height };
  if (right) return { x: Math.floor(width / 2), y: 0, widthPx: Math.ceil(width / 2), heightPx: height };
  if (top) return { x: 0, y: 0, widthPx: width, heightPx: Math.floor(height / 2) };
  if (bottom) return { x: 0, y: Math.floor(height / 2), widthPx: width, heightPx: Math.ceil(height / 2) };
  return null;
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
  icon: typeof Blocks;
  tabs: AutomationViewInstance[];
  windowId: string;
  windowIndex: number;
  subtitle: string;
  title: string;
  onActivate(): void;
  onAddTab(event: MouseEvent<HTMLButtonElement>): void;
  onClose(): void;
  onCloseTab(viewId: string): void;
  onMoveStart(event: ReactPointerEvent<HTMLElement>): void;
  onResetSize(): void;
  onResizeStart(edge: AutomationWindowResizeEdge, event: ReactPointerEvent<HTMLButtonElement>): void;
  onTabSelect(viewId: string): void;
}) {
  const Icon = props.icon;
  return (
    <section className={props.active ? "automation-view-container active" : "automation-view-container"} onMouseDown={props.onActivate}>
      <header onPointerDown={props.onMoveStart}>
        <div>
          <Icon size={15} aria-hidden />
          <span><strong>{props.title}</strong><small>Window {props.windowIndex + 1} - {props.subtitle}</small></span>
        </div>
        <div className="automation-pane-actions">
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onAddTab(event); }} title="Add tab" aria-label="Add tab" type="button"><Plus size={13} aria-hidden /></button>
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onResetSize(); }} title="Reset window size" aria-label="Reset window size" type="button"><RefreshCcw size={13} aria-hidden /></button>
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onClose(); }} title="Close window" aria-label="Close window" type="button"><XCircle size={13} aria-hidden /></button>
        </div>
      </header>
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
      <button className="automation-window-resize-edge top" onPointerDown={(event) => props.onResizeStart("north", event)} title="Resize height" aria-label="Resize height from top" type="button" />
      <button className="automation-window-resize-edge right" onPointerDown={(event) => props.onResizeStart("east", event)} title="Resize width" aria-label="Resize width from right" type="button" />
      <button className="automation-window-resize-edge bottom" onPointerDown={(event) => props.onResizeStart("south", event)} title="Resize height" aria-label="Resize height from bottom" type="button" />
      <button className="automation-window-resize-edge left" onPointerDown={(event) => props.onResizeStart("west", event)} title="Resize width" aria-label="Resize width from left" type="button" />
      <button className="automation-window-resize-corner top-left" onPointerDown={(event) => props.onResizeStart("north-west", event)} title="Resize window" aria-label="Resize window from top left" type="button" />
      <button className="automation-window-resize-corner top-right" onPointerDown={(event) => props.onResizeStart("north-east", event)} title="Resize window" aria-label="Resize window from top right" type="button" />
      <button className="automation-window-resize-corner bottom-left" onPointerDown={(event) => props.onResizeStart("south-west", event)} title="Resize window" aria-label="Resize window from bottom left" type="button" />
      <button className="automation-window-resize-corner bottom-right" onPointerDown={(event) => props.onResizeStart("south-east", event)} title="Resize window" aria-label="Resize window from bottom right" type="button" />
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

function automationPaletteIcon(family: string): typeof Blocks {
  switch (family) {
    case "control-flow": return GitBranch;
    case "policy": return ShieldCheck;
    case "routine": return Workflow;
    case "logic": return ListChecks;
    case "math": return Braces;
    case "random": return Radio;
    case "data": return Network;
    case "database": return Network;
    case "timing": return History;
    case "custom": return Blocks;
    default: return Blocks;
  }
}

function automationNodeIcon(icon: string | undefined, family: string | undefined): typeof Blocks {
  switch (icon) {
    case "calculator": return Calculator;
    case "circle-dot": return CircleDot;
    case "clock-alert":
    case "clock": return Clock;
    case "database": return Database;
    case "dice-5": return Dice5;
    case "git-branch": return GitBranch;
    case "merge": return Merge;
    case "repeat": return Repeat;
    case "shield": return ShieldCheck;
    case "shuffle": return Shuffle;
    case "split": return Split;
    case "waves": return Waves;
    case "workflow": return Workflow;
    case "zap": return Zap;
    default: return automationPaletteIcon(family ?? "custom");
  }
}

function AutomationNodePalette(props: {
  collapsed: boolean;
  groups: AutomationEditorPaletteGroup[];
  title: string;
  onAddNode(spec: AutomationEditorNodeSpec): void;
  onCollapsedChange(value: boolean): void;
}) {
  return (
    <aside className={props.collapsed ? "automation-node-palette collapsed" : "automation-node-palette"} aria-label={props.title}>
      <header>
        <strong>{props.title}</strong>
        <button className="icon-button" onClick={() => props.onCollapsedChange(!props.collapsed)} title={props.collapsed ? "Expand palette" : "Collapse palette"} aria-label={props.collapsed ? "Expand palette" : "Collapse palette"} type="button">
          {props.collapsed ? <ChevronLeftIcon /> : <ChevronRight size={13} aria-hidden />}
        </button>
      </header>
      {!props.collapsed ? props.groups.map((group) => (
        <section key={group.title}>
          <strong>{group.title}</strong>
          {group.nodes.map((item) => {
            const Icon = automationNodeIcon(item.icon, item.family);
            return (
              <button key={item.id} onClick={() => props.onAddNode(item)} title={item.description} type="button">
                <Icon size={15} aria-hidden />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            );
          })}
        </section>
      )) : null}
    </aside>
  );
}

function ChevronLeftIcon() {
  return <ChevronRight size={13} aria-hidden style={{ transform: "rotate(180deg)" }} />;
}

function routineEditorSelection(id: string, data: AutomationRoutineNodeData): AutomationSelection {
  return {
    kind: "editor-node",
    id,
    node: {
      label: data.label,
      nodeType: data.nodeType,
      family: data.family,
      description: data.description,
      ...(data.customDescription !== undefined ? { customDescription: data.customDescription } : {}),
      inputs: data.inputs,
      outputs: data.outputs,
      parameters: data.parameters,
      parameterValues: data.parameterValues,
      ...(data.nodeDefinitionId !== undefined ? { nodeDefinitionId: data.nodeDefinitionId } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.privileged !== undefined ? { privileged: data.privileged } : {})
    }
  };
}

function policyEditorSelection(id: string, data: AutomationPolicyNodeData): AutomationSelection {
  return {
    kind: "editor-node",
    id,
    node: {
      label: data.label,
      nodeType: data.isStart ? "start" : "policy",
      family: data.recovery,
      description: data.description,
      ...(data.customDescription !== undefined ? { customDescription: data.customDescription } : {}),
      inputs: data.inputs,
      outputs: data.outputs,
      parameters: data.parameters,
      parameterValues: data.parameterValues,
      ...(data.nodeDefinitionId !== undefined ? { nodeDefinitionId: data.nodeDefinitionId } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      actionTypes: data.actionTypes
    }
  };
}

function AutomationRoutineView(props: { models: any[]; policies: any[]; setSelection(selection: AutomationSelection): void }) {
  const [selectedRoutineNodeId, setSelectedRoutineNodeId] = useState("");
  const [selectedRoutineEdgeIds, setSelectedRoutineEdgeIds] = useState<string[]>([]);
  const [layer, setLayer] = useState("Routine flow");
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const routineFrameRef = useRef<HTMLDivElement>(null);
  const routineSelectionRef = useRef("");
  const [routineFlow, setRoutineFlow] = useState<ReactFlowInstance<Node<AutomationRoutineNodeData>, Edge> | null>(null);
  const graph = useMemo(() => routineToReactFlowGraph(), []);
  const [routineNodes, setRoutineNodes] = useState(graph.nodes);
  const [routineEdges, setRoutineEdges] = useState(graph.edges);
  useEffect(() => {
    setRoutineNodes((current) => syncGraphNodes(current, graph.nodes));
    setRoutineEdges(graph.edges);
  }, [graph.edges, graph.nodes]);
  const palette = automationEditorPalette
    .map((group) => ({ ...group, nodes: group.nodes.filter((node) => node.scope === "routine" || node.scope === "both") }))
    .filter((group) => group.nodes.length > 0);
  const addRoutineNode = (spec: AutomationEditorNodeSpec) => {
    const id = `routine-${spec.id}-${Date.now().toString(36)}`;
    const data: AutomationRoutineNodeData = {
      nodeDefinitionId: spec.id,
      label: spec.label,
      nodeType: spec.nodeType === "custom" ? "custom" : "base",
      family: spec.family,
      description: spec.description,
      ...(spec.icon !== undefined ? { icon: spec.icon } : {}),
      inputs: automationVisualInputPorts(spec.inputs, spec.id),
      outputs: spec.outputs,
      parameters: spec.parameters,
      parameterValues: defaultAutomationParameterValues(spec.parameters),
      ...(spec.privileged !== undefined ? { privileged: spec.privileged } : {})
    };
    const node: Node<AutomationRoutineNodeData> = {
      id,
      type: "routineNode",
      position: roundedAutomationPosition(spawnAutomationNodePosition(selectedRoutineNodeId, routineNodes, routineEdges, routineFlow, routineFrameRef.current)),
      data
    };
    setRoutineNodes((nodes) => [...nodes, node]);
    setSelectedRoutineNodeId(id);
    setSelectedRoutineEdgeIds([]);
    props.setSelection(routineEditorSelection(id, data));
    routineSelectionRef.current = `node:${id}`;
  };
  const deleteRoutineSelection = () => {
    const nodeIds = new Set(selectedRoutineNodeId ? [selectedRoutineNodeId] : []);
    const edgeIds = new Set(selectedRoutineEdgeIds);
    setRoutineNodes((nodes) => nodes.filter((node) => !nodeIds.has(node.id)));
    setRoutineEdges((edges) => edges.filter((edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target)));
    setSelectedRoutineNodeId("");
    setSelectedRoutineEdgeIds([]);
  };
  useEffect(() => {
    function handleDeleteNode(event: Event) {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      setRoutineNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
      setRoutineEdges((edges) => edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedRoutineNodeId((current) => current === nodeId ? "" : current);
    }
    function handleDeleteEdge(event: Event) {
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId) return;
      setRoutineEdges((edges) => edges.filter((edge) => edge.id !== edgeId));
      setSelectedRoutineEdgeIds((ids) => ids.filter((id) => id !== edgeId));
    }
    function handleUpdateParameters(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string; parameterValues?: JsonObject; customDescription?: string }>).detail;
      if (!detail?.nodeId) return;
      setRoutineNodes((nodes) => nodes.map((node) => node.id === detail.nodeId ? { ...node, data: { ...node.data, ...(detail.parameterValues ? { parameterValues: detail.parameterValues } : {}), ...(detail.customDescription !== undefined ? { customDescription: detail.customDescription } : {}) } } : node));
    }
    window.addEventListener("automation-studio:delete-node", handleDeleteNode);
    window.addEventListener("automation-studio:delete-edge", handleDeleteEdge);
    window.addEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    return () => {
      window.removeEventListener("automation-studio:delete-node", handleDeleteNode);
      window.removeEventListener("automation-studio:delete-edge", handleDeleteEdge);
      window.removeEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    };
  }, []);
  return (
    <section className="automation-policy-canvas routine-canvas">
      <div className="automation-layer-tabs" role="tablist" aria-label="Routine graph layers">
        {["Routine flow", "Tasks", "Branches", "Recovery", "Permissions", "Custom nodes"].map((item) => (
          <button className={layer === item ? "selected" : ""} key={item} onClick={() => setLayer(item)} type="button">{item}</button>
        ))}
      </div>
      <div className={paletteCollapsed ? "automation-routine-editor-grid palette-collapsed" : "automation-routine-editor-grid"}>
        <div className="automation-react-flow-frame" ref={routineFrameRef}>
          <ReactFlow<Node<AutomationRoutineNodeData>, Edge>
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodes={routineNodes}
            edges={routineEdges}
            edgeTypes={automationEdgeTypes}
            nodeTypes={automationNodeTypes}
            nodesDraggable
            nodesConnectable
            elementsSelectable
            deleteKeyCode={["Backspace", "Delete"]}
            onInit={setRoutineFlow}
            isValidConnection={(connection) => automationConnectionIsValid(connection, routineNodes)}
            onConnect={(connection) => setRoutineEdges((edges) => addEdge(createAutomationConnectionEdge(connection, edges, "routine-edge", routineNodes), edges))}
            onEdgesChange={(changes: EdgeChange[]) => setRoutineEdges((edges) => applyEdgeChanges(changes, edges))}
            onEdgesDelete={(deletedEdges) => setSelectedRoutineEdgeIds((ids) => ids.filter((id) => !deletedEdges.some((edge) => edge.id === id)))}
            onNodesDelete={(deletedNodes) => {
              const deletedIds = new Set(deletedNodes.map((node) => node.id));
              setRoutineEdges((edges) => edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)));
              if (deletedIds.has(selectedRoutineNodeId)) setSelectedRoutineNodeId("");
            }}
            onNodesChange={(changes: NodeChange<Node<AutomationRoutineNodeData>>[]) => setRoutineNodes((nodes) => applyNodeChanges(changes, nodes))}
            onNodeClick={(_event, node) => {
              setSelectedRoutineNodeId((current) => current === node.id ? current : node.id);
              const key = `node:${node.id}`;
              if (routineSelectionRef.current !== key) {
                routineSelectionRef.current = key;
                props.setSelection(routineEditorSelection(node.id, node.data));
              }
            }}
            onSelectionChange={({ nodes, edges }) => {
              const selectedNode = nodes[0];
              const edgeIds = edges.map((edge) => edge.id);
              setSelectedRoutineNodeId((current) => current === (selectedNode?.id ?? "") ? current : selectedNode?.id ?? "");
              setSelectedRoutineEdgeIds((current) => sameStringList(current, edgeIds) ? current : edgeIds);
              const key = selectedNode ? `node:${selectedNode.id}` : edgeIds.length ? `edges:${edgeIds.join(",")}` : "";
              if (selectedNode && routineSelectionRef.current !== key) {
                routineSelectionRef.current = key;
                props.setSelection(routineEditorSelection(selectedNode.id, selectedNode.data));
              } else if (!selectedNode) {
                routineSelectionRef.current = key;
              }
            }}
          >
            <Background gap={24} size={1} />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <AutomationNodePalette collapsed={paletteCollapsed} groups={palette} title="Routine Nodes" onAddNode={addRoutineNode} onCollapsedChange={setPaletteCollapsed} />
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
  const [selectedPolicyNodeId, setSelectedPolicyNodeId] = useState(props.selectedNode?.id ?? "");
  const [selectedPolicyEdgeIds, setSelectedPolicyEdgeIds] = useState<string[]>([]);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const policyFrameRef = useRef<HTMLDivElement>(null);
  const policySelectionRef = useRef("");
  const [policyFlow, setPolicyFlow] = useState<ReactFlowInstance<Node<AutomationPolicyNodeData>, Edge> | null>(null);
  const graph = useMemo(() => policyToReactFlowGraph(props.policy, ""), [props.policy]);
  const [policyNodes, setPolicyNodes] = useState(graph.nodes);
  const [policyEdges, setPolicyEdges] = useState(graph.edges);
  useEffect(() => {
    setPolicyNodes((current) => syncGraphNodes(current, graph.nodes));
    setPolicyEdges(graph.edges);
    setSelectedPolicyEdgeIds([]);
  }, [graph.edges, graph.nodes]);
  useEffect(() => {
    setSelectedPolicyNodeId(props.selectedNode?.id ?? "");
  }, [props.selectedNode?.id]);
  const palette = automationEditorPalette
    .map((group) => ({ ...group, nodes: group.nodes.filter((node) => node.scope === "policy" || node.scope === "both") }))
    .filter((group) => group.nodes.length > 0);
  const addPolicyNode = (spec: AutomationEditorNodeSpec) => {
    const id = `policy-${spec.id}-${Date.now().toString(36)}`;
    const data: AutomationPolicyNodeData = {
      nodeDefinitionId: spec.id,
      label: spec.label,
      description: spec.description,
      ...(spec.icon !== undefined ? { icon: spec.icon } : {}),
      actionTypes: spec.actionTypes ?? [],
      recovery: spec.family,
      evidenceCount: 0,
      readinessCount: spec.inputs.length,
      successCount: spec.outputs.length,
      inputs: automationVisualInputPorts(spec.inputs, spec.id),
      outputs: spec.outputs,
      parameters: spec.parameters,
      parameterValues: defaultAutomationParameterValues(spec.parameters),
      isStart: spec.id === "builtin.control.start"
    };
    const node: Node<AutomationPolicyNodeData> = {
      id,
      type: "policyNode",
      position: roundedAutomationPosition(spawnAutomationNodePosition(selectedPolicyNodeId, policyNodes, policyEdges, policyFlow, policyFrameRef.current)),
      data
    };
    setPolicyNodes((nodes) => [...nodes, node]);
    setSelectedPolicyNodeId(id);
    setSelectedPolicyEdgeIds([]);
    props.setSelection(policyEditorSelection(id, data));
    policySelectionRef.current = `node:${id}`;
  };
  const deletePolicySelection = () => {
    const nodeIds = new Set(selectedPolicyNodeId ? [selectedPolicyNodeId] : []);
    const edgeIds = new Set(selectedPolicyEdgeIds);
    setPolicyNodes((nodes) => nodes.filter((node) => !nodeIds.has(node.id)));
    setPolicyEdges((edges) => edges.filter((edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target)));
    setSelectedPolicyNodeId("");
    setSelectedPolicyEdgeIds([]);
  };
  useEffect(() => {
    function handleDeleteNode(event: Event) {
      const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (!nodeId) return;
      setPolicyNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
      setPolicyEdges((edges) => edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedPolicyNodeId((current: string) => current === nodeId ? "" : current);
    }
    function handleDeleteEdge(event: Event) {
      const edgeId = (event as CustomEvent<{ edgeId?: string }>).detail?.edgeId;
      if (!edgeId) return;
      setPolicyEdges((edges) => edges.filter((edge) => edge.id !== edgeId));
      setSelectedPolicyEdgeIds((ids) => ids.filter((id) => id !== edgeId));
    }
    function handleUpdateParameters(event: Event) {
      const detail = (event as CustomEvent<{ nodeId?: string; parameterValues?: JsonObject; customDescription?: string }>).detail;
      if (!detail?.nodeId) return;
      setPolicyNodes((nodes) => nodes.map((node) => node.id === detail.nodeId ? { ...node, data: { ...node.data, ...(detail.parameterValues ? { parameterValues: detail.parameterValues } : {}), ...(detail.customDescription !== undefined ? { customDescription: detail.customDescription } : {}) } } : node));
    }
    window.addEventListener("automation-studio:delete-node", handleDeleteNode);
    window.addEventListener("automation-studio:delete-edge", handleDeleteEdge);
    window.addEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    return () => {
      window.removeEventListener("automation-studio:delete-node", handleDeleteNode);
      window.removeEventListener("automation-studio:delete-edge", handleDeleteEdge);
      window.removeEventListener("automation-studio:update-node-parameters", handleUpdateParameters);
    };
  }, []);
  return (
    <section className="automation-policy-canvas">
      <div className="automation-layer-tabs" role="tablist" aria-label="Policy graph layers">
        {["Logical flow", "State eligibility", "Actions", "Expectations", "Recovery", "Evidence", "Runtime"].map((item) => (
          <button className={layer === item ? "selected" : ""} key={item} onClick={() => setLayer(item)} type="button">{item}</button>
        ))}
      </div>
      <div className={paletteCollapsed ? "automation-policy-editor-grid palette-collapsed" : "automation-policy-editor-grid"}>
        <div className="automation-react-flow-frame" ref={policyFrameRef}>
          <ReactFlow<Node<AutomationPolicyNodeData>, Edge>
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodes={policyNodes}
            edges={policyEdges}
            edgeTypes={automationEdgeTypes}
            nodeTypes={automationNodeTypes}
            nodesDraggable
            nodesConnectable
            elementsSelectable
            deleteKeyCode={["Backspace", "Delete"]}
            onInit={setPolicyFlow}
            isValidConnection={(connection) => automationConnectionIsValid(connection, policyNodes)}
            onConnect={(connection) => setPolicyEdges((edges) => addEdge(createAutomationConnectionEdge(connection, edges, "policy-edge", policyNodes), edges))}
            onEdgesChange={(changes: EdgeChange[]) => setPolicyEdges((edges) => applyEdgeChanges(changes, edges))}
            onEdgesDelete={(deletedEdges) => setSelectedPolicyEdgeIds((ids) => ids.filter((id) => !deletedEdges.some((edge) => edge.id === id)))}
            onNodesDelete={(deletedNodes) => {
              const deletedIds = new Set(deletedNodes.map((node) => node.id));
              setPolicyEdges((edges) => edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)));
              if (deletedIds.has(selectedPolicyNodeId)) setSelectedPolicyNodeId("");
            }}
            onNodesChange={(changes: NodeChange<Node<AutomationPolicyNodeData>>[]) => setPolicyNodes((nodes) => applyNodeChanges(changes, nodes))}
            onNodeClick={(_event, node) => {
              setSelectedPolicyNodeId((current: string) => current === node.id ? current : node.id);
              const key = `node:${node.id}`;
              if (policySelectionRef.current !== key) {
                policySelectionRef.current = key;
                props.setSelection(props.policy?.nodes?.some((policyNode: any) => policyNode.id === node.id) ? { kind: "node", id: node.id } : policyEditorSelection(node.id, node.data));
              }
            }}
            onSelectionChange={({ nodes, edges }) => {
              const selectedNode = nodes[0];
              const nodeId = selectedNode?.id ?? "";
              const edgeIds = edges.map((edge) => edge.id);
              setSelectedPolicyNodeId((current: string) => current === nodeId ? current : nodeId);
              setSelectedPolicyEdgeIds((current) => sameStringList(current, edgeIds) ? current : edgeIds);
              const key = selectedNode ? `node:${selectedNode.id}` : edgeIds.length ? `edges:${edgeIds.join(",")}` : "";
              if (selectedNode && policySelectionRef.current !== key) {
                policySelectionRef.current = key;
                props.setSelection(props.policy?.nodes?.some((policyNode: any) => policyNode.id === selectedNode.id) ? { kind: "node", id: selectedNode.id } : policyEditorSelection(selectedNode.id, selectedNode.data));
              } else if (!selectedNode) {
                policySelectionRef.current = key;
              }
            }}
          >
            <Background gap={24} size={1} />
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <AutomationNodePalette collapsed={paletteCollapsed} groups={palette} title="Policy Nodes" onAddNode={addPolicyNode} onCollapsedChange={setPaletteCollapsed} />
      </div>
    </section>
  );
}

function AutomationPolicyNode({ id, data, selected }: NodeProps) {
  const node = data as AutomationPolicyNodeData;
  const Icon = automationNodeIcon(node.icon, node.recovery);
  const description = node.customDescription || node.description || node.actionTypes.join(", ") || "Policy node";
  return (
    <div className={selected ? "automation-flow-node selected" : "automation-flow-node"}>
      {selected ? <SelectedNodeDeleteButton nodeId={id} /> : null}
      <AutomationNodePortHandles ports={node.inputs} type="target" />
      <AutomationNodePortHandles ports={node.outputs} type="source" />
      <div className="node-badges">
        {node.isStart ? <span className="node-badge start">Start</span> : null}
        <span className="node-badge category">{node.nodeDefinitionId ? "Base" : "Generated"}</span>
        <span className="node-badge category">{node.recovery.replace(/_/g, " ")}</span>
        {node.confidence !== undefined ? <span className="node-badge confidence">{Math.round(node.confidence * 100)}%</span> : null}
      </div>
      <div className="automation-flow-node-main">
        <span className="node-icon" title={node.nodeDefinitionId ? node.label : "Generated policy node"}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{node.label}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className="node-definition-lines">
        <span>Eligible: {node.readinessCount || 0} signals</span>
        <span>Success: {node.successCount || 0} expectations</span>
        <span>Timeout: {node.timeoutMs ? `${(node.timeoutMs / 1000).toFixed(1)}s` : "default"}</span>
      </div>
      <AutomationNodePortList inputs={node.inputs} outputs={node.outputs} />
      <div className="node-state-indicators">
        <span className={node.readinessCount ? "node-state-chip has-state" : "node-state-chip empty-state"}>Ready {node.readinessCount}</span>
        <span className={node.successCount ? "node-state-chip has-state" : "node-state-chip empty-state"}>Success {node.successCount}</span>
        <span className="node-state-chip has-state">Evidence {node.evidenceCount}</span>
      </div>
      <footer className="node-runtime-line">12 successes - 1 retry</footer>
    </div>
  );
}

function AutomationRoutineNode({ id, data, selected }: NodeProps) {
  const node = data as AutomationRoutineNodeData;
  const Icon = automationNodeIcon(node.icon, node.family);
  const description = node.customDescription || node.description;
  return (
    <div className={selected ? `automation-flow-node routine-node selected ${node.nodeType}` : `automation-flow-node routine-node ${node.nodeType}`}>
      {selected ? <SelectedNodeDeleteButton nodeId={id} /> : null}
      <AutomationNodePortHandles ports={node.inputs} type="target" />
      <AutomationNodePortHandles ports={node.outputs} type="source" />
      <div className="node-badges">
        <span className={node.nodeType === "custom" ? "node-badge custom" : "node-badge category"}>{node.nodeType}</span>
        <span className="node-badge category">{node.family}</span>
        {node.privileged ? <span className="node-badge privileged">PIN</span> : null}
      </div>
      <div className="automation-flow-node-main">
        <span className="node-icon" title={node.label}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{node.label}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className="node-definition-lines">
        <span>Inputs: {node.inputs.length}</span>
        <span>Outputs: {node.outputs.length}</span>
        <span>Scope: routine orchestration</span>
      </div>
      <AutomationNodePortList inputs={node.inputs} outputs={node.outputs} />
      <footer className="node-runtime-line">No recordings or state bindings</footer>
    </div>
  );
}

function AutomationNodePortHandles(props: { ports: AutomationNodePort[]; type: "source" | "target" }) {
  return props.ports.map((port, index) => (
    <Handle
      key={`${props.type}-${port.id}`}
      type={props.type}
      position={props.type === "source" ? Position.Right : Position.Left}
      id={port.id}
      className={`${props.type === "source" ? "automation-flow-handle output" : "automation-flow-handle input"} tone-${automationPortTone(port, props.type)}`}
      style={{ top: automationPortHandleTop(index, props.ports.length) }}
      title={automationPortTitle(port, props.type)}
    />
  ));
}

function automationVisualInputPorts(inputs: AutomationNodePort[], nodeDefinitionId: string): AutomationNodePort[] {
  if (inputs.length || nodeDefinitionId === "builtin.control.start") return inputs;
  return [{ id: "in", label: "In", valueType: "any", role: "control" }];
}

function defaultAutomationParameterValues(parameters: AutomationNodeParameter[]): JsonObject {
  return Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.defaultValue ?? defaultAutomationParameterValue(parameter)]));
}

function defaultAutomationParameterValue(parameter: AutomationNodeParameter): unknown {
  if (parameter.options?.[0]) return parameter.options[0].value;
  if (parameter.valueType === "number") return 0;
  if (parameter.valueType === "boolean") return false;
  if (parameter.valueType === "json") return {};
  return "";
}

function automationNodeExecutionPreview(definition: AutomationNodeDefinition | undefined, parameterValues: JsonObject): string {
  if (!definition?.execute) return "No built-in executor available.";
  try {
    const result = definition.execute({
      inputs: {},
      parameters: parameterValues as Record<string, any>,
      random: () => 0.42,
      now: () => 0
    });
    if (result instanceof Promise) return "Async executor preview pending runtime integration.";
    return shortJson(result);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function AutomationNodePortList(props: { inputs: AutomationNodePort[]; outputs: AutomationNodePort[] }) {
  return (
    <div className="automation-node-port-list">
      <div className="automation-node-port-column input">
        {props.inputs.length ? props.inputs.map((port) => <AutomationNodePortRow key={port.id} port={port} direction="target" />) : <span className="empty">No inputs</span>}
      </div>
      <div className="automation-node-port-column output">
        {props.outputs.length ? props.outputs.map((port) => <AutomationNodePortRow key={port.id} port={port} direction="source" />) : <span className="empty">No outputs</span>}
      </div>
    </div>
  );
}

function AutomationNodePortRow(props: { port: AutomationNodePort; direction: "source" | "target" }) {
  const tone = automationPortTone(props.port, props.direction);
  const caption = automationPortCaption(props.port, props.direction);
  return (
    <span className={`tone-${tone}`} title={automationPortTitle(props.port, props.direction)}>
      <i aria-hidden />
      <strong>{automationPortDisplayLabel(props.port)}</strong>
      {caption ? <small>{caption}</small> : null}
    </span>
  );
}

function SelectedNodeDeleteButton(props: { nodeId: string }) {
  return (
    <button
      className="automation-node-delete-button nodrag nopan"
      onClick={(event) => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("automation-studio:delete-node", { detail: { nodeId: props.nodeId } }));
      }}
      title="Delete node"
      aria-label="Delete node"
      type="button"
    >
      <Trash2 size={13} aria-hidden />
    </button>
  );
}

function AutomationFlowEdge(props: EdgeProps) {
  const route = automationEdgeRoute(props.id, props.sourceX, props.sourceY, props.targetX, props.targetY, props.data as Record<string, unknown> | undefined);
  const [edgePath, labelX, labelY] = route.kind === "loop"
    ? automationLoopEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane)
    : automationLaneEdgePath(props.sourceX, props.sourceY, props.targetX, props.targetY, route.lane);
  const label = String(props.label ?? props.data?.label ?? "");
  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{
          ...props.style,
          strokeWidth: props.selected ? 4 : props.style?.strokeWidth
        }}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
      />
      {label ? (
        <EdgeLabelRenderer>
          <span className={props.selected ? "automation-edge-label selected nodrag nopan" : "automation-edge-label nodrag nopan"} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</span>
        </EdgeLabelRenderer>
      ) : null}
      {props.selected ? (
        <EdgeLabelRenderer>
          <button
            className="automation-edge-delete-button nodrag nopan"
            onClick={(event) => {
              event.stopPropagation();
              window.dispatchEvent(new CustomEvent("automation-studio:delete-edge", { detail: { edgeId: props.id } }));
            }}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 28}px)` }}
            title="Delete edge"
            aria-label="Delete edge"
            type="button"
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
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

function AutomationInspector(props: { selection: AutomationSelection | null; policy: any; node: any; recording: any; entry: any; signal: any; setSelection(selection: AutomationSelection): void }) {
  const title = props.selection?.kind === "signal" ? "Signal" : props.selection?.kind === "timeline" ? "Timeline Entry" : props.selection?.kind === "recording" ? "Recording" : props.selection?.kind === "policy" ? "Policy Graph" : props.selection?.kind === "editor-node" ? "Editor Node" : "Node Inspector";
  const updateEditorNodeParameters = (parameterValues: JsonObject) => {
    if (props.selection?.kind !== "editor-node") return;
    const nextSelection: AutomationSelection = {
      ...props.selection,
      node: {
        ...props.selection.node,
        parameterValues
      }
    };
    props.setSelection(nextSelection);
    window.dispatchEvent(new CustomEvent("automation-studio:update-node-parameters", { detail: { nodeId: props.selection.id, parameterValues } }));
  };
  const updateEditorNodeDescription = (customDescription: string) => {
    if (props.selection?.kind !== "editor-node") return;
    const nextSelection: AutomationSelection = {
      ...props.selection,
      node: {
        ...props.selection.node,
        customDescription
      }
    };
    props.setSelection(nextSelection);
    window.dispatchEvent(new CustomEvent("automation-studio:update-node-parameters", { detail: { nodeId: props.selection.id, customDescription } }));
  };
  return (
    <aside className="automation-inspector">
      <header>
        <span>Inspector</span>
        <strong>{title}</strong>
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
      {props.selection?.kind === "editor-node" && props.node ? <>
        <AutomationNodeParameterEditor node={props.node} onChange={updateEditorNodeParameters} onDescriptionChange={updateEditorNodeDescription} />
        <InspectorSection title="Metadata" rows={[["Node", props.node.label], ["ID", props.node.id], ["Type", props.node.nodeType ?? "-"], ["Family", props.node.family ?? "-"], ["Default description", props.node.description ?? "-"]]} />
        <InspectorSection title="Ports" rows={[["Inputs", formatAutomationPorts(props.node.inputs)], ["Outputs", formatAutomationPorts(props.node.outputs)], ["Privileged", props.node.privileged ? "Yes" : "No"], ["Actions", (props.node.actionTypes ?? []).join(", ") || "-"]]} />
      </> : null}
      {(!props.selection || props.selection.kind === "node") && props.node ? <>
        <InspectorSection title="General" rows={[["Node", props.node.label], ["ID", props.node.id], ["Actions", (props.node.actions ?? []).map((action: any) => action.actionType).join(", ")], ["Recovery", props.node.recovery?.strategy ?? "-"]]} />
        <InspectorSection title="Conditions" rows={[["Eligibility", conditionSummary(props.node.eligibility)], ["Readiness", conditionSummary(props.node.readinessConditions)], ["Success", conditionSummary(props.node.successConditions)]]} />
        <InspectorSection title="Timing and Retries" rows={[["Timeout", props.node.timeout?.timeoutMs ? `${props.node.timeout.timeoutMs} ms` : "Default"], ["Retry", props.node.retry?.strategy ?? "Default"], ["Recovery", props.node.recovery?.strategy ?? "-"]]} />
        <InspectorSection title="Runtime History" rows={[["Runs", "124"], ["Successes", "118"], ["Retries", "5"], ["Median duration", "1.7s"]]} />
        <InspectorSection title="Training" rows={[["Suggested adjustment", "Increase timeout when recent runs exceed observed median"], ["Risk", "Low"]]} />
        <InspectorProvenance current={props.node.timeout?.timeoutMs ? `${props.node.timeout.timeoutMs} ms` : "Default"} source="Generated from recording evidence and editable by user" />
      </> : null}
      {props.selection?.kind === "policy" && props.policy ? <>
        <InspectorSection title="Policy" rows={[["Policy", props.policy.policyId], ["Task", props.policy.taskId], ["Version", props.policy.version], ["Nodes", String(props.policy.nodes?.length ?? 0)], ["Edges", String(props.policy.edges?.length ?? 0)]]} />
        <InspectorSection title="Validation" rows={[["Schema", "Ready"], ["Graph", "Check missing references"], ["Portability", "Domain-neutral contracts"]]} />
      </> : null}
    </aside>
  );
}

function AutomationNodeParameterEditor(props: {
  node: {
    nodeDefinitionId?: string;
    description?: string;
    customDescription?: string;
    parameters?: AutomationNodeParameter[];
    parameterValues?: JsonObject;
  };
  onChange(parameterValues: JsonObject): void;
  onDescriptionChange(customDescription: string): void;
}) {
  const parameters = props.node.parameters ?? [];
  const values = props.node.parameterValues ?? {};
  const definition = props.node.nodeDefinitionId ? getAutomationNodeDefinition(props.node.nodeDefinitionId) : undefined;
  const preview = automationNodeExecutionPreview(definition, values);
  const setValue = (parameter: AutomationNodeParameter, value: unknown) => {
    props.onChange({ ...values, [parameter.id]: value });
  };
  return (
    <details className="automation-inspector-section automation-node-parameters" open>
      <summary>Parameters</summary>
      <div className="automation-parameter-stack">
        <label className="automation-parameter-field">
          <span>Node description</span>
          <textarea
            className="automation-description-input"
            placeholder={props.node.description ?? "Describe what this node does in this flow"}
            value={props.node.customDescription ?? ""}
            onChange={(event) => props.onDescriptionChange(event.target.value)}
          />
        </label>
        {parameters.length ? parameters.map((parameter) => (
          <AutomationNodeParameterField
            key={parameter.id}
            parameter={parameter}
            value={values[parameter.id] ?? parameter.defaultValue}
            onChange={(value) => setValue(parameter, value)}
          />
        )) : <span className="muted-text">This node has no editable parameters.</span>}
      </div>
      <div className="automation-node-preview">
        <strong>Preview</strong>
        <pre>{preview}</pre>
      </div>
    </details>
  );
}

function AutomationNodeParameterField(props: { parameter: AutomationNodeParameter; value: unknown; onChange(value: unknown): void }) {
  const parameter = props.parameter;
  const value = props.value;
  if (parameter.options?.length) {
    return (
      <label className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <select value={String(value ?? "")} onChange={(event) => props.onChange(event.target.value)}>
          {parameter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  if (parameter.valueType === "boolean") {
    return (
      <label className="automation-parameter-field checkbox">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => props.onChange(event.target.checked)} />
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
      </label>
    );
  }
  if (parameter.valueType === "number") {
    return (
      <label className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <input type="number" value={String(value ?? 0)} onChange={(event) => props.onChange(Number(event.target.value))} />
      </label>
    );
  }
  if (parameter.valueType === "object" || parameter.valueType === "json") {
    return (
      <div className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <AutomationObjectParameterEditor value={value} onChange={props.onChange} />
      </div>
    );
  }
  if (parameter.valueType === "array") {
    return (
      <div className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <AutomationArrayParameterEditor value={value} onChange={props.onChange} />
      </div>
    );
  }
  if (parameter.valueType === "any" || parameter.ui?.control === "value") {
    return (
      <div className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <AutomationTypedValueParameterEditor value={value} onChange={props.onChange} />
      </div>
    );
  }
  if (parameter.ui?.control === "textarea") {
    return (
      <label className="automation-parameter-field">
        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
        <textarea value={String(value ?? "")} placeholder={parameter.ui.placeholder} onChange={(event) => props.onChange(event.target.value)} />
      </label>
    );
  }
  return (
    <AutomationStringParameterField parameter={parameter} value={value} onChange={props.onChange} />
  );
}

function AutomationStringParameterField(props: { parameter: AutomationNodeParameter; value: unknown; onChange(value: string): void }) {
  const ui = props.parameter.ui;
  const controlLabel = automationParameterControlLabel(props.parameter);
  return (
    <label className={`automation-parameter-field automation-string-control ${ui?.control ?? "text"}`}>
      <span>{props.parameter.label}{props.parameter.required ? " *" : ""}</span>
      <div className="automation-string-input-wrap">
        <input value={String(props.value ?? "")} placeholder={ui?.placeholder ?? controlLabel} onChange={(event) => props.onChange(event.target.value)} />
        <small>{controlLabel}</small>
      </div>
    </label>
  );
}

function AutomationTypedValueParameterEditor(props: { value: unknown; onChange(value: unknown): void }) {
  const kind = automationTypedValueKind(props.value);
  return (
    <div className="automation-typed-value-editor">
      <select
        aria-label="Value type"
        value={kind}
        onChange={(event) => props.onChange(defaultAutomationTypedValue(event.target.value))}
      >
        <option value="text">Text</option>
        <option value="number">Number</option>
        <option value="boolean">Boolean</option>
        <option value="empty">Empty</option>
      </select>
      {kind === "boolean" ? (
        <select aria-label="Boolean value" value={String(Boolean(props.value))} onChange={(event) => props.onChange(event.target.value === "true")}>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : kind === "empty" ? (
        <input aria-label="Empty value" value="No value" disabled />
      ) : (
        <input
          aria-label="Value"
          type={kind === "number" ? "number" : "text"}
          value={String(props.value ?? "")}
          onChange={(event) => props.onChange(kind === "number" ? Number(event.target.value) : event.target.value)}
        />
      )}
    </div>
  );
}

function AutomationObjectParameterEditor(props: { value: unknown; onChange(value: JsonObject): void }) {
  const entries = Object.entries(automationObjectParameterValue(props.value));
  const updateEntry = (index: number, key: string, value: unknown) => {
    const nextEntries: Array<[string, unknown]> = entries.map(([entryKey, entryValue], entryIndex) => entryIndex === index ? [key, automationCoercedParameterValue(value)] : [entryKey, entryValue]);
    props.onChange(Object.fromEntries(nextEntries.filter(([entryKey]) => entryKey.trim())));
  };
  const removeEntry = (index: number) => props.onChange(Object.fromEntries(entries.filter((_entry, entryIndex) => entryIndex !== index)));
  return (
    <div className="automation-structured-parameter">
      {entries.map(([key, entryValue], index) => (
        <div className="automation-structured-row" key={`${key}-${index}`}>
          <input aria-label="Field name" placeholder="Field" value={key} onChange={(event) => updateEntry(index, event.target.value, entryValue)} />
          <input aria-label="Field value" placeholder="Value" value={automationParameterPrimitiveText(entryValue)} onChange={(event) => updateEntry(index, key, event.target.value)} />
          <button className="icon-button" onClick={() => removeEntry(index)} title="Remove field" aria-label="Remove field" type="button"><Trash2 size={12} aria-hidden /></button>
        </div>
      ))}
      <button className="secondary-button compact" onClick={() => props.onChange({ ...automationObjectParameterValue(props.value), field: "" })} type="button">
        <Plus size={13} aria-hidden /> Add field
      </button>
    </div>
  );
}

function AutomationArrayParameterEditor(props: { value: unknown; onChange(value: unknown[]): void }) {
  const values = Array.isArray(props.value) ? props.value : [];
  const updateItem = (index: number, value: unknown) => props.onChange(values.map((item, itemIndex) => itemIndex === index ? automationCoercedParameterValue(value) : item));
  const removeItem = (index: number) => props.onChange(values.filter((_item, itemIndex) => itemIndex !== index));
  return (
    <div className="automation-structured-parameter">
      {values.map((item, index) => (
        typeof item === "object" && item !== null && !Array.isArray(item) ? (
          <div className="automation-array-object" key={index}>
            <AutomationObjectParameterEditor value={item} onChange={(value) => updateItem(index, value)} />
            <button className="secondary-button compact danger" onClick={() => removeItem(index)} type="button"><Trash2 size={12} aria-hidden /> Remove item</button>
          </div>
        ) : (
          <div className="automation-structured-row" key={index}>
            <input aria-label="Item value" placeholder="Value" value={automationParameterPrimitiveText(item)} onChange={(event) => updateItem(index, event.target.value)} />
            <button className="icon-button" onClick={() => removeItem(index)} title="Remove item" aria-label="Remove item" type="button"><Trash2 size={12} aria-hidden /></button>
          </div>
        )
      ))}
      <button className="secondary-button compact" onClick={() => props.onChange([...values, {}])} type="button">
        <Plus size={13} aria-hidden /> Add item
      </button>
    </div>
  );
}

function automationObjectParameterValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function automationParameterControlLabel(parameter: AutomationNodeParameter): string {
  switch (parameter.ui?.control) {
    case "reference":
      switch (parameter.ui.referenceType) {
        case "action": return "Action picker";
        case "task": return "Task picker";
        case "policy": return "Policy picker";
        case "routine": return "Routine picker";
        case "database-collection": return "Collection picker";
        case "variable": return "Variable picker";
        default: return "Reference picker";
      }
    case "identifier": return "Identifier";
    case "path": return "Object path";
    case "field": return "Field";
    case "textarea": return "Long text";
    case "value": return "Typed value";
    default: return "Text";
  }
}

function automationTypedValueKind(value: unknown): "text" | "number" | "boolean" | "empty" {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

function defaultAutomationTypedValue(kind: string): unknown {
  switch (kind) {
    case "number": return 0;
    case "boolean": return false;
    case "empty": return null;
    default: return "";
  }
}

function automationParameterPrimitiveText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return shortJson(value);
  return String(value);
}

function automationCoercedParameterValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed)) return numeric;
  return value;
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

function automationHierarchySignature(customHierarchyNodes: AutomationHierarchyNode[], deletedHierarchyIds: string[], workspacePrefs: AutomationWorkspacePrefs): string {
  return JSON.stringify({ customHierarchyNodes, deletedHierarchyIds, workspacePrefs });
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

function syncGraphNodes<T extends Record<string, unknown>>(currentNodes: Array<Node<T>>, nextNodes: Array<Node<T>>): Array<Node<T>> {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  return nextNodes.map((node) => {
    const current = currentById.get(node.id);
    return current ? { ...node, position: current.position } : node;
  });
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function spawnAutomationNodePosition<T extends Record<string, unknown>>(_selectedNodeId: string, nodes: Array<Node<T>>, _edges: Edge[], flow: Pick<ReactFlowInstance<Node<T>, Edge>, "screenToFlowPosition"> | null, canvasElement: HTMLElement | null): { x: number; y: number } {
  const bounds = canvasElement?.getBoundingClientRect();
  if (flow?.screenToFlowPosition && bounds) {
    const center = flow.screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2
    });
    return { x: center.x - 140, y: center.y - 98 };
  }
  if (flow?.screenToFlowPosition) {
    const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return { x: center.x - 140, y: center.y - 98 };
  }
  return { x: 80 + (nodes.length % 4) * 300, y: 80 + Math.floor(nodes.length / 4) * 190 };
}

function roundedAutomationPosition(position: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(position.x), y: Math.round(position.y) };
}

function createAutomationConnectionEdge<T extends AutomationPolicyNodeData | AutomationRoutineNodeData>(connection: { source: string | null; target: string | null; sourceHandle?: string | null; targetHandle?: string | null }, existingEdges: Edge[], prefix: string, nodes: Array<Node<T>>): Edge {
  const source = connection.source ?? "";
  const target = connection.target ?? "";
  const outgoingIndex = existingEdges.filter((edge) => edge.source === source).length;
  const lane = automationEdgeLane(`${prefix}-${source}-${target}-${outgoingIndex}`, outgoingIndex);
  const sourcePort = nodes.find((node) => node.id === source)?.data.outputs.find((port) => port.id === connection.sourceHandle);
  const label = sourcePort ? automationPortDisplayLabel(sourcePort) : automationPortLabelFromId(connection.sourceHandle) ?? (outgoingIndex === 0 ? "Next" : `Branch ${outgoingIndex + 1}`);
  const color = automationPortColor(automationPortTone(sourcePort ?? { id: connection.sourceHandle ?? "next", label, valueType: "any" }, "source"));
  return {
    id: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    target,
    sourceHandle: connection.sourceHandle ?? "next",
    targetHandle: connection.targetHandle ?? "in",
    type: "automationEdge",
    label,
    data: { label, lane, sourcePort: connection.sourceHandle ?? "next", targetPort: connection.targetHandle ?? "in" },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
    style: { stroke: color, strokeWidth: 3 }
  };
}

function automationConnectionIsValid<T extends AutomationPolicyNodeData | AutomationRoutineNodeData>(connection: Connection | Edge, nodes: Array<Node<T>>): boolean {
  if (!connection.source || !connection.target || connection.source === connection.target) return false;
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  const sourcePort = source?.data.outputs.find((port) => port.id === connection.sourceHandle);
  const targetPort = target?.data.inputs.find((port) => port.id === connection.targetHandle);
  if (!sourcePort || !targetPort) return false;
  return automationPortTypesCompatible(sourcePort.valueType, targetPort.valueType);
}

function automationPortTypesCompatible(sourceType: AutomationNodePort["valueType"], targetType: AutomationNodePort["valueType"]): boolean {
  if (sourceType === "any" || targetType === "any") return true;
  if (sourceType === targetType) return true;
  if (sourceType === "signal" && targetType === "boolean") return true;
  return false;
}

type AutomationPortTone = "flow" | "success" | "warning" | "danger" | "boolean" | "number" | "text" | "object" | "signal" | "routine" | "neutral";

function automationPortTone(port: AutomationNodePort, direction: "source" | "target"): AutomationPortTone {
  if (port.role === "success") return "success";
  if (port.role === "failure" || port.role === "error") return "danger";
  if (port.role === "branch") return "warning";
  if (port.role === "data") return "object";
  if (port.role === "control") return "flow";
  const semantic = `${port.id} ${port.label}`.toLowerCase();
  if (/\b(success|passed|approved|recovered|stable|done|next)\b/.test(semantic)) return "success";
  if (/\b(fail|failure|failed|rejected|timeout|error)\b/.test(semantic)) return "danger";
  if (/\b(branch|body|case|default|retry|recover|branches)\b/.test(semantic)) return "warning";
  if (/\b(value|result|choice|record|records|items|object|patch)\b/.test(semantic)) return "object";
  switch (port.valueType) {
    case "boolean": return "boolean";
    case "number": return "number";
    case "string": return "text";
    case "object":
    case "array": return "object";
    case "signal": return "signal";
    case "policy":
    case "routine": return "routine";
    case "any": return direction === "source" && automationPortIsRoute(port) ? "flow" : "neutral";
    default: return "neutral";
  }
}

function automationPortColor(tone: AutomationPortTone): string {
  switch (tone) {
    case "success": return "#188038";
    case "warning": return "#b35c00";
    case "danger": return "#c5221f";
    case "boolean": return "#00897b";
    case "number": return "#5e35b1";
    case "text": return "#ad1457";
    case "object": return "#1565c0";
    case "signal": return "#ef6c00";
    case "routine": return "#6a1b9a";
    case "flow": return "#0972d3";
    default: return "#6b7785";
  }
}

function automationPortCaption(port: AutomationNodePort, direction: "source" | "target"): string {
  const tone = automationPortTone(port, direction);
  if (port.role === "control") return "control";
  if (port.role === "success" || port.role === "failure" || port.role === "branch") return "route";
  if (port.role === "error") return "error";
  if (port.role === "data" && port.valueType === "any") return "data";
  if (port.valueType === "any") {
    return automationPortIsRoute(port) || tone === "success" || tone === "warning" || tone === "danger" ? "route" : "";
  }
  const suffix = port.multiple ? "[]" : "";
  switch (port.valueType) {
    case "boolean": return `condition${suffix}`;
    case "number": return `number${suffix}`;
    case "string": return `text${suffix}`;
    case "object": return `object${suffix}`;
    case "array": return `list${suffix}`;
    case "signal": return `signal${suffix}`;
    case "policy": return `policy${suffix}`;
    case "routine": return `routine${suffix}`;
    default: return `${port.valueType}${suffix}`;
  }
}

function automationPortIsRoute(port: AutomationNodePort): boolean {
  if (port.role === "control" || port.role === "success" || port.role === "failure" || port.role === "branch") return true;
  return /\b(next|success|failure|failed|passed|approved|rejected|timeout|body|done|case|default|branch|branches|recovered)\b/.test(`${port.id} ${port.label}`.toLowerCase());
}

function automationPortTitle(port: AutomationNodePort, direction: "source" | "target"): string {
  const caption = automationPortCaption(port, direction);
  const label = automationPortDisplayLabel(port);
  return caption ? `${label} - ${caption}` : label;
}

function automationPortDisplayLabel(port: AutomationNodePort): string {
  if (port.id === "body" || port.label.toLowerCase() === "body") return "Repeat";
  return port.label;
}

function automationPortHandleTop(index: number, total: number): string {
  if (total <= 1) return "50%";
  const start = 30;
  const end = 78;
  return `${start + (index / Math.max(1, total - 1)) * (end - start)}%`;
}

function automationPortIdFromLabel(label: unknown): string {
  const normalized = String(label ?? "next")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "next";
}

function automationPortLabelFromId(portId: string | null | undefined): string | null {
  if (!portId) return null;
  if (portId === "body") return "Repeat";
  return portId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || null;
}

function uniqueAutomationPorts(ports: AutomationNodePort[]): AutomationNodePort[] {
  const counts = new Map<string, number>();
  return ports.map((port) => {
    const count = counts.get(port.id) ?? 0;
    counts.set(port.id, count + 1);
    return count === 0 ? port : { ...port, id: `${port.id}-${count + 1}` };
  });
}

function formatAutomationPorts(ports: AutomationNodePort[] | undefined): string {
  if (!ports?.length) return "None";
  return ports.map((port) => {
    const caption = automationPortCaption(port, "source");
    const label = automationPortDisplayLabel(port);
    return caption ? `${label}: ${caption}` : label;
  }).join(", ");
}

function automationEdgeRoute(id: string, sourceX: number, sourceY: number, targetX: number, targetY: number, data: Record<string, unknown> | undefined): { kind: "step" | "loop"; lane: number } {
  const dx = targetX - sourceX;
  const lane = Number(data?.lane ?? automationEdgeLane(id));
  if (dx < -40) return { kind: "loop", lane };
  return { kind: "step", lane };
}

function automationEdgeLane(id: string, index?: number): number {
  const lanes = [-72, -42, 42, 72, -104, 104, -136, 136];
  return lanes[(index ?? stableHash(id)) % lanes.length] ?? 42;
}

function automationLoopEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number): [string, number, number] {
  const direction = lane < 0 ? -1 : 1;
  const distance = Math.abs(targetX - sourceX);
  const lift = direction * (96 + Math.min(220, distance * 0.35) + Math.abs(lane) * 0.35);
  const spread = Math.max(96, Math.min(220, distance * 0.42));
  const control1X = sourceX + spread;
  const control2X = targetX - spread;
  const control1Y = sourceY + lift;
  const control2Y = targetY + lift;
  return [`M ${sourceX},${sourceY} C ${control1X},${control1Y} ${control2X},${control2Y} ${targetX},${targetY}`, (sourceX + targetX) / 2, (sourceY + targetY) / 2 + lift * 0.72];
}

function automationLaneEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number): [string, number, number] {
  const dx = targetX - sourceX;
  const distance = Math.max(140, Math.abs(dx));
  const horizontal = Math.min(260, Math.max(120, distance * 0.45));
  const lift = Math.sign(lane || 1) * Math.min(90, Math.max(28, Math.abs(lane) * 0.72));
  const control1X = sourceX + horizontal;
  const control2X = targetX - horizontal;
  const control1Y = sourceY + lift;
  const control2Y = targetY + lift;
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2 + lift * 0.74;
  return [`M ${sourceX},${sourceY} C ${control1X},${control1Y} ${control2X},${control2Y} ${targetX},${targetY}`, labelX, labelY];
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

function policyToReactFlowGraph(policy: any, selectedNodeId = ""): { nodes: Node<AutomationPolicyNodeData>[]; edges: Edge[] } {
  const policyNodes = policy?.nodes ?? [];
  const policyEdges = policy?.edges ?? [];
  const positions = layoutAutomationPolicyNodes(policyNodes, policyEdges);
  const nodes: Node<AutomationPolicyNodeData>[] = policyNodes.map((node: any, index: number) => ({
    id: node.id,
    type: "policyNode",
    position: positions.get(node.id) ?? { x: index * 340, y: 160 },
    selected: node.id === selectedNodeId,
    data: {
      label: node.label ?? node.id,
      description: generatedPolicyNodeDescription(node),
      icon: generatedPolicyNodeIcon(node, index),
      actionTypes: (node.actions ?? []).map((action: any) => action.actionType),
      recovery: node.recovery?.strategy ?? "ready",
      evidenceCount: node.sourceEvidence?.length ?? 0,
      readinessCount: countConditionLeaves(node.readinessConditions),
      successCount: countConditionLeaves(node.successConditions),
      inputs: generatedPolicyInputPorts(node, index),
      outputs: generatedPolicyOutputPorts(node, policyEdges),
      parameters: [],
      parameterValues: {},
      isStart: index === 0,
      confidence: node.generatedMetadata?.confidence,
      timeoutMs: node.timeout?.timeoutMs ?? node.timeoutMs
    }
  }));
  const outgoingCounts = new Map<string, number>();
  const edges: Edge[] = policyEdges.map((edge: any, index: number) => {
    const source = String(edge.fromNodeId ?? edge.source ?? "");
    const count = outgoingCounts.get(source) ?? 0;
    outgoingCounts.set(source, count + 1);
    const visuals = edgeVisuals(edge);
    const label = edge.label ?? edge.kind ?? edge.type ?? (edge.probability !== undefined ? `${Math.round(Number(edge.probability) * 100)}%` : "Next");
    const id = edge.id ?? `${edge.fromNodeId}-${edge.toNodeId}-${index}`;
    return {
      id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      sourceHandle: automationPortIdFromLabel(label),
      targetHandle: "in",
      type: "automationEdge",
      animated: false,
      data: { label, lane: automationEdgeLane(id, count) },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: visuals.color,
        width: 18,
        height: 18
      },
      style: visuals.style,
      label
    };
  });
  return { nodes, edges };
}

function generatedPolicyInputPorts(node: any, index: number): AutomationNodePort[] {
  if (index === 0 || node.isStart) return [];
  return [{ id: "in", label: "In", valueType: "any", role: "control" }];
}

function generatedPolicyNodeDescription(node: any): string {
  const actions = (node.actions ?? []).map((action: any) => action.actionType).filter(Boolean);
  if (actions.length) return actions.join(", ");
  if (node.description) return String(node.description);
  if (node.recovery?.strategy) return `Recovery: ${String(node.recovery.strategy).replace(/_/g, " ")}`;
  return "Generated policy node";
}

function generatedPolicyNodeIcon(node: any, index: number): string {
  if (index === 0 || node.isStart) return "workflow";
  const actions = (node.actions ?? []).map((action: any) => String(action.actionType ?? "").toLowerCase());
  if (actions.some((action: string) => action.includes("database") || action.includes("record"))) return "database";
  if (actions.some((action: string) => action.includes("random"))) return "dice-5";
  if (actions.some((action: string) => action.includes("calculate") || action.includes("math"))) return "calculator";
  if (node.recovery?.strategy) return "shield";
  return "git-branch";
}

function generatedPolicyOutputPorts(node: any, policyEdges: any[]): AutomationNodePort[] {
  const outgoing = policyEdges.filter((edge) => String(edge.fromNodeId ?? edge.source ?? "") === String(node.id));
  const ports = outgoing.map((edge, index) => {
    const label = edge.label ?? edge.kind ?? edge.type ?? (edge.probability !== undefined ? `${Math.round(Number(edge.probability) * 100)}%` : index === 0 ? "Next" : `Branch ${index + 1}`);
    const id = automationPortIdFromLabel(label);
    return { id, label: String(label), valueType: "any" as const, role: generatedPolicyOutputRole(id, label) };
  });
  return ports.length ? uniqueAutomationPorts(ports) : [{ id: "success", label: "Success", valueType: "any", role: "success" }];
}

function generatedPolicyOutputRole(id: string, label: unknown): NonNullable<AutomationNodePort["role"]> {
  const semantic = `${id} ${String(label ?? "")}`.toLowerCase();
  if (semantic.includes("success") || semantic.includes("pass") || semantic.includes("approved")) return "success";
  if (semantic.includes("fail") || semantic.includes("error") || semantic.includes("timeout") || semantic.includes("reject")) return "failure";
  return "branch";
}

function layoutAutomationPolicyNodes(policyNodes: any[], policyEdges: any[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const ids = policyNodes.map((node) => String(node.id));
  const knownIds = new Set(ids);
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const id of ids) incomingCount.set(id, 0);
  for (const edge of policyEdges) {
    const source = String(edge.fromNodeId ?? edge.source ?? "");
    const target = String(edge.toNodeId ?? edge.target ?? "");
    if (!knownIds.has(source) || !knownIds.has(target)) continue;
    outgoing.set(source, [...(outgoing.get(source) ?? []), target]);
    incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
  }

  const roots = ids.filter((id) => (incomingCount.get(id) ?? 0) === 0);
  const queue = roots.length ? roots.map((id) => ({ id, level: 0 })) : ids.slice(0, 1).map((id) => ({ id, level: 0 }));
  const levelById = new Map<string, number>();
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const previousLevel = levelById.get(current.id);
    if (previousLevel !== undefined) continue;
    levelById.set(current.id, current.level);
    for (const target of outgoing.get(current.id) ?? []) queue.push({ id: target, level: current.level + 1 });
  }
  for (const id of ids) {
    if (!levelById.has(id)) levelById.set(id, Math.max(0, ...levelById.values()) + 1);
  }

  const lanesByLevel = new Map<number, string[]>();
  for (const id of ids) {
    const level = levelById.get(id) ?? 0;
    lanesByLevel.set(level, [...(lanesByLevel.get(level) ?? []), id]);
  }
  for (const [level, levelIds] of lanesByLevel) {
    const centerOffset = (levelIds.length - 1) / 2;
    levelIds.forEach((id, index) => {
      positions.set(id, {
        x: level * 360,
        y: 220 + (index - centerOffset) * 190
      });
    });
  }
  return positions;
}

function routineToReactFlowGraph(): { nodes: Node<AutomationRoutineNodeData>[]; edges: Edge[] } {
  return { nodes: [], edges: [] };
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
