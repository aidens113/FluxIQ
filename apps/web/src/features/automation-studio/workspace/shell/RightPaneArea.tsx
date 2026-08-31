"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { memo } from "react";
import { AutomationViewContainer } from "../components/view-container";
import { viewTitle } from "../components/view-metadata";
import type { AutomationWorkspaceCommandPort, AutomationWorkspaceCommands } from "../commands/contracts";
import type { AutomationWarmViewRegistry } from "../commands/warm-activation";
import type { AutomationWorkspaceRenderStore } from "../render-store";
import { defaultAutomationRightSidebarPrefs } from "../layout/defaults";
import type { AutomationWorkspaceChromeCommands, AutomationWorkspaceViewSource } from "./contracts";
import { AutomationMountedViewStack } from "./MountedViewStack";
import { beginAutomationSectionResize, resizeInspectorFromKeyboard } from "./resize-events";
import { useAutomationWorkspaceSelector } from "./selectors";
import { useAutomationWorkspaceViews } from "./view-source";

export const AutomationRightPaneArea = memo(function AutomationRightPaneArea(props: {
  chrome: AutomationWorkspaceChromeCommands;
  commands: AutomationWorkspaceCommands;
  forceExpanded?: boolean;
  port: AutomationWorkspaceCommandPort;
  projectKey: string;
  source: AutomationWorkspaceViewSource;
  store: AutomationWorkspaceRenderStore;
  warm: AutomationWarmViewRegistry;
}) {
  const state = useAutomationWorkspaceSelector(props.store, (prefs) => ({
    activeViewId: prefs.rightSidebar.activeViewId || defaultAutomationRightSidebarPrefs().activeViewId,
    collapsed: props.forceExpanded ? false : prefs.rightSidebarCollapsed,
    tabs: prefs.rightSidebar.tabs,
    width: prefs.inspectorWidth
  }), rightPaneStateEqual);
  const entries = useAutomationWorkspaceViews(props.source, state.tabs, state.activeViewId);
  const activeEntry = entries.find((entry) => entry.view.id === state.activeViewId) ?? entries[0];
  return (
    <aside aria-label="Right utilities" className="automation-workspace-section right strict" data-workspace-region="inspector">
      <button
        aria-label="Resize right area"
        aria-orientation="vertical"
        aria-valuemax={620}
        aria-valuemin={260}
        aria-valuenow={state.width}
        className="automation-section-resize-handle right"
        onKeyDown={(event) => resizeInspectorFromKeyboard(event, props.port)}
        onPointerDown={(event) => {
          const workspace = event.currentTarget.closest<HTMLElement>(".automation-studio-workspace");
          const previousColumns = workspace?.style.gridTemplateColumns ?? "";
          beginAutomationSectionResize({
            axis: "x",
            direction: -1,
            event,
            min: 260,
            max: 620,
            startValue: state.width,
            transient: (width) => {
              if (workspace) workspace.style.gridTemplateColumns = `minmax(0, 1fr) ${width}px`;
            },
            restore: () => {
              if (workspace) workspace.style.gridTemplateColumns = previousColumns;
            },
            commit: (width) => props.port.commit(
              (current) => ({ ...current, inspectorWidth: width, rightSidebarCollapsed: false }),
              { persist: true, scope: "right-sidebar" }
            )
          });
        }}
        role="separator"
        title="Resize right area"
        type="button"
      />
      <header className="automation-workspace-section-header">
        <div className="automation-workspace-section-actions">
          <button
            aria-label={state.collapsed ? "Expand right area" : "Collapse right area"}
            className="icon-button"
            onClick={props.commands.toggleRightSidebar}
            title={state.collapsed ? "Expand right area" : "Collapse right area"}
            type="button"
          >{state.collapsed ? <ChevronLeft aria-hidden size={13} /> : <ChevronRight aria-hidden size={13} />}</button>
          <button
            aria-label="Add sidebar tab"
            className="icon-button"
            onClick={(event) => props.chrome.openViewAdder("right", "right-sidebar", event.currentTarget.getBoundingClientRect())}
            title="Add sidebar tab"
            type="button"
          ><Plus aria-hidden size={13} /></button>
        </div>
      </header>
      {!state.collapsed && activeEntry ? (
        <div className="automation-dock-layout">
          <div className="automation-pane-slot">
            <AutomationViewContainer
              active
              activeViewId={activeEntry.view.id}
              frameLabel="Right utility"
              icon={activeEntry.view.icon}
              onActivate={() => undefined}
              onAddTab={(event) => props.chrome.openViewAdder("right", "right-sidebar", event.currentTarget.getBoundingClientRect())}
              onClose={() => props.commands.closeRightTab(activeEntry.view.id)}
              onCloseTab={props.commands.closeRightTab}
              onTabSelect={props.commands.selectRightTab}
              subtitle={activeEntry.view.label}
              tabs={entries.map((entry) => entry.view)}
              title={viewTitle(activeEntry.view)}
              windowId="right-sidebar"
              windowIndex={0}
            >
              <AutomationMountedViewStack
                activePane
                activeViewId={activeEntry.view.id}
                paneId="right-sidebar"
                projectKey={props.projectKey}
                source={props.source}
                tabIds={entries.map((entry) => entry.view.id)}
                warm={props.warm}
              />
            </AutomationViewContainer>
          </div>
        </div>
      ) : null}
    </aside>
  );
});

function rightPaneStateEqual(
  left: { activeViewId: string; collapsed: boolean; tabs: string[]; width: number },
  right: { activeViewId: string; collapsed: boolean; tabs: string[]; width: number }
) {
  return left.activeViewId === right.activeViewId
    && left.collapsed === right.collapsed
    && left.tabs === right.tabs
    && left.width === right.width;
}
