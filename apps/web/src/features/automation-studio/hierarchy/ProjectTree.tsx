"use client";

import { ChevronDown, ChevronRight, Plus, Workflow } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent, UIEvent } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import { useUiRenderMetric } from "../../programs/ui-performance";
import { createAutomationHierarchyCommands } from "./commands";
import {
  createAutomationHierarchyController,
  type AutomationHierarchyController,
  type AutomationHierarchyControllerContext
} from "./controller";
import type { AutomationHierarchyAction, AutomationHierarchyKind, AutomationHierarchyNode } from "./model";
import type { AutomationHierarchyPageInfo } from "./paged-cache";
import { automationHierarchyKeyboardAction } from "./keyboard";
import {
  createAutomationHierarchyProjectionSelector,
  selectAutomationHierarchyEffectiveCollapsedIds,
  type AutomationHierarchyProjection
} from "./selectors";
import {
  automationHierarchyUiStateSignature,
  createAutomationHierarchyStore,
  type AutomationHierarchyStore,
  type AutomationHierarchyUiState
} from "./store";
import { AutomationHierarchyTreeRow } from "./tree-rows";
import { useAutomationHierarchyPrimaryTreeNodeId } from "./usePrimaryTreeNodeId";
import { usePostPaintHierarchyReconciliation } from "./usePostPaintHierarchyReconciliation";
import { useSelectionDisclosure } from "./useSelectionDisclosure";
import {
  AUTOMATION_HIERARCHY_DEFAULT_VIEWPORT_HEIGHT,
  AUTOMATION_HIERARCHY_ROW_HEIGHT,
  automationHierarchyRowIndex,
  flattenVisibleAutomationHierarchy,
  selectAutomationHierarchyVirtualWindow,
  type AutomationHierarchyFlatRow
} from "./virtualized-tree";

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
  const viewportRef = useRef<HTMLElement | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: AUTOMATION_HIERARCHY_DEFAULT_VIEWPORT_HEIGHT });
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
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const height = Math.max(AUTOMATION_HIERARCHY_ROW_HEIGHT, element.clientHeight);
      setViewport((current) => current.height === height ? current : { ...current, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const primaryTreeNodeId = useAutomationHierarchyPrimaryTreeNodeId({
    nodes: props.nodes,
    selection: props.selection,
    activeViewId: props.activeViewId,
    recordingPrimaryKind: props.recordingPrimaryKind,
    store: hierarchyStore
  });
  const focusedTreeNodeId = flatNodeIds.has(uiState.focusedTreeNodeId) ? uiState.focusedTreeNodeId : "root-flow";
  const virtualWindow = selectAutomationHierarchyVirtualWindow({
    rows: flatRows,
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.height
  });

  const openFromTree = useCallback((node: AutomationHierarchyNode, mode: "preview" | "new-pane-or-focus") => hierarchyController.openNode(node, mode), [hierarchyController]);
  const openSettingsFromTree = useCallback((node: AutomationHierarchyNode) => hierarchyController.openSettings(node), [hierarchyController]);
  const toggleFolder = useCallback((folderId: string) => hierarchyController.toggleFolder(folderId), [hierarchyController]);
  const focusTreeItem = useCallback((nodeId: string) => hierarchyStore.previewFocus(nodeId), [hierarchyStore]);

  const focusRow = useCallback((id: string) => {
    const index = automationHierarchyRowIndex(flatRows, id);
    if (index < 0) return;
    hierarchyStore.previewFocus(id);
    const element = viewportRef.current;
    if (element) {
      const top = index * AUTOMATION_HIERARCHY_ROW_HEIGHT;
      const bottom = top + AUTOMATION_HIERARCHY_ROW_HEIGHT;
      let scrollTop = element.scrollTop;
      if (top < scrollTop) scrollTop = top;
      else if (bottom > scrollTop + element.clientHeight) scrollTop = bottom - element.clientHeight;
      if (scrollTop !== element.scrollTop) {
        element.scrollTop = scrollTop;
        setViewport((current) => current.scrollTop === scrollTop ? current : { ...current, scrollTop });
      }
    }
    window.requestAnimationFrame(() => viewportRef.current
      ?.querySelector<HTMLElement>(`[data-tree-item-id="${CSS.escape(id)}"]`)
      ?.focus());
  }, [flatRows, hierarchyStore]);

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!item || !event.currentTarget.contains(item)) return;
    const keyboardRows = flatRows.filter((row): row is Exclude<AutomationHierarchyFlatRow, { kind: "load-more" }> => row.kind !== "load-more");
    const action = automationHierarchyKeyboardAction({
      items: keyboardRows.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        expanded: row.isContainer ? !row.collapsed : null
      })),
      currentId: item.dataset.treeItemId ?? "root-flow",
      key: event.key
    });
    if (action.type === "none") return;
    event.preventDefault();
    if (action.type === "focus") focusRow(action.id);
    else if (action.type === "toggle" || action.id === "root-flow") toggleFolder(action.id);
    else {
      const row = flatRows.find((candidate) => candidate.id === action.id);
      if (row?.kind === "node") openFromTree(row.node, "preview");
    }
  };
  const handleScroll = (event: UIEvent<HTMLElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    setViewport((current) => current.scrollTop === scrollTop ? current : { ...current, scrollTop });
  };

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
                <RootFlowRow
                  collapsed={row.collapsed}
                  commands={commands}
                  focused={focusedTreeNodeId === row.id}
                  onFocus={focusTreeItem}
                  toggleFolder={toggleFolder}
                />
              ) : row.kind === "load-more" ? (
                <div aria-label="More project hierarchy items" aria-level={row.level} className="automation-tree-page-more-wrap" role="treeitem" style={{ paddingInlineStart: `${Math.max(0, row.level - 2) * 14}px` } as CSSProperties}>
                  <button
                    className="automation-tree-page-more"
                    disabled={Boolean(row.pageInfo.loading)}
                    onClick={() => props.loadMoreChildren?.(row.parentId)}
                    type="button"
                  >
                    {row.pageInfo.loading ? "Loading..." : row.pageInfo.invalidated ? "Refresh folder" : "Load more"}
                  </button>
                </div>
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

const RootFlowRow = memo(function RootFlowRow(props: {
  collapsed: boolean;
  commands: ReturnType<typeof createAutomationHierarchyCommands>;
  focused: boolean;
  onFocus(id: string): void;
  toggleFolder(id: string): void;
}) {
  return <div aria-expanded={!props.collapsed} aria-label="Flows" aria-level={1} aria-posinset={1} aria-setsize={1} className="automation-tree-item root-folder automation-tree-virtual-item" data-tree-item-id="root-flow" onFocus={() => props.onFocus("root-flow")} role="treeitem" tabIndex={props.focused ? 0 : -1}>
    <span className="tree-row-disclosure-slot">
      <button aria-expanded={!props.collapsed} aria-label={`${props.collapsed ? "Expand" : "Collapse"} Flows`} className="tree-row-disclosure" onClick={() => props.toggleFolder("root-flow")} tabIndex={-1} title={`${props.collapsed ? "Expand" : "Collapse"} Flows`} type="button">
        {props.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </button>
    </span>
    <button className="tree-row-main type-folder category-root category-flow" onClick={() => props.toggleFolder("root-flow")} tabIndex={-1} type="button">
      <Workflow size={14} aria-hidden />
      <span className="tree-row-label"><strong>Flows</strong><small>Product automations</small></span>
    </button>
    <button aria-label="Add Flow" className="tree-row-action" onClick={(event) => { event.preventDefault(); event.stopPropagation(); props.commands.create({ parentId: null, category: "flow" }); }} onPointerDown={(event) => event.stopPropagation()} title="Add Flow" type="button">
      <Plus size={13} aria-hidden />
    </button>
  </div>;
});

export { AutomationHierarchyTreeRow } from "./tree-rows";
export {
  automationHierarchyNodeCanRemainPrimary,
  automationHierarchyPrimaryNode,
  automationHierarchyPrimaryNodeId,
  automationHierarchyRouterPrimaryNode,
  automationHierarchyRouterPrimaryNodeId,
  automationHierarchySettingsPrimaryNodeId
} from "./selectors";
