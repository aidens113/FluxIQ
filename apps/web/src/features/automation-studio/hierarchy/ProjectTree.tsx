"use client";

import { Bug, ChevronDown, ChevronRight, ClipboardList, FileCode2, FileText, FolderOpen, GitBranch, History, ListChecks, MoreHorizontal, Network, Plus, Radio, Route, Settings, SlidersHorizontal, Sparkles, Trash2, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { AutomationHierarchyAction, AutomationHierarchyIndex, AutomationHierarchyKind, AutomationHierarchyNode } from "./model";
import { automationHierarchyNodeCanCreateChildFolder, automationHierarchyNodeCanDelete, indexAutomationHierarchyNodes, visibleAutomationHierarchyNodeIds } from "./model";
import { automationHierarchyPageKey, type AutomationHierarchyPageInfo } from "./paged-cache";
import type { AutomationSelection } from "../types";
import { Menu } from "../../programs/shared-ui";

export function AutomationProjectTree(props: {
  nodes: AutomationHierarchyNode[];
  activeViewId: string | undefined;
  search: string;
  typeFilter: "all" | AutomationHierarchyKind;
  selection: AutomationSelection | null;
  recordingPrimaryKind: "recording" | "proposal" | null;
  setRecordingPrimaryKind(kind: "recording" | "proposal" | null): void;
  setSelection(selection: AutomationSelection): void;
  openView(viewId: string, mode?: "preview" | "new-window"): void;
  openSubflow?(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  childPageInfo?: Record<string, AutomationHierarchyPageInfo>;
  loadMoreChildren?(parentId: string | null): void;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
}) {
  const [primaryTreeNodeId, setPrimaryTreeNodeId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>([]);
  const [expandedDefaultCollapsedIds, setExpandedDefaultCollapsedIds] = useState<string[]>([]);
  const [focusedTreeNodeId, setFocusedTreeNodeId] = useState("root-flow");
  const hierarchyIndex = useMemo(() => indexAutomationHierarchyNodes(props.nodes), [props.nodes]);
  const visibleIds = useMemo(() => {
    const normalizedSearch = props.search.trim().toLocaleLowerCase();
    return visibleAutomationHierarchyNodeIds(hierarchyIndex, (node) =>
      (props.typeFilter === "all" || props.typeFilter === node.kind)
      && (!normalizedSearch || (node.label + " " + node.kind).toLocaleLowerCase().includes(normalizedSearch))
    );
  }, [hierarchyIndex, props.search, props.typeFilter]);
  const rootNodes = (hierarchyIndex.childrenByParentId.get(null) ?? [])
    .filter((node) => node.category === "flow" && visibleIds.has(node.id));
  const activeSubflowContainerIds = useMemo(() => new Set(props.nodes
    .filter((node) => node.kind === "subflow" && props.selection?.kind === "flow" && node.metadata?.graphFlowId === props.selection.id)
    .map((node) => node.id)), [props.nodes, props.selection?.kind, props.selection?.id]);
  const effectiveCollapsedFolderIds = useMemo(() => {
    const expandedIds = new Set(expandedDefaultCollapsedIds);
    return [
      ...collapsedFolderIds.filter((id) => !activeSubflowContainerIds.has(id)),
      ...props.nodes.filter((node) => node.metadata?.defaultCollapsed === true && !expandedIds.has(node.id) && !activeSubflowContainerIds.has(node.id)).map((node) => node.id)
    ];
  }, [activeSubflowContainerIds, collapsedFolderIds, expandedDefaultCollapsedIds, props.nodes]);
  useEffect(() => {
    if (focusedTreeNodeId === "root-flow" || visibleIds.has(focusedTreeNodeId)) return;
    setFocusedTreeNodeId("root-flow");
  }, [focusedTreeNodeId, props.nodes, props.search, props.typeFilter, visibleIds]);
  const handleTreeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!item || !event.currentTarget.contains(item)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    const index = items.indexOf(item);
    if (index < 0) return;
    const focusItem = (target: HTMLElement | undefined) => {
      if (!target) return;
      event.preventDefault();
      item.tabIndex = -1;
      target.tabIndex = 0;
      setFocusedTreeNodeId(target.dataset.treeItemId ?? "root-flow");
      target.focus();
    };
    if (event.key === "ArrowDown") return focusItem(items[index + 1] ?? items[0]);
    if (event.key === "ArrowUp") return focusItem(items[index - 1] ?? items[items.length - 1]);
    if (event.key === "Home") return focusItem(items[0]);
    if (event.key === "End") return focusItem(items[items.length - 1]);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (item.getAttribute("aria-expanded") === "false") {
        const disclosure = item.closest(".automation-tree-item")?.querySelector<HTMLButtonElement>(".tree-row-disclosure");
        (disclosure ?? item).click();
        return;
      }
      const next = items[index + 1];
      if (next?.dataset.treeParentId === item.dataset.treeItemId) focusItem(next);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (item.getAttribute("aria-expanded") === "true") {
        const disclosure = item.closest(".automation-tree-item")?.querySelector<HTMLButtonElement>(".tree-row-disclosure");
        (disclosure ?? item).click();
        return;
      }
      const parentId = item.dataset.treeParentId;
      if (parentId) focusItem(items.find((candidate) => candidate.dataset.treeItemId === parentId));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      item.click();
    }
  };
  const requestTreeAction = (action: NonNullable<AutomationHierarchyAction>) => {
    props.requestAction(action);
  };
  const expandHierarchyContainer = (node: AutomationHierarchyNode) => {
    if (node.metadata?.hierarchyContainer !== true) return;
    setCollapsedFolderIds((current) => current.filter((id) => id !== node.id));
    if (node.metadata?.defaultCollapsed === true) {
      setExpandedDefaultCollapsedIds((current) => current.includes(node.id) ? current : [...current, node.id]);
    }
  };
  const openFromTree = (node: AutomationHierarchyNode, mode: "preview" | "new-window") => {
    if (node.kind === "folder") return;
    expandHierarchyContainer(node);
    const targetNode = automationHierarchyPrimaryNode(node, props.nodes);
    setPrimaryTreeNodeId(targetNode.id);
    if (node.kind === "subflow" && props.openSubflow) {
      props.openSubflow(node, mode);
      return;
    }
    if (node.kind === "task" && node.sourceId) props.setSelection({ kind: "policy", id: node.sourceId });
    if (node.kind === "flow" && node.sourceId) props.setSelection({ kind: "flow", id: node.sourceId });
    if (node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string") props.setSelection({ kind: "flow", id: node.metadata.graphFlowId });
    if (node.flowId && node.kind !== "flow" && node.kind !== "subflow" && node.kind !== "recording" && node.kind !== "proposal") props.setSelection({ kind: "flow", id: node.flowId });
    if (node.kind === "recording" && node.sourceId) {
      props.setRecordingPrimaryKind("recording");
      props.setSelection({ kind: "recording", id: node.sourceId });
    }
    if (node.kind === "proposal" && node.sourceId) {
      props.setRecordingPrimaryKind("proposal");
      props.setSelection({ kind: "proposal", id: node.sourceId, ...(node.recordingId ? { recordingId: node.recordingId } : {}) });
    }
    if ((node.kind === "client" || (node.kind === "run" && !node.flowId)) && node.sourceId) props.setSelection({ kind: "workspace", id: node.sourceId as "clients" | "runs" });
    props.openView(targetNode.viewId ?? (targetNode.kind === "flow" || targetNode.kind === "task" ? "policy-primary" : targetNode.kind === "routine" ? "routine-editor" : targetNode.kind === "recording" ? "timeline-recording" : targetNode.kind === "client" ? "client-gateway" : targetNode.kind === "proposal" ? "proposal-workbench" : targetNode.kind === "run" ? "runtime-debug" : "flow-settings"), mode);
  };
  const openSettingsFromTree = (node: AutomationHierarchyNode) => {
    if (!node.sourceId || (node.kind !== "flow" && node.kind !== "task")) return;
    setPrimaryTreeNodeId(automationHierarchySettingsPrimaryNodeId(node, props.nodes));
    props.setSelection(node.kind === "flow" ? { kind: "flow", id: node.sourceId } : { kind: "policy", id: node.sourceId });
    props.openView("flow-settings", "preview");
  };
  useEffect(() => {
    if (!primaryTreeNodeId) return;
    const primaryNode = props.nodes.find((node) => node.id === primaryTreeNodeId);
    if (!primaryNode || !automationHierarchyNodeCanRemainPrimary(primaryNode, props.selection)) setPrimaryTreeNodeId(null);
  }, [primaryTreeNodeId, props.nodes, props.selection]);
  useEffect(() => {
    if (!props.recordingPrimaryKind) return;
    const primaryNode = props.selection?.kind === "recording"
      ? props.nodes.find((node) => node.kind === props.recordingPrimaryKind && (node.sourceId === props.selection?.id || node.recordingId === props.selection?.id))
      : props.selection?.kind === "proposal"
        ? props.nodes.find((node) => node.kind === props.recordingPrimaryKind && node.sourceId === props.selection?.id)
        : null;
    setPrimaryTreeNodeId(primaryNode?.id ?? null);
  }, [props.nodes, props.recordingPrimaryKind, props.selection]);
  const toggleFolder = (folderId: string) => {
    const node = hierarchyIndex.byId.get(folderId);
    if (node?.metadata?.defaultCollapsed === true) {
      setExpandedDefaultCollapsedIds((current) => current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]);
      return;
    }
    setCollapsedFolderIds((current) => current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]);
  };
  return (
    <nav className="automation-project-tree" aria-label="Automation Studio project tree">
      <section className="automation-folder-root root-flow" onKeyDown={handleTreeKeyDown} role="tree" aria-label="Flows">
        <div className="automation-tree-item root-folder">
          <button aria-expanded={!collapsedFolderIds.includes("root-flow")} aria-level={1} data-tree-item-id="root-flow" role="treeitem" tabIndex={focusedTreeNodeId === "root-flow" ? 0 : -1} className="type-folder category-root category-flow" onClick={() => toggleFolder("root-flow")} onFocus={() => setFocusedTreeNodeId("root-flow")} type="button">
            {collapsedFolderIds.includes("root-flow") ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            <span><strong>Flows</strong><small>Product automations</small></span>
          </button>
          <button className="tree-row-action" onClick={(event) => { event.preventDefault(); event.stopPropagation(); requestTreeAction({ action: "create", category: "flow", parentId: null }); }} onPointerDown={(event) => event.stopPropagation()} title="Add Flow" aria-label="Add Flow" type="button"><Plus size={13} aria-hidden /></button>
        </div>
        {!collapsedFolderIds.includes("root-flow") ? <div className="automation-tree-children root-children" role="group">
          <AutomationHierarchyChildren nodes={rootNodes} activeViewId={props.activeViewId} allNodes={props.nodes} hierarchyIndex={hierarchyIndex} visibleIds={visibleIds} collapsedFolderIds={effectiveCollapsedFolderIds} primaryTreeNodeId={primaryTreeNodeId} focusedTreeNodeId={focusedTreeNodeId} parentId={null} level={2} recordingPrimaryKind={props.recordingPrimaryKind} selection={props.selection} openConfig={openSettingsFromTree} openNode={openFromTree} {...(props.loadMoreChildren ? { onLoadMoreChildren: props.loadMoreChildren } : {})} onTreeItemFocus={setFocusedTreeNodeId} {...(props.childPageInfo ? { pageInfo: props.childPageInfo } : {})} requestAction={requestTreeAction} toggleFolder={toggleFolder} unbounded={Boolean(props.search || props.typeFilter !== "all")} />
          {!rootNodes.length ? <div className="automation-tree-empty">No flows match the current filter.</div> : null}
        </div> : null}
      </section>
    </nav>
  );
}

export function AutomationHierarchyTreeNode(props: {
  node: AutomationHierarchyNode;
  activeViewId: string | undefined;
  nodes: AutomationHierarchyNode[];
  hierarchyIndex: AutomationHierarchyIndex;
  visibleIds: Set<string>;
  collapsedFolderIds: string[];
  primaryTreeNodeId: string | null;
  focusedTreeNodeId: string;
  level: number;
  recordingPrimaryKind: "recording" | "proposal" | null;
  selection: AutomationSelection | null;
  openConfig(node: AutomationHierarchyNode): void;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  onTreeItemFocus(nodeId: string): void;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  toggleFolder(folderId: string): void;
  pageInfo?: Record<string, AutomationHierarchyPageInfo>;
  onLoadMoreChildren?(parentId: string | null): void;
  unbounded: boolean;
}) {
  const children = (props.hierarchyIndex.childrenByParentId.get(props.node.id) ?? []).filter((node) => props.visibleIds.has(node.id));
  const selectionMatched = automationHierarchyNodeMatchesSelection(props.node, props.selection);
  const activeViewMatched = automationHierarchyNodeMatchesActiveFlowView(props.node, props.selection, props.activeViewId);
  const activeChildOwnsFlowSelection = automationHierarchyActiveChildOwnsFlowSelection(props.node, props.hierarchyIndex, props.selection, props.activeViewId);
  const recordingPrimarySelected = props.selection?.kind === "recording" && props.recordingPrimaryKind ? props.node.kind === props.recordingPrimaryKind : props.node.kind === "recording";
  const primarySelected = props.primaryTreeNodeId ? props.primaryTreeNodeId === props.node.id : activeViewMatched || (!activeChildOwnsFlowSelection && selectionMatched && (props.selection?.kind === "recording" ? recordingPrimarySelected : true));
  const correlatedSelected = selectionMatched && !primarySelected && !activeChildOwnsFlowSelection;
  const isFolder = props.node.kind === "folder";
  const isContainer = isFolder || children.length > 0;
  const canCreateChildFolder = automationHierarchyNodeCanCreateChildFolder(props.node);
  const canDeleteNode = automationHierarchyNodeCanDelete(props.node);
  const collapsed = props.collapsedFolderIds.includes(props.node.id);
  const Icon = automationHierarchyIconForNode(props.node);
  return (
    <div className="automation-tree-branch">
      <div className="automation-tree-item">
        {isContainer && !isFolder ? <button
          className="tree-row-disclosure"
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); props.toggleFolder(props.node.id); }}
          onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
          title={`${collapsed ? "Expand" : "Collapse"} ${props.node.label}`}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${props.node.label}`}
          type="button"
        >{collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}</button> : null}
        <button aria-expanded={isContainer ? !collapsed : undefined} aria-level={props.level} aria-selected={primarySelected} data-tree-item-id={props.node.id} data-tree-parent-id={props.node.parentId ?? "root-flow"} role="treeitem" tabIndex={props.focusedTreeNodeId === props.node.id ? 0 : -1} className={`tree-row-main ${primarySelected ? "selected " : ""}${correlatedSelected ? "correlated " : ""}${isFolder ? "folder-row " : ""}type-${props.node.kind}`} onClick={(event) => {
          if (event.detail > 1) return;
          if (isFolder) props.toggleFolder(props.node.id);
          else props.openNode(props.node, "preview");
        }} onDoubleClick={() => props.openNode(props.node, "new-window")} onFocus={() => props.onTreeItemFocus(props.node.id)} title={props.node.label} type="button">
          {isFolder ? <>{collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}<Icon size={14} aria-hidden /></> : <Icon size={14} aria-hidden />}
          <span><strong>{props.node.label}</strong><small>{props.node.kind}</small></span>
        </button>
        {canCreateChildFolder || ((props.node.kind === "flow" || props.node.kind === "task") && props.node.sourceId) || canDeleteNode ? (
          <div className="automation-tree-row-menu">
            <Menu
              icon={<MoreHorizontal size={14} aria-hidden />}
              iconOnly
              label={props.node.label + " actions"}
              options={[
                ...(canCreateChildFolder ? [{
                  id: "create",
                  label: "Add inside",
                  icon: <Plus size={14} aria-hidden />,
                  onSelect: () => props.requestAction({ action: "create", parentId: props.node.id })
                }] : []),
                ...((props.node.kind === "flow" || props.node.kind === "task") && props.node.sourceId ? [{
                  id: "settings",
                  label: "Open settings",
                  icon: <Settings size={14} aria-hidden />,
                  onSelect: () => props.openConfig(props.node)
                }] : []),
                ...(canDeleteNode ? [{
                  id: "delete",
                  label: "Delete",
                  icon: <Trash2 size={14} aria-hidden />,
                  danger: true,
                  onSelect: () => props.requestAction({ action: "delete", node: props.node })
                }] : [])
              ]}
            />
          </div>
        ) : null}
      </div>
      {children.length && !collapsed ? <div className="automation-tree-children" role="group"><AutomationHierarchyChildren nodes={children} activeViewId={props.activeViewId} allNodes={props.nodes} hierarchyIndex={props.hierarchyIndex} visibleIds={props.visibleIds} collapsedFolderIds={props.collapsedFolderIds} primaryTreeNodeId={props.primaryTreeNodeId} focusedTreeNodeId={props.focusedTreeNodeId} parentId={props.node.id} level={props.level + 1} recordingPrimaryKind={props.recordingPrimaryKind} selection={props.selection} openConfig={props.openConfig} openNode={props.openNode} {...(props.onLoadMoreChildren ? { onLoadMoreChildren: props.onLoadMoreChildren } : {})} onTreeItemFocus={props.onTreeItemFocus} {...(props.pageInfo ? { pageInfo: props.pageInfo } : {})} requestAction={props.requestAction} toggleFolder={props.toggleFolder} unbounded={props.unbounded} /></div> : null}
    </div>
  );
}

function automationHierarchyIconForNode(node: AutomationHierarchyNode): LucideIcon {
  if (node.kind === "folder") {
    if (node.viewId === "timeline-recording") return Radio;
    if (node.viewId === "proposal-workbench") return Sparkles;
    if (node.viewId === "runs-history") return History;
    if (node.viewId === "adaptations") return ClipboardList;
    if (node.label === "Subflows") return Workflow;
    return FolderOpen;
  }
  if (node.viewId === "flow-instructions" || node.kind === "instruction") return ListChecks;
  if (node.kind === "change-proposal" || node.kind === "proposal") return Sparkles;
  if (node.viewId === "runtime-debug") return Bug;
  if (node.viewId === "state-explorer" || node.metadata?.flowStructure === "subflow-nodes") return Network;
  if (node.viewId === "flow-settings") return Settings;
  if (node.kind === "subflow" || node.kind === "routine") return Workflow;
  if (node.kind === "recording" || node.kind === "client") return Radio;
  if (node.kind === "run") return History;
  if (node.kind === "config") return SlidersHorizontal;
  if (node.kind === "task") return FileCode2;
  if (node.viewId === "flow-router") return Route;
  if (node.kind === "flow") return GitBranch;
  return FileText;
}

export function AutomationHierarchyChildren(props: {
  nodes: AutomationHierarchyNode[];
  activeViewId: string | undefined;
  allNodes: AutomationHierarchyNode[];
  hierarchyIndex: AutomationHierarchyIndex;
  visibleIds: Set<string>;
  collapsedFolderIds: string[];
  primaryTreeNodeId: string | null;
  focusedTreeNodeId: string;
  level: number;
  recordingPrimaryKind: "recording" | "proposal" | null;
  selection: AutomationSelection | null;
  openConfig(node: AutomationHierarchyNode): void;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  onLoadMoreChildren?(parentId: string | null): void;
  onTreeItemFocus(nodeId: string): void;
  pageInfo?: Record<string, AutomationHierarchyPageInfo>;
  parentId: string | null;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  toggleFolder(folderId: string): void;
  unbounded: boolean;
}) {
  const [limit, setLimit] = useState(100);
  const pageInfo = props.pageInfo?.[automationHierarchyPageKey(props.parentId)];
  const visibleNodes = pageInfo ? props.nodes : props.unbounded ? props.nodes : props.nodes.slice(0, limit);
  const remaining = pageInfo ? 0 : props.nodes.length - visibleNodes.length;
  const showPageMore = pageInfo ? pageInfo.hasMore || pageInfo.invalidated : remaining > 0;
  const pageMoreLabel = pageInfo
    ? pageInfo.loading ? "Loading..." : pageInfo.invalidated ? "Refresh folder" : "Load more"
    : `Show ${Math.min(100, remaining)} more`;
  return (
    <>
      {visibleNodes.map((node) => (
        <AutomationHierarchyTreeNode
          key={node.id}
          node={node}
          activeViewId={props.activeViewId}
          nodes={props.allNodes}
          hierarchyIndex={props.hierarchyIndex}
          visibleIds={props.visibleIds}
          collapsedFolderIds={props.collapsedFolderIds}
          primaryTreeNodeId={props.primaryTreeNodeId}
          focusedTreeNodeId={props.focusedTreeNodeId}
          level={props.level}
          recordingPrimaryKind={props.recordingPrimaryKind}
          selection={props.selection}
          openConfig={props.openConfig}
          openNode={props.openNode}
          {...(props.onLoadMoreChildren ? { onLoadMoreChildren: props.onLoadMoreChildren } : {})}
          onTreeItemFocus={props.onTreeItemFocus}
          {...(props.pageInfo ? { pageInfo: props.pageInfo } : {})}
          requestAction={props.requestAction}
          toggleFolder={props.toggleFolder}
          unbounded={props.unbounded}
        />
      ))}
      {showPageMore ? <div className="automation-tree-page-more-wrap" role="none"><button className="automation-tree-page-more" disabled={Boolean(pageInfo?.loading)} onClick={() => pageInfo ? props.onLoadMoreChildren?.(props.parentId) : setLimit((current) => current + 100)} type="button">{pageMoreLabel}</button></div> : null}
    </>
  );
}

function automationHierarchyActiveChildOwnsFlowSelection(node: AutomationHierarchyNode, hierarchyIndex: AutomationHierarchyIndex, selection: AutomationSelection | null, activeViewId?: string): boolean {
  const ownedFlowId = node.kind === "flow"
    ? node.sourceId
    : node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string" ? node.metadata.graphFlowId : null;
  return Boolean(
    ownedFlowId
    && selection?.kind === "flow"
    && selection.id === ownedFlowId
    && activeViewId
    && (hierarchyIndex.childrenByParentId.get(node.id) ?? []).some((candidate) => candidate.flowId === ownedFlowId && candidate.viewId === activeViewId)
  );
}

function automationHierarchyNodeMatchesSelection(node: AutomationHierarchyNode, selection: AutomationSelection | null): boolean {
  return Boolean(
    node.sourceId
    && (
      (selection?.kind === "flow" && node.kind === "flow" && selection.id === node.sourceId)
      || (selection?.kind === "flow" && node.kind === "subflow" && selection.id === node.metadata?.graphFlowId)
      || (selection?.kind === "policy" && selection.id === node.sourceId)
      || (selection?.kind === "recording" && selection.id === node.sourceId)
      || (selection?.kind === "recording" && selection.id === node.recordingId)
      || (selection?.kind === "proposal" && selection.id === node.sourceId)
      || (selection?.kind === "workspace" && selection.id === node.sourceId)
    )
  );
}

function automationHierarchyNodeMatchesActiveFlowView(node: AutomationHierarchyNode, selection: AutomationSelection | null, activeViewId?: string): boolean {
  return Boolean(
    activeViewId
    && node.viewId === activeViewId
    && node.flowId
    && node.kind !== "flow"
    && selection?.kind === "flow"
    && selection.id === node.flowId
  );
}

export function automationHierarchyNodeCanRemainPrimary(node: AutomationHierarchyNode, selection: AutomationSelection | null): boolean {
  if (automationHierarchyNodeMatchesSelection(node, selection)) return true;
  return Boolean(node.flowId && node.kind !== "flow" && selection?.kind === "flow" && selection.id === node.flowId);
}

export function automationHierarchyPrimaryNode(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): AutomationHierarchyNode {
  if (node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string") {
    return nodes.find((candidate) => candidate.parentId === node.id && candidate.metadata?.flowStructure === "subflow-nodes" && candidate.flowId === node.metadata?.graphFlowId) ?? node;
  }
  return automationHierarchyRouterPrimaryNode(node, nodes);
}

export function automationHierarchyPrimaryNodeId(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): string {
  return automationHierarchyPrimaryNode(node, nodes).id;
}
export function automationHierarchyRouterPrimaryNode(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): AutomationHierarchyNode {
  if (node.kind !== "flow" || !node.sourceId) return node;
  return nodes.find((candidate) => candidate.viewId === "flow-router" && candidate.flowId === node.sourceId) ?? node;
}

export function automationHierarchyRouterPrimaryNodeId(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): string {
  return automationHierarchyRouterPrimaryNode(node, nodes).id;
}
export function automationHierarchySettingsPrimaryNodeId(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[]): string {
  if (!node.sourceId) return node.id;
  return nodes.find((candidate) => candidate.viewId === "flow-settings" && candidate.flowId === node.sourceId)?.id ?? node.id;
}
