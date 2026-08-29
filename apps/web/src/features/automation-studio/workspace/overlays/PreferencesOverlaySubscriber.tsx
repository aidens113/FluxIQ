"use client";

import { useState } from "react";
import { InlineNotice, Modal } from "../../../programs/shared-ui";
import { AutomationWorkspacePreferences } from "../components/workspace-preferences";
import { useAtomicOverlayCommand, type OverlayCommandDispatcher } from "./atomic-command";
import type { PreferencesOverlayCommand, PreferencesOverlayRequest } from "./contracts";
import { useAutomationOverlaySelection, type AutomationStudioOverlayStore } from "./overlay-state-store";

export function PreferencesOverlaySubscriber(props: {
  dispatch: OverlayCommandDispatcher<PreferencesOverlayCommand>;
  store: AutomationStudioOverlayStore;
}) {
  const request = useAutomationOverlaySelection(props.store, "preferences");
  if (!request) return null;
  return (
    <PreferencesOverlaySurface
      dispatch={props.dispatch}
      key={request.id}
      onClose={() => props.store.close("preferences", request.id)}
      request={request}
    />
  );
}

export function PreferencesOverlaySurface(props: {
  dispatch: OverlayCommandDispatcher<PreferencesOverlayCommand>;
  onClose(): void;
  request: PreferencesOverlayRequest;
}) {
  const [prefs, setPrefs] = useState(props.request.prefs);
  const { execute, status } = useAtomicOverlayCommand(props.dispatch);

  async function confirm() {
    const completed = await execute({
      type: "workspace.preferences.replace",
      requestId: props.request.id,
      prefs
    });
    if (completed) props.onClose();
  }

  return (
    <Modal
      busy={status.pending}
      closeOnEscape={!status.pending}
      description="Layout, region sizing, motion, and operational density."
      onClose={props.onClose}
      title="Workspace Preferences"
    >
      <AutomationWorkspacePreferences
        prefs={prefs}
        saveStatus={status.pending ? "Saving workspace preferences..." : props.request.saveStatus}
        setPrefs={setPrefs}
      />
      {status.error ? <InlineNotice message={status.error} tone="error" /> : null}
      <div className="modal-actions">
        <button className="button" disabled={status.pending} onClick={props.onClose} type="button">Cancel</button>
        <button className="button button-primary" data-modal-submit disabled={status.pending} onClick={() => void confirm()} type="button">
          {status.pending ? "Saving..." : "Apply"}
        </button>
      </div>
    </Modal>
  );
}