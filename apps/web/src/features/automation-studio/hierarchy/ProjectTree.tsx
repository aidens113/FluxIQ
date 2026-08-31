"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent
} from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import { useUiRenderMetric } from "../../programs/ui-performance";
import { createAutomationHierarchyCommands } from "./commands";
import {
  createAutomationHierarchyController,
  type AutomationHierarchyController,
  type AutomationHierarchyControllerContext
} from "./controller";
import type {
  AutomationHierarchyAction,
  AutomationHierarchyKind,
  AutomationHierarchyNode
} from "./model";
import type { AutomationHierarchyPageInfo } from "./paged-cache";
import { automationHierarchyKeyboardAction } from "./keyboard";
import type { AutomationHierarchyRoutableViewId } from "./routing";
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
import { AutomationHierarchyChildren } from "./tree-rows";
import { useAutomationHierarchyPrimaryTreeNodeId } from "./usePrimaryTreeNodeId";
import { usePostPaintHierarchyReconciliation } from "./usePostPaintHierarchyReconciliation";

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
  openView(viewId: AutomationHierarchyRoutableViewId, mode?: "preview" | "new-window"): void;
  openSubflow?(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
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

  const uiState = useSyncExternalStore(
    hierarchyStore.subscribe,
    hierarchyStore.getSnapshot,
    hierarchyStore.getSnapshot
  );

  const projectionSelectorRef = useRef<ReturnType<typeof createAutomationHierarchyProjectionSelector> | null>(null);
  if (!projectionSelectorRef.current) {
    projectionSelectorRef.current = createAutomationHierarchyProjectionSelector();
  }
  const projection = props.projection
    ?? projectionSelectorRef.current(props.nodes, props.search, props.typeFilter);
  const { index: hierarchyIndex, visibleIds, rootNodes } = projection;
  const effectiveCollapsedFolderIds = useMemo(
    () => selectAutomationHierarchyEffectiveCollapsedIds({
      nodes: props.nodes,
      collapsedFolderIds: uiState.collapsedFolderIds,
      expandedDefaultCollapsedIds: uiState.expandedDefaultCollapsedIds,
      selection: props.selection
    }),
    [
      props.nodes,
      props.selection,
      uiState.collapsedFolderIds,
      uiState.expandedDefaultCollapsedIds
    ]
  );

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
  if (!controllerRef.current) {
    controllerRef.current = createAutomationHierarchyController(
      hierarchyStore,
      () => controllerContextRef.current
    );
  }
  const hierarchyController = controllerRef.current;
  const commands = useMemo(
    () => createAutomationHierarchyCommands(props.requestAction),
    [props.requestAction]
  );

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
  const focusedTreeNodeId = uiState.focusedTreeNodeId === "root-flow" || visibleIds.has(uiState.focusedTreeNodeId)
    ? uiState.focusedTreeNodeId
    : "root-flow";

  const openFromTree = useCallback(
    (node: AutomationHierarchyNode, mode: "preview" | "new-window") => hierarchyController.openNode(node, mode),
    [hierarchyController]
  );
  const openSettingsFromTree = useCallback(
    (node: AutomationHierarchyNode) => hierarchyController.openSettings(node),
    [hierarchyController]
  );
  const toggleFolder = useCallback(
    (folderId: string) => hierarchyController.toggleFolder(folderId),
    [hierarchyController]
  );
  const focusTreeItem = useCallback(
    (nodeId: string) => hierarchyStore.previewFocus(nodeId),
    [hierarchyStore]
  );

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!item || !event.currentTarget.contains(item)) return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    const action = automationHierarchyKeyboardAction({
      items: elements.map((element) => ({
        id: element.dataset.treeItemId ?? "root-flow",
        parentId: element.dataset.treeParentId ?? null,
        expanded: element.hasAttribute("aria-expanded")
          ? element.getAttribute("aria-expanded") === "true"
          : null
      })),
      currentId: item.dataset.treeItemId ?? "root-flow",
      key: event.key
    });
    if (action.type === "none") return;
    event.preventDefault();
    const target = elements.find((element) => element.dataset.treeItemId === action.id);
    if (!target) return;
    if (action.type === "focus") {
      item.tabIndex = -1;
      target.tabIndex = 0;
      hierarchyStore.previewFocus(action.id);
      target.focus();
      return;
    }
    if (action.type === "toggle") {
      const disclosure = target.closest(".automation-tree-item")
        ?.querySelector<HTMLButtonElement>(".tree-row-disclosure");
      (disclosure ?? target).click();
      return;
    }
    target.click();
  };

  const rootCollapsed = uiState.collapsedFolderIds.includes("root-flow");
  return (
    <nav className="automation-project-tree" aria-label="Automation Studio project tree">
      <section
        className="automation-folder-root root-flow"
        onKeyDown={handleTreeKeyDown}
        role="tree"
        aria-label="Flows"
      >
        <div className="automation-tree-item root-folder">
          <button
            aria-expanded={!rootCollapsed}
            aria-level={1}
            data-tree-item-id="root-flow"
            role="treeitem"
            tabIndex={focusedTreeNodeId === "root-flow" ? 0 : -1}
            className="type-folder category-root category-flow"
            onClick={() => toggleFolder("root-flow")}
            type="button"
          >
            {rootCollapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            <span><strong>Flows</strong><small>Product automations</small></span>
          </button>
          <button
            className="tree-row-action"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              commands.create({ parentId: null, category: "flow" });
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title="Add Flow"
            aria-label="Add Flow"
            type="button"
          >
            <Plus size={13} aria-hidden />
          </button>
        </div>
        {!rootCollapsed ? (
          <div className="automation-tree-children root-children" role="group">
            <AutomationHierarchyChildren
              nodes={rootNodes}
              activeViewId={props.activeViewId}
              allNodes={props.nodes}
              hierarchyIndex={hierarchyIndex}
              visibleIds={visibleIds}
              collapsedFolderIds={effectiveCollapsedFolderIds}
              primaryTreeNodeId={primaryTreeNodeId}
              focusedTreeNodeId={focusedTreeNodeId}
              parentId={null}
              level={2}
              recordingPrimaryKind={props.recordingPrimaryKind}
              selection={props.selection}
              openConfig={openSettingsFromTree}
              openNode={openFromTree}
              {...(props.loadMoreChildren ? { onLoadMoreChildren: props.loadMoreChildren } : {})}
              onTreeItemFocus={focusTreeItem}
              {...(props.childPageInfo ? { pageInfo: props.childPageInfo } : {})}
              commands={commands}
              toggleFolder={toggleFolder}
              unbounded={Boolean(props.search || props.typeFilter !== "all")}
            />
            {!rootNodes.length ? (
              <div className="automation-tree-empty">No flows match the current filter.</div>
            ) : null}
          </div>
        ) : null}
      </section>
    </nav>
  );
});

export { AutomationHierarchyChildren, AutomationHierarchyTreeNode } from "./tree-rows";
export {
  automationHierarchyNodeCanRemainPrimary,
  automationHierarchyPrimaryNode,
  automationHierarchyPrimaryNodeId,
  automationHierarchyRouterPrimaryNode,
  automationHierarchyRouterPrimaryNodeId,
  automationHierarchySettingsPrimaryNodeId
} from "./selectors";
