"use client";

import { ChevronDown, ChevronRight, Plus, Workflow } from "lucide-react";
import { memo } from "react";
import type { createAutomationHierarchyCommands } from "../commands";

// The fixed "Flows" root row at the top of the project tree: it collapses the
// whole tree and offers "Add Flow" at the top level.
export const AutomationHierarchyRootFlowRow = memo(function AutomationHierarchyRootFlowRow(props: {
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
