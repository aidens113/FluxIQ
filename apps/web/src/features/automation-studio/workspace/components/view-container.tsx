"use client";

import { ChevronLeft, ChevronRight, Plus, Search, X, XCircle } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { Blocks } from "lucide-react";
import type { AutomationViewInstance } from "../../views/view-types";
import { useUiRenderMetric } from "../../../programs/ui-performance";
import { viewTitle } from "./view-metadata";

export function AutomationViewContainer(props: {
  active: boolean;
  activeViewId: string;
  children: ReactNode;
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
  useUiRenderMetric("AutomationStudioPaneBoundary");
  const frameLabel = props.frameLabel ?? "Window";
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabPickerButtonRef = useRef<HTMLButtonElement>(null);
  const tabPickerId = `automation-tab-picker-${useId().replace(/:/g, "")}`;
  const [tabPickerOpen, setTabPickerOpen] = useState(false);
  const [tabQuery, setTabQuery] = useState("");
  const activeView = props.tabs.find((tab) => tab.id === props.activeViewId);
  const Icon = activeView?.icon ?? props.icon;
  const activeTabDomId = `automation-tab-${props.windowId}-${props.activeViewId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const visiblePickerTabs = props.tabs.filter((tab) => tab.label.toLowerCase().includes(tabQuery.trim().toLowerCase()));
  const requestTabSelection = (viewId: string) => {
    props.onTabSelect(viewId);
  };
  const focusSelectedTab = () => window.requestAnimationFrame(() => {
    tabsRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
  });
  const closeTabAndRestoreFocus = (viewId: string) => {
    props.onCloseTab(viewId);
    focusSelectedTab();
  };
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
          <span><strong>{activeView ? viewTitle(activeView) : props.title}</strong><small>{frameLabel} {props.windowIndex + 1} - {activeView?.label ?? props.subtitle}</small></span>
        </div>
        <div className="automation-pane-actions">
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onAddTab(event); }} title="Add tab" aria-label="Add tab" type="button"><Plus size={13} aria-hidden /></button>
          <button className="icon-button" onClick={(event) => { event.stopPropagation(); props.onClose(); focusSelectedTab(); }} title="Close active tab" aria-label="Close active tab" type="button"><XCircle size={13} aria-hidden /></button>
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
              <button
                aria-controls={`automation-panel-${props.windowId}`}
                aria-keyshortcuts={props.onMoveTab ? "Alt+Shift+ArrowLeft Alt+Shift+ArrowRight Delete" : "Delete"}
                aria-selected={selected}
                className={selected ? "automation-tab-item selected" : "automation-tab-item"}
                draggable={Boolean(props.onTabDragStart)}
                id={tabId}
                key={tab.id}
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                    closeTabAndRestoreFocus(tab.id);
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if ((event.target as HTMLElement).closest("[data-tab-close]")) closeTabAndRestoreFocus(tab.id);
                  else requestTabSelection(tab.id);
                }}
                onDragOver={props.onTabDrop ? (event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; } : undefined}
                onDragStart={props.onTabDragStart ? (event) => props.onTabDragStart?.(tab.id, event) : undefined}
                onDrop={props.onTabDrop ? (event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  props.onTabDrop?.(tab.id, event.clientX > bounds.left + bounds.width / 2 ? "after" : "before", event);
                } : undefined}
                onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                    if (event.key === "Delete") {
                      event.preventDefault();
                      closeTabAndRestoreFocus(tab.id);
                      return;
                    }
                    if (event.altKey && event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && props.onMoveTab) {
                      event.preventDefault();
                      props.onMoveTab(tab.id, event.key === "ArrowLeft" ? -1 : 1);
                      return;
                    }
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
                      event.preventDefault();
                      closeTabAndRestoreFocus(tab.id);
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
                    requestTabSelection(next.id);
                    tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
                  }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                title={tab.label}
                type="button"
              >
                <span className="automation-tab-select">
                  <TabIcon size={13} aria-hidden />
                  <span>{tab.label}</span>
                </span>
                <span aria-hidden className="tab-close" data-tab-close title={`Close ${tab.label}`}><X aria-hidden size={12} /></span>
              </button>
            );
          })}
        </div>
        <button aria-label="Scroll tabs right" className="automation-tab-scroll" onClick={() => tabsRef.current?.scrollBy({ left: 220, behavior: "auto" })} type="button"><ChevronRight aria-hidden size={14} /></button>
        <button aria-controls={tabPickerId} aria-expanded={tabPickerOpen} aria-haspopup="dialog" aria-label="Find open tab" className="automation-tab-scroll" onClick={() => setTabPickerOpen((current) => !current)} ref={tabPickerButtonRef} type="button"><Search aria-hidden size={13} /></button>
        {tabPickerOpen ? (
          <div aria-label="Open tabs" className="automation-tab-picker" id={tabPickerId} onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setTabPickerOpen(false);
            tabPickerButtonRef.current?.focus({ preventScroll: true });
          }} role="dialog">
            <label>
              <span>Find open tab</span>
              <input autoFocus onChange={(event) => setTabQuery(event.target.value)} placeholder="Search tabs" type="search" value={tabQuery} />
            </label>
            <div>
              {visiblePickerTabs.length ? visiblePickerTabs.map((tab) => (
                <button className={tab.id === props.activeViewId ? "selected" : undefined} key={tab.id} onClick={() => {
                  requestTabSelection(tab.id);
                  setTabPickerOpen(false);
                  setTabQuery("");
                  focusSelectedTab();
                }} type="button">{tab.label}</button>
              )) : <span className="automation-tab-picker-empty">No matching tabs.</span>}
            </div>
          </div>
        ) : null}
      </div>      <div aria-labelledby={activeTabDomId} className="automation-view-body" id={`automation-panel-${props.windowId}`} role="tabpanel">{props.children}</div>
    </section>
  );
}
