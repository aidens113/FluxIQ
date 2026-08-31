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

export function AutomationHierarchyTreeNode(
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

  return (
    <div className="automation-tree-branch">
      <AutomationHierarchyTreeRow
        collapsed={collapsed}
        commands={props.commands}
        correlatedSelected={correlatedSelected}
        focused={props.focusedTreeNodeId === props.node.id}
        isContainer={isContainer}
        isFolder={isFolder}
        level={props.level}
        node={props.node}
        onTreeItemFocus={props.onTreeItemFocus}
        openConfig={props.openConfig}
        openNode={props.openNode}
        primarySelected={primarySelected}
        toggleFolder={props.toggleFolder}
      />
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
}

type AutomationHierarchyTreeRowProps = {
  collapsed: boolean;
  commands: AutomationHierarchyCommands;
  correlatedSelected: boolean;
  focused: boolean;
  isContainer: boolean;
  isFolder: boolean;
  level: number;
  node: AutomationHierarchyNode;
  onTreeItemFocus(nodeId: string): void;
  openConfig(node: AutomationHierarchyNode): void;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  primarySelected: boolean;
  toggleFolder(folderId: string): void;
};

const AutomationHierarchyTreeRow = memo(function AutomationHierarchyTreeRow(
  props: AutomationHierarchyTreeRowProps
) {
  const actionIds = automationHierarchyRowActionIds(props.node);
  const Icon = automationHierarchyIconForNode(props.node);
  return (
    <div className="automation-tree-item">
      {props.isContainer && !props.isFolder ? (
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
          title={`${props.collapsed ? "Expand" : "Collapse"} ${props.node.label}`}
          aria-label={`${props.collapsed ? "Expand" : "Collapse"} ${props.node.label}`}
          type="button"
        >
          {props.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>
      ) : null}
      <button
        aria-expanded={props.isContainer ? !props.collapsed : undefined}
        aria-level={props.level}
        aria-selected={props.primarySelected}
        data-tree-item-id={props.node.id}
        data-tree-parent-id={props.node.parentId ?? "root-flow"}
        role="treeitem"
        tabIndex={props.focused ? 0 : -1}
        className={`tree-row-main ${props.primarySelected ? "selected " : ""}${props.correlatedSelected ? "correlated " : ""}${props.isFolder ? "folder-row " : ""}type-${props.node.kind}`}
        onClick={(event) => {
          if (event.detail > 1) return;
          if (props.isFolder) props.toggleFolder(props.node.id);
          else props.openNode(props.node, "preview");
        }}
        onDoubleClick={() => props.openNode(props.node, "new-window")}
        title={props.node.label}
        type="button"
      >
        {props.isFolder ? (
          <>
            {props.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
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
  );
});
