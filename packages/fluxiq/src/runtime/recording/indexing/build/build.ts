import type { EmptyRecordingIndexInput, RecordingActionIndexItem, RecordingEntryIndexItem, RecordingIndex, RecordingSession, TimelineEntry } from "@fluxiq/contracts/recording";
import type { ActionVisualEntityTarget } from "@fluxiq/contracts/runtime";
import { emptyRecordingIndex } from "../empty.ts";
import { readRecordingIndexItem, writeRecordingIndexItem } from "../dictionary/index.ts";
import { recordingEntryActionId, recordingEntryActionType, recordingEntryExplicitStateSnapshotId, recordingEntryIndexedTimestamp, recordingEntryIsActionLike, recordingEntryIsStateSnapshot, recordingEntryObjectRefs, recordingEntryStateIndexItem, recordingEntryStateSnapshotId } from "../entries/index.ts";
import { finalizeRecordingStateLinks } from "../links/index.ts";
import type { RecordingIndexBuildPorts } from "../policy/index.ts";
import { sortRecordingIndex } from "../sort.ts";
import { recordingActionVisualTargetIndexItem } from "../visual-target.ts";

export function buildRecordingStateIndex<TTarget, TEvidence>(projectId: string, recording: RecordingSession<TTarget, TEvidence>, ports: RecordingIndexBuildPorts): RecordingIndex {
  const now = ports.now();
  const input: EmptyRecordingIndexInput = { projectId, recordingId: recording.recordingId, startedAt: recording.startedAt, updatedAt: now };
  if (recording.endedAt !== undefined) input.endedAt = recording.endedAt;
  const index = emptyRecordingIndex(input);
  index.summary = {
    ...index.summary,
    eventCount: recording.timeline.length,
    actionCount: recording.timeline.filter(recordingEntryIsActionLike).length,
    stateSnapshotCount: recording.timeline.filter((entry) => recordingEntryIsStateSnapshot(entry, ports.observations)).length,
    proposalCount: 0,
    updatedAt: now
  };
  if (recording.timeline[0]?.id) index.timeline.firstEntryId = recording.timeline[0].id;
  if (recording.timeline.at(-1)?.id) index.timeline.lastEntryId = recording.timeline.at(-1)!.id;
  for (const [sequence, entry] of recording.timeline.entries()) {
    const actionId = recordingEntryActionId(entry);
    const entryItem = indexedEntry(projectId, entry, sequence, actionId, ports);
    writeRecordingIndexItem(index.entries, entry.id, entryItem);
    const stateSnapshotId = recordingEntryStateSnapshotId(entry, ports.observations);
    if (recordingEntryIsStateSnapshot(entry, ports.observations) && stateSnapshotId) {
      const stateItem = recordingEntryStateIndexItem(projectId, entry, stateSnapshotId, ports);
      if (stateItem) {
        writeRecordingIndexItem(index.states, stateSnapshotId, stateItem);
        entryItem.stateSnapshotId = stateSnapshotId;
      }
    }
    if (actionId) {
      const actionStateId = recordingEntryExplicitStateSnapshotId(entry);
      writeRecordingIndexItem(index.actions, actionId, indexedAction(projectId, entry, actionId, actionStateId, ports));
      if (actionStateId) {
        entryItem.stateSnapshotId = actionStateId;
        const state = readRecordingIndexItem(index.states, actionStateId);
        if (state && !state.linkedActionIds.includes(actionId)) {
          writeRecordingIndexItem(index.states, actionStateId, { ...state, linkedActionIds: [...state.linkedActionIds, actionId].sort() });
        }
      }
    }
  }
  return finalizeRecordingStateLinks(sortRecordingIndex(index)).index;
}

function indexedEntry(projectId: string, entry: TimelineEntry<unknown, unknown>, sequence: number, actionId: string | undefined, ports: RecordingIndexBuildPorts): RecordingEntryIndexItem {
  const timestamp = recordingEntryIndexedTimestamp(entry, ports.observations);
  const item: RecordingEntryIndexItem = { entryId: entry.id, type: entry.type };
  if (timestamp !== undefined) item.timestamp = timestamp;
  if ("startedAt" in entry && typeof entry.startedAt === "number") item.startedAt = entry.startedAt;
  if ("completedAt" in entry && typeof entry.completedAt === "number") item.completedAt = entry.completedAt;
  if (typeof entry.monotonicOffsetMs === "number") item.monotonicOffsetMs = entry.monotonicOffsetMs;
  item.sequence = sequence;
  if (actionId) item.actionId = actionId;
  item.objectRefs = recordingEntryObjectRefs(projectId, entry, ports.references);
  return item;
}

function indexedAction(projectId: string, entry: TimelineEntry<unknown, unknown>, actionId: string, stateAtActionId: string | undefined, ports: RecordingIndexBuildPorts): RecordingActionIndexItem {
  const item: RecordingActionIndexItem = { actionId, entryId: entry.id, actionType: recordingEntryActionType(entry) };
  if ("outputId" in entry && typeof entry.outputId === "string") item.outputId = entry.outputId;
  if ("startedAt" in entry && typeof entry.startedAt === "number") item.startedAt = entry.startedAt;
  if ("completedAt" in entry && typeof entry.completedAt === "number") item.completedAt = entry.completedAt;
  if (stateAtActionId) item.stateAtActionId = stateAtActionId;
  const target = "visualTarget" in entry ? entry.visualTarget as ActionVisualEntityTarget | undefined : undefined;
  const visualTarget = recordingActionVisualTargetIndexItem(target);
  if (visualTarget) item.visualTarget = visualTarget;
  item.sourceObjectRefs = recordingEntryObjectRefs(projectId, entry, ports.references);
  return item;
}
