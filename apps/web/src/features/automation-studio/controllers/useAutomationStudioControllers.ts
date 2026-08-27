"use client";

import { useState } from "react";
import type { NodeStatePhase } from "fluxiq/automation-studio";
import type {
  AutomationCreatableHierarchyKind,
  AutomationHierarchyAction,
  AutomationHierarchyCategory,
  AutomationHierarchyKind,
  AutomationHierarchyNode,
  AutomationProjectModal,
  AutomationStudioProject,
  AutomationStudioProjectCategory
} from "../hierarchy/model";
import type { AutomationSelection, RecordingProcessingStatus } from "../types";
import {
  defaultAutomationWorkspacePrefs,
  type AutomationLayoutPickerState,
  type AutomationWindowAdderState,
} from "../workspace/layout";

export type AutomationFlowPreset = "blank" | "deterministic" | "recorded" | "integration" | "scheduled" | "api-endpoint" | "reusable";
export type AutomationFlowRunState = {
  phase: "idle" | "starting" | "succeeded" | "failed";
  message: string;
  runId?: string;
  flowId?: string;
  status?: string;
  startedAt?: number;
  finishedAt?: number;
};
export const automationControllerStateKeys = {
  project: ["snapshot", "projects", "projectCategories", "projectsLoaded", "activeProjectId", "projectModal", "projectTarget", "categoryTarget", "projectName", "projectDescription", "categoryName", "projectPin", "projectStatus", "projectActionBusy", "pendingProjectMove", "pendingCategoryMove", "dragOverCategoryId"],
  hierarchy: ["loadedProjectHierarchyId", "projectSearch", "projectTypeFilter", "hierarchyAction", "hierarchyCreateStep", "hierarchyPin", "hierarchyName", "hierarchyFlowOrigin", "hierarchyKind", "hierarchyCategory", "hierarchyParentId", "hierarchyStatus", "customHierarchyNodes", "deletedHierarchyIds"],
  flow: ["projectArtifacts", "projectFlows", "nativeNodeDefinitions", "publishedFlowDefinitions", "flowPublications", "flowDependencyInfo", "automationActionStatus", "flowRunState", "hasDirtyTaskGraph", "taskGraphDrafts"],
  recording: ["projectRecordings", "projectTimelines", "recordingDomains", "recordingTreePrimaryKind", "recordingProcessing"],
  runtime: ["runtimeSessions", "pipelineArtifacts", "gatewaySnapshot"],
  state: ["indexedStateSources", "selection", "pendingStateOpen", "bottomPreviewEntryId"],
  layout: ["workspacePrefs", "liveSidebarWidth", "liveInspectorWidth", "liveBottomTimelineHeight", "liveMainSplitRatios", "preferencesOpen", "windowAdderOpen", "layoutPickerOpen"]
} as const;

export function useProjectController() {
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
  const [projectActionBusy, setProjectActionBusy] = useState(false);
  const [pendingProjectMove, setPendingProjectMove] = useState<{ projectId: string; categoryId: string | null } | null>(null);
  const [pendingCategoryMove, setPendingCategoryMove] = useState<{ categoryId: string; targetCategoryId: string } | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);

  return {
    snapshot, setSnapshot, projects, setProjects, projectCategories, setProjectCategories,
    projectsLoaded, setProjectsLoaded, activeProjectId, setActiveProjectId, projectModal, setProjectModal,
    projectTarget, setProjectTarget, categoryTarget, setCategoryTarget, projectName, setProjectName,
    projectDescription, setProjectDescription, categoryName, setCategoryName, projectPin, setProjectPin,
    projectStatus, setProjectStatus, projectActionBusy, setProjectActionBusy, pendingProjectMove, setPendingProjectMove, pendingCategoryMove,
    setPendingCategoryMove, dragOverCategoryId, setDragOverCategoryId
  };
}

export function useHierarchyController() {
  const [loadedProjectHierarchyId, setLoadedProjectHierarchyId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | AutomationHierarchyKind>("all");
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

  return {
    loadedProjectHierarchyId, setLoadedProjectHierarchyId, projectSearch, setProjectSearch,
    projectTypeFilter, setProjectTypeFilter, hierarchyAction, setHierarchyAction, hierarchyCreateStep,
    setHierarchyCreateStep, hierarchyPin, setHierarchyPin, hierarchyName, setHierarchyName,
    hierarchyFlowOrigin, setHierarchyFlowOrigin, hierarchyKind, setHierarchyKind, hierarchyCategory,
    setHierarchyCategory, hierarchyParentId, setHierarchyParentId, hierarchyStatus, setHierarchyStatus,
    customHierarchyNodes, setCustomHierarchyNodes, deletedHierarchyIds, setDeletedHierarchyIds
  };
}

export function useFlowController() {
  const [projectArtifacts, setProjectArtifacts] = useState<any>({ tasks: [], routines: [], configs: [], flows: [] });
  const [projectFlows, setProjectFlows] = useState<any[]>([]);
  const [nativeNodeDefinitions, setNativeNodeDefinitions] = useState<any[]>([]);
  const [publishedFlowDefinitions, setPublishedFlowDefinitions] = useState<any[]>([]);
  const [flowPublications, setFlowPublications] = useState<any[]>([]);
  const [flowDependencyInfo, setFlowDependencyInfo] = useState<any>({ dependencies: [], usedBy: [], availableUpgrades: [] });
  const [automationActionStatus, setAutomationActionStatus] = useState("");
  const [flowRunState, setFlowRunState] = useState<AutomationFlowRunState>({ phase: "idle", message: "Ready." });
  const [hasDirtyTaskGraph, setHasDirtyTaskGraph] = useState(false);
  const [taskGraphDrafts, setTaskGraphDrafts] = useState<Record<string, { nodes: any[]; edges: any[] }>>({});

  return {
    projectArtifacts, setProjectArtifacts, projectFlows, setProjectFlows, nativeNodeDefinitions,
    setNativeNodeDefinitions, publishedFlowDefinitions, setPublishedFlowDefinitions, flowPublications,
    setFlowPublications, flowDependencyInfo, setFlowDependencyInfo, automationActionStatus,
    setAutomationActionStatus, flowRunState, setFlowRunState, hasDirtyTaskGraph, setHasDirtyTaskGraph,
    taskGraphDrafts, setTaskGraphDrafts
  };
}

export function useRecordingController() {
  const [projectRecordings, setProjectRecordings] = useState<any[]>([]);
  const [projectTimelines, setProjectTimelines] = useState<any[]>([]);
  const [recordingDomains, setRecordingDomains] = useState<any[]>([]);
  const [recordingTreePrimaryKind, setRecordingTreePrimaryKind] = useState<"recording" | "proposal" | null>(null);
  const [recordingProcessing, setRecordingProcessing] = useState<RecordingProcessingStatus | null>(null);

  return {
    projectRecordings, setProjectRecordings, projectTimelines, setProjectTimelines, recordingDomains,
    setRecordingDomains, recordingTreePrimaryKind, setRecordingTreePrimaryKind, recordingProcessing,
    setRecordingProcessing
  };
}

export function useRuntimeController() {
  const [runtimeSessions, setRuntimeSessions] = useState<any[]>([]);
  const [pipelineArtifacts, setPipelineArtifacts] = useState<any>({
    normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [],
    stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: []
  });
  const [gatewaySnapshot, setGatewaySnapshot] = useState<any>({ enabled: false, sessions: [], pairings: [], auditLog: [] });

  return { runtimeSessions, setRuntimeSessions, pipelineArtifacts, setPipelineArtifacts, gatewaySnapshot, setGatewaySnapshot };
}

export function useStateController() {
  const [indexedStateSources, setIndexedStateSources] = useState<Record<string, { source: any; snapshot: any; raw?: any }>>({});
  const [selection, setSelection] = useState<AutomationSelection | null>(null);
  const [pendingStateOpen, setPendingStateOpen] = useState<{ key: string; recordingId?: string; timelineEntryId?: string; stateSnapshotId?: string; phase: NodeStatePhase } | null>(null);
  const [bottomPreviewEntryId, setBottomPreviewEntryId] = useState<string | null>(null);

  return {
    indexedStateSources, setIndexedStateSources, selection, setSelection, pendingStateOpen,
    setPendingStateOpen, bottomPreviewEntryId, setBottomPreviewEntryId
  };
}

export function useLayoutController() {
  const [workspacePrefs, setWorkspacePrefs] = useState(() => defaultAutomationWorkspacePrefs());
  const [liveSidebarWidth, setLiveSidebarWidth] = useState<number | null>(null);
  const [liveInspectorWidth, setLiveInspectorWidth] = useState<number | null>(null);
  const [liveBottomTimelineHeight, setLiveBottomTimelineHeight] = useState<number | null>(null);
  const [liveMainSplitRatios, setLiveMainSplitRatios] = useState<number[] | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [windowAdderOpen, setWindowAdderOpen] = useState<AutomationWindowAdderState | null>(null);
  const [layoutPickerOpen, setLayoutPickerOpen] = useState<AutomationLayoutPickerState | null>(null);

  return {
    workspacePrefs, setWorkspacePrefs,
    liveSidebarWidth, setLiveSidebarWidth, liveInspectorWidth, setLiveInspectorWidth, liveBottomTimelineHeight, setLiveBottomTimelineHeight,
    liveMainSplitRatios, setLiveMainSplitRatios, preferencesOpen, setPreferencesOpen, windowAdderOpen,
    setWindowAdderOpen, layoutPickerOpen, setLayoutPickerOpen
  };
}