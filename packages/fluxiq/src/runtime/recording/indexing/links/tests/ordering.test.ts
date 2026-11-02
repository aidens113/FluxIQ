import { expect, it } from "vitest";
import { finalizeRecordingStateLinks } from "../index.ts";
import { fixtureIndex } from "../../tests/fixture.ts";

it("clones the entire index and changes only finalized links", () => {
  const input = fixtureIndex();
  input.actions["action.one"]!.stateBeforeId = "state.one";
  input.actions["action.one"]!.stateAfterId = "state.two";
  input.states["state.two"]!.linkedActionIds = ["stale"];
  input.proposals.p = { proposalId: "p", recordingId: input.recordingId, kind: "custom", status: "draft", updatedAt: 20, stateSnapshotIds: ["state.two"], objectRefs: ["opaque"] };
  const before = structuredClone(input);
  const expected = structuredClone(input);
  expected.states["state.one"]!.linkedActionIds = ["action.one"];
  expected.states["state.two"]!.linkedActionIds = [];
  const result = finalizeRecordingStateLinks(input);
  expect(result).toStrictEqual({ index: expected, warnings: [] });
  expect(input).toStrictEqual(before);
  expect(result.index.entries["entry.action"]).not.toBe(input.entries["entry.action"]);
  expect(result.index.proposals.p).not.toBe(input.proposals.p);
});

it.each([
  { firstOffset: 3, secondOffset: 2, selected: "state.two" },
  { firstOffset: 2, secondOffset: 2, selected: "state.one" }
])("breaks same-time state ties by offset then entry identity: $selected", ({ firstOffset, secondOffset, selected }) => {
  const index = fixtureIndex();
  index.entries["entry.state.two"]!.timestamp = 10;
  index.states["state.two"]!.timestamp = 10;
  index.states["state.one"]!.monotonicOffsetMs = firstOffset;
  index.states["state.two"]!.monotonicOffsetMs = secondOffset;
  const result = finalizeRecordingStateLinks(index);
  expect(result.index.actions["action.one"]!.stateAtActionId).toBe(selected);
  expect(result.warnings).toStrictEqual([{ code: "ambiguous_state_timestamp", entryId: "entry.action", message: `Action entry entry.action matched multiple state snapshots at the same timestamp; chose ${selected}.` }]);
});
