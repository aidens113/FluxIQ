import type { RecordingSession } from "../../../model/index.ts";
import { emptyRecordingIndex, recordingActionVisualTargetIndexItem, sortRecordingIndex, type RecordingIndex as RecordingStateIndex } from "../../../storage/index.ts";
import { finalizeRecordingStateLinks } from "../../state-linker.ts";
import { recordingEntryActionId, recordingEntryActionType, recordingEntryIndexedTimestamp, recordingEntryIsActionLike, recordingEntryObjectRefs } from "./entry-readings.ts";
import { recordingEntryExplicitStateSnapshotId, recordingEntryIsStateSnapshot, recordingEntryStateIndexItem, recordingEntryStateSnapshotId } from "./state-entry-readings.ts";

// Building a recording's state index from its timeline: one pass over the
// entries, recording the states, the actions, and the links between them.

export function buildRecordingStateIndex(projectId: string, recording: RecordingSession): RecordingStateIndex {
  const now = Date.now();
  const index = emptyRecordingIndex({
    projectId,
    recordingId: recording.recordingId,
    startedAt: recording.startedAt,
    ...(recording.endedAt !== undefined ? { endedAt: recording.endedAt } : {}),
    updatedAt: now
  });
  index.summary = {
    ...index.summary,
    eventCount: recording.timeline.length,
    actionCount: recording.timeline.filter(recordingEntryIsActionLike).length,
    stateSnapshotCount: recording.timeline.filter(recordingEntryIsStateSnapshot).length,
    proposalCount: 0,
    updatedAt: now
  };
  index.timeline = {
    timelineRef: "timeline.jsonl",
    ...(recording.timeline[0]?.id ? { firstEntryId: recording.timeline[0].id } : {}),
    ...(recording.timeline.at(-1)?.id ? { lastEntryId: recording.timeline.at(-1)!.id } : {})
  };

  for (const [sequence, entry] of recording.timeline.entries()) {
    const actionId = recordingEntryActionId(entry);
    const indexedTimestamp = recordingEntryIndexedTimestamp(entry);
    index.entries[entry.id] = {
      entryId: entry.id,
      type: entry.type,
      ...(indexedTimestamp !== undefined ? { timestamp: indexedTimestamp } : {}),
      ...(typeof (entry as { startedAt?: unknown }).startedAt === "number" ? { startedAt: (entry as { startedAt: number }).startedAt } : {}),
      ...(typeof (entry as { completedAt?: unknown }).completedAt === "number" ? { completedAt: (entry as { completedAt: number }).completedAt } : {}),
      ...(typeof (entry as { monotonicOffsetMs?: unknown }).monotonicOffsetMs === "number" ? { monotonicOffsetMs: (entry as { monotonicOffsetMs: number }).monotonicOffsetMs } : {}),
      sequence,
      ...(actionId ? { actionId } : {}),
      objectRefs: recordingEntryObjectRefs(projectId, entry)
    };

    let stateSnapshotId = recordingEntryStateSnapshotId(entry);
    if (recordingEntryIsStateSnapshot(entry) && stateSnapshotId) {
      const stateItem = recordingEntryStateIndexItem(projectId, entry, stateSnapshotId);
      if (stateItem) {
        index.states[stateSnapshotId] = stateItem;
        index.entries[entry.id] = { ...index.entries[entry.id]!, stateSnapshotId };
      } else {
        stateSnapshotId = undefined;
      }
    }

    if (actionId) {
      const actionStateId = recordingEntryExplicitStateSnapshotId(entry);
      const visualTargetIndexItem = recordingActionVisualTargetIndexItem((entry as { visualTarget?: any }).visualTarget);
      index.actions[actionId] = {
        actionId,
        entryId: entry.id,
        actionType: recordingEntryActionType(entry),
        ...(typeof (entry as { outputId?: unknown }).outputId === "string" ? { outputId: (entry as { outputId: string }).outputId } : {}),
        ...(typeof (entry as { startedAt?: unknown }).startedAt === "number" ? { startedAt: (entry as { startedAt: number }).startedAt } : {}),
        ...(typeof (entry as { completedAt?: unknown }).completedAt === "number" ? { completedAt: (entry as { completedAt: number }).completedAt } : {}),
        ...(actionStateId ? { stateAtActionId: actionStateId } : {}),
        ...(visualTargetIndexItem ? { visualTarget: visualTargetIndexItem } : {}),
        sourceObjectRefs: recordingEntryObjectRefs(projectId, entry)
      };
      if (actionStateId) {
        index.entries[entry.id] = { ...index.entries[entry.id]!, stateSnapshotId: actionStateId };
        if (index.states[actionStateId] && !index.states[actionStateId]!.linkedActionIds.includes(actionId)) {
          index.states[actionStateId] = {
            ...index.states[actionStateId]!,
            linkedActionIds: [...index.states[actionStateId]!.linkedActionIds, actionId].sort()
          };
        }
      }
    }
  }

  return finalizeRecordingStateLinks(sortRecordingIndex(index)).index;
}
