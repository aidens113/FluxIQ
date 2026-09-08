"use client";

import { useMemo, type ComponentProps, type ReactNode } from "react";
import {
  AutomationStudioConnectedHierarchy,
  AutomationStudioConnectedTimeline
} from "./AutomationStudioConnectedRegions";

type HierarchyProps = ComponentProps<typeof AutomationStudioConnectedHierarchy>;
type HierarchySurface = HierarchyProps["surface"];
type TimelineProps = ComponentProps<typeof AutomationStudioConnectedTimeline>;

export function useAutomationConnectedRegionSurfaces(options: {
  coordinator: HierarchySurface["coordinator"];
  dialogStore: HierarchyProps["dialog"]["store"];
  executeDialog: HierarchyProps["dialog"]["execute"];
  getProjectView: HierarchyProps["getProjectView"];
  onCloseProject: HierarchySurface["onCloseProject"];
  onSelectAction: TimelineProps["onSelectAction"];
  openSubflow: HierarchySurface["openSubflow"];
  openView: HierarchySurface["openView"];
  paging: HierarchySurface["paging"];
  port: HierarchySurface["port"];
  projectId: string;
  projectName: string;
  requestAction: HierarchySurface["requestAction"];
  setRecordingPrimaryKind: HierarchySurface["setRecordingPrimaryKind"];
  setSelection: HierarchySurface["setSelection"];
  stores: HierarchyProps["stores"];
  workspaceStore: HierarchySurface["store"];
}): { hierarchySurface: ReactNode; timelineSurface: ReactNode } {
  const hierarchySurface = useMemo(() => (
    <AutomationStudioConnectedHierarchy
      dialog={{ execute: options.executeDialog, store: options.dialogStore }}
      getProjectView={options.getProjectView}
      stores={options.stores}
      surface={{
        coordinator: options.coordinator,
        paging: options.paging,
        projectId: options.projectId,
        onCloseProject: options.onCloseProject,
        openSubflow: options.openSubflow,
        openView: options.openView,
        port: options.port,
        projectName: options.projectName,
        requestAction: options.requestAction,
        setRecordingPrimaryKind: options.setRecordingPrimaryKind,
        setSelection: options.setSelection,
        store: options.workspaceStore
      }}
    />
  ), [
    options.coordinator,
    options.dialogStore,
    options.executeDialog,
    options.getProjectView,
    options.onCloseProject,
    options.openSubflow,
    options.openView,
    options.paging,
    options.port,
    options.projectId,
    options.projectName,
    options.requestAction,
    options.setRecordingPrimaryKind,
    options.setSelection,
    options.stores,
    options.workspaceStore
  ]);
  const timelineSurface = useMemo(() => (
    <AutomationStudioConnectedTimeline
      onSelectAction={options.onSelectAction}
      stores={options.stores}
    />
  ), [options.onSelectAction, options.stores]);
  return { hierarchySurface, timelineSurface };
}