"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Field, Modal } from "../../programs/shared-ui";
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
    save: (authorizationPin) => callbacks.current.save(authorizationPin),
    discard: () => callbacks.current.discard()
  }), [entry.id]);
  useEffect(() => updateDirtyView(entry.id, { viewId: entry.viewId, label: entry.label, dirty: entry.dirty }), [entry.dirty, entry.id, entry.label, entry.viewId]);
}

export function DirtyViewGuard() {
  const state = useSyncExternalStore(subscribeDirtyViewRegistry, dirtyViewRegistrySnapshot, dirtyViewRegistrySnapshot);
  const [authorizationPin, setAuthorizationPin] = useState("");
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
  const saveAndContinue = async () => {
    if (authorizationPin.length < 4) return;
    setSaving(true);
    setSaveError("");
    try {
      await resolveDirtyViewDecision("save", authorizationPin);
      setAuthorizationPin("");
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
      <Field label="Security PIN" {...(saveError ? { error: saveError } : {})}><input autoFocus inputMode="numeric" maxLength={12} onChange={(event) => { setAuthorizationPin(event.target.value.replace(/\D/g, "")); setSaveError(""); }} type="password" value={authorizationPin} /></Field>
      <div className="modal-actions">
        <Button disabled={saving} onClick={() => void resolveDirtyViewDecision("cancel")}>Cancel</Button>
        <Button disabled={saving} onClick={() => void resolveDirtyViewDecision("discard")}>Discard</Button>
        <Button data-modal-submit disabled={saving || authorizationPin.length < 4} onClick={() => void saveAndContinue()} variant="primary">{saving ? "Saving..." : "Save"}</Button>
      </div>
    </div>
  </Modal>;
}
