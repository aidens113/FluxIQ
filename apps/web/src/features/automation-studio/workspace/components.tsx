"use client";

import { Columns3, Maximize2, Minimize2, Plus, RefreshCcw, XCircle } from "lucide-react";
import type { MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { Blocks } from "lucide-react";
import type { AutomationViewInstance } from "../types";
import { automationLayoutPresetOptions, defaultAutomationWorkspacePrefs, type AutomationLayoutPickerState, type AutomationLayoutPreset, type AutomationLayoutPresetOption, type AutomationWindowAdderState, type AutomationWindowResizeEdge, type AutomationWorkspaceArea, type AutomationWorkspacePrefs } from "./layout";

export function viewTitle(view: AutomationViewInstance): string {
  if (view.type === "design") return "Flow Editor";
  if (view.type === "recordings") return "Timeline";
  if (view.type === "proposal") return "Proposal";
  if (view.type === "signals") return "Relationship Web";
  if (view.type === "runtime") return "Runtime Debug";
  if (view.type === "problems") return "Problems";
  if (view.type === "assistant") return "AI Assistant";
  if (view.type === "clients") return "Connected Clients";
  if (view.type === "runs") return "Runs";
  if (view.type === "state") return "State View";
  if (view.type === "inspector") return "Inspector";
  if (view.type === "dock") return "Workspace Dock";
  if (view.type === "routine") return "Legacy Routine (read-only)";
  if (view.type === "config") return "Configuration";
  return "State Explorer";
}

export function AutomationWindowAdderPalette(props: { area: AutomationWorkspaceArea; anchor: AutomationWindowAdderState["anchor"]; targetWindowId?: string; views: AutomationViewInstance[]; onAdd(viewId: string, area: AutomationWorkspaceArea, targetWindowId?: string): void }) {
  const groups = [
    { title: "Workflow", ids: ["client-gateway", "timeline-recording", "proposal-workbench", "policy-primary", "runs-history"] },
    { title: "Editors", ids: ["config-default"] },
    { title: "Evidence", ids: ["state-explorer", "signals-web", "runtime-debug", "problems-view"] },
    { title: "Tools", ids: ["global-inspector", "workspace-dock", "ai-assistant"] }
  ];
  const byId = new Map(props.views.map((view) => [view.id, view]));
  return (
    <section className="automation-window-adder-panel" style={automationWindowAdderPanelStyle(props.area, props.anchor)}>
      <header><strong>{props.targetWindowId ? "Add Tab" : "Add Window"}</strong><span>{props.targetWindowId ? "Open a new tab in this inner window" : "Open a new inner window in the workspace"}</span></header>
      {groups.map((group) => (
        <section key={group.title}>
          <strong>{group.title}</strong>
          <div>
            {group.ids.map((id) => {
              const view = byId.get(id);
              if (!view) return null;
              const Icon = view.icon;
              return (
                <button key={view.id} onClick={() => props.onAdd(view.id, props.area, props.targetWindowId)} type="button">
                  <Icon size={16} aria-hidden />
                  <span><strong>{viewTitle(view)}</strong><small>{automationWindowDescription(view)}</small></span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

export function automationWindowAdderPanelStyle(area: AutomationWorkspaceArea, anchor: AutomationWindowAdderState["anchor"]) {
  const gap = 8;
  const margin = 12;
  const width = Math.min(420, window.innerWidth - 48);
  const height = Math.min(620, window.innerHeight - 126);
  const left = area === "right"
    ? Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.right - width))
    : Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.left));
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, anchor.bottom + gap));
  return { left, top, width };
}

export function AutomationLayoutPicker(props: { area: AutomationWorkspaceArea; anchor: AutomationLayoutPickerState["anchor"]; onArrange(preset: AutomationLayoutPreset, area: AutomationWorkspaceArea): void }) {
  const options = automationLayoutOptionsForArea(props.area);
  return (
    <section className="automation-layout-picker-panel" style={automationFloatingPanelStyle(props.area, props.anchor, 320, 280)}>
      <header><strong>Arrange Windows</strong><span>{automationAreaLabel(props.area)}</span></header>
      <div className="automation-layout-picker-grid">
        {options.map((preset) => (
          <button key={preset.id} onClick={() => props.onArrange(preset.id, props.area)} title={preset.title} type="button">
            <span className="automation-layout-icon" aria-hidden>
              {preset.cells.map((cell, index) => <i key={index} style={{ left: `${cell.x * 100}%`, top: `${cell.y * 100}%`, width: `${cell.w * 100}%`, height: `${cell.h * 100}%` }} />)}
            </span>
            <span><strong>{preset.label}</strong><small>{preset.title}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function automationLayoutOptionsForArea(area: AutomationWorkspaceArea): AutomationLayoutPresetOption[] {
  if (area === "right") return automationLayoutPresetOptions.filter((item) => item.id === "single" || item.id === "two-rows");
  return automationLayoutPresetOptions.filter((item) => item.id !== "two-rows");
}

export function automationAreaLabel(area: AutomationWorkspaceArea): string {
  if (area === "right") return "Right Sidebar";
  return "Main";
}

export function automationFloatingPanelStyle(area: AutomationWorkspaceArea, anchor: AutomationWindowAdderState["anchor"], maxWidth: number, maxHeight: number) {
  const gap = 8;
  const margin = 12;
  const width = Math.min(maxWidth, window.innerWidth - 48);
  const height = Math.min(maxHeight, window.innerHeight - 126);
  const left = area === "right"
    ? Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.right - width))
    : Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.left));
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, anchor.bottom + gap));
  return { left, top, width };
}

export function automationWindowDescription(view: AutomationViewInstance): string {
  if (view.type === "design") return "Edit learned task nodes and edges.";
  if (view.type === "routine") return "Build routine orchestration graphs.";
  if (view.type === "config") return "Edit project configuration values.";
  if (view.type === "recordings") return "Review raw timeline evidence and notes.";
  if (view.type === "proposal") return "Review and apply generated proposals.";
  if (view.type === "signals") return "Browse mined state signals.";
  if (view.type === "runtime") return "Inspect live/debug execution state.";
  if (view.type === "runs") return "Inspect replay and validation history.";
  if (view.type === "state") return "Reconstruct selected node state and evidence.";
  if (view.type === "clients") return "Pair remote recorder and action clients.";
  if (view.type === "problems") return "Review validation and authoring issues.";
  if (view.type === "inspector") return "Inspect the current global selection.";
  if (view.type === "dock") return "Assistant, problems, history, and state panels.";
  if (view.type === "assistant") return "Work with AI proposals and context.";
  return "Open this workspace view.";
}

export function AutomationWorkspacePreferences(props: { prefs: AutomationWorkspacePrefs; setPrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs): void }) {
  const setNumber = (key: "sidebarWidth" | "inspectorWidth", value: number) => props.setPrefs((current) => ({ ...current, [key]: value }));
  const resetLayout = () => props.setPrefs(() => defaultAutomationWorkspacePrefs());
  return (
    <section className="automation-preferences-panel">
      <header>
        <div><strong>Workspace Preferences</strong><span>Saved for this task and as the next default</span></div>
        <button className="button" onClick={resetLayout} type="button">Reset</button>
      </header>
      <div className="automation-preference-group">
        <strong>Frame</strong>
        <PreferenceSlider label="Sidebar" max={420} min={220} unit="px" value={props.prefs.sidebarWidth} onChange={(value) => setNumber("sidebarWidth", value)} />
        <PreferenceSlider label="Right area" max={620} min={260} unit="px" value={props.prefs.inspectorWidth} onChange={(value) => setNumber("inspectorWidth", value)} />
      </div>
      <div className="automation-preference-group">
        <strong>Window Canvas</strong>
        <p className="muted-text">Drag window title bars to move panes. Drag edges or corners to resize them. Reset restores the default single-window layout.</p>
      </div>
    </section>
  );
}

export function PreferenceSlider(props: { label: string; min: number; max: number; unit: string; value: number; note?: string; onChange(value: number): void }) {
  return (
    <label className="automation-preference-row">
      <span>{props.label}</span>
      <input max={props.max} min={props.min} onChange={(event) => props.onChange(Number(event.target.value))} type="range" value={props.value} />
      <output>{props.note ?? `${props.value}${props.unit}`}</output>
    </label>
  );
}

export function AutomationViewContainer(props: {
  active: boolean;
  activeViewId: string;
  canPageFullscreen: boolean;
  children: ReactNode;
  icon: typeof Blocks;
  pageFullscreen: boolean;
  tabs: AutomationViewInstance[];
  windowId: string;
  windowIndex: number;
  subtitle: string;
  title: string;
  onActivate(): void;
  onAddTab(event: MouseEvent<HTMLButtonElement>): void;
  onClose(): void;
  onCloseTab(viewId: string): void;
  onMoveStart(event: ReactPointerEvent<HTMLElement>): void;
  onPageFullscreen(): void;
  onResetSize(): void;
  onResizeStart(edge: AutomationWindowResizeEdge, event: ReactPointerEvent<HTMLButtonElement>): void;
  onTabSelect(viewId: string): void;
}) {
  const Icon = props.icon;
  return (
    <section className={props.active ? "automation-view-container active" : "automation-view-container"} data-automation-window-id={props.windowId} onMouseDown={props.onActivate}>
      <header onPointerDown={props.onMoveStart}>
        <div>
          <Icon size={15} aria-hidden />
          <span><strong>{props.title}</strong><small>Window {props.windowIndex + 1} - {props.subtitle}</small></span>
        </div>
        <div className="automation-pane-actions">
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onAddTab(event); }} title="Add tab" aria-label="Add tab" type="button"><Plus size={13} aria-hidden /></button>
          {props.canPageFullscreen ? <button
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              props.onPageFullscreen();
            }}
            title={props.pageFullscreen ? "Exit full page" : "Fill page"}
            aria-label={props.pageFullscreen ? "Exit full page" : "Fill page"}
            type="button"
          >{props.pageFullscreen ? <Minimize2 size={13} aria-hidden /> : <Maximize2 size={13} aria-hidden />}</button> : null}
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onResetSize(); }} title="Reset window size" aria-label="Reset window size" type="button"><RefreshCcw size={13} aria-hidden /></button>
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onClose(); }} title="Close window" aria-label="Close window" type="button"><XCircle size={13} aria-hidden /></button>
        </div>
      </header>
      <div className="automation-window-tabs" onMouseDown={(event) => event.stopPropagation()} role="tablist" aria-label={`Window ${props.windowIndex + 1} tabs`}>
        {props.tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button className={tab.id === props.activeViewId ? "selected" : ""} key={tab.id} onClick={(event) => { event.stopPropagation(); props.onTabSelect(tab.id); }} role="tab" title={tab.label} aria-selected={tab.id === props.activeViewId} type="button">
              <TabIcon size={13} aria-hidden />
              <span>{tab.label}</span>
              <span className="tab-close" onClick={(event) => { event.stopPropagation(); props.onCloseTab(tab.id); }}>x</span>
            </button>
          );
        })}
      </div>
      <div className="automation-view-body">{props.children}</div>
      <button className="automation-window-resize-edge top" onPointerDown={(event) => props.onResizeStart("north", event)} title="Resize height" aria-label="Resize height from top" type="button" />
      <button className="automation-window-resize-edge right" onPointerDown={(event) => props.onResizeStart("east", event)} title="Resize width" aria-label="Resize width from right" type="button" />
      <button className="automation-window-resize-edge bottom" onPointerDown={(event) => props.onResizeStart("south", event)} title="Resize height" aria-label="Resize height from bottom" type="button" />
      <button className="automation-window-resize-edge left" onPointerDown={(event) => props.onResizeStart("west", event)} title="Resize width" aria-label="Resize width from left" type="button" />
      <button className="automation-window-resize-corner top-left" onPointerDown={(event) => props.onResizeStart("north-west", event)} title="Resize window" aria-label="Resize window from top left" type="button" />
      <button className="automation-window-resize-corner top-right" onPointerDown={(event) => props.onResizeStart("north-east", event)} title="Resize window" aria-label="Resize window from top right" type="button" />
      <button className="automation-window-resize-corner bottom-left" onPointerDown={(event) => props.onResizeStart("south-west", event)} title="Resize window" aria-label="Resize window from bottom left" type="button" />
      <button className="automation-window-resize-corner bottom-right" onPointerDown={(event) => props.onResizeStart("south-east", event)} title="Resize window" aria-label="Resize window from bottom right" type="button" />
    </section>
  );
}

