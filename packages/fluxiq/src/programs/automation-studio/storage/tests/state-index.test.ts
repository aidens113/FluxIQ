import { describe, expect, it } from "vitest";
import { assertValidRecordingIndex, emptyRecordingIndex, recordingIndexStateObjectRefs, validateRecordingIndex, type RecordingIndex } from "../state-index.ts";
import { validateRecordingIndex as canonicalValidate } from "../../../../runtime/recording/indexing/index.ts";
import { automationStudioRecordingReferenceReader } from "../recording-index-policy/index.ts";

const projectId = "project.one";
const stateRef = `automation-object://project/${encodeURIComponent(projectId)}/${"a".repeat(64)}`;
const screenshotRef = `automation-object://project/${encodeURIComponent(projectId)}/${"b".repeat(64)}`;

describe("Studio recording index reference policy", () => {
  it("keeps valid full legacy projections compatible with explicit canonical validation", () => {
    const index = fixtureIndex();
    expect(validateRecordingIndex(index)).toStrictEqual([]);
    expect(validateRecordingIndex(index)).toStrictEqual(canonicalValidate(index, automationStudioRecordingReferenceReader));
    expect(() => assertValidRecordingIndex(index)).not.toThrow();
    expect(recordingIndexStateObjectRefs(index)).toEqual([stateRef, screenshotRef].sort());
  });

  it("retains exact invalid and cross-project object-reference diagnostics", () => {
    const index = fixtureIndex();
    index.states["state.snapshot"]!.stateRef = "invalid-ref";
    index.states["state.snapshot"]!.screenshotRef = `automation-object://project/${encodeURIComponent("project.two")}/${"c".repeat(64)}`;
    expect(validateRecordingIndex(index)).toStrictEqual([
      { code: "invalid_object_ref", path: "states.state.snapshot.objectRefs", message: "Object reference is not an Automation Studio content ref: invalid-ref" },
      { code: "cross_project_ref", path: "states.state.snapshot.objectRefs", message: "Object reference points to project project.two, expected project.one." }
    ]);
    expect(() => assertValidRecordingIndex(index)).toThrow("Recording state index is invalid:\n- states.state.snapshot.objectRefs: Object reference is not an Automation Studio content ref: invalid-ref");
  });

  it("keeps the existing API ref syntax and encoded same-project identity interpretation", () => {
    const index = fixtureIndex();
    index.states["state.snapshot"]!.stateRef = `/api/programs/automation-studio/state-assets/${encodeURIComponent(projectId)}/${"d".repeat(64)}`;
    expect(validateRecordingIndex(index)).toEqual([]);
    expect(automationStudioRecordingReferenceReader.accepts(stateRef, { projectId })).toBe(true);
    expect(automationStudioRecordingReferenceReader.accepts(stateRef, { projectId: "other" })).toBe(false);
    expect(automationStudioRecordingReferenceReader.validate("object://arbitrary", { projectId })).toStrictEqual({ ok: false, code: "invalid_object_ref", message: "Object reference is not an Automation Studio content ref: object://arbitrary" });
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
