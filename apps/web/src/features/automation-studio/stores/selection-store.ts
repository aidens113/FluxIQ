import type { NodeStatePhase } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../shared/selection-contracts";
import { createScopedExternalStore, type ScopedExternalStore } from "./external-store";

export type AutomationPendingStateOpen = {
  key?: string;
  nodeId?: string;
  sourceId?: string;
  phase?: NodeStatePhase;
  evidenceId?: string;
  factPath?: string;
  recordingId?: string;
  timelineEntryId?: string;
  stateSnapshotId?: string;
};

export type AutomationSelectionState = {
  selection: AutomationSelection | null;
  pendingStateOpen: AutomationPendingStateOpen | null;
  bottomPreviewEntryId: string | null;
  recordingPrimaryKind: "recording" | "proposal" | null;
};

export type AutomationSelectionStore = ScopedExternalStore<AutomationSelectionState> & {
  select(selection: AutomationSelection | null): boolean;
  requestStateOpen(request: AutomationPendingStateOpen | null): boolean;
  setBottomPreview(entryId: string | null): boolean;
  setRecordingPrimaryKind(kind: AutomationSelectionState["recordingPrimaryKind"]): boolean;
};

export function createAutomationSelectionStore(initial: AutomationSelectionState = {
  selection: null,
  pendingStateOpen: null,
  bottomPreviewEntryId: null,
  recordingPrimaryKind: null
}): AutomationSelectionStore {
  const store = createScopedExternalStore(initial);
  return {
    ...store,
    select: (selection) => store.update((current) => sameSelection(current.selection, selection) ? current : { ...current, selection }, ["selection"]),
    requestStateOpen: (pendingStateOpen) => store.update((current) => Object.is(current.pendingStateOpen, pendingStateOpen) ? current : { ...current, pendingStateOpen }, ["state-open"]),
    setBottomPreview: (bottomPreviewEntryId) => store.update((current) => current.bottomPreviewEntryId === bottomPreviewEntryId ? current : { ...current, bottomPreviewEntryId }, ["preview"]),
    setRecordingPrimaryKind: (recordingPrimaryKind) => store.update((current) => current.recordingPrimaryKind === recordingPrimaryKind ? current : { ...current, recordingPrimaryKind }, ["recording-primary"])
  };
}

function sameSelection(left: AutomationSelection | null, right: AutomationSelection | null): boolean {
  return left === right || Boolean(left && right && left.kind === right.kind && left.id === right.id);
}