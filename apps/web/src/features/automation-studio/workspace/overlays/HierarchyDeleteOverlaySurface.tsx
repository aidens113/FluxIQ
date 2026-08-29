"use client";

import { useState } from "react";
import { InlineNotice, Modal } from "../../../programs/shared-ui";
import { useAtomicOverlayCommand, type OverlayCommandDispatcher } from "./atomic-command";
import type { HierarchyOverlayCommand } from "./contracts";
import { hierarchyCommandFromDraft, hierarchyDraftForRequest, type HierarchyDeleteRequest } from "./hierarchy-overlay-model";
import { PinField } from "./HierarchyCreateOverlaySurface";

export function HierarchyDeleteOverlaySurface(props: {
  dispatch: OverlayCommandDispatcher<HierarchyOverlayCommand>;
  onClose(): void;
  request: HierarchyDeleteRequest;
}) {
  const [draft, setDraft] = useState(() => hierarchyDraftForRequest(props.request));
  const { execute, status } = useAtomicOverlayCommand(props.dispatch);
  const ready = draft.pin.length >= 4;

  async function confirm() {
    if (!ready) return;
    if (await execute(hierarchyCommandFromDraft(props.request, draft))) props.onClose();
  }

  return (
    <Modal busy={status.pending} closeOnEscape={!status.pending} onClose={props.onClose} title="Delete item">
      <InlineNotice message={`Delete ${props.request.node.label} and its contained hierarchy items.`} title="This cannot be undone" tone="warning" />
      <PinField draft={draft} setDraft={setDraft} />
      {status.error ? <InlineNotice message={status.error} tone="error" /> : null}
      <div className="modal-actions">
        <button className="button" disabled={status.pending} onClick={props.onClose} type="button">Cancel</button>
        <button className="button danger" data-modal-submit disabled={!ready || status.pending} onClick={() => void confirm()} type="button">{status.pending ? "Deleting..." : "Delete"}</button>
      </div>
    </Modal>
  );
}