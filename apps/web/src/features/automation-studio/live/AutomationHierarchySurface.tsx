"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import type {
  AutomationHierarchyAction,
  AutomationHierarchyNode
} from "../hierarchy/contracts";
import {
  type AutomationHierarchyBrowserPaging,
  type AutomationHierarchyBrowserPagingSnapshot,
  type AutomationHierarchyStaticMergeInput
} from "../hierarchy/browser-hierarchy-paging";
import type { AutomationHierarchyPageInfo } from "../hierarchy/paged-cache";
import type { AutomationHierarchyRoutableViewId } from "../hierarchy/routing";
import type { AutomationHierarchyUiCoordinator } from "../hierarchy/ui-coordinator";
import { AutomationProjectHierarchySidebar } from "../hierarchy/AutomationProjectHierarchySidebar";
import type { AutomationWorkspaceCommandPort } from "../workspace/commands/contracts";
import type { AutomationWorkspaceRenderStore } from "../workspace/render-store";
import { useAutomationWorkspaceSelector } from "../workspace/shell/selectors";

type AutomationHierarchySurfaceCommonProps = {
  childPageInfo?: Record<string, AutomationHierarchyPageInfo>;
  coordinator: AutomationHierarchyUiCoordinator;
  loadMoreChildren?(parentId: string | null): void;
  nodes: AutomationHierarchyNode[];
  onCloseProject(): void;
  openSubflow(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  openView(viewId: AutomationHierarchyRoutableViewId, mode?: "preview" | "new-window"): void;
  port: AutomationWorkspaceCommandPort;
  projectName: string;
  recordingPrimaryKind: "recording" | null;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  selection: AutomationSelection | null;
  setRecordingPrimaryKind(kind: "recording" | null): void;
  setSelection(selection: AutomationSelection): void;
  store: AutomationWorkspaceRenderStore;
};

type AutomationHierarchySurfacePagingProps =
  | { paging: AutomationHierarchyBrowserPaging; projectId: string | null }
  | { paging?: undefined; projectId?: string | null };

export type AutomationHierarchySurfaceProps = AutomationHierarchySurfaceCommonProps
  & AutomationHierarchySurfacePagingProps;

const emptyPagingSnapshot: AutomationHierarchyBrowserPagingSnapshot = {
  projectId: null,
  nodes: [],
  childPageInfo: {}
};
const subscribeEmptyPaging = () => () => undefined;
const getEmptyPagingSnapshot = () => emptyPagingSnapshot;

export function AutomationHierarchySurface(props: AutomationHierarchySurfaceProps) {
  const workspace = useAutomationWorkspaceSelector(props.store, (prefs) => {
    const activePane = prefs.panes.find((pane) => pane.id === prefs.activePaneId) ?? prefs.panes[0];
    return {
      activeViewId: activePane?.activeViewId ?? prefs.activeViewId,
      collapsed: prefs.leftSidebarCollapsed
    };
  }, (left, right) => left.activeViewId === right.activeViewId
    && left.collapsed === right.collapsed);
  const projectId = props.projectId ?? null;
  const staticMergeRef = useRef<AutomationHierarchyStaticMergeInput>(staticMerge(props));
  staticMergeRef.current = staticMerge(props);
  const pagingSnapshot = useSyncExternalStore(
    props.paging?.subscribe ?? subscribeEmptyPaging,
    props.paging?.getSnapshot ?? getEmptyPagingSnapshot,
    props.paging?.getSnapshot ?? getEmptyPagingSnapshot
  );

  useEffect(() => {
    if (!props.paging) return;
    return activateAutomationHierarchySurfaceProject(
      props.paging,
      projectId,
      staticMergeRef.current
    );
  }, [projectId, props.paging]);

  useEffect(() => {
    props.paging?.setStaticMerge(staticMergeRef.current);
  }, [props.childPageInfo, props.nodes, props.paging]);

  const pagingState = useMemo(() => resolveAutomationHierarchySurfacePaging({
    nodes: props.nodes,
    pagingSnapshot,
    projectId,
    ...(props.childPageInfo ? { childPageInfo: props.childPageInfo } : {}),
    ...(props.loadMoreChildren ? { loadMoreChildren: props.loadMoreChildren } : {}),
    ...(props.paging ? { paging: props.paging } : {})
  }), [props.childPageInfo, props.loadMoreChildren, props.nodes, props.paging, pagingSnapshot, projectId]);

  return (
    <AutomationProjectHierarchySidebar
      activeViewId={workspace.activeViewId}
      collapsed={workspace.collapsed}
      coordinator={props.coordinator}
      nodes={pagingState.nodes}
      onCloseProject={props.onCloseProject}
      onToggleCollapsed={() => {
        props.port.commit(
          (current) => ({ ...current, leftSidebarCollapsed: !current.leftSidebarCollapsed }),
          { persist: true, scope: "sidebar" }
        );
      }}
      openSubflow={props.openSubflow}
      openView={props.openView}
      projectName={props.projectName}
      recordingPrimaryKind={props.recordingPrimaryKind}
      requestAction={props.requestAction}
      selection={props.selection}
      setRecordingPrimaryKind={props.setRecordingPrimaryKind}
      setSelection={props.setSelection}
      {...(pagingState.childPageInfo ? { childPageInfo: pagingState.childPageInfo } : {})}
      {...(pagingState.loadMoreChildren ? { loadMoreChildren: pagingState.loadMoreChildren } : {})}
    />
  );
}

export function activateAutomationHierarchySurfaceProject(
  paging: AutomationHierarchyBrowserPaging,
  projectId: string | null,
  merge: AutomationHierarchyStaticMergeInput
): () => void {
  void paging.activateProject(projectId, merge);
  return () => {
    if (paging.getSnapshot().projectId === projectId) void paging.activateProject(null);
  };
}

export function resolveAutomationHierarchySurfacePaging(input: {
  childPageInfo?: Record<string, AutomationHierarchyPageInfo>;
  loadMoreChildren?: (parentId: string | null) => void;
  nodes: AutomationHierarchyNode[];
  paging?: AutomationHierarchyBrowserPaging;
  pagingSnapshot: AutomationHierarchyBrowserPagingSnapshot;
  projectId: string | null;
}): {
  childPageInfo?: Record<string, AutomationHierarchyPageInfo>;
  loadMoreChildren?: (parentId: string | null) => void;
  nodes: AutomationHierarchyNode[];
} {
  if (!input.paging || input.pagingSnapshot.projectId !== input.projectId) {
    return {
      nodes: input.nodes,
      ...(input.childPageInfo ? { childPageInfo: input.childPageInfo } : {}),
      ...(input.loadMoreChildren ? { loadMoreChildren: input.loadMoreChildren } : {})
    };
  }
  return {
    nodes: input.pagingSnapshot.nodes as AutomationHierarchyNode[],
    childPageInfo: input.pagingSnapshot.childPageInfo as Record<string, AutomationHierarchyPageInfo>,
    loadMoreChildren: input.paging.loadMoreChildren
  };
}

function staticMerge(props: Pick<AutomationHierarchySurfaceCommonProps, "childPageInfo" | "nodes">): AutomationHierarchyStaticMergeInput {
  return {
    nodes: props.nodes,
    ...(props.childPageInfo ? { childPageInfo: props.childPageInfo } : {})
  };
}
