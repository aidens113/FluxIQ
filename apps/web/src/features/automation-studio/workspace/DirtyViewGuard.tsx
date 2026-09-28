"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Modal } from "../../programs/shared-ui";
import {
  dirtyViewRegistrySnapshot,
  hasDirtyAutomationViews,
  registerDirtyView,
  resolveDirtyViewDecision,
  subscribeDirtyViewRegistry,
  updateDirtyView,
  type DirtyViewRegistration
} from "./dirty-view-registry";

export function useDirtyViewRegistration(entry: DirtyViewRegistration): void {
  const callbacks = useRef({ save: entry.save, discard: entry.discard });
  callbacks.current = { save: entry.save, discard: entry.discard };
  useEffect(() => registerDirtyView({
    ...entry,
    save: () => callbacks.current.save(),
    discard: () => callbacks.current.discard()
  }), [entry.id]);
  useEffect(() => updateDirtyView(entry.id, { viewId: entry.viewId, label: entry.label, dirty: entry.dirty }), [entry.dirty, entry.id, entry.label, entry.viewId]);
}

export function DirtyViewGuard() {
  const state = useSyncExternalStore(subscribeDirtyViewRegistry, dirtyViewRegistrySnapshot, dirtyViewRegistrySnapshot);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasDirtyAutomationViews()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  if (!state.pending) return null;
  // Saving the person's own unsaved work is the least gate-worthy action in the
  // product, so this no longer asks for a PIN. What it does owe them is a clear
  // difference between the button that keeps their work and the one that throws
  // it away: Discard is the only destructive control here, so it carries the
  // danger variant and sits apart from the two that lose nothing.
  const saveAndContinue = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await resolveDirtyViewDecision("save");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The changes could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  return <Modal title="Unsaved changes" description={`Choose what to do before ${state.pending.actionLabel}.`} onClose={() => void resolveDirtyViewDecision("cancel")}>
    <div className="automation-modal-form">
      <p>The following work has not been saved:</p>
      <ul>{state.pending.entries.map((entry) => <li key={entry.id}>{entry.label}</li>)}</ul>
      {saveError ? <p className="automation-runtime-message" role="alert">{saveError}</p> : null}
      <div className="modal-actions">
        <Button disabled={saving} onClick={() => void resolveDirtyViewDecision("discard")} style={{ marginRight: "auto" }} variant="danger">Discard changes</Button>
        <Button disabled={saving} onClick={() => void resolveDirtyViewDecision("cancel")}>Cancel</Button>
        <Button busy={saving} data-modal-submit onClick={() => void saveAndContinue()} variant="primary">{saving ? "Saving..." : "Save"}</Button>
      </div>
    </div>
  </Modal>;
}
