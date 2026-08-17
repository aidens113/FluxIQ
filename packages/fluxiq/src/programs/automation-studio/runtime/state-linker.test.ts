import { describe, expect, it } from "vitest";
import { emptyRecordingIndex, type RecordingIndex } from "../storage/state-index.ts";
import { finalizeRecordingStateLinks } from "./state-linker.ts";

const projectId = "project.one";
const recordingId = "recording.one";
const stateRef = (suffix: string) => `automation-object://project/${encodeURIComponent(projectId)}/${suffix.repeat(64).slice(0, 64)}`;

describe("finalizeRecordingStateLinks", () => {
  it("keeps explicit valid action state links", () => {
    const index = fixtureIndex();
    index.actions["action.one"]!.stateAtActionId = "state.two";
    index.entries["entry.action"]!.stateSnapshotId = "state.two";

    const result = finalizeRecordingStateLinks(index, { preserveExistingLinks: true });

    expect(result.warnings).toEqual([]);
    expect(result.index.actions["action.one"]?.stateAtActionId).toBe("state.two");
    expect(result.index.states["state.two"]?.linkedActionIds).toEqual(["action.one"]);
  });

  it("links to the nearest prior state when no explicit link exists", () => {
    const index = fixtureIndex();
    delete index.actions["action.one"]!.stateAtActionId;
    delete index.entries["entry.action"]!.stateSnapshotId;

    const result = finalizeRecordingStateLinks(index);

    expect(result.index.actions["action.one"]?.stateAtActionId).toBe("state.one");
    expect(result.index.entries["entry.action"]?.stateSnapshotId).toBe("state.one");
    expect(result.index.states["state.one"]?.linkedActionIds).toEqual(["action.one"]);
  });

  it("links to a later state when it is closer than the prior state", () => {
    const index = fixtureIndex();
    delete index.actions["action.one"]!.stateAtActionId;
    delete index.entries["entry.action"]!.stateSnapshotId;
    index.entries["entry.state.one"]!.timestamp = 1;
    index.states["state.one"]!.timestamp = 1;
    index.entries["entry.action"]!.timestamp = 50;
    index.actions["action.one"]!.startedAt = 50;
    index.entries["entry.state.two"]!.timestamp = 51;
    index.states["state.two"]!.timestamp = 51;

    const result = finalizeRecordingStateLinks(index);

    expect(result.index.actions["action.one"]?.stateAtActionId).toBe("state.two");
    expect(result.index.entries["entry.action"]?.stateSnapshotId).toBe("state.two");
  });

  it("warns when actions have no state snapshots", () => {
    const index = fixtureIndex();
    index.states = {};
    delete index.actions["action.one"]!.stateAtActionId;
    delete index.entries["entry.action"]!.stateSnapshotId;

    const result = finalizeRecordingStateLinks(index);

    expect(result.warnings.map((warning) => warning.code)).toEqual(["no_states", "action_without_state"]);
    expect(result.index.actions["action.one"]?.stateAtActionId).toBeUndefined();
  });

  it("reports ambiguous same-timestamp state candidates", () => {
    const index = fixtureIndex();
    delete index.actions["action.one"]!.stateAtActionId;
    delete index.entries["entry.action"]!.stateSnapshotId;
    index.entries["entry.state.two"]!.timestamp = 10;
    index.states["state.two"]!.timestamp = 10;

    const result = finalizeRecordingStateLinks(index);

    expect(result.warnings).toMatchObject([{ code: "ambiguous_state_timestamp", entryId: "entry.action" }]);
    expect(result.index.actions["action.one"]?.stateAtActionId).toBe("state.one");
  });
});

function fixtureIndex(): RecordingIndex {
  const index = emptyRecordingIndex({ projectId, recordingId, startedAt: 1, updatedAt: 20 });
  index.entries["entry.state.one"] = { entryId: "entry.state.one", type: "observation", timestamp: 10, sequence: 0, stateSnapshotId: "state.one" };
  index.entries["entry.action"] = { entryId: "entry.action", type: "action", timestamp: 11, sequence: 1, actionId: "action.one", stateSnapshotId: "state.one" };
  index.entries["entry.state.two"] = { entryId: "entry.state.two", type: "observation", timestamp: 12, sequence: 2, stateSnapshotId: "state.two" };
  index.actions["action.one"] = { actionId: "action.one", entryId: "entry.action", actionType: "click", startedAt: 11, stateAtActionId: "state.one" };
  index.states["state.one"] = { stateSnapshotId: "state.one", entryId: "entry.state.one", timestamp: 10, stateRef: stateRef("a"), objectRefs: [stateRef("a")], linkedActionIds: [] };
  index.states["state.two"] = { stateSnapshotId: "state.two", entryId: "entry.state.two", timestamp: 12, stateRef: stateRef("b"), objectRefs: [stateRef("b")], linkedActionIds: [] };
  return index;
}
