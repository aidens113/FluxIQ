"use client";

import { useState, useSyncExternalStore } from "react";
import {
  automationStudioActionSnapshot,
  invokeAutomationStudioGraphAction,
  saveActiveAutomationStudioGraph,
  subscribeAutomationStudioActions
} from "../../../../../../features/automation-studio/workspace/studio-action-registry";

/**
 * Undo, Redo and Save for the graph on this page. The canvas registers what it can do; these
 * buttons press it. Saving asks for nothing more: changing a Flow's steps is a normal action.
 */
export function GraphActions(props: { dirty: boolean }) {
  const actions = useSyncExternalStore(subscribeAutomationStudioActions, automationStudioActionSnapshot, automationStudioActionSnapshot);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState("");
  const graph = actions.graph;
  const save = async () => {
    const pending = saveActiveAutomationStudioGraph("");
    if (!pending) {
      setSaid("The graph is not open yet, so there is nothing to save.");
      return;
    }
    setSaving(true);
    setSaid("");
    try {
      const result = await pending;
      setSaid(result.ok ? "Saved." : `Not saved: ${result.message}`);
    } catch (error) {
      setSaid(`Not saved: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flow-graph-actions" role="group" aria-label="Graph changes">
      <button className="button" type="button" disabled={!graph?.canUndo} onClick={() => invokeAutomationStudioGraphAction("undo")}>Undo</button>
      <button className="button" type="button" disabled={!graph?.canRedo} onClick={() => invokeAutomationStudioGraphAction("redo")}>Redo</button>
      <button className="button button-primary" type="button" disabled={!graph || saving || !props.dirty} onClick={() => void save()}>
        {saving ? "Saving…" : "Save"}
      </button>
      <span role="status">{said || (props.dirty ? "You have changes that are not saved." : "")}</span>
    </div>
  );
}
