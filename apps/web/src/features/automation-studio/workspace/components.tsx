"use client";

import { ChevronLeft, ChevronRight, Columns3, Plus, Search, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { Blocks } from "lucide-react";
import type { AutomationViewInstance } from "../types";
import type { AutomationViewAdderOption } from "./view-adder";
import { automationBottomDockMaxHeight, automationBottomDockMinHeight, automationLayoutPresetOptions, automationStrictMainLayoutPresets, defaultAutomationMainSplitRatios, defaultAutomationWorkspacePrefs, type AutomationLayoutPickerState, type AutomationLayoutPreset, type AutomationLayoutPresetOption, type AutomationWindowAdderState, type AutomationWorkspaceArea, type AutomationWorkspacePrefs, type AutomationStrictMainLayoutPreset } from "./layout";

export function viewTitle(view: AutomationViewInstance): string {
  if (view.type === "design") return "Flow";
  if (view.type === "recordings") return "Timeline";
  if (view.type === "proposal") return "Legacy Proposal";
  if (view.type === "proposal-generator") return "Legacy Proposal Generator";
  if (view.type === "runtime") return "Runtime Debug";
  if (view.type === "problems") return "Problems";
  if (view.type === "subflows") return "Subflows";
  if (view.type === "clients") return "Connected Clients";
  if (view.type === "runs") return "Runs";
  if (view.type === "router") return "Router";
  if (view.type === "adaptations") return "Adaptations";
  if (view.type === "instructions") return "Instructions";
  if (view.type === "settings") return "Settings";
  if (view.type === "state") return "State View";
  if (view.type === "inspector") return "Inspector";
  if (view.type === "routine") return "Legacy Routine (read-only)";
  if (view.type === "config") return "Configuration";
  return "State Explorer";
}

export function AutomationWindowAdderPalette(props: {
  area: AutomationWorkspaceArea;
  anchor: AutomationWindowAdderState["anchor"];
  targetWindowId?: string;
  options: AutomationViewAdderOption[];
  onAdd(viewId: string, area: AutomationWorkspaceArea, targetWindowId?: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const groups: AutomationViewAdderOption["group"][] = ["Flow", "Evidence", "Workspace"];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = props.options.filter((option) => !normalizedQuery || [
    viewTitle(option.view),
    option.view.label,
    automationWindowDescription(option.view),
    option.scope,
    option.placement
  ].join(" ").toLocaleLowerCase().includes(normalizedQuery));

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) props.onClose();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <section aria-label="Add workspace tab" className="automation-window-adder-panel" ref={panelRef} role="dialog" style={automationWindowAdderPanelStyle(props.area, props.anchor)}>
      <header>
        <div><strong>Add Tab</strong><span>{props.area === "right" ? "Inspector" : "Main editor"}</span></div>
        <button aria-label="Close tab picker" className="icon-button" onClick={props.onClose} title="Close" type="button"><X size={14} aria-hidden /></button>
      </header>
      <label className="automation-window-adder-search">
        <Search size={14} aria-hidden />
        <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Find a view" type="search" value={query} />
      </label>
      {groups.map((group) => {
        const options = filtered.filter((option) => option.group === group);
        if (!options.length) return null;
        return (
          <section key={group}>
            <strong>{group}</strong>
            <div>
              {options.map((option) => {
                const Icon = option.view.icon;
                return (
                  <button
                    className="automation-window-adder-option"
                    aria-describedby={"automation-view-option-" + option.view.id}
                    disabled={Boolean(option.disabledReason)}
                    key={option.view.id}
                    onClick={() => props.onAdd(option.view.id, props.area, props.targetWindowId)}
                    type="button"
                  >
                    <Icon size={16} aria-hidden />
                    <span>
                      <strong>{viewTitle(option.view)}</strong>
                      <small id={"automation-view-option-" + option.view.id}>{option.scope} · {option.placement}</small>
                      <small>{option.disabledReason ?? automationWindowDescription(option.view)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!filtered.length ? <p className="automation-window-adder-empty">No matching views.</p> : null}
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
  if (view.type === "proposal") return "Read-only review of a persisted legacy proposal.";
  if (view.type === "proposal-generator") return "Retired recording-proposal compatibility view.";
  if (view.type === "runtime") return "Inspect live/debug execution state.";
  if (view.type === "runs") return "Inspect replay and validation history.";
  if (view.type === "router") return "Edit route rules, groups, fallback, and targets.";
  if (view.type === "subflows") return "Inspect and manage reusable Flow subflows.";
  if (view.type === "adaptations") return "Review and promote runtime adaptations.";
  if (view.type === "instructions") return "Manage scoped LLM instructions.";
  if (view.type === "settings") return "Tune Flow training and approval settings.";
  if (view.type === "state") return "Reconstruct selected node state and evidence.";
  if (view.type === "clients") return "Pair remote recorder and action clients.";
  if (view.type === "problems") return "Review validation and authoring issues.";
  if (view.type === "inspector") return "Inspect the current global selection.";
  return "Open this workspace view.";
}

export function AutomationWorkspacePreferences(props: {
  prefs: AutomationWorkspacePrefs;
  saveStatus: string;
  setPrefs(updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs): void;
}) {
  const setNumber = (key: "sidebarWidth" | "inspectorWidth" | "bottomTimelineHeight", value: number) => props.setPrefs((current) => ({ ...current, [key]: value }));
  const setPreset = (preset: AutomationStrictMainLayoutPreset) => props.setPrefs((current) => ({
    ...current,
    mainLayoutPreset: preset,
    mainSplitRatios: defaultAutomationMainSplitRatios(preset)
  }));
  const resetLayout = () => props.setPrefs(() => defaultAutomationWorkspacePrefs());
  return (
    <div className="automation-preferences-panel">
      <section className="automation-preference-group" aria-labelledby="workspace-frame-preferences">
        <strong id="workspace-frame-preferences">Workspace Frame</strong>
        <PreferenceSlider label="Hierarchy width" max={420} min={220} unit="px" value={props.prefs.sidebarWidth} onChange={(value) => setNumber("sidebarWidth", value)} />
        <PreferenceSlider label="Inspector width" max={620} min={260} unit="px" value={props.prefs.inspectorWidth} onChange={(value) => setNumber("inspectorWidth", value)} />
      </section>
      <section className="automation-preference-group" aria-labelledby="workspace-editor-preferences">
        <strong id="workspace-editor-preferences">Main Editor</strong>
        <label className="automation-preference-row">
          <span>Layout</span>
          <select value={props.prefs.mainLayoutPreset} onChange={(event) => setPreset(event.target.value as AutomationStrictMainLayoutPreset)}>
            {automationStrictMainLayoutPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label} - {preset.title}</option>)}
          </select>
          <output>{automationStrictMainLayoutPresets.find((preset) => preset.id === props.prefs.mainLayoutPreset)?.label}</output>
        </label>
      </section>
      <section className="automation-preference-group" aria-labelledby="workspace-timeline-preferences">
        <strong id="workspace-timeline-preferences">Action Preview</strong>
        <PreferenceSlider label="Dock height" max={automationBottomDockMaxHeight} min={automationBottomDockMinHeight} unit="px" value={props.prefs.bottomTimelineHeight} onChange={(value) => setNumber("bottomTimelineHeight", value)} />
        <label className="automation-preference-row">
          <span>Visible</span>
          <input checked={!props.prefs.bottomTimelineCollapsed} onChange={(event) => props.setPrefs((current) => ({ ...current, bottomTimelineCollapsed: !event.target.checked, bottomDock: { ...current.bottomDock, expanded: event.target.checked } }))} type="checkbox" />
          <output>{props.prefs.bottomTimelineCollapsed ? "Collapsed" : "Open"}</output>
        </label>
      </section>
      <section className="automation-preference-group" aria-labelledby="workspace-display-preferences">
        <strong id="workspace-display-preferences">Display</strong>
        <label className="automation-preference-row">
          <span>Density</span>
          <select value={props.prefs.density} onChange={(event) => props.setPrefs((current) => ({ ...current, density: event.target.value === "compact" ? "compact" : "comfortable" }))}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact operations</option>
          </select>
          <output>{props.prefs.density === "compact" ? "Compact" : "Comfort"}</output>
        </label>
        <label className="automation-preference-row">
          <span>Motion</span>
          <select value={props.prefs.motion} onChange={(event) => props.setPrefs((current) => ({ ...current, motion: event.target.value === "reduce" ? "reduce" : "system" }))}>
            <option value="system">Use system setting</option>
            <option value="reduce">Reduce motion</option>
          </select>
          <output>{props.prefs.motion === "reduce" ? "Reduced" : "System"}</output>
        </label>
      </section>
      <footer className="automation-preferences-footer">
        <output aria-live="polite" className="automation-preferences-save-status">{props.saveStatus}</output>
        <button className="button" onClick={resetLayout} type="button">Reset workspace layout</button>
      </footer>
    </div>
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
  children: ReactNode;
  bodyClassName?: string | undefined;
  icon: typeof Blocks;
  frameLabel?: string;
  tabs: AutomationViewInstance[];
  windowId: string;
  windowIndex: number;
  subtitle: string;
  title: string;
  onActivate(): void;
  onAddTab(event: MouseEvent<HTMLButtonElement>): void;
  onClose(): void;
  onCloseTab(viewId: string): void;
  onMoveTab?(viewId: string, direction: -1 | 1): void;
  onTabDragStart?(viewId: string, event: DragEvent<HTMLButtonElement>): void;
  onTabDrop?(viewId: string | null, placement: "before" | "after" | "end", event: DragEvent<HTMLElement>): void;
  onTabSelect(viewId: string): void;
}) {
  const Icon = props.icon;
  const frameLabel = props.frameLabel ?? "Window";
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabPickerOpen, setTabPickerOpen] = useState(false);
  const [tabQuery, setTabQuery] = useState("");
  const activeTabDomId = `automation-tab-${props.windowId}-${props.activeViewId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const visiblePickerTabs = props.tabs.filter((tab) => tab.label.toLowerCase().includes(tabQuery.trim().toLowerCase()));
  const handleWindowDragOver = props.onTabDrop
    ? (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
    }
    : undefined;
  const handleWindowDrop = props.onTabDrop
    ? (event: DragEvent<HTMLElement>) => props.onTabDrop?.(null, "end", event)
    : undefined;
  return (
    <section
      className={props.active ? "automation-view-container active" : "automation-view-container"}
      data-automation-window-id={props.windowId}
      onDragOver={handleWindowDragOver}
      onDrop={handleWindowDrop}
      onMouseDown={props.active ? undefined : props.onActivate}
    >
      <header className="not-movable">
        <div>
          <Icon size={15} aria-hidden />
          <span><strong>{props.title}</strong><small>{frameLabel} {props.windowIndex + 1} - {props.subtitle}</small></span>
        </div>
        <div className="automation-pane-actions">
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onAddTab(event); }} title="Add tab" aria-label="Add tab" type="button"><Plus size={13} aria-hidden /></button>
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onClose(); }} title="Close active tab" aria-label="Close active tab" type="button"><XCircle size={13} aria-hidden /></button>
        </div>
      </header>
      <div className="automation-tabs-shell" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setTabPickerOpen(false);
      }} onMouseDown={(event) => event.stopPropagation()}>
        <button aria-label="Scroll tabs left" className="automation-tab-scroll" onClick={() => tabsRef.current?.scrollBy({ left: -220, behavior: "auto" })} type="button"><ChevronLeft aria-hidden size={14} /></button>
        <div className="automation-window-tabs" ref={tabsRef} role="tablist" aria-label={`${frameLabel} ${props.windowIndex + 1} tabs`}>
          {props.tabs.map((tab, tabIndex) => {
            const TabIcon = tab.icon;
            const selected = tab.id === props.activeViewId;
            const tabId = `automation-tab-${props.windowId}-${tab.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
            return (
              <div className={selected ? "automation-tab-item selected" : "automation-tab-item"} key={tab.id}>
                <button
                  aria-controls={selected ? `automation-panel-${props.windowId}` : undefined}
                  aria-keyshortcuts={props.onMoveTab ? "Alt+Shift+ArrowLeft Alt+Shift+ArrowRight" : undefined}
                  aria-selected={selected}
                  className="automation-tab-select"
                  draggable={Boolean(props.onTabDragStart)}
                  id={tabId}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      props.onCloseTab(tab.id);
                    }
                  }}
                  onClick={(event) => { event.stopPropagation(); props.onTabSelect(tab.id); }}
                  onDragOver={props.onTabDrop ? (event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; } : undefined}
                  onDragStart={props.onTabDragStart ? (event) => props.onTabDragStart?.(tab.id, event) : undefined}
                  onDrop={props.onTabDrop ? (event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    props.onTabDrop?.(tab.id, event.clientX > bounds.left + bounds.width / 2 ? "after" : "before", event);
                  } : undefined}
                  onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                    if (event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && props.onMoveTab) {
                      event.preventDefault();
                      props.onMoveTab(tab.id, event.key === "ArrowLeft" ? -1 : 1);
                      return;
                    }
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
                      event.preventDefault();
                      props.onCloseTab(tab.id);
                      return;
                    }
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    const nextIndex = event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? props.tabs.length - 1
                        : event.key === "ArrowLeft"
                          ? (tabIndex - 1 + props.tabs.length) % props.tabs.length
                          : (tabIndex + 1) % props.tabs.length;
                    const next = props.tabs[nextIndex];
                    if (!next) return;
                    props.onTabSelect(next.id);
                    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
                  }}
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  title={tab.label}
                  type="button"
                >
                  <TabIcon size={13} aria-hidden />
                  <span>{tab.label}</span>
                </button>
                <button aria-label={`Close ${tab.label}`} className="tab-close" onClick={(event) => { event.stopPropagation(); props.onCloseTab(tab.id); }} title={`Close ${tab.label}`} type="button"><X aria-hidden size={12} /></button>
              </div>
            );
          })}
        </div>
        <button aria-label="Scroll tabs right" className="automation-tab-scroll" onClick={() => tabsRef.current?.scrollBy({ left: 220, behavior: "auto" })} type="button"><ChevronRight aria-hidden size={14} /></button>
        <button aria-expanded={tabPickerOpen} aria-haspopup="dialog" aria-label="Find open tab" className="automation-tab-scroll" onClick={() => setTabPickerOpen((current) => !current)} type="button"><Search aria-hidden size={13} /></button>
        {tabPickerOpen ? (
          <div aria-label="Open tabs" className="automation-tab-picker" role="dialog">
            <label>
              <span>Find open tab</span>
              <input autoFocus onChange={(event) => setTabQuery(event.target.value)} placeholder="Search tabs" type="search" value={tabQuery} />
            </label>
            <div>
              {visiblePickerTabs.length ? visiblePickerTabs.map((tab) => (
                <button className={tab.id === props.activeViewId ? "selected" : undefined} key={tab.id} onClick={() => {
                  props.onTabSelect(tab.id);
                  setTabPickerOpen(false);
                  setTabQuery("");
                }} type="button">{tab.label}</button>
              )) : <span className="automation-tab-picker-empty">No matching tabs.</span>}
            </div>
          </div>
        ) : null}
      </div>      <div aria-labelledby={activeTabDomId} className={["automation-view-body", props.bodyClassName ?? ""].filter(Boolean).join(" ")} id={`automation-panel-${props.windowId}`} role="tabpanel">{props.children}</div>
    </section>
  );
}

