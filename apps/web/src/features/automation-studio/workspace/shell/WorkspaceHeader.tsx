"use client";

import { Bug, FolderOpen, ListChecks, Pause, Play, Radio, Redo2, Save, SlidersHorizontal, Square, Undo2 } from "lucide-react";
import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { Field, Modal } from "../../../programs/shared-ui";
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
  const [saveOpen, setSaveOpen] = useState(false);
  const [savePin, setSavePin] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const requestProjectSave = () => {
    props.commands.requestWorkspaceSave();
    if (!dirtyState.dirtyCount) return;
    setSavePin("");
    setSaveError("");
    setSaveOpen(true);
  };
  const saveProject = async () => {
    if (savePin.length < 4) return;
    setSaving(true);
    setSaveError("");
    try {
      await saveDirtyAutomationViews(savePin);
      props.commands.requestWorkspaceSave();
      setSaveOpen(false);
      setSavePin("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The project could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    const onSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      requestProjectSave();
    };
    window.addEventListener("keydown", onSaveShortcut);
    return () => window.removeEventListener("keydown", onSaveShortcut);
  }, [dirtyState.dirtyCount]);
  return (
    <>
    <header className="automation-studio-workbar">
      <div className="automation-workspace-actions">
        <button className="button" onClick={props.commands.closeProject} type="button">
          <FolderOpen aria-hidden size={14} />Back to Projects
        </button>
        <div aria-label="Project editing commands" className="automation-studio-global-controls" role="toolbar">
          <button aria-keyshortcuts="Control+Z Meta+Z" aria-label="Undo action" className="icon-button" disabled={!actions.graph?.canUndo} onClick={() => invokeAutomationStudioGraphAction("undo")} title="Undo" type="button"><Undo2 aria-hidden size={15} /></button>
          <button aria-keyshortcuts="Control+Y Meta+Shift+Z" aria-label="Redo action" className="icon-button" disabled={!actions.graph?.canRedo} onClick={() => invokeAutomationStudioGraphAction("redo")} title="Redo" type="button"><Redo2 aria-hidden size={15} /></button>
          <span aria-hidden className="automation-studio-control-divider" />
          <button aria-label="Play automation" className="icon-button" disabled={actions.runtime?.canPlay === false} onClick={() => { if (!invokeAutomationStudioRuntimeAction("play")) props.commands.openRuntime(); }} title="Play" type="button"><Play aria-hidden size={15} /></button>
          <button aria-label="Pause automation" className="icon-button" disabled={!actions.runtime?.canPause} onClick={() => invokeAutomationStudioRuntimeAction("pause")} title="Pause" type="button"><Pause aria-hidden size={15} /></button>
          <button aria-label="Stop automation" className="icon-button" disabled={!actions.runtime?.canStop} onClick={() => invokeAutomationStudioRuntimeAction("stop")} title="Stop" type="button"><Square aria-hidden size={14} /></button>
          <button aria-keyshortcuts="Control+S Meta+S" aria-label="Save entire project" className="button button-primary" disabled={saving} onClick={requestProjectSave} title="Save all project changes" type="button"><Save aria-hidden size={14} />{saving ? "Saving..." : "Save Project"}{dirtyState.dirtyCount ? <span className="automation-studio-dirty-count">{dirtyState.dirtyCount}</span> : null}</button>
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
    {saveOpen ? <Modal title="Save Automation Studio Project" description="Save every unsaved editor in this project with one authorization." onClose={() => saving ? undefined : setSaveOpen(false)}>
      <div className="automation-modal-form">
        <p>{dirtyState.dirtyCount} unsaved {dirtyState.dirtyCount === 1 ? "editor" : "editors"} will be saved.</p>
        <Field label="Security PIN" {...(saveError ? { error: saveError } : {})}><input autoFocus inputMode="numeric" maxLength={12} onChange={(event) => { setSavePin(event.target.value.replace(/\D/g, "")); setSaveError(""); }} type="password" value={savePin} /></Field>
        <div className="modal-actions"><button className="button" disabled={saving} onClick={() => setSaveOpen(false)} type="button">Cancel</button><button className="button button-primary" data-modal-submit disabled={savePin.length < 4 || saving} onClick={() => void saveProject()} type="button">{saving ? "Saving Project..." : "Authorize and Save Project"}</button></div>
      </div>
    </Modal> : null}
    </>
  );
});
