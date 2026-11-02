import { readRecordingIndexItem } from "../dictionary/index.ts";
import type { FinalizeRecordingStateLinksResult, RecordingIndex, RecordingStateLinkWarning } from "@fluxiq/contracts/recording";
import { sortRecordingIndex } from "../sort.ts";
import { compareRecordingIndexEntries, compareRecordingIndexStates } from "./order.ts";
import { selectRecordingActionState } from "./selection.ts";

export function finalizeRecordingStateLinks(input: RecordingIndex, options: { preserveExistingLinks?: boolean } = {}): FinalizeRecordingStateLinksResult {
  const index = sortRecordingIndex(structuredClone(input));
  const warnings: RecordingStateLinkWarning[] = [];
  const states = Object.values(index.states).sort(compareRecordingIndexStates);
  if (!states.length && Object.keys(index.actions).length) {
    warnings.push({ code: "no_states", message: "Recording has actions but no indexed state snapshots." });
  }
  for (const state of Object.values(index.states)) state.linkedActionIds = [];
  for (const action of Object.values(index.actions).sort((left, right) => compareRecordingIndexEntries(index, left.entryId, right.entryId))) {
    const entry = readRecordingIndexItem(index.entries, action.entryId);
    const selected = options.preserveExistingLinks === true
      ? existingState(index, action.stateAtActionId) ?? existingState(index, entry?.stateSnapshotId) ?? selectRecordingActionState(index, action.entryId, states, warnings)
      : selectRecordingActionState(index, action.entryId, states, warnings) ?? existingState(index, action.stateAtActionId) ?? existingState(index, entry?.stateSnapshotId);
    if (!selected) {
      warnings.push({ code: "action_without_state", actionId: action.actionId, entryId: action.entryId, message: `Action ${action.actionId} has no linked state snapshot.` });
      delete action.stateAtActionId;
      if (entry) delete entry.stateSnapshotId;
      continue;
    }
    action.stateAtActionId = selected.stateSnapshotId;
    if (entry) entry.stateSnapshotId = selected.stateSnapshotId;
    const state = readRecordingIndexItem(index.states, selected.stateSnapshotId)!;
    if (!state.linkedActionIds.includes(action.actionId)) state.linkedActionIds.push(action.actionId);
  }
  for (const state of Object.values(index.states)) state.linkedActionIds.sort();
  return { index: sortRecordingIndex(index), warnings };
}

function existingState(index: RecordingIndex, stateSnapshotId: string | undefined) {
  return stateSnapshotId ? readRecordingIndexItem(index.states, stateSnapshotId) : undefined;
}
