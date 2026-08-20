import { describe, expect, it } from "vitest";
import {
  assertValidRecordingIndex,
  emptyRecordingIndex,
  recordingIndexStateObjectRefs,
  sortRecordingIndex,
  validateRecordingIndex,
  type RecordingIndex
} from "./state-index.ts";

const projectId = "project.one";
const stateRef = `automation-object://project/${encodeURIComponent(projectId)}/${"a".repeat(64)}`;
const screenshotRef = `automation-object://project/${encodeURIComponent(projectId)}/${"b".repeat(64)}`;

describe("Recording state index contracts", () => {
  it("accepts a valid action-to-state index", () => {
    const index = fixtureIndex();

    expect(validateRecordingIndex(index)).toEqual([]);
    expect(() => assertValidRecordingIndex(index)).not.toThrow();
    expect(recordingIndexStateObjectRefs(index)).toEqual([stateRef, screenshotRef].sort());
  });

  it("accepts action visual target summaries distinct from state links", () => {
    const index = fixtureIndex();
    index.actions["action.click"]!.visualTarget = {
      entityId: "checkout.submit",
      entityKind: "button",
      statePath: { namespace: "app", path: "elements.submit.visible" },
      stateSnapshotId: "state.snapshot",
      visualFrameId: "viewport",
      visualLayerId: "element.submit",
      confidence: 0.9
    };

    expect(validateRecordingIndex(index)).toEqual([]);
  });

  it("rejects missing state refs and missing action links", () => {
    const index = fixtureIndex();
    index.entries["entry.action"]!.stateSnapshotId = "state.missing";
    index.actions["action.click"]!.stateAtActionId = "state.missing";
    index.actions["action.click"]!.visualTarget = { entityId: "checkout.submit", stateSnapshotId: "state.missing" };
    index.states["state.snapshot"]!.linkedActionIds = ["action.missing"];

    expect(validateRecordingIndex(index).map((issue) => issue.code)).toEqual([
      "missing_state",
      "missing_state",
      "missing_state",
      "missing_action"
    ]);
    expect(() => assertValidRecordingIndex(index)).toThrow("Recording state index is invalid");
  });

  it("rejects object refs from another project", () => {
    const index = fixtureIndex();
    index.states["state.snapshot"]!.screenshotRef = `automation-object://project/${encodeURIComponent("project.two")}/${"c".repeat(64)}`;

    expect(validateRecordingIndex(index)).toMatchObject([
      {
        code: "cross_project_ref",
        path: "states.state.snapshot.objectRefs"
      }
    ]);
  });

  it("sorts records deterministically", () => {
    const index = emptyRecordingIndex({ projectId, recordingId: "recording.one", startedAt: 10, updatedAt: 20 });
    index.entries.b = { entryId: "b", type: "action" };
    index.entries.a = { entryId: "a", type: "observation" };

    expect(Object.keys(sortRecordingIndex(index).entries)).toEqual(["a", "b"]);
  });
});

function fixtureIndex(): RecordingIndex {
  const index = emptyRecordingIndex({
    projectId,
    recordingId: "recording.one",
    name: "Recording One",
    startedAt: 100,
    updatedAt: 200
  });
  index.summary.eventCount = 2;
  index.summary.actionCount = 1;
  index.summary.stateSnapshotCount = 1;
  index.timeline = { timelineRef: "timeline.jsonl", firstEntryId: "entry.state", lastEntryId: "entry.action" };
  index.entries["entry.state"] = {
    entryId: "entry.state",
    type: "observation",
    timestamp: 101,
    stateSnapshotId: "state.snapshot"
  };
  index.entries["entry.action"] = {
    entryId: "entry.action",
    type: "action",
    timestamp: 110,
    actionId: "action.click",
    stateSnapshotId: "state.snapshot"
  };
  index.actions["action.click"] = {
    actionId: "action.click",
    entryId: "entry.action",
    actionType: "click",
    startedAt: 110,
    stateAtActionId: "state.snapshot"
  };
  index.states["state.snapshot"] = {
    stateSnapshotId: "state.snapshot",
    entryId: "entry.state",
    timestamp: 101,
    stateRef,
    screenshotRef,
    objectRefs: [stateRef, screenshotRef],
    linkedActionIds: ["action.click"]
  };
  return index;
}
