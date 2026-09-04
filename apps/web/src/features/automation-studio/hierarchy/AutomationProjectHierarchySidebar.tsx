"use client";

import { ChevronLeft, ChevronRight, FolderOpen, Search, X } from "lucide-react";
import { memo, useRef, useSyncExternalStore } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationHierarchyAction, AutomationHierarchyKind, AutomationHierarchyNode } from "./contracts";
import type { AutomationHierarchyPageInfo } from "./paged-cache";
import { AutomationProjectTree } from "./ProjectTree";
import { createAutomationHierarchyProjectionSelector } from "./selectors";
import type { AutomationHierarchyUiCoordinator } from "./ui-coordinator";

export const AutomationProjectHierarchySidebar = memo(function AutomationProjectHierarchySidebar(props: {
  activeViewId: string;
  childPageInfo?: Record<string, AutomationHierarchyPageInfo>;
  collapsed: boolean;
  coordinator: AutomationHierarchyUiCoordinator;
  loadMoreChildren?(parentId: string | null): void;
  nodes: AutomationHierarchyNode[];
  onCloseProject(): void;
  onToggleCollapsed(): void;
  openSubflow(node: AutomationHierarchyNode, mode: "preview" | "new-pane-or-focus"): void;
  openView(viewId: string, mode?: "preview" | "new-pane-or-focus"): void;
  projectName: string;
  recordingPrimaryKind: "recording" | null;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  selection: AutomationSelection | null;
  setRecordingPrimaryKind(kind: "recording" | null): void;
  setSelection(selection: AutomationSelection): void;
}) {
  const ui = useSyncExternalStore(props.coordinator.subscribe, props.coordinator.getSnapshot, props.coordinator.getSnapshot);
  const projectionSelectorRef = useRef<ReturnType<typeof createAutomationHierarchyProjectionSelector> | null>(null);
  if (!projectionSelectorRef.current) {
    projectionSelectorRef.current = createAutomationHierarchyProjectionSelector();
  }
  const projection = projectionSelectorRef.current(props.nodes, ui.filter.search, ui.filter.typeFilter);
  const updateFilters = (next: { search: string; typeFilter: "all" | AutomationHierarchyKind }) => {
    props.coordinator.setFilter(next);
  };

  return (
    <aside aria-label="Project hierarchy" className="automation-studio-sidebar" id="automation-project-hierarchy">
      <div className="automation-studio-sidebar-heading">
        {!props.collapsed ? <strong title={props.projectName}>{props.projectName}</strong> : null}
        <div className="inline-actions">
          {props.collapsed ? <button className="icon-button automation-sidebar-heading-action" onClick={props.onCloseProject} title="Back to projects" aria-label="Back to projects" type="button"><FolderOpen size={15} aria-hidden /></button> : null}
          <button aria-controls="automation-project-hierarchy" aria-expanded={!props.collapsed} className="icon-button automation-sidebar-heading-action automation-sidebar-collapse-toggle" onClick={props.onToggleCollapsed} title={props.collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"} type="button">
            {props.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronLeft size={14} aria-hidden />}
          </button>
        </div>
      </div>
      {!props.collapsed ? <div className="automation-sidebar-tools">
        <label className="automation-tree-search">
          <Search size={14} aria-hidden />
          <span className="sr-only">Search project hierarchy</span>
          <input aria-label="Search project hierarchy" onChange={(event) => updateFilters({ ...ui.filter, search: event.target.value })} placeholder="Search objects" type="search" value={ui.filter.search} />
          {ui.filter.search ? <button aria-label="Clear hierarchy search" className="automation-tree-search-clear" onClick={() => updateFilters({ ...ui.filter, search: "" })} type="button"><X size={13} aria-hidden /></button> : null}
        </label>
        <div className="automation-tree-filter-row">
          <label>
            <span className="sr-only">Filter project object type</span>
            <select aria-label="Filter project object type" onChange={(event) => updateFilters({ ...ui.filter, typeFilter: event.target.value as "all" | AutomationHierarchyKind })} value={ui.filter.typeFilter}>
              <option value="all">All objects</option>
              <option value="flow">Flows</option>
              <option value="folder">Folders</option>
              <option value="subflow">Subflows</option>
              <option value="flow-object">Flow objects</option>
              <option value="instruction">Instructions</option>
              <option value="adaptation">Adaptations</option>
              <option value="recording">Recordings</option>
              <option value="run">Runs</option>
            </select>
          </label>
          <small aria-live="polite">{projection.matchCount} match{projection.matchCount === 1 ? "" : "es"}</small>
        </div>
      </div> : null}
      {!props.collapsed ? <AutomationProjectTree
        nodes={props.nodes}
        projection={projection}
        activeViewId={props.activeViewId}
        selection={props.selection}
        recordingPrimaryKind={props.recordingPrimaryKind}
        setRecordingPrimaryKind={props.setRecordingPrimaryKind}
        search={ui.filter.search}
        typeFilter={ui.filter.typeFilter}
        setSelection={props.setSelection}
        openSubflow={props.openSubflow}
        openView={props.openView}
        requestAction={props.requestAction}
        uiState={ui.tree}
        onUiStateChange={props.coordinator.setTree}
        {...(props.childPageInfo ? { childPageInfo: props.childPageInfo } : {})}
        {...(props.loadMoreChildren ? { loadMoreChildren: props.loadMoreChildren } : {})}
      /> : null}
    </aside>
  );
});
