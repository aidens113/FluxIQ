"use client";

import { Bug, FolderOpen, ListChecks, Radio, SlidersHorizontal } from "lucide-react";
import { memo } from "react";
import type {
  AutomationWorkspaceBreadcrumb,
  AutomationWorkspaceChromeCommands,
  AutomationWorkspaceHeaderCommands
} from "./contracts";

export const AutomationWorkspaceHeader = memo(function AutomationWorkspaceHeader(props: {
  breadcrumbs: readonly AutomationWorkspaceBreadcrumb[];
  chrome: AutomationWorkspaceChromeCommands;
  commands: AutomationWorkspaceHeaderCommands;
  inspectorLabel: string;
  narrow: boolean;
  narrowPanel: "hierarchy" | "inspector" | "timeline" | null;
  showDataInspector?: boolean;
}) {
  return (
    <header className="automation-studio-workbar">
      <div className="automation-workspace-actions">
        <button className="button" onClick={props.commands.closeProject} type="button">
          <FolderOpen aria-hidden size={14} />Back to Projects
        </button>
        {props.narrow ? (
          <div className="automation-narrow-workspace-actions">
            <button
              aria-controls="automation-project-hierarchy"
              aria-expanded={props.narrowPanel === "hierarchy"}
              className="button"
              onClick={() => props.chrome.setNarrowPanel(props.narrowPanel === "hierarchy" ? null : "hierarchy")}
              type="button"
            ><ListChecks aria-hidden size={14} />Hierarchy</button>
            <button
              aria-controls="automation-right-utilities"
              aria-expanded={props.narrowPanel === "inspector"}
              className="button"
              onClick={() => props.chrome.setNarrowPanel(props.narrowPanel === "inspector" ? null : "inspector")}
              type="button"
            ><SlidersHorizontal aria-hidden size={14} />{props.inspectorLabel}</button>
            <button
              aria-controls="automation-action-preview"
              aria-expanded={props.narrowPanel === "timeline"}
              className="button"
              onClick={() => props.chrome.setNarrowPanel(props.narrowPanel === "timeline" ? null : "timeline")}
              type="button"
            ><Radio aria-hidden size={14} />Preview</button>
          </div>
        ) : null}
      </div>
      <div className="automation-studio-context">
        {props.showDataInspector ? (
          <button
            aria-label="Open data flow inspector"
            aria-haspopup="dialog"
            className="icon-button"
            onClick={props.commands.openDataInspector}
            title="Open data flow inspector"
            type="button"
          ><Bug aria-hidden size={15} /></button>
        ) : null}
        <button
          aria-haspopup="dialog"
          className="button"
          onClick={props.commands.openPreferences}
          type="button"
        ><SlidersHorizontal aria-hidden size={14} />Preferences</button>
      </div>
    </header>
  );
});
