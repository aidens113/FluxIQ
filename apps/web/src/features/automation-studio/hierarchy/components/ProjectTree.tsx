"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { AutomationSelection } from "../../shared/selection-contracts";
import { useUiRenderMetric } from "../../../programs/ui-performance";
import { createAutomationHierarchyCommands } from "../commands";
import {
  createAutomationHierarchyController,
  type AutomationHierarchyController,
  type AutomationHierarchyControllerContext
} from "../controller";
import type { AutomationHierarchyAction, AutomationHierarchyKind, AutomationHierarchyNode } from "../model";
import type { AutomationHierarchyPageInfo } from "../paged-cache";
import {
  createAutomationHierarchyProjectionSelector,
  selectAutomationHierarchyEffectiveCollapsedIds,
  type AutomationHierarchyProjection
} from "../selectors";
import {
  automationHierarchyUiStateSignature,
  createAutomationHierarchyStore,
  type AutomationHierarchyStore,
  type AutomationHierarchyUiState
} from "../store";
import {
  useAutomationHierarchyPrimaryTreeNodeId,
  useAutomationHierarchyTreeKeyDown,
  useAutomationHierarchyTreeViewport,
  usePostPaintHierarchyReconciliation,
  useSelectionDisclosure
} from "../hooks";
import {
  AUTOMATION_HIERARCHY_ROW_HEIGHT,
  flattenVisibleAutomationHierarchy,
  selectAutomationHierarchyVirtualWindow
} from "../virtualized-tree";
import { AutomationHierarchyLoadMoreRow } from "./LoadMoreRow";
import { AutomationHierarchyRootFlowRow } from "./RootFlowRow";
import { AutomationHierarchyTreeRow } from "./TreeRows";

export const AutomationProjectTree = memo(function AutomationProjectTree(props: {
  nodes: AutomationHierarchyNode[];
  projection?: AutomationHierarchyProjection;
  activeViewId: string | undefined;
  search: string;
  typeFilter: "all" | AutomationHierarchyKind;
  selection: AutomationSelection | null;
  recordingPrimaryKind: "recording" | null;
  setRecordingPrimaryKind(kind: "recording" | null): void;
  setSelection(selection: AutomationSelection): void;
  openView(viewId: string, mode?: "preview" | "new-pane-or-focus"): void;
  openSubflow?(node: AutomationHierarchyNode, mode: "preview" | "new-pane-or-focus"): void;
  childPageInfo?: Record<string, AutomationHierarchyPageInfo>;
  loadMoreChildren?(parentId: string | null): void;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  uiState?: AutomationHierarchyUiState | null;
  onUiStateChange?(state: AutomationHierarchyUiState): void;
}) {
  useUiRenderMetric("AutomationStudioHierarchyBoundary");
  const incomingUiStateRef = useRef(props.uiState);
  incomingUiStateRef.current = props.uiState;
  const incomingUiStateSignature = automationHierarchyUiStateSignature(props.uiState);

  const storeRef = useRef<AutomationHierarchyStore | null>(null);
  if (!storeRef.current) storeRef.current = createAutomationHierarchyStore(props.uiState);
  const hierarchyStore = storeRef.current;
  const scheduleHierarchyReconciliation = usePostPaintHierarchyReconciliation();
  const appliedIncomingUiStateSignatureRef = useRef(incomingUiStateSignature);
  const uiState = useSyncExternalStore(hierarchyStore.subscribe, hierarchyStore.getSnapshot, hierarchyStore.getSnapshot);
  useSelectionDisclosure(props.nodes, props.selection, props.activeViewId, hierarchyStore);

  const projectionSelectorRef = useRef<ReturnType<typeof createAutomationHierarchyProjectionSelector> | null>(null);
  if (!projectionSelectorRef.current) projectionSelectorRef.current = createAutomationHierarchyProjectionSelector();
  const projection = props.projection ?? projectionSelectorRef.current(props.nodes, props.search, props.typeFilter);
  const { index: hierarchyIndex, visibleIds, rootNodes } = projection;
  const effectiveCollapsedFolderIds = useMemo(() => selectAutomationHierarchyEffectiveCollapsedIds({
    nodes: props.nodes,
    collapsedFolderIds: uiState.collapsedFolderIds,
    expandedDefaultCollapsedIds: uiState.expandedDefaultCollapsedIds,
    selection: props.selection
  }), [props.nodes, props.selection, uiState.collapsedFolderIds, uiState.expandedDefaultCollapsedIds]);
  const rootCollapsed = uiState.collapsedFolderIds.includes("root-flow");
  const flatRows = useMemo(() => flattenVisibleAutomationHierarchy({
    index: hierarchyIndex,
    rootNodes,
    visibleIds,
    collapsedFolderIds: effectiveCollapsedFolderIds,
    rootCollapsed,
    ...(props.childPageInfo ? { pageInfo: props.childPageInfo } : {})
  }), [effectiveCollapsedFolderIds, hierarchyIndex, props.childPageInfo, rootCollapsed, rootNodes, visibleIds]);
  const flatNodeIds = useMemo(() => new Set(flatRows.filter((row) => row.kind !== "load-more").map((row) => row.id)), [flatRows]);

  const controllerContextRef = useRef<AutomationHierarchyControllerContext>({
    nodes: props.nodes,
    activeViewId: props.activeViewId,
    selection: props.selection,
    recordingPrimaryKind: props.recordingPrimaryKind,
    setRecordingPrimaryKind: props.setRecordingPrimaryKind,
    setSelection: props.setSelection,
    openView: props.openView,
    scheduleReconciliation: scheduleHierarchyReconciliation,
    ...(props.openSubflow ? { openSubflow: props.openSubflow } : {})
  });
  controllerContextRef.current = {
    nodes: props.nodes,
    activeViewId: props.activeViewId,
    selection: props.selection,
    recordingPrimaryKind: props.recordingPrimaryKind,
    setRecordingPrimaryKind: props.setRecordingPrimaryKind,
    setSelection: props.setSelection,
    openView: props.openView,
    scheduleReconciliation: scheduleHierarchyReconciliation,
    ...(props.openSubflow ? { openSubflow: props.openSubflow } : {})
  };
  const controllerRef = useRef<AutomationHierarchyController | null>(null);
  if (!controllerRef.current) controllerRef.current = createAutomationHierarchyController(hierarchyStore, () => controllerContextRef.current);
  const hierarchyController = controllerRef.current;
  const commands = useMemo(() => createAutomationHierarchyCommands(props.requestAction), [props.requestAction]);

  useEffect(() => {
    hierarchyStore.setChangeListener(props.onUiStateChange);
    return () => hierarchyStore.setChangeListener(undefined);
  }, [hierarchyStore, props.onUiStateChange]);
  useEffect(() => {
    if (incomingUiStateSignature === appliedIncomingUiStateSignatureRef.current) return;
    appliedIncomingUiStateSignatureRef.current = incomingUiStateSignature;
    hierarchyStore.hydrate(incomingUiStateRef.current);
  }, [hierarchyStore, incomingUiStateSignature]);

  const primaryTreeNodeId = useAutomationHierarchyPrimaryTreeNodeId({
    nodes: props.nodes,
    selection: props.selection,
    activeViewId: props.activeViewId,
    recordingPrimaryKind: props.recordingPrimaryKind,
    store: hierarchyStore
  });
  const focusedTreeNodeId = flatNodeIds.has(uiState.focusedTreeNodeId) ? uiState.focusedTreeNodeId : "root-flow";

  const openFromTree = useCallback((node: AutomationHierarchyNode, mode: "preview" | "new-pane-or-focus") => hierarchyController.openNode(node, mode), [hierarchyController]);
  const openSettingsFromTree = useCallback((node: AutomationHierarchyNode) => hierarchyController.openSettings(node), [hierarchyController]);
  const toggleFolder = useCallback((folderId: string) => hierarchyController.toggleFolder(folderId), [hierarchyController]);
  const focusTreeItem = useCallback((nodeId: string) => hierarchyStore.previewFocus(nodeId), [hierarchyStore]);

  const { viewportRef, viewport, focusRow, handleScroll } = useAutomationHierarchyTreeViewport({ flatRows, previewFocus: focusTreeItem });
  const handleTreeKeyDown = useAutomationHierarchyTreeKeyDown({ flatRows, focusRow, toggleFolder, openNode: openFromTree });
  const virtualWindow = selectAutomationHierarchyVirtualWindow({
    rows: flatRows,
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.height
  });

  return (
    <nav
      aria-label="Automation Studio project tree"
      className="automation-project-tree automation-project-tree-virtual"
      onScroll={handleScroll}
      ref={viewportRef}
    >
      <div aria-label="Flows" className="automation-folder-root root-flow" onKeyDown={handleTreeKeyDown} role="tree">
        <div className="automation-tree-virtual-spacer" role="none" style={{ height: `${virtualWindow.totalHeight}px` }}>
          {virtualWindow.rows.map(({ row, top }) => (
            <div className="automation-tree-virtual-row" key={row.id} role="none" style={{ height: `${AUTOMATION_HIERARCHY_ROW_HEIGHT}px`, transform: `translateY(${top}px)` }}>
              {row.kind === "root" ? (
                <AutomationHierarchyRootFlowRow
                  collapsed={row.collapsed}
                  commands={commands}
                  focused={focusedTreeNodeId === row.id}
                  onFocus={focusTreeItem}
                  toggleFolder={toggleFolder}
                />
              ) : row.kind === "load-more" ? (
                <AutomationHierarchyLoadMoreRow
                  level={row.level}
                  pageInfo={row.pageInfo}
                  parentId={row.parentId}
                  {...(props.loadMoreChildren ? { loadMoreChildren: props.loadMoreChildren } : {})}
                />
              ) : (
                <AutomationHierarchyTreeRow
                  {...(props.activeViewId ? { activeViewId: props.activeViewId } : {})}
                  commands={commands}
                  focusedTreeNodeId={focusedTreeNodeId}
                  hierarchyIndex={hierarchyIndex}
                  onTreeItemFocus={focusTreeItem}
                  openConfig={openSettingsFromTree}
                  openNode={openFromTree}
                  primaryTreeNodeId={primaryTreeNodeId}
                  recordingPrimaryKind={props.recordingPrimaryKind}
                  row={row}
                  selection={props.selection}
                  toggleFolder={toggleFolder}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      {flatRows.length === 1 && !rootCollapsed ? <div className="automation-tree-empty">No flows match the current filter.</div> : null}
    </nav>
  );
});
