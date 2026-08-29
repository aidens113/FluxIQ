"use client";

import { useCallback } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationPendingStateOpen, AutomationSelectionState } from "./selection-store";
import type { AutomationStudioStores } from "./studio-stores";
import type { AutomationStoreSetter } from "./use-project-data-resource";
import { useAutomationStoreSelector } from "./use-store-selector";

export function useAutomationSelectionState(stores: AutomationStudioStores) {
  const selection = useAutomationStoreSelector(stores.selection, (state) => state.selection, "selection");
  const pendingStateOpen = useAutomationStoreSelector(stores.selection, (state) => state.pendingStateOpen, "state-open");
  const bottomPreviewEntryId = useAutomationStoreSelector(stores.selection, (state) => state.bottomPreviewEntryId, "preview");
  const recordingTreePrimaryKind = useAutomationStoreSelector(stores.selection, (state) => state.recordingPrimaryKind, "recording-primary");

  return {
    selection,
    setSelection: useSelectionSetter(stores, "selection"),
    pendingStateOpen,
    setPendingStateOpen: useSelectionSetter(stores, "pendingStateOpen"),
    bottomPreviewEntryId,
    setBottomPreviewEntryId: useSelectionSetter(stores, "bottomPreviewEntryId"),
    recordingTreePrimaryKind,
    setRecordingTreePrimaryKind: useSelectionSetter(stores, "recordingPrimaryKind")
  };
}

function useSelectionSetter<Key extends keyof AutomationSelectionState>(
  stores: AutomationStudioStores,
  key: Key
): AutomationStoreSetter<AutomationSelectionState[Key]> {
  return useCallback((next) => {
    const current = stores.selection.getState()[key];
    const value = typeof next === "function" ? next(current) : next;
    if (key === "selection") stores.selection.select(value as AutomationSelection | null);
    else if (key === "pendingStateOpen") stores.selection.requestStateOpen(value as AutomationPendingStateOpen | null);
    else if (key === "bottomPreviewEntryId") stores.selection.setBottomPreview(value as string | null);
    else stores.selection.setRecordingPrimaryKind(value as AutomationSelectionState["recordingPrimaryKind"]);
  }, [key, stores]);
}