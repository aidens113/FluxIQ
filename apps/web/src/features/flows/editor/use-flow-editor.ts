"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { loadOutline } from "../data";
import { rebaseEdit } from "../model";
import { stepEditPayload, undoPayload } from "../requests";
import { useLoaded, type Loaded } from "../use-loaded";
import { editAnswer, type EditAnswer, type FlowConflict, type FlowOutline, type GraphOperation, type OutlineAnswer, type StepEdit } from "../wire";

/** What the banner above the steps says after a change. */
export type EditBannerState =
  | { kind: "saved"; revision: number; inverseOperations: GraphOperation[] }
  | { kind: "undone"; revision: number }
  | { kind: "restored"; revision: number; from: number }
  | {
      kind: "conflict";
      conflict: FlowConflict;
      /** The change that was not saved; absent when it was an undo. */
      edit?: StepEdit;
      /** Where it was made, so a second refusal shows in the same place. */
      at: string;
      /** The list the person was looking at when they made it. */
      before: FlowOutline;
      showChanges: boolean;
    };

export type FlowEditorState = {
  /** The list as last read or saved. */
  outline: Loaded<OutlineAnswer>;
  busy: boolean;
  banner?: EditBannerState;
  refusal?: { at: string; reason: string };
  /** When this page last saved a version, so the status line says the Flow changed since its last run. */
  savedAt?: number;
  edit(edit: StepEdit, at: string): Promise<boolean>;
  undo(): Promise<void>;
  applyAgain(): Promise<void>;
  toggleChanges(): void;
  dismiss(): void;
  restored(revision: number, from: number): void;
};

/**
 * The editor's list and every change made to it. Each change is sent against the version the
 * list shows; a refusal is kept at the place it was made and saves nothing; a conflict shows the
 * Flow as it is now and keeps the change so it can be made again on top.
 */
export function useFlowEditor(studio: ProgramCommandTransport, flow: { projectId: string; flowId: string }): FlowEditorState {
  const loaded = useLoaded(`${flow.projectId}/${flow.flowId}`, useCallback((signal: AbortSignal) => loadOutline(studio, flow, signal), [studio, flow]));
  const [shown, setShown] = useState<OutlineAnswer>();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<EditBannerState>();
  const [refusal, setRefusal] = useState<{ at: string; reason: string }>();
  const [savedAt, setSavedAt] = useState<number>();
  const sending = useRef(false);
  const current = useRef<OutlineAnswer | undefined>(undefined);
  const readData = loaded.state === "ready" ? loaded.data : undefined;
  useEffect(() => {
    if (readData) setShown(readData);
  }, [readData]);
  current.current = shown;

  const settle = useCallback((answer: EditAnswer, made: { at: string; edit?: StepEdit; before: FlowOutline; undo: boolean }): boolean => {
    if (answer.kind === "refused") {
      setRefusal({ at: made.at, reason: answer.reason });
      return false;
    }
    setShown({ outline: answer.outline, revision: answer.revision });
    if (answer.kind === "conflict") {
      setBanner({ kind: "conflict", conflict: answer.conflict, ...(made.edit ? { edit: made.edit } : {}), at: made.at, before: made.before, showChanges: false });
      return false;
    }
    setSavedAt(Date.now());
    setBanner(made.undo ? { kind: "undone", revision: answer.revision } : { kind: "saved", revision: answer.revision, inverseOperations: answer.inverseOperations });
    return true;
  }, []);

  const send = useCallback(async (endpoint: string, payload: Record<string, unknown>, made: { at: string; edit?: StepEdit; undo: boolean }): Promise<boolean> => {
    const before = current.current;
    if (!before || sending.current) return false;
    sending.current = true;
    setBusy(true);
    setRefusal(undefined);
    try {
      const response = await studio.post(endpoint, payload);
      return settle(editAnswer(response), { ...made, before: before.outline });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }, [studio, settle]);

  const edit = useCallback(async (change: StepEdit, at: string) => {
    const seen = current.current;
    if (!seen) return false;
    return send("edit-flow-steps", stepEditPayload({ ...flow, revision: seen.revision }, change), { at, edit: change, undo: false });
  }, [flow, send]);

  const undo = useCallback(async () => {
    if (banner?.kind !== "saved") return;
    await send("undo-flow-edit", undoPayload(flow, banner), { at: "banner", undo: true });
  }, [banner, flow, send]);

  const applyAgain = useCallback(async () => {
    const now = current.current;
    if (banner?.kind !== "conflict" || !banner.edit || !now) return;
    const rebased = rebaseEdit(banner.edit, banner.before, now.outline);
    if (!rebased.ok) {
      setRefusal({ at: "banner", reason: rebased.reason });
      return;
    }
    await send("edit-flow-steps", stepEditPayload({ ...flow, revision: now.revision }, rebased.edit), { at: banner.at, edit: rebased.edit, undo: false });
  }, [banner, flow, send]);

  const toggleChanges = useCallback(() => setBanner((was) => (was?.kind === "conflict" ? { ...was, showChanges: !was.showChanges } : was)), []);
  const dismiss = useCallback(() => setBanner(undefined), []);
  const { reload } = loaded;
  const restored = useCallback((revision: number, from: number) => {
    setBanner({ kind: "restored", revision, from });
    setSavedAt(Date.now());
    reload();
  }, [reload]);

  // A failed re-read (after a restore) is shown as failed: the list from before would read as current.
  const outline: Loaded<OutlineAnswer> = loaded.state !== "error" && shown ? { state: "ready", data: shown } : loaded;
  return { outline, busy, ...(banner ? { banner } : {}), ...(refusal ? { refusal } : {}), ...(savedAt ? { savedAt } : {}), edit, undo, applyAgain, toggleChanges, dismiss, restored };
}
