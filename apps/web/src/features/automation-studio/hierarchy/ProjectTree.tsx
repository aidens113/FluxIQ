"use client";

import { ChevronDown, ChevronRight, FileText, FolderOpen, GitBranch, History, Plus, Radio, Settings, SlidersHorizontal, Trash2, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AutomationHierarchyAction, AutomationHierarchyCategory, AutomationHierarchyKind, AutomationHierarchyNode } from "./model";
import { automationHierarchyCategories, automationHierarchyCategoryLabel, collectHierarchyAncestorIds, sortAutomationHierarchyNodes } from "./model";
import type { AutomationSelection } from "../types";

export function AutomationProjectTree(props: {
  nodes: AutomationHierarchyNode[];
  search: string;
  typeFilter: "all" | AutomationHierarchyKind;
  selection: AutomationSelection | null;
  recordingPrimaryKind: "recording" | "proposal" | null;
  setRecordingPrimaryKind(kind: "recording" | "proposal" | null): void;
  setSelection(selection: AutomationSelection): void;
  openView(viewId: string, mode?: "preview" | "new-window"): void;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
}) {
  const singleClickTimer = useRef<number | null>(null);
  const [primaryTreeNodeId, setPrimaryTreeNodeId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>([]);
  const matches = (node: AutomationHierarchyNode) => (props.typeFilter === "all" || props.typeFilter === node.kind) && (!props.search || `${node.label} ${node.kind}`.toLowerCase().includes(props.search.toLowerCase()));
  const visibleIds = new Set(props.nodes.filter(matches).flatMap((node) => [node.id, ...collectHierarchyAncestorIds(node.parentId, props.nodes)]));
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
  const openFromTree = (node: AutomationHierarchyNode, mode: "preview" | "new-window") => {
    cancelPendingOpen();
    if (node.kind === "folder") return;
    const open = () => {
      setPrimaryTreeNodeId(node.id);
      if (node.kind === "task" && node.sourceId) props.setSelection({ kind: "policy", id: node.sourceId });
      if (node.kind === "flow" && node.sourceId) props.setSelection({ kind: "flow", id: node.sourceId });
      if (node.kind === "recording" && node.sourceId) {
        props.setRecordingPrimaryKind("recording");
        props.setSelection({ kind: "recording", id: node.sourceId });
      }
      if (node.kind === "proposal" && node.sourceId) {
        props.setRecordingPrimaryKind("proposal");
        props.setSelection({ kind: "proposal", id: node.sourceId, ...(node.recordingId ? { recordingId: node.recordingId } : {}) });
      }
      if ((node.kind === "client" || node.kind === "run") && node.sourceId) props.setSelection({ kind: "workspace", id: node.sourceId as "clients" | "runs" });
      props.openView(node.viewId ?? (node.kind === "flow" || node.kind === "task" ? "policy-primary" : node.kind === "routine" ? "routine-editor" : node.kind === "recording" ? "timeline-recording" : node.kind === "client" ? "client-gateway" : node.kind === "proposal" ? "proposal-workbench" : node.kind === "run" ? "runs-history" : "config-default"), mode);
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
  const openConfigFromTree = (node: AutomationHierarchyNode) => {
    cancelPendingOpen();
    if (!node.sourceId || (node.kind !== "flow" && node.kind !== "task")) return;
    setPrimaryTreeNodeId(node.id);
    props.setSelection(node.kind === "flow" ? { kind: "flow", id: node.sourceId } : { kind: "policy", id: node.sourceId });
    props.openView("config-default", "preview");
  };
  useEffect(() => {
    if (!primaryTreeNodeId) return;
    const primaryNode = props.nodes.find((node) => node.id === primaryTreeNodeId);
    if (!primaryNode || !automationHierarchyNodeMatchesSelection(primaryNode, props.selection)) setPrimaryTreeNodeId(null);
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
  const toggleFolder = (folderId: string) => setCollapsedFolderIds((current) => current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]);
  return (
    <nav className="automation-project-tree" aria-label="Automation Studio project tree">
      {automationHierarchyCategories.map((category) => {
        const rootId = `root-${category.id}`;
        const collapsed = collapsedFolderIds.includes(rootId);
        const rootNodes = props.nodes.filter((node) => node.parentId === null && node.category === category.id && visibleIds.has(node.id));
        const canCreate = category.creatable === true;
        const shouldShowTree = props.typeFilter === "all" || props.typeFilter === "folder" || props.typeFilter === category.id || rootNodes.length > 0;
        if (!shouldShowTree) return null;
        return (
          <section className={`automation-folder-root root-${category.id}`} key={category.id}>
            <div className="automation-tree-item root-folder">
              <button className={`type-folder category-root category-${category.id}`} onClick={() => toggleFolder(rootId)} type="button">
                {collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                <span><strong>{category.label}</strong><small>{category.description}</small></span>
              </button>
              {canCreate ? <button className="tree-row-action" onClick={(event) => { event.preventDefault(); event.stopPropagation(); requestTreeAction({ action: "create", category: category.id, parentId: null }); }} onPointerDown={(event) => event.stopPropagation()} title={`Add inside ${category.label}`} aria-label={`Add inside ${category.label}`} type="button"><Plus size={13} aria-hidden /></button> : null}
            </div>
            {!collapsed ? <div className="automation-tree-children root-children">
              <AutomationHierarchyChildren nodes={sortAutomationHierarchyNodes(rootNodes)} allNodes={props.nodes} visibleIds={visibleIds} collapsedFolderIds={collapsedFolderIds} primaryTreeNodeId={primaryTreeNodeId} recordingPrimaryKind={props.recordingPrimaryKind} selection={props.selection} openConfig={openConfigFromTree} openNode={openFromTree} requestAction={requestTreeAction} toggleFolder={toggleFolder} />
              {!rootNodes.length ? <div className="automation-tree-empty">No {category.label.toLowerCase()} match the current filter.</div> : null}
            </div> : null}
          </section>
        );
      })}
    </nav>
  );
}

export function AutomationHierarchyTreeNode(props: {
  node: AutomationHierarchyNode;
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
  const selected = automationHierarchyNodeMatchesSelection(props.node, props.selection);
  const recordingPrimarySelected = props.selection?.kind === "recording" && props.recordingPrimaryKind ? props.node.kind === props.recordingPrimaryKind : props.node.kind === "recording";
  const primarySelected = selected && (props.primaryTreeNodeId ? props.primaryTreeNodeId === props.node.id : props.selection?.kind === "recording" ? recordingPrimarySelected : true);
  const correlatedSelected = selected && !primarySelected;
  const isFolder = props.node.kind === "folder";
  const isProposalHierarchyNode = props.node.category === "proposal";
  const isStaticWorkspaceNode = props.node.kind === "client" || props.node.kind === "run";
  const collapsed = props.collapsedFolderIds.includes(props.node.id);
  const Icon = props.node.kind === "folder" ? FolderOpen : props.node.kind === "routine" ? Workflow : props.node.kind === "config" ? SlidersHorizontal : props.node.kind === "recording" ? Radio : props.node.kind === "client" ? Radio : props.node.kind === "proposal" ? FileText : props.node.kind === "run" ? History : GitBranch;
  return (
    <div className="automation-tree-branch">
      <div className="automation-tree-item">
        <button className={`${selected ? "selected " : ""}${correlatedSelected ? "correlated " : ""}type-${props.node.kind}`} onClick={() => isFolder ? props.toggleFolder(props.node.id) : props.openNode(props.node, "preview")} onDoubleClick={() => props.openNode(props.node, "new-window")} type="button">
          {isFolder ? (collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />) : <Icon size={14} aria-hidden />}
          <span><strong>{props.node.label}</strong><small>{props.node.kind}</small></span>
        </button>
        {props.node.kind === "folder" && !isProposalHierarchyNode ? <button
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
          title={`Open ${props.node.label} config`}
          aria-label={`Open ${props.node.label} config`}
          type="button"
        ><Settings size={13} aria-hidden /></button> : null}
        {!isStaticWorkspaceNode && (!isProposalHierarchyNode || props.node.kind === "proposal") ? <button
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
      {children.length && !collapsed ? <div className="automation-tree-children"><AutomationHierarchyChildren nodes={sortAutomationHierarchyNodes(children)} allNodes={props.nodes} visibleIds={props.visibleIds} collapsedFolderIds={props.collapsedFolderIds} primaryTreeNodeId={props.primaryTreeNodeId} recordingPrimaryKind={props.recordingPrimaryKind} selection={props.selection} openConfig={props.openConfig} openNode={props.openNode} requestAction={props.requestAction} toggleFolder={props.toggleFolder} /></div> : null}
    </div>
  );
}

export function AutomationHierarchyChildren(props: {
  nodes: AutomationHierarchyNode[];
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

function automationHierarchyNodeMatchesSelection(node: AutomationHierarchyNode, selection: AutomationSelection | null): boolean {
  return Boolean(
    node.sourceId
    && (
      (selection?.kind === "flow" && selection.id === node.sourceId)
      || (selection?.kind === "policy" && selection.id === node.sourceId)
      || (selection?.kind === "recording" && selection.id === node.sourceId)
      || (selection?.kind === "recording" && selection.id === node.recordingId)
      || (selection?.kind === "proposal" && selection.id === node.sourceId)
      || (selection?.kind === "workspace" && selection.id === node.sourceId)
    )
  );
}
