"use client";

import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Settings, Trash2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import { Menu } from "../../programs/shared-ui";
import { nextAutomationHierarchyRowLimit, selectAutomationHierarchyRowWindow } from "./bounded-rows";
import { automationHierarchyRowActionIds } from "./capabilities";
import type { AutomationHierarchyCommands } from "./commands";
import type { AutomationHierarchyIndex, AutomationHierarchyNode } from "./model";
import { automationHierarchyPageKey, type AutomationHierarchyPageInfo } from "./paged-cache";
import { automationHierarchyNodeSelectionState } from "./selectors";
import { automationHierarchyIconForNode } from "./tree-icons";

export type AutomationHierarchyTreeRowsProps = {
  nodes: AutomationHierarchyNode[];
  activeViewId: string | undefined;
  allNodes: AutomationHierarchyNode[];
  hierarchyIndex: AutomationHierarchyIndex;
  visibleIds: Set<string>;
  collapsedFolderIds: string[];
  primaryTreeNodeId: string | null;
  focusedTreeNodeId: string;
  level: number;
  recordingPrimaryKind: "recording" | null;
  selection: AutomationSelection | null;
  openConfig(node: AutomationHierarchyNode): void;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  onLoadMoreChildren?(parentId: string | null): void;
  onTreeItemFocus(nodeId: string): void;
  pageInfo?: Record<string, AutomationHierarchyPageInfo>;
  parentId: string | null;
  commands: AutomationHierarchyCommands;
  toggleFolder(folderId: string): void;
  unbounded: boolean;
};

export const AutomationHierarchyChildren = memo(function AutomationHierarchyChildren(
  props: AutomationHierarchyTreeRowsProps
) {
  const [limit, setLimit] = useState(100);
  const pageInfo = props.pageInfo?.[automationHierarchyPageKey(props.parentId)];
  const rowWindow = useMemo(() => selectAutomationHierarchyRowWindow({
    rows: props.nodes,
    limit,
    unbounded: props.unbounded,
    ...(pageInfo ? { pageInfo } : {})
  }), [limit, pageInfo, props.nodes, props.unbounded]);

  return (
    <>
      {rowWindow.rows.map((node) => (
        <AutomationHierarchyTreeNode
          key={node.id}
          {...props}
          node={node}
        />
      ))}
      {rowWindow.canLoadMore ? (
        <div className="automation-tree-page-more-wrap" role="none">
          <button
            className="automation-tree-page-more"
            disabled={rowWindow.loading}
            onClick={() => pageInfo
              ? props.onLoadMoreChildren?.(props.parentId)
              : setLimit((current) => nextAutomationHierarchyRowLimit(current))}
            type="button"
          >
            {rowWindow.loadMoreLabel}
          </button>
        </div>
      ) : null}
    </>
  );
});

type AutomationHierarchyTreeNodeProps = AutomationHierarchyTreeRowsProps & {
  node: AutomationHierarchyNode;
};

export const AutomationHierarchyTreeNode = memo(function AutomationHierarchyTreeNode(
  props: AutomationHierarchyTreeNodeProps
) {
  const children = useMemo(
    () => (props.hierarchyIndex.childrenByParentId.get(props.node.id) ?? [])
      .filter((node) => props.visibleIds.has(node.id)),
    [props.hierarchyIndex, props.node.id, props.visibleIds]
  );
  const { primarySelected, correlatedSelected } = automationHierarchyNodeSelectionState({
    node: props.node,
    index: props.hierarchyIndex,
    selection: props.selection,
    ...(props.activeViewId ? { activeViewId: props.activeViewId } : {}),
    primaryTreeNodeId: props.primaryTreeNodeId,
    recordingPrimaryKind: props.recordingPrimaryKind
  });
  const isFolder = props.node.kind === "folder";
  const isContainer = isFolder || children.length > 0;
  const collapsed = props.collapsedFolderIds.includes(props.node.id);
  const actionIds = automationHierarchyRowActionIds(props.node);
  const Icon = automationHierarchyIconForNode(props.node);

  return (
    <div className="automation-tree-branch">
      <div className="automation-tree-item">
        {isContainer && !isFolder ? (
          <button
            className="tree-row-disclosure"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.toggleFolder(props.node.id);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            title={`${collapsed ? "Expand" : "Collapse"} ${props.node.label}`}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${props.node.label}`}
            type="button"
          >
            {collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
        ) : null}
        <button
          aria-expanded={isContainer ? !collapsed : undefined}
          aria-level={props.level}
          aria-selected={primarySelected}
          data-tree-item-id={props.node.id}
          data-tree-parent-id={props.node.parentId ?? "root-flow"}
          role="treeitem"
          tabIndex={props.focusedTreeNodeId === props.node.id ? 0 : -1}
          className={`tree-row-main ${primarySelected ? "selected " : ""}${correlatedSelected ? "correlated " : ""}${isFolder ? "folder-row " : ""}type-${props.node.kind}`}
          onClick={(event) => {
            if (event.detail > 1) return;
            if (isFolder) props.toggleFolder(props.node.id);
            else props.openNode(props.node, "preview");
          }}
          onDoubleClick={() => props.openNode(props.node, "new-window")}
          onFocus={() => props.onTreeItemFocus(props.node.id)}
          title={props.node.label}
          type="button"
        >
          {isFolder ? (
            <>
              {collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              <Icon size={14} aria-hidden />
            </>
          ) : <Icon size={14} aria-hidden />}
          <span><strong>{props.node.label}</strong><small>{props.node.kind}</small></span>
        </button>
        {actionIds.length ? (
          <div className="automation-tree-row-menu">
            <Menu
              icon={<MoreHorizontal size={14} aria-hidden />}
              iconOnly
              label={props.node.label + " actions"}
              options={actionIds.map((actionId) => {
                if (actionId === "create-child") {
                  return {
                    id: actionId,
                    label: "Add inside",
                    icon: <Plus size={14} aria-hidden />,
                    onSelect: () => props.commands.create({ parentId: props.node.id, parent: props.node })
                  };
                }
                if (actionId === "open-settings") {
                  return {
                    id: actionId,
                    label: "Open settings",
                    icon: <Settings size={14} aria-hidden />,
                    onSelect: () => props.openConfig(props.node)
                  };
                }
                return {
                  id: actionId,
                  label: "Delete",
                  icon: <Trash2 size={14} aria-hidden />,
                  danger: true,
                  onSelect: () => props.commands.delete(props.node)
                };
              })}
            />
          </div>
        ) : null}
      </div>
      {children.length && !collapsed ? (
        <div className="automation-tree-children" role="group">
          <AutomationHierarchyChildren
            {...props}
            nodes={children}
            parentId={props.node.id}
            level={props.level + 1}
          />
        </div>
      ) : null}
    </div>
  );
});