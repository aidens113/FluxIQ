"use client";

import { Bug, ChevronDown, ChevronRight, ClipboardList, FileCode2, FileText, FolderOpen, GitBranch, History, ListChecks, Network, Plus, Radio, Route, Settings, SlidersHorizontal, Sparkles, Trash2, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AutomationHierarchyAction, AutomationHierarchyKind, AutomationHierarchyNode } from "./model";
import { automationHierarchyNodeCanCreateChildFolder, automationHierarchyNodeCanDelete, collectHierarchyAncestorIds, sortAutomationHierarchyNodes } from "./model";
import type { AutomationSelection } from "../types";

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
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
}) {
  const singleClickTimer = useRef<number | null>(null);
  const [primaryTreeNodeId, setPrimaryTreeNodeId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>([]);
  const [expandedDefaultCollapsedIds, setExpandedDefaultCollapsedIds] = useState<string[]>([]);
  const matches = (node: AutomationHierarchyNode) => (props.typeFilter === "all" || props.typeFilter === node.kind) && (!props.search || `${node.label} ${node.kind}`.toLowerCase().includes(props.search.toLowerCase()));
  const visibleIds = new Set(props.nodes.filter(matches).flatMap((node) => [node.id, ...collectHierarchyAncestorIds(node.parentId, props.nodes)]));
  const activeSubflowContainerIds = new Set(props.nodes
    .filter((node) => node.kind === "subflow" && props.selection?.kind === "flow" && node.metadata?.graphFlowId === props.selection.id)
    .map((node) => node.id));
  const effectiveCollapsedFolderIds = [
    ...collapsedFolderIds.filter((id) => !activeSubflowContainerIds.has(id)),
    ...props.nodes.filter((node) => node.metadata?.defaultCollapsed === true && !expandedDefaultCollapsedIds.includes(node.id) && !activeSubflowContainerIds.has(node.id)).map((node) => node.id)
  ];
  useEffect(() => () => {
    if (singleClickTimer.current !== null) window.clearTimeout(singleClickTimer.current);
  }, []);
  const cancelPendingOpen = () => {
    if (singleClickTimer.current !== null) {
      window.clearTimeout(singleClickTimer.current);
      singleClickTimer.current = null;
    }
  };
  const requestTreeAction = (action: NonNullable<AutomationHierarchyAction>) => {
    cancelPendingOpen();
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
    cancelPendingOpen();
    if (node.kind === "folder") return;
    const open = () => {
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
      props.openView(targetNode.viewId ?? (targetNode.kind === "flow" || targetNode.kind === "task" ? "policy-primary" : targetNode.kind === "routine" ? "routine-editor" : targetNode.kind === "recording" ? "timeline-recording" : targetNode.kind === "client" ? "client-gateway" : targetNode.kind === "proposal" ? "proposal-workbench" : targetNode.kind === "run" ? "runs-history" : "flow-settings"), mode);
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
  const openSettingsFromTree = (node: AutomationHierarchyNode) => {
    cancelPendingOpen();
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
    const node = props.nodes.find((candidate) => candidate.id === folderId);
    if (node?.metadata?.defaultCollapsed === true) {
      setExpandedDefaultCollapsedIds((current) => current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]);
      return;
    }
    setCollapsedFolderIds((current) => current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]);
  };
  return (
    <nav className="automation-project-tree" aria-label="Automation Studio project tree">
      <section className="automation-folder-root root-flow">
        <div className="automation-tree-item root-folder">
          <button className="type-folder category-root category-flow" onClick={() => toggleFolder("root-flow")} type="button">
            {collapsedFolderIds.includes("root-flow") ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            <span><strong>Flows</strong><small>Product automations</small></span>
          </button>
          <button className="tree-row-action" onClick={(event) => { event.preventDefault(); event.stopPropagation(); requestTreeAction({ action: "create", category: "flow", parentId: null }); }} onPointerDown={(event) => event.stopPropagation()} title="Add Flow" aria-label="Add Flow" type="button"><Plus size={13} aria-hidden /></button>
        </div>
        {!collapsedFolderIds.includes("root-flow") ? <div className="automation-tree-children root-children">
          <AutomationHierarchyChildren nodes={sortAutomationHierarchyNodes(props.nodes.filter((node) => node.parentId === null && node.category === "flow" && visibleIds.has(node.id)))} activeViewId={props.activeViewId} allNodes={props.nodes} visibleIds={visibleIds} collapsedFolderIds={effectiveCollapsedFolderIds} primaryTreeNodeId={primaryTreeNodeId} recordingPrimaryKind={props.recordingPrimaryKind} selection={props.selection} openConfig={openSettingsFromTree} openNode={openFromTree} requestAction={requestTreeAction} toggleFolder={toggleFolder} />
          {!props.nodes.some((node) => node.parentId === null && node.category === "flow" && visibleIds.has(node.id)) ? <div className="automation-tree-empty">No flows match the current filter.</div> : null}
        </div> : null}
      </section>
    </nav>
  );
}

export function AutomationHierarchyTreeNode(props: {
  node: AutomationHierarchyNode;
  activeViewId: string | undefined;
  nodes: AutomationHierarchyNode[];
  visibleIds: Set<string>;
  collapsedFolderIds: string[];
  primaryTreeNodeId: string | null;
  recordingPrimaryKind: "recording" | "proposal" | null;
  selection: AutomationSelection | null;
  openConfig(node: AutomationHierarchyNode): void;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  toggleFolder(folderId: string): void;
}) {
  const children = props.nodes.filter((node) => node.parentId === props.node.id && props.visibleIds.has(node.id));
  const selectionMatched = automationHierarchyNodeMatchesSelection(props.node, props.selection);
  const activeViewMatched = automationHierarchyNodeMatchesActiveFlowView(props.node, props.selection, props.activeViewId);
  const activeChildOwnsFlowSelection = automationHierarchyActiveChildOwnsFlowSelection(props.node, props.nodes, props.selection, props.activeViewId);
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
        <button className={`tree-row-main ${primarySelected ? "selected " : ""}${correlatedSelected ? "correlated " : ""}${isFolder ? "folder-row " : ""}type-${props.node.kind}`} onClick={() => isFolder ? props.toggleFolder(props.node.id) : props.openNode(props.node, "preview")} onDoubleClick={() => props.openNode(props.node, "new-window")} type="button">
          {isFolder ? <>{collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}<Icon size={14} aria-hidden /></> : <Icon size={14} aria-hidden />}
          <span><strong>{props.node.label}</strong><small>{props.node.kind}</small></span>
        </button>
        {canCreateChildFolder ? <button
          className="tree-row-action"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.requestAction({ action: "create", parentId: props.node.id });
          }}
          onPointerDown={(event) => event.stopPropagation()}
          title={`Add inside ${props.node.label}`}
          aria-label={`Add inside ${props.node.label}`}
          type="button"
        ><Plus size={13} aria-hidden /></button> : null}
        {(props.node.kind === "flow" || props.node.kind === "task") && props.node.sourceId ? <button
          className="tree-row-action config"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.openConfig(props.node);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          title={`Open ${props.node.label} settings`}
          aria-label={`Open ${props.node.label} settings`}
          type="button"
        ><Settings size={13} aria-hidden /></button> : null}
        {canDeleteNode ? <button
          className="tree-row-action danger"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.requestAction({ action: "delete", node: props.node });
          }}
          onPointerDown={(event) => event.stopPropagation()}
          title={`Delete ${props.node.label}`}
          aria-label={`Delete ${props.node.label}`}
          type="button"
        ><Trash2 size={13} aria-hidden /></button> : null}
      </div>
      {children.length && !collapsed ? <div className="automation-tree-children"><AutomationHierarchyChildren nodes={sortAutomationHierarchyNodes(children)} activeViewId={props.activeViewId} allNodes={props.nodes} visibleIds={props.visibleIds} collapsedFolderIds={props.collapsedFolderIds} primaryTreeNodeId={props.primaryTreeNodeId} recordingPrimaryKind={props.recordingPrimaryKind} selection={props.selection} openConfig={props.openConfig} openNode={props.openNode} requestAction={props.requestAction} toggleFolder={props.toggleFolder} /></div> : null}
    </div>
  );
}

function automationHierarchyIconForNode(node: AutomationHierarchyNode): LucideIcon {
  if (node.kind === "folder") {
    if (node.viewId === "timeline-recording") return Radio;
    if (node.viewId === "proposal-workbench" || node.viewId === "change-proposals") return Sparkles;
    if (node.viewId === "runs-history") return History;
    if (node.viewId === "adaptations") return ClipboardList;
    if (node.label === "Subflows") return Workflow;
    return FolderOpen;
  }
  if (node.viewId === "flow-instructions" || node.kind === "instruction") return ListChecks;
  if (node.viewId === "change-proposals" || node.kind === "change-proposal" || node.kind === "proposal") return Sparkles;
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
  visibleIds: Set<string>;
  collapsedFolderIds: string[];
  primaryTreeNodeId: string | null;
  recordingPrimaryKind: "recording" | "proposal" | null;
  selection: AutomationSelection | null;
  openConfig(node: AutomationHierarchyNode): void;
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
          activeViewId={props.activeViewId}
          nodes={props.allNodes}
          visibleIds={props.visibleIds}
          collapsedFolderIds={props.collapsedFolderIds}
          primaryTreeNodeId={props.primaryTreeNodeId}
          recordingPrimaryKind={props.recordingPrimaryKind}
          selection={props.selection}
          openConfig={props.openConfig}
          openNode={props.openNode}
          requestAction={props.requestAction}
          toggleFolder={props.toggleFolder}
        />
      ))}
    </>
  );
}

function automationHierarchyActiveChildOwnsFlowSelection(node: AutomationHierarchyNode, nodes: AutomationHierarchyNode[], selection: AutomationSelection | null, activeViewId?: string): boolean {
  const ownedFlowId = node.kind === "flow"
    ? node.sourceId
    : node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string" ? node.metadata.graphFlowId : null;
  return Boolean(
    ownedFlowId
    && selection?.kind === "flow"
    && selection.id === ownedFlowId
    && activeViewId
    && nodes.some((candidate) => candidate.parentId === node.id && candidate.flowId === ownedFlowId && candidate.viewId === activeViewId)
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
