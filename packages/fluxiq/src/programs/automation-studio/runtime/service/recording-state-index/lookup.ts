import type { AutomationStudioRecordingMapperCandidate } from "../../../nodes/index.ts";
import type { RecordingEntryIndexItem, RecordingIndex as RecordingStateIndex, RecordingStateIndexItem } from "../../../storage/index.ts";
import type { RecordingFlowActionCandidate } from "../../recording-flow-proposal.ts";
import { uniqueStrings } from "../collections.ts";
import { compactJsonObject } from "../compact-json.ts";
import { firstFiniteNumber } from "../scalar-readings/index.ts";
import type { RecordingEntryStateLookupInput, RecordingEntryStateLookupResult } from "./contracts.ts";

// Resolving a state snapshot out of a built index: by snapshot id, by action,
// by entry, or by the latest state at or before an entry.

export function resolveRecordingStateIndexItem(index: RecordingStateIndex, input: RecordingEntryStateLookupInput): { state?: RecordingStateIndexItem; reason: string } {
  if (input.stateSnapshotId) {
    const state = index.states[input.stateSnapshotId];
    return state ? { state, reason: "" } : { reason: `State snapshot ${input.stateSnapshotId} is not indexed for recording ${input.recordingId}.` };
  }
  if (input.actionId) {
    const action = index.actions[input.actionId];
    if (!action) return { reason: `Action ${input.actionId} is not indexed for recording ${input.recordingId}.` };
    if (!action.stateAtActionId) return { reason: `Action ${input.actionId} has no linked state snapshot.` };
    const state = index.states[action.stateAtActionId];
    return state ? { state, reason: "" } : { reason: `Action ${input.actionId} points to missing state snapshot ${action.stateAtActionId}.` };
  }
  if (input.entryId) {
    const entry = index.entries[input.entryId];
    if (!entry) return { reason: `Entry ${input.entryId} is not indexed for recording ${input.recordingId}.` };
    if (entry.stateSnapshotId) {
      const state = index.states[entry.stateSnapshotId];
      return state ? { state, reason: "" } : { reason: `Entry ${input.entryId} points to missing state snapshot ${entry.stateSnapshotId}.` };
    }
    if (entry.actionId) {
      const action = index.actions[entry.actionId];
      const state = action?.stateAtActionId ? index.states[action.stateAtActionId] : undefined;
      if (state) return { state, reason: "" };
    }
    const priorState = latestStateAtOrBeforeEntry(index, entry);
    if (priorState) return { state: priorState, reason: "" };
    return { reason: `Entry ${input.entryId} has no linked state snapshot.` };
  }
  return { reason: "State lookup requires stateSnapshotId, actionId, or entryId." };
}

function latestStateAtOrBeforeEntry(index: RecordingStateIndex, entry: RecordingEntryIndexItem): RecordingStateIndexItem | undefined {
  const targetTime = firstFiniteNumber(entry.startedAt, entry.timestamp, entry.completedAt, entry.monotonicOffsetMs);
  const targetSequence = entry.sequence;
  const states = Object.values(index.states).filter((state) => {
    const stateEntry = index.entries[state.entryId];
    if (targetTime !== undefined) {
      const stateTime = firstFiniteNumber(state.timestamp, stateEntry?.timestamp, stateEntry?.startedAt, state.monotonicOffsetMs, stateEntry?.monotonicOffsetMs);
      if (stateTime !== undefined) return stateTime <= targetTime;
    }
    return targetSequence !== undefined && stateEntry?.sequence !== undefined && stateEntry.sequence <= targetSequence;
  });
  return states.sort((left, right) => {
    const leftEntry = index.entries[left.entryId];
    const rightEntry = index.entries[right.entryId];
    const leftTime = firstFiniteNumber(left.timestamp, leftEntry?.timestamp, leftEntry?.startedAt, left.monotonicOffsetMs, leftEntry?.monotonicOffsetMs) ?? Number.NEGATIVE_INFINITY;
    const rightTime = firstFiniteNumber(right.timestamp, rightEntry?.timestamp, rightEntry?.startedAt, right.monotonicOffsetMs, rightEntry?.monotonicOffsetMs) ?? Number.NEGATIVE_INFINITY;
    if (leftTime !== rightTime) return rightTime - leftTime;
    const leftSequence = leftEntry?.sequence ?? Number.NEGATIVE_INFINITY;
    const rightSequence = rightEntry?.sequence ?? Number.NEGATIVE_INFINITY;
    if (leftSequence !== rightSequence) return rightSequence - leftSequence;
    return right.stateSnapshotId.localeCompare(left.stateSnapshotId);
  })[0];
}

export function proposalNodeStateLinkFromIndex(index: RecordingStateIndex, actionEntryId: string): RecordingFlowActionCandidate["stateLink"] | undefined {
  const entry = index.entries[actionEntryId];
  const action = entry?.actionId ? index.actions[entry.actionId] : undefined;
  const stateSnapshotId = action?.stateAtActionId ?? entry?.stateSnapshotId;
  const state = stateSnapshotId ? index.states[stateSnapshotId] : undefined;
  const stateLink = entry && state ? {
    recordingId: index.recordingId,
    actionEntryId,
    ...(entry.actionId ? { actionId: entry.actionId } : {}),
    stateSnapshotId: state.stateSnapshotId,
    stateRef: state.stateRef,
    ...(state.screenshotRef ? { screenshotRef: state.screenshotRef } : {})
  } : undefined;
  return stateLink;
}

export function resolveCandidateActionEntryId(index: RecordingStateIndex | null, sourceEntryId: string, candidate: AutomationStudioRecordingMapperCandidate): string {
  if (!index) return sourceEntryId;
  for (const entryId of uniqueStrings([sourceEntryId, ...(candidate.sourceObservationIds ?? [])])) {
    const entry = index.entries[entryId];
    if (entry?.actionId || entry?.type === "action") return entryId;
  }
  return sourceEntryId;
}

export function missingRecordingStateLookup(input: RecordingEntryStateLookupInput, reason: string): RecordingEntryStateLookupResult {
  return {
    recordingId: input.recordingId,
    requested: compactJsonObject({ entryId: input.entryId, actionId: input.actionId, stateSnapshotId: input.stateSnapshotId }) as RecordingEntryStateLookupResult["requested"],
    resolved: null,
    reason
  };
}
