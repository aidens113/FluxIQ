"use client";

import { useMemo, useState } from "react";
import { FolderPlus, GitBranch, Workflow } from "lucide-react";
import { Field, InlineNotice, Modal } from "../../../programs/shared-ui";
import { useAtomicOverlayCommand, type OverlayCommandDispatcher } from "./atomic-command";
import type {
  FlowOrigin,
  HierarchyFolderOption,
  HierarchyFolderOptionSource,
  HierarchyItemKind,
  HierarchyOverlayCommand
} from "./contracts";
import {
  hierarchyCommandFromDraft,
  hierarchyDraftForRequest,
  type HierarchyCreateRequest,
  type HierarchyOverlayDraft
} from "./hierarchy-overlay-model";

const folderResultLimit = 100;

export function HierarchyCreateOverlaySurface(props: {
  dispatch: OverlayCommandDispatcher<HierarchyOverlayCommand>;
  onClose(): void;
  request: HierarchyCreateRequest;
}) {
  const [draft, setDraft] = useState(() => hierarchyDraftForRequest(props.request));
  const [folderQuery, setFolderQuery] = useState("");
  const { execute, status } = useAtomicOverlayCommand(props.dispatch);
  const folderOptions = useMemo(
    () => boundedHierarchyFolderOptions(
      props.request.folderSource,
      folderQuery,
      draft.parentId
    ),
    [draft.parentId, folderQuery, props.request.folderSource]
  );
  const ready = draft.pin.length >= 4 && Boolean(draft.name.trim());
  const title = draft.step === "type"
    ? `Add to ${props.request.categoryLabel}`
    : `Create ${draft.itemKind === "flow" ? "Flow" : draft.itemKind}`;

  async function confirm() {
    if (!ready) return;
    if (await execute(hierarchyCommandFromDraft(props.request, draft))) props.onClose();
  }

  return (
    <Modal busy={status.pending} closeOnEscape={!status.pending} onClose={props.onClose} title={title}>
      {draft.step === "type" ? (
        <div className="automation-hierarchy-create">
          <div aria-label="Choose item type" className="automation-create-type-grid" role="list">
            {props.request.allowedKinds.map((kind: HierarchyItemKind) => {
              const Icon = kind === "flow" ? GitBranch : kind === "subflow" ? Workflow : FolderPlus;
              return (
                <button
                  className="automation-create-type-card"
                  key={kind}
                  onClick={() => setDraft((current) => ({ ...current, itemKind: kind, step: "details" }))}
                  type="button"
                >
                  <span className="automation-create-type-icon"><Icon aria-hidden size={19} /></span>
                  <span>
                    <strong>{kind === "flow" ? "Flow" : kind === "subflow" ? "Subflow" : "Folder"}</strong>
                    <small>{hierarchyKindDescription(kind, props.request.subflowContainer)}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="modal-actions"><button className="button" onClick={props.onClose} type="button">Cancel</button></div>
        </div>
      ) : (
        <div className="automation-hierarchy-create automation-hierarchy-create-form">
          <div className="automation-hierarchy-create-fields">
            <Field label="Name" required>
              <input
                autoFocus
                maxLength={120}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder={draft.itemKind === "flow" ? "Flow name" : draft.itemKind === "subflow" ? "Subflow name" : "Folder name"}
                value={draft.name}
              />
            </Field>
            {draft.itemKind === "flow" ? <FlowOriginField draft={draft} setDraft={setDraft} /> : null}
            <Field label="Location">
              <input
                onChange={(event) => setFolderQuery(event.target.value)}
                placeholder="Find a folder"
                type="search"
                value={folderQuery}
              />
              <select
                onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value || null }))}
                value={draft.parentId ?? ""}
              >
                {!props.request.subflowContainer ? <option value="">{props.request.categoryLabel}</option> : null}
                {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
              </select>
            </Field>
            <PinField draft={draft} setDraft={setDraft} />
          </div>
          {status.error ? <InlineNotice message={status.error} tone="error" /> : null}
          <div className="modal-actions">
            <button className="button" disabled={status.pending} onClick={() => setDraft((current) => ({ ...current, step: "type" }))} type="button">Back</button>
            <button className="button" disabled={status.pending} onClick={props.onClose} type="button">Cancel</button>
            <button className="button button-primary" data-modal-submit disabled={!ready || status.pending} onClick={() => void confirm()} type="button">{status.pending ? "Creating..." : "Create"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function boundedHierarchyFolderOptions(
  source: HierarchyFolderOptionSource,
  query: string,
  selectedId: string | null
): readonly HierarchyFolderOption[] {
  const matches = source.search(query.trim(), folderResultLimit).slice(0, folderResultLimit);
  if (!selectedId || matches.some((option) => option.id === selectedId)) return matches;
  const selected = source.resolve(selectedId);
  return selected ? [selected, ...matches.slice(0, folderResultLimit - 1)] : matches;
}

function FlowOriginField(props: {
  draft: HierarchyOverlayDraft;
  setDraft(updater: (current: HierarchyOverlayDraft) => HierarchyOverlayDraft): void;
}) {
  return (
    <Field label="Flow preset">
      <select onChange={(event) => props.setDraft((current) => ({ ...current, flowOrigin: event.target.value as FlowOrigin }))} value={props.draft.flowOrigin}>
        <option value="blank">Blank visual Flow</option>
        <option value="deterministic">Deterministic workflow</option>
        <option value="recorded">Recorded automation</option>
        <option value="integration">Integration Flow</option>
        <option value="scheduled">Scheduled Flow</option>
        <option value="api-endpoint">API endpoint</option>
        <option value="reusable">Reusable component</option>
      </select>
    </Field>
  );
}

export function PinField(props: {
  draft: HierarchyOverlayDraft;
  setDraft(updater: (current: HierarchyOverlayDraft) => HierarchyOverlayDraft): void;
}) {
  return (
    <Field label="Security PIN" required>
      <input inputMode="numeric" onChange={(event) => props.setDraft((current) => ({ ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 12) }))} type="password" value={props.draft.pin} />
    </Field>
  );
}

function hierarchyKindDescription(kind: HierarchyItemKind, subflowContainer: boolean): string {
  if (kind === "flow") return "Create a top-level automation Flow.";
  if (kind === "subflow") return "Create an executable workflow that the Router can target.";
  return `Organize items inside ${subflowContainer ? "Subflows" : "this category"}.`;
}
