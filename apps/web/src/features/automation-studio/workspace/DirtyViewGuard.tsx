"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
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
  return <Modal title="Unsaved changes" description={`Choose what to do before ${state.pending.actionLabel}.`} onClose={() => void resolveDirtyViewDecision("cancel")}>
    <div className="automation-modal-form">
      <p>The following work has not been saved:</p>
      <ul>{state.pending.entries.map((entry) => <li key={entry.id}>{entry.label}</li>)}</ul>
      <div className="modal-actions">
        <Button onClick={() => void resolveDirtyViewDecision("cancel")}>Cancel</Button>
        <Button onClick={() => void resolveDirtyViewDecision("discard")}>Discard</Button>
        <Button data-modal-submit onClick={() => void resolveDirtyViewDecision("save")} variant="primary">Save</Button>
      </div>
    </div>
  </Modal>;
}
