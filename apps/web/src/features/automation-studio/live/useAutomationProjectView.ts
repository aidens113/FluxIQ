"use client";

import { useMemo } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationViewInstance } from "../views/view-types";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import { createAutomationProjectViewModelSelector, type AutomationProjectViewModelInput } from "../model/project-view-model";
import { createAutomationStudioViewInstances } from "../views/view-instances";
import { automationStudioViewId as viewId } from "../views/view-registry";
import { resolveActionPreviewEntryId, selectedNodeActionPreviewEntryId } from "../model/timeline-resolution";

type ProjectViewOptions = {
  model: AutomationProjectViewModelInput;
  workspacePrefs: AutomationWorkspacePrefs;
  projects: readonly any[];
  activeProjectId: string | null;
  urlProjectId: string | null;
  projectCatalogError: string | null;
  projectsLoaded: boolean;
  pendingStateOpen: { timelineEntryId?: string } | null;
  bottomPreviewEntryId: string | null;
  selection: AutomationSelection | null;
};

export function useAutomationProjectView(options: ProjectViewOptions) {
  const select = useMemo(() => createAutomationProjectViewModelSelector(), []);
  const viewModel = useMemo(() => select(options.model), [options.model, select]);
  const activePane = options.workspacePrefs.panes.find((item) => item.id === options.workspacePrefs.activePaneId)
    ?? options.workspacePrefs.panes[0];
  const activeViewId = activePane?.activeViewId ?? options.workspacePrefs.activeViewId ?? viewId.flowEditor;
  const openViewIds = useMemo(() => [...new Set([
    ...options.workspacePrefs.panes.flatMap((pane) => pane.tabs),
    ...options.workspacePrefs.rightSidebar.tabs
  ])], [options.workspacePrefs.panes, options.workspacePrefs.rightSidebar.tabs]);
  const sourceEntryId = options.pendingStateOpen?.timelineEntryId
    ?? options.bottomPreviewEntryId
    ?? (options.selection?.kind === "state" && options.selection.timelineEntryId ? options.selection.timelineEntryId : undefined)
    ?? selectedNodeActionPreviewEntryId(viewModel.selectedTimeline ?? viewModel.selectedRecording, viewModel.selectedNode);
  const activePreviewEntryId = viewModel.selectedEntry?.id
    ?? resolveActionPreviewEntryId(viewModel.selectedTimeline ?? viewModel.selectedRecording, sourceEntryId);
  const activePreviewEntry = activePreviewEntryId
    ? viewModel.indexes.timelineEntryById.get(activePreviewEntryId)?.entry ?? viewModel.selectedEntry
    : viewModel.selectedEntry;
  const activeProject = options.projects.find((project) => project.id === options.activeProjectId) ?? null;
  const restoringUrlProject = Boolean(
    options.urlProjectId
    && !activeProject
    && !options.projectCatalogError
    && (!options.projectsLoaded || options.activeProjectId === options.urlProjectId)
  );
  const viewInstances = useMemo<AutomationViewInstance[]>(() => createAutomationStudioViewInstances({
    [viewId.recordingTimeline]: "Timeline: " + (viewModel.selectedRecording?.name ?? viewModel.selectedRecording?.recordingId ?? "Recording"),
    [viewId.flowEditor]: viewModel.selectedFlow ? "Flow: " + viewModel.selectedFlow.name : "Flow: None",
    [viewId.state]: viewModel.selectedNode?.label ? "State: " + viewModel.selectedNode.label : "State View"
  }), [viewModel.selectedFlow?.name, viewModel.selectedNode?.label, viewModel.selectedRecording?.name, viewModel.selectedRecording?.recordingId]);
  const openWorkspaceViewIds = useMemo(() => new Set(openViewIds), [openViewIds]);
  const viewById = useMemo(() => new Map(viewInstances.map((view) => [view.id, view])), [viewInstances]);

  return {
    ...viewModel,
    activePreviewEntry,
    activePreviewEntryId,
    activeProject,
    activeViewId,
    openViewIds,
    openWorkspaceViewIds,
    restoringUrlProject,
    viewById,
    viewInstances
  };
}