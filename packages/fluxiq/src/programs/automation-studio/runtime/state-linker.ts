import { sortRecordingIndex, type RecordingIndex } from "../storage/state-index.ts";

export type RecordingStateLinkWarning = {
  code: "no_states" | "action_without_state" | "ambiguous_state_timestamp";
  actionId?: string;
  entryId?: string;
  message: string;
};

export type FinalizeRecordingStateLinksResult = {
  index: RecordingIndex;
  warnings: RecordingStateLinkWarning[];
};

export function finalizeRecordingStateLinks(input: RecordingIndex, options: { preserveExistingLinks?: boolean } = {}): FinalizeRecordingStateLinksResult {
  const index = sortRecordingIndex(structuredClone(input));
  const warnings: RecordingStateLinkWarning[] = [];
  const states = Object.values(index.states).sort(compareStateItems);
  if (!states.length && Object.keys(index.actions).length) {
    warnings.push({ code: "no_states", message: "Recording has actions but no indexed state snapshots." });
  }

  for (const state of Object.values(index.states)) state.linkedActionIds = [];

  for (const action of Object.values(index.actions).sort((left, right) => compareEntryOrder(index, left.entryId, right.entryId))) {
    const entry = index.entries[action.entryId];
    const selected = options.preserveExistingLinks === true
      ? existingState(index, action.stateAtActionId) ?? existingState(index, entry?.stateSnapshotId) ?? selectStateForAction(index, action.entryId, states, warnings)
      : selectStateForAction(index, action.entryId, states, warnings) ?? existingState(index, action.stateAtActionId) ?? existingState(index, entry?.stateSnapshotId);

    if (!selected) {
      warnings.push({
        code: "action_without_state",
        actionId: action.actionId,
        entryId: action.entryId,
        message: `Action ${action.actionId} has no linked state snapshot.`
      });
      delete action.stateAtActionId;
      if (entry) delete entry.stateSnapshotId;
      continue;
    }

    action.stateAtActionId = selected.stateSnapshotId;
    if (entry) entry.stateSnapshotId = selected.stateSnapshotId;
    const state = index.states[selected.stateSnapshotId]!;
    if (!state.linkedActionIds.includes(action.actionId)) state.linkedActionIds.push(action.actionId);
  }

  for (const state of Object.values(index.states)) state.linkedActionIds.sort();
  return { index: sortRecordingIndex(index), warnings };
}

function existingState(index: RecordingIndex, stateSnapshotId: string | undefined) {
  return stateSnapshotId ? index.states[stateSnapshotId] : undefined;
}

function selectStateForAction(index: RecordingIndex, actionEntryId: string, states: Array<RecordingIndex["states"][string]>, warnings: RecordingStateLinkWarning[]) {
  const actionEntry = index.entries[actionEntryId];
  if (!actionEntry) return undefined;
  const actionTime = comparableEntryTime(actionEntry);
  const candidates = states
    .map((state) => {
      const stateEntry = index.entries[state.entryId];
      const stateTime = comparableEntryTime(stateEntry) ?? state.timestamp;
      const delta = stateTime - actionTime;
      return { state, stateTime, delta, distance: Math.abs(delta), prior: delta <= 0 };
    })
    .filter((candidate) => Number.isFinite(candidate.stateTime) && Number.isFinite(candidate.distance))
    .sort((left, right) => {
      if (left.distance !== right.distance) return left.distance - right.distance;
      if (left.prior !== right.prior) return left.prior ? -1 : 1;
      return compareStateItems(left.state, right.state);
    });
  const selected = candidates[0]?.state;
  if (selected && candidates[1] && candidates[0]!.stateTime === candidates[1].stateTime && candidates[0]!.distance === candidates[1].distance) {
    warnings.push({
      code: "ambiguous_state_timestamp",
      entryId: actionEntryId,
      message: `Action entry ${actionEntryId} matched multiple state snapshots at the same timestamp; chose ${selected.stateSnapshotId}.`
    });
  }
  return selected;
}

function compareEntryOrder(index: RecordingIndex, leftEntryId: string, rightEntryId: string): number {
  const left = index.entries[leftEntryId];
  const right = index.entries[rightEntryId];
  return (left?.sequence ?? Number.MAX_SAFE_INTEGER) - (right?.sequence ?? Number.MAX_SAFE_INTEGER)
    || (comparableEntryTime(left) ?? Number.MAX_SAFE_INTEGER) - (comparableEntryTime(right) ?? Number.MAX_SAFE_INTEGER)
    || leftEntryId.localeCompare(rightEntryId);
}

function compareStateItems(left: RecordingIndex["states"][string], right: RecordingIndex["states"][string]): number {
  return left.timestamp - right.timestamp
    || (left.monotonicOffsetMs ?? Number.MAX_SAFE_INTEGER) - (right.monotonicOffsetMs ?? Number.MAX_SAFE_INTEGER)
    || left.entryId.localeCompare(right.entryId)
    || left.stateSnapshotId.localeCompare(right.stateSnapshotId);
}

function comparableEntryTime(entry: RecordingIndex["entries"][string] | undefined): number {
  if (!entry) return Number.NaN;
  return entry.timestamp ?? entry.startedAt ?? entry.monotonicOffsetMs ?? Number.NaN;
}
