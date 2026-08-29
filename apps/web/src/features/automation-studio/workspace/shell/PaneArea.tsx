"use client";

import { Columns3 } from "lucide-react";
import { memo, useMemo } from "react";
import { AutomationViewContainer } from "../components/view-container";
import { createAutomationMountedViewActivationStore, type AutomationMountedViewActivationStore } from "../components/mounted-view-activation";
import { viewTitle } from "../components/view-metadata";
import type { AutomationWorkspaceCommandPort, AutomationWorkspaceCommands } from "../commands/contracts";
import type { AutomationWarmViewRegistry } from "../commands/warm-activation";
import type { AutomationWorkspacePane } from "../layout/contracts";
import { automationMainPaneCount } from "../layout/mutations";
import type { AutomationWorkspaceRenderStore } from "../render-store";
import type { AutomationWorkspaceChromeCommands, AutomationWorkspaceViewSource } from "./contracts";
import { AutomationMountedViewStack } from "./MountedViewStack";
import {
  automationPaneGridStyle,
  automationPaneSplitHandles,
  dropAutomationTab,
  startAutomationSplitResize,
  startAutomationTabDrag
} from "./pane-interactions";
import { resizeSplitFromKeyboard } from "./resize-events";
import { useAutomationWorkspaceSelector } from "./selectors";
import { useAutomationWorkspaceViews } from "./view-source";

export const AutomationPaneArea = memo(function AutomationPaneArea(props: {
  chrome: AutomationWorkspaceChromeCommands;
  commands: AutomationWorkspaceCommands;
  narrow: boolean;
  port: AutomationWorkspaceCommandPort;
  projectKey: string;
  source: AutomationWorkspaceViewSource;
  store: AutomationWorkspaceRenderStore;
  warm: AutomationWarmViewRegistry;
}) {
  const activation = useMemo(createAutomationMountedViewActivationStore, [props.projectKey]);
  const state = useAutomationWorkspaceSelector(props.store, (prefs) => ({
    activePaneId: prefs.activePaneId,
    panes: prefs.panes,
    preset: prefs.mainLayoutPreset,
    ratios: prefs.mainSplitRatios
  }), mainPaneStateEqual);
  const configured = state.panes.slice(0, automationMainPaneCount(state.preset));
  const activeNarrow = configured.find((pane) => pane.id === state.activePaneId) ?? configured[0];
  const panes = props.narrow && activeNarrow ? [activeNarrow] : configured;
  const ratios = props.narrow
    ? [1]
    : state.ratios.length === panes.length
      ? state.ratios
      : panes.map(() => 1 / Math.max(1, panes.length));
  const handles = automationPaneSplitHandles(ratios);

  return (
    <section aria-label="Main editor" className="automation-workspace-section main strict" data-workspace-region="main">
      <header className="automation-workspace-section-header">
        <div className="automation-workspace-section-actions">
          <button
            aria-label="Arrange Main"
            className="icon-button"
            onClick={(event) => props.chrome.openLayoutPicker("main", event.currentTarget.getBoundingClientRect())}
            title="Arrange Main"
            type="button"
          ><Columns3 aria-hidden size={13} /></button>
        </div>
      </header>
      <div className="automation-dock-layout">
        <div className={`automation-strict-pane-layout preset-${state.preset}`} style={automationPaneGridStyle(state.preset, ratios)}>
          {panes.map((pane, index) => (
            <AutomationPaneSlot
              active={pane.id === state.activePaneId}
              activation={activation}
              chrome={props.chrome}
              commands={props.commands}
              index={index}
              key={pane.id}
              pane={pane}
              projectKey={props.projectKey}
              source={props.source}
              warm={props.warm}
            />
          ))}
          {!props.narrow ? handles.map((handle) => (
            <button
              aria-label="Resize panes"
              aria-orientation={state.preset === "two-rows" ? "horizontal" : "vertical"}
              aria-valuemax={88}
              aria-valuemin={12}
              aria-valuenow={Math.round(handle.offsetPct)}
              className={state.preset === "two-rows"
                ? "automation-main-split-handle horizontal"
                : "automation-main-split-handle vertical"}
              key={handle.index}
              onKeyDown={(event) => resizeSplitFromKeyboard(event, props.port, handle.index)}
              onPointerDown={(event) => startAutomationSplitResize(event, props.port, handle.index, state.preset === "two-rows")}
              role="separator"
              style={state.preset === "two-rows" ? { top: `${handle.offsetPct}%` } : { left: `${handle.offsetPct}%` }}
              title="Resize panes"
              type="button"
            />
          )) : null}
        </div>
      </div>
    </section>
  );
});

function AutomationPaneSlot(props: {
  active: boolean;
  activation: AutomationMountedViewActivationStore;
  chrome: AutomationWorkspaceChromeCommands;
  commands: AutomationWorkspaceCommands;
  index: number;
  pane: AutomationWorkspacePane;
  projectKey: string;
  source: AutomationWorkspaceViewSource;
  warm: AutomationWarmViewRegistry;
}) {
  const entries = useAutomationWorkspaceViews(props.source, props.pane.tabs, props.pane.activeViewId);
  const activeEntry = entries.find((entry) => entry.view.id === props.pane.activeViewId) ?? entries[0];
  if (!activeEntry) {
    return <div aria-label={`Editor pane ${props.index + 1}`} className="automation-pane-slot automation-pane-empty" role="status">No view is open in this pane.</div>;
  }
  return (
    <div aria-label={`Editor pane ${props.index + 1}`} className="automation-pane-slot" role="group">
      <AutomationViewContainer
        active={props.active}
        activation={props.activation}
        activeViewId={activeEntry.view.id}
        bodyClassName={activeEntry.bodyClassName}
        frameLabel="Pane"
        icon={activeEntry.view.icon}
        onActivate={() => props.commands.activatePane(props.pane.id)}
        onAddTab={(event) => props.chrome.openViewAdder("main", props.pane.id, event.currentTarget.getBoundingClientRect())}
        onClose={() => props.commands.closePaneTab(props.pane.id, activeEntry.view.id)}
        onCloseTab={(viewId) => props.commands.closePaneTab(props.pane.id, viewId)}
        onMoveTab={(viewId, direction) => props.commands.movePaneTabByKeyboard(props.pane.id, viewId, direction)}
        onTabDragStart={(viewId, event) => startAutomationTabDrag(props.pane.id, viewId, event)}
        onTabDrop={(viewId, placement, event) => dropAutomationTab(props.commands, props.pane.id, viewId, placement, event)}
        onTabSelect={(viewId) => props.commands.selectPaneTab(props.pane.id, viewId)}
        subtitle={activeEntry.view.label}
        tabs={entries.map((entry) => entry.view)}
        title={viewTitle(activeEntry.view)}
        windowId={props.pane.id}
        windowIndex={props.index}
      >
        <AutomationMountedViewStack
          activePane={props.active}
          activation={props.activation}
          activeViewId={activeEntry.view.id}
          paneId={props.pane.id}
          projectKey={props.projectKey}
          source={props.source}
          tabIds={entries.map((entry) => entry.view.id)}
          warm={props.warm}
        />
      </AutomationViewContainer>
    </div>
  );
}

function mainPaneStateEqual(
  left: { activePaneId: string; panes: AutomationWorkspacePane[]; preset: string; ratios: number[] },
  right: { activePaneId: string; panes: AutomationWorkspacePane[]; preset: string; ratios: number[] }
) {
  return left.activePaneId === right.activePaneId
    && left.panes === right.panes
    && left.preset === right.preset
    && left.ratios === right.ratios;
}
