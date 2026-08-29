"use client";

import { ChevronLeft, ChevronRight, FolderOpen, Search, X } from "lucide-react";
import { memo, useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import type {
  AutomationHierarchyAction,
  AutomationHierarchyKind,
  AutomationHierarchyNode
} from "./model";
import { AutomationProjectTree } from "./ProjectTree";
import type { AutomationHierarchyPageInfo } from "./paged-cache";
import type { AutomationHierarchyUiState } from "./store";
export const AutomationProjectHierarchySidebar = memo(function AutomationProjectHierarchySidebar(props: {
  activeViewId: string;
  childPageInfo?: Record<string, AutomationHierarchyPageInfo>;
  collapsed: boolean;
  initialSearch: string;
  initialTypeFilter: "all" | AutomationHierarchyKind;
  loadMoreChildren?(parentId: string | null): void;
  nodes: AutomationHierarchyNode[];
  onCloseProject(): void;
  onFilterStateChange(state: { search: string; typeFilter: "all" | AutomationHierarchyKind }): void;
  onResizeKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
  onToggleCollapsed(): void;
  onTreeUiStateChange(state: AutomationHierarchyUiState): void;
  openSubflow(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  openView(viewId: string, mode?: "preview" | "new-window"): void;
  projectName: string;
  recordingPrimaryKind: AutomationHierarchyNode["kind"] | null;
  requestAction(action: NonNullable<AutomationHierarchyAction>): void;
  selection: AutomationSelection | null;
  setRecordingPrimaryKind(kind: "recording" | null): void;
  setSelection(selection: AutomationSelection): void;
  sidebarWidth: number;
  treeUiState: AutomationHierarchyUiState | null;
}) {
  const [filterState, setFilterState] = useState({ search: props.initialSearch, typeFilter: props.initialTypeFilter });
  useEffect(() => {
    setFilterState((current) => current.search === props.initialSearch && current.typeFilter === props.initialTypeFilter
      ? current
      : { search: props.initialSearch, typeFilter: props.initialTypeFilter });
  }, [props.initialSearch, props.initialTypeFilter]);
  const normalizedSearch = filterState.search.trim().toLocaleLowerCase();
  const matchCount = useMemo(() => props.nodes.filter((node) =>
    (filterState.typeFilter === "all" || node.kind === filterState.typeFilter)
    && (!normalizedSearch || (node.label + " " + node.kind).toLocaleLowerCase().includes(normalizedSearch))
  ).length, [filterState.typeFilter, normalizedSearch, props.nodes]);
  const updateFilters = (next: { search: string; typeFilter: "all" | AutomationHierarchyKind }) => {
    setFilterState(next);
    props.onFilterStateChange(next);
  };

  return (
    <aside aria-label="Project hierarchy" className="automation-studio-sidebar">
      <div className="automation-studio-sidebar-heading">
        {!props.collapsed ? <strong title={props.projectName}>{props.projectName}</strong> : null}
        <div className="inline-actions">
          {props.collapsed ? <button className="icon-button" onClick={props.onCloseProject} title="Back to projects" aria-label="Back to projects" type="button"><FolderOpen size={15} aria-hidden /></button> : null}
          <button
            aria-expanded={!props.collapsed}
            className="icon-button"
            onClick={props.onToggleCollapsed}
            title={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            {props.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronLeft size={14} aria-hidden />}
          </button>
        </div>
      </div>
      {!props.collapsed ? <div className="automation-sidebar-tools">
        <label className="automation-tree-search">
          <Search size={14} aria-hidden />
          <span className="sr-only">Search project hierarchy</span>
          <input aria-label="Search project hierarchy" onChange={(event) => updateFilters({ ...filterState, search: event.target.value })} placeholder="Search objects" type="search" value={filterState.search} />
          {filterState.search ? <button aria-label="Clear hierarchy search" className="automation-tree-search-clear" onClick={() => updateFilters({ ...filterState, search: "" })} type="button"><X size={13} aria-hidden /></button> : null}
        </label>
        <div className="automation-tree-filter-row">
          <label>
            <span className="sr-only">Filter project object type</span>
            <select aria-label="Filter project object type" onChange={(event) => updateFilters({ ...filterState, typeFilter: event.target.value as "all" | AutomationHierarchyKind })} value={filterState.typeFilter}>
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
          <small aria-live="polite">{matchCount} match{matchCount === 1 ? "" : "es"}</small>
        </div>
      </div> : null}
      {!props.collapsed ? <AutomationProjectTree
        nodes={props.nodes}
        activeViewId={props.activeViewId}
        selection={props.selection}
        recordingPrimaryKind={props.recordingPrimaryKind === "recording" ? "recording" : null}
        setRecordingPrimaryKind={props.setRecordingPrimaryKind}
        search={filterState.search}
        typeFilter={filterState.typeFilter}
        setSelection={props.setSelection}
        openSubflow={props.openSubflow}
        openView={props.openView}
        requestAction={props.requestAction}
        uiState={props.treeUiState}
        onUiStateChange={props.onTreeUiStateChange}
        {...(props.childPageInfo ? { childPageInfo: props.childPageInfo } : {})}
        {...(props.loadMoreChildren ? { loadMoreChildren: props.loadMoreChildren } : {})}
      /> : null}
      {!props.collapsed ? <div
        aria-label="Resize project hierarchy"
        aria-orientation="vertical"
        aria-valuemax={420}
        aria-valuemin={220}
        aria-valuenow={Math.round(props.sidebarWidth)}
        className="automation-sidebar-resizer"
        onKeyDown={props.onResizeKeyDown}
        onPointerDown={props.onResizePointerDown}
        role="separator"
        tabIndex={0}
        title="Drag to resize. Use Left and Right arrow keys; Home resets."
      /> : null}
    </aside>
  );
});
