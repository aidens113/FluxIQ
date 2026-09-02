"use client";

import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Settings, Trash2 } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { Menu } from "../../programs/shared-ui";
import type { AutomationSelection } from "../shared/selection-contracts";
import { automationHierarchyRowActionIds } from "./capabilities";
import type { AutomationHierarchyCommands } from "./commands";
import type { AutomationHierarchyIndex } from "./indexing";
import { automationHierarchyNodeSelectionState } from "./selectors";
import { automationHierarchyIconForNode } from "./tree-icons";
import type { AutomationHierarchyFlatNodeRow } from "./virtualized-tree";

export type AutomationHierarchyTreeRowProps = {
  row: AutomationHierarchyFlatNodeRow;
  activeViewId?: string;
  commands: AutomationHierarchyCommands;
  hierarchyIndex: AutomationHierarchyIndex;
  primaryTreeNodeId: string | null;
  focusedTreeNodeId: string;
  recordingPrimaryKind: "recording" | null;
  selection: AutomationSelection | null;
  openConfig(node: AutomationHierarchyFlatNodeRow["node"]): void;
  openNode(node: AutomationHierarchyFlatNodeRow["node"], mode: "preview" | "new-pane-or-focus"): void;
  onTreeItemFocus(nodeId: string): void;
  toggleFolder(folderId: string): void;
};

export const AutomationHierarchyTreeRow = memo(function AutomationHierarchyTreeRow(
  props: AutomationHierarchyTreeRowProps
) {
  const { node } = props.row;
  const { primarySelected, correlatedSelected } = automationHierarchyNodeSelectionState({
    node,
    index: props.hierarchyIndex,
    selection: props.selection,
    ...(props.activeViewId ? { activeViewId: props.activeViewId } : {}),
    primaryTreeNodeId: props.primaryTreeNodeId,
    recordingPrimaryKind: props.recordingPrimaryKind
  });
  const actionIds = automationHierarchyRowActionIds(node);
  const canCreateChild = actionIds.includes("create-child");
  const menuActionIds = actionIds.filter((actionId) => actionId !== "create-child");
  const Icon = automationHierarchyIconForNode(node);
  const isFolder = node.kind === "folder";
  return (
    <div
      aria-expanded={props.row.isContainer ? !props.row.collapsed : undefined}
      aria-label={node.label}
      aria-level={props.row.level}
      aria-posinset={props.row.positionInSet}
      aria-setsize={props.row.setSize}
      aria-selected={primarySelected}
      className="automation-tree-item automation-tree-virtual-item"
      data-tree-item-id={node.id}
      data-tree-parent-id={props.row.parentId}
      onFocus={() => props.onTreeItemFocus(node.id)}
      role="treeitem"
      style={{ paddingInlineStart: `${Math.max(0, props.row.level - 2) * 14}px` } as CSSProperties}
      tabIndex={props.focusedTreeNodeId === node.id ? 0 : -1}
    >
      <span aria-hidden={!props.row.isContainer || undefined} className="tree-row-disclosure-slot">
        {props.row.isContainer ? (
          <button
            aria-expanded={!props.row.collapsed}
            className="tree-row-disclosure"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.toggleFolder(node.id);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            title={`${props.row.collapsed ? "Expand" : "Collapse"} ${node.label}`}
            aria-label={`${props.row.collapsed ? "Expand" : "Collapse"} ${node.label}`}
            tabIndex={-1}
            type="button"
          >
            {props.row.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
        ) : null}
      </span>
      <button
        className={`tree-row-main ${primarySelected ? "selected " : ""}${correlatedSelected ? "correlated " : ""}type-${node.kind}`}
        onClick={(event) => {
          if (event.detail > 1) return;
          if (isFolder) props.toggleFolder(node.id);
          else props.openNode(node, "preview");
        }}
        onDoubleClick={() => props.openNode(node, "new-pane-or-focus")}
        tabIndex={-1}
        title={node.label}
        type="button"
      >
        <Icon size={14} aria-hidden />
        <span className="tree-row-label"><strong>{node.label}</strong><small>{node.kind}</small></span>
      </button>
      {canCreateChild ? (
        <button
          aria-label={`Add inside ${node.label}`}
          className="tree-row-action"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.commands.create({ parentId: node.id, parent: node });
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          title={`Add inside ${node.label}`}
          type="button"
        >
          <Plus size={14} aria-hidden />
        </button>
      ) : null}
      {menuActionIds.length ? (
        <div className="automation-tree-row-menu">
          <Menu
            icon={<MoreHorizontal size={14} aria-hidden />}
            iconOnly
            label={node.label + " actions"}
            options={menuActionIds.map((actionId) => {
              if (actionId === "open-settings") return {
                id: actionId,
                label: "Open settings",
                icon: <Settings size={14} aria-hidden />,
                onSelect: () => props.openConfig(node)
              };
              return {
                id: actionId,
                label: "Delete",
                icon: <Trash2 size={14} aria-hidden />,
                danger: true,
                onSelect: () => props.commands.delete(node)
              };
            })}
          />
        </div>
      ) : null}
    </div>
  );
});
