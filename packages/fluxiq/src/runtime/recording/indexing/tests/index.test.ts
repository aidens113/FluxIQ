import { describe, expect, it } from "vitest";
import { assertValidRecordingIndex, emptyRecordingIndex, isRecordingIndex, recordingActionVisualTargetIndexItem, recordingIndexStateObjectRefs, sortRecordingIndex, validateRecordingIndex } from "../index.ts";
import { fixtureIndex, projectId, recordingId, ref, references } from "./fixture.ts";

describe("canonical recording index", () => {
  it("accepts the complete action-to-state structure through an explicit reference policy", () => {
    const index = fixtureIndex();
    expect(validateRecordingIndex(index, references)).toEqual([]);
    expect(() => assertValidRecordingIndex(index, references)).not.toThrow();
    expect(isRecordingIndex(index)).toBe(true);
    expect([null, [], {}, { ...index, schemaVersion: "0.1" }, { ...index, states: [] }].map(isRecordingIndex)).toEqual([false, false, false, false, false]);
  });

  it("projects only the defined visual summary fields and validates their state links", () => {
    const index = fixtureIndex();
    const target = { entityId: "machine.switch", entityKind: "switch", statePath: { namespace: "machine", path: "switch" }, stateSnapshotId: "state.one", visualFrameId: "frame", visualLayerId: "layer", confidence: 0.9, metadata: { retainedAtSource: true } };
    index.actions["action.one"]!.visualTarget = recordingActionVisualTargetIndexItem(target)!;
    expect(index.actions["action.one"]!.visualTarget).toStrictEqual({ entityId: "machine.switch", entityKind: "switch", statePath: target.statePath, stateSnapshotId: "state.one", visualFrameId: "frame", visualLayerId: "layer", confidence: 0.9 });
    expect(recordingActionVisualTargetIndexItem({ entityId: "only" })).toStrictEqual({ entityId: "only" });
    expect(recordingActionVisualTargetIndexItem(undefined)).toBeUndefined();
    expect(validateRecordingIndex(index, references)).toEqual([]);
  });

  it("preserves missing-link diagnostics and their deterministic order", () => {
    const index = fixtureIndex();
    index.entries["entry.action"]!.stateSnapshotId = "state.missing";
    index.actions["action.one"]!.stateAtActionId = "state.missing";
    index.actions["action.one"]!.visualTarget = { stateSnapshotId: "state.missing" };
    index.states["state.one"]!.linkedActionIds = ["action.missing"];
    expect(validateRecordingIndex(index, references)).toStrictEqual([
      { code: "missing_state", path: "entries.entry.action.stateSnapshotId", message: "Entry references missing state snapshot state.missing." },
      { code: "missing_state", path: "actions.action.one.stateAtActionId", message: "Action references missing state snapshot state.missing." },
      { code: "missing_state", path: "actions.action.one.visualTarget.stateSnapshotId", message: "Action visual target references missing state snapshot state.missing." },
      { code: "missing_action", path: "states.state.one.linkedActionIds", message: "State links missing action action.missing." }
    ]);
    expect(() => assertValidRecordingIndex(index, references)).toThrow("Recording state index is invalid:\n- entries.entry.action.stateSnapshotId: Entry references missing state snapshot state.missing.");
  });

  it("sorts only indexed records while retaining complete item and summary data", () => {
    const index = emptyRecordingIndex({ projectId, recordingId, name: "Machine", startedAt: 10, endedAt: 15, updatedAt: 20, timelineRef: "events" });
    index.entries.b = { entryId: "b", type: "action", objectRefs: [ref("b")] };
    index.entries.a = { entryId: "a", type: "observation", objectRefs: [ref("a")] };
    const sorted = sortRecordingIndex(index);
    expect(Object.keys(sorted.entries)).toEqual(["a", "b"]);
    expect(sorted.summary).toStrictEqual({ name: "Machine", startedAt: 10, endedAt: 15, eventCount: 0, actionCount: 0, stateSnapshotCount: 0, proposalCount: 0, updatedAt: 20 });
    expect(sorted.timeline).toStrictEqual({ timelineRef: "events" });
    expect(sorted.entries.a).toBe(index.entries.a);
    expect(Object.keys(index.entries)).toEqual(["b", "a"]);
  });

  it("unions all entry, action, state and proposal refs without interpreting opaque strings", () => {
    const index = fixtureIndex();
    index.entries["entry.action"]!.objectRefs = ["opaque", ref("one")];
    index.actions["action.one"]!.sourceObjectRefs = [ref("action")];
    index.states["state.one"]!.screenshotRef = ref("shot");
    index.proposals.p = { proposalId: "p", recordingId, kind: "custom", status: "draft", updatedAt: 20, objectRefs: [ref("proposal"), "opaque"] };
    expect(recordingIndexStateObjectRefs(index)).toEqual(["opaque", ref("one"), ref("two"), ref("action"), ref("shot"), ref("proposal")].sort());
  });
});
