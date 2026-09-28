"use client";

import { Bug, FolderOpen, ListChecks, Play, Radio, Redo2, Save, SlidersHorizontal, Square, Undo2 } from "lucide-react";
import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { notifyGlobalAlert } from "../../../programs/shared-ui";
import { dirtyViewRegistrySnapshot, saveDirtyAutomationViews, subscribeDirtyViewRegistry } from "../dirty-view-registry";
import {
  automationStudioActionSnapshot,
  invokeAutomationStudioGraphAction,
  invokeAutomationStudioRuntimeAction,
  subscribeAutomationStudioActions
} from "../studio-action-registry";
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
  const dirtyState = useSyncExternalStore(subscribeDirtyViewRegistry, dirtyViewRegistrySnapshot, dirtyViewRegistrySnapshot);
  const actions = useSyncExternalStore(subscribeAutomationStudioActions, automationStudioActionSnapshot, automationStudioActionSnapshot);
  const [saving, setSaving] = useState(false);
  // Saving a project is the product doing the job it was asked for, so it no
  // longer stops for a security PIN. Core agrees: every endpoint a save touches
  // is registered `classification: "authoring"`, and only `destructive`
  // endpoints are PIN-checked server side, so the dialog bought no safety at
  // all. What a save did owe the person is a word back, which Ctrl+S on a clean
  // workspace never gave.
  const requestProjectSave = async () => {
    props.commands.requestWorkspaceSave();
    if (!dirtyState.dirtyCount) {
      notifyGlobalAlert({ tone: "info", title: "Project", message: "Everything in this project is already saved." });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveDirtyAutomationViews();
      props.commands.requestWorkspaceSave();
      notifyGlobalAlert({ tone: "success", title: "Project", message: `Saved ${saved} ${saved === 1 ? "editor" : "editors"}.` });
    } catch (error) {
      notifyGlobalAlert({ tone: "error", title: "Project", message: error instanceof Error ? error.message : "The project could not be saved." });
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    const onSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void requestProjectSave();
    };
    window.addEventListener("keydown", onSaveShortcut);
    return () => window.removeEventListener("keydown", onSaveShortcut);
  }, [dirtyState.dirtyCount]);
  // Pause is gone rather than disabled: the only registrar of runtime actions
  // reports `canPause: false` unconditionally and its `pause()` returns
  // undefined, so the button could never enable in any state of the product.
  //
  // Play lied about its own state twice over: `canPlay === false` is false when
  // no run panel is mounted, so it rendered enabled, and clicking it then opened
  // a view instead of starting anything. Now it is disabled exactly when a
  // mounted run panel says it cannot play, and when none is mounted it says what
  // it will actually do.
  const runtimeMounted = Boolean(actions.runtime);
  const playLabel = runtimeMounted ? "Play automation" : "Open the run panel";
  return (
    <header className="automation-studio-workbar">
      <div className="automation-workspace-actions">
        <button className="button" onClick={props.commands.closeProject} type="button">
          <FolderOpen aria-hidden size={14} />Back to Projects
        </button>
        <div aria-label="Project editing commands" className="automation-studio-global-controls" role="toolbar">
          <button aria-keyshortcuts="Control+Z Meta+Z" aria-label="Undo action" className="icon-button" disabled={!actions.graph?.canUndo} onClick={() => invokeAutomationStudioGraphAction("undo")} title="Undo" type="button"><Undo2 aria-hidden size={15} /></button>
          <button aria-keyshortcuts="Control+Y Meta+Shift+Z" aria-label="Redo action" className="icon-button" disabled={!actions.graph?.canRedo} onClick={() => invokeAutomationStudioGraphAction("redo")} title="Redo" type="button"><Redo2 aria-hidden size={15} /></button>
          <span aria-hidden className="automation-studio-control-divider" />
          <button aria-label={playLabel} className="icon-button" disabled={runtimeMounted && actions.runtime?.canPlay !== true} onClick={() => { if (!invokeAutomationStudioRuntimeAction("play")) props.commands.openRuntime(); }} title={playLabel} type="button"><Play aria-hidden size={15} /></button>
          <button aria-label="Stop automation" className="icon-button" disabled={!actions.runtime?.canStop} onClick={() => invokeAutomationStudioRuntimeAction("stop")} title="Stop" type="button"><Square aria-hidden size={14} /></button>
          <button aria-keyshortcuts="Control+S Meta+S" aria-label="Save entire project" className="button button-primary" disabled={saving} onClick={() => void requestProjectSave()} title="Save all project changes" type="button"><Save aria-hidden size={14} />{saving ? "Saving..." : "Save Project"}{dirtyState.dirtyCount ? <span className="automation-studio-dirty-count">{dirtyState.dirtyCount}</span> : null}</button>
        </div>
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
