import type { RecordingIndex } from "@fluxiq/contracts/recording";
import { appendRecordingEntry, createRecordingSession } from "../../../../model/index.ts";

export const projectId = "project.index";
export const ref = (value: string, project = projectId) => `automation-object://project/${encodeURIComponent(project)}/${value.repeat(64)}`;

export function projectionRecording() {
  let recording = createRecordingSession({ recordingId: "recording.index", startedAt: 1, initialState: { timestamp: 0, namespaces: {} } });
  recording = appendRecordingEntry(recording, {
    id: "entry.state",
    type: "observation",
    observationType: "client.state_snapshot",
    timestamp: 200,
    monotonicOffsetMs: 9,
    metadata: { eventTimestampMs: Number.NaN, actionTimestampMs: 101, asset: ref("d") },
    payload: {
      snapshotId: " state.primary ",
      stateRef: ref("a"),
      screenshotRef: ref("b"),
      state: { timestamp: 90, namespaces: {} },
      metadata: {
        eventTimestampMs: 102,
        screenshotRef: ` ${ref("c")} `,
        visualFrameId: " frame.one ",
        coordinateSpace: { width: 800, height: 600, unit: "px", origin: "top-left" }
      }
    }
  });
  recording = appendRecordingEntry(recording, {
    id: "entry.action",
    type: "action",
    actionType: " mark ",
    outputId: "archive.mark",
    origin: "operator",
    parameters: { record: "r" },
    timestamp: 180,
    startedAt: 120,
    completedAt: 125,
    monotonicOffsetMs: 15,
    metadata: { eventTimestampMs: 110, stateSnapshotId: "state.primary", refs: [ref("a"), ref("d"), ref("e", "other")] },
    visualTarget: {
      entityId: "record.mark",
      entityKind: "button",
      statePath: { namespace: "archive", path: "mark" },
      stateSnapshotId: "state.primary",
      visualFrameId: "frame.one",
      visualLayerId: "layer.one",
      confidence: 0.7,
      metadata: { privateProjection: "not copied" }
    }
  });
  const note = { id: "entry.note", recordingId: recording.recordingId, type: "note" as const, noteId: "note.one", timestamp: 130, monotonicOffsetMs: 129, sequence: 2, sourceId: "source.host" };
  return { ...recording, timeline: [...recording.timeline, note], endedAt: 300 };
}

export function expectedProjection(): RecordingIndex {
  const stateRefs = [` ${ref("c")} `, ref("a"), ref("b"), ref("c"), ref("d")].sort();
  return {
    schemaVersion: "0.2",
    projectId,
    recordingId: "recording.index",
    summary: { startedAt: 1, endedAt: 300, eventCount: 3, actionCount: 1, stateSnapshotCount: 1, proposalCount: 0, updatedAt: 500 },
    timeline: { timelineRef: "timeline.jsonl", firstEntryId: "entry.state", lastEntryId: "entry.note" },
    entries: {
      "entry.action": { entryId: "entry.action", type: "action", timestamp: 110, startedAt: 120, completedAt: 125, monotonicOffsetMs: 15, sequence: 1, actionId: "action.entry.action", objectRefs: [ref("a"), ref("d")], stateSnapshotId: "state.primary" },
      "entry.note": { entryId: "entry.note", type: "note", timestamp: 130, monotonicOffsetMs: 129, sequence: 2, objectRefs: [] },
      "entry.state": { entryId: "entry.state", type: "observation", timestamp: 101, monotonicOffsetMs: 9, sequence: 0, objectRefs: [` ${ref("c")} `, ref("a"), ref("b"), ref("d")].sort(), stateSnapshotId: "state.primary" }
    },
    actions: {
      "action.entry.action": {
        actionId: "action.entry.action",
        entryId: "entry.action",
        actionType: "mark",
        outputId: "archive.mark",
        startedAt: 120,
        completedAt: 125,
        stateAtActionId: "state.primary",
        visualTarget: { entityId: "record.mark", entityKind: "button", statePath: { namespace: "archive", path: "mark" }, stateSnapshotId: "state.primary", visualFrameId: "frame.one", visualLayerId: "layer.one", confidence: 0.7 },
        sourceObjectRefs: [ref("a"), ref("d")]
      }
    },
    states: {
      "state.primary": {
        stateSnapshotId: "state.primary",
        entryId: "entry.state",
        timestamp: 101,
        monotonicOffsetMs: 9,
        stateRef: ref("a"),
        screenshotRef: ref("c"),
        visualFrameId: "frame.one",
        coordinateSpace: { width: 800, height: 600, unit: "px", origin: "top-left" },
        objectRefs: stateRefs,
        linkedActionIds: ["action.entry.action"]
      }
    },
    proposals: {}
  };
}
