"use client";

import { ChevronDown, ChevronUp, Radio } from "lucide-react";
import type { ReactNode } from "react";
import type { AutomationWorkspaceCommands, AutomationWorkspaceCommandPort } from "../commands/contracts";
import { automationBottomDockMaxHeight, automationBottomDockMinHeight } from "../layout/defaults";
import type { AutomationWorkspaceRenderStore } from "../render-store";
import { useAutomationWorkspaceSelector } from "./selectors";
import { beginAutomationSectionResize, resizeTimelineFromKeyboard } from "./resize-events";

export function AutomationTimelineDock(props: {
  commands: AutomationWorkspaceCommands;
  content: ReactNode;
  forceExpanded?: boolean;
  port: AutomationWorkspaceCommandPort;
  store: AutomationWorkspaceRenderStore;
}) {
  const state = useAutomationWorkspaceSelector(props.store, (prefs) => ({
    collapsed: props.forceExpanded ? false : prefs.bottomTimelineCollapsed,
    height: prefs.bottomTimelineHeight
  }), (left, right) => left.collapsed === right.collapsed && left.height === right.height);
  return (
    <section
      aria-label="Action preview timeline"
      className={state.collapsed ? "automation-bottom-timeline-region collapsed" : "automation-bottom-timeline-region"}
      data-workspace-region="timeline"
    >
      <button
        aria-label="Resize timeline"
        aria-orientation="horizontal"
        aria-valuemax={automationBottomDockMaxHeight}
        aria-valuemin={automationBottomDockMinHeight}
        aria-valuenow={state.height}
        className="automation-section-resize-handle bottom"
        disabled={state.collapsed}
        onKeyDown={(event) => resizeTimelineFromKeyboard(event, props.port)}
        onPointerDown={(event) => {
          const workspace = event.currentTarget.closest<HTMLElement>(".automation-studio-workspace");
          const previousRows = workspace?.style.gridTemplateRows ?? "";
          beginAutomationSectionResize({
            axis: "y",
            direction: -1,
            event,
            min: automationBottomDockMinHeight,
            max: automationBottomDockMaxHeight,
            startValue: state.height,
            transient: (height) => {
              if (workspace) workspace.style.gridTemplateRows = `minmax(0, 1fr) ${height}px`;
            },
            restore: () => {
              if (workspace) workspace.style.gridTemplateRows = previousRows;
            },
            commit: (height) => props.port.commit((current) => ({
              ...current,
              bottomTimelineHeight: height,
              bottomTimelineCollapsed: false,
              bottomDock: { ...current.bottomDock, expanded: true }
            }), { persist: true, scope: "timeline" })
          });
        }}
        role="separator"
        title="Resize timeline"
        type="button"
      />
      <header className="automation-bottom-timeline-header">
        <div><Radio aria-hidden size={14} /><span><strong>Action Preview</strong><small>Selected recording or run action</small></span></div>
        <div className="automation-bottom-timeline-actions">
          <button
            aria-label={state.collapsed ? "Expand timeline" : "Collapse timeline"}
            className="icon-button"
            onClick={props.commands.toggleTimeline}
            title={state.collapsed ? "Expand timeline" : "Collapse timeline"}
            type="button"
          >{state.collapsed ? <ChevronUp aria-hidden size={13} /> : <ChevronDown aria-hidden size={13} />}</button>
        </div>
      </header>
      {!state.collapsed ? props.content : null}
    </section>
  );
}
