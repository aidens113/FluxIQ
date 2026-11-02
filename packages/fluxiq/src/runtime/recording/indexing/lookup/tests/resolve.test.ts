import { expect, it } from "vitest";
import { finalizeRecordingStateLinks, missingRecordingStateLookup, proposalNodeStateLinkFromIndex, resolveCandidateActionEntryId, resolveRecordingStateIndexItem } from "../../index.ts";
import { fixtureIndex, projectId, recordingId, ref } from "../../tests/fixture.ts";

const scope = { projectId, recordingId };

it("keeps nearest-action linking distinct from prior-only unlinked entry lookup", () => {
  const input = fixtureIndex();
  input.entries["entry.state.one"]!.timestamp = 1;
  input.states["state.one"]!.timestamp = 1;
  input.entries["entry.action"]!.timestamp = 50;
  input.entries["entry.state.two"]!.timestamp = 51;
  input.states["state.two"]!.timestamp = 51;
  input.entries.event = { entryId: "event", type: "observation", timestamp: 50, sequence: 3 };
  const index = finalizeRecordingStateLinks(input).index;
  expect(resolveRecordingStateIndexItem(index, { ...scope, actionId: "action.one" })).toStrictEqual({ state: index.states["state.two"], reason: "" });
  expect(resolveRecordingStateIndexItem(index, { ...scope, entryId: "event" })).toStrictEqual({ state: index.states["state.one"], reason: "" });
});

it("prioritizes explicit snapshot, action and entry links and preserves missing-target messages", () => {
  const index = fixtureIndex();
  const lookup = (input: { stateSnapshotId?: string; actionId?: string; entryId?: string }) => resolveRecordingStateIndexItem(index, { ...scope, ...input });
  expect(lookup({ stateSnapshotId: "state.two", actionId: "missing" })).toStrictEqual({ state: index.states["state.two"], reason: "" });
  expect(lookup({ stateSnapshotId: "missing" })).toStrictEqual({ reason: `State snapshot missing is not indexed for recording ${recordingId}.` });
  expect(lookup({ actionId: "missing" })).toStrictEqual({ reason: `Action missing is not indexed for recording ${recordingId}.` });
  expect(lookup({ entryId: "missing" })).toStrictEqual({ reason: `Entry missing is not indexed for recording ${recordingId}.` });
  index.actions["action.one"]!.stateAtActionId = "missing";
  expect(lookup({ actionId: "action.one" })).toStrictEqual({ reason: "Action action.one points to missing state snapshot missing." });
  index.entries["entry.action"]!.stateSnapshotId = "missing";
  expect(lookup({ entryId: "entry.action" })).toStrictEqual({ reason: "Entry entry.action points to missing state snapshot missing." });
  delete index.actions["action.one"]!.stateAtActionId;
  expect(lookup({ actionId: "action.one" })).toStrictEqual({ reason: "Action action.one has no linked state snapshot." });
  expect(lookup({})).toStrictEqual({ reason: "State lookup requires stateSnapshotId, actionId, or entryId." });
});

it("uses startedAt before timestamp for prior lookup, then sequence and descending identity ties", () => {
  const index = fixtureIndex();
  index.entries.event = { entryId: "event", type: "observation", startedAt: 11, timestamp: 100, sequence: 4 };
  expect(resolveRecordingStateIndexItem(index, { ...scope, entryId: "event" }).state).toBe(index.states["state.one"]);
  index.entries["entry.state.two"]!.timestamp = 10;
  index.states["state.two"]!.timestamp = 10;
  expect(resolveRecordingStateIndexItem(index, { ...scope, entryId: "event" }).state).toBe(index.states["state.two"]);
  index.entries["entry.state.two"]!.sequence = 0;
  expect(resolveRecordingStateIndexItem(index, { ...scope, entryId: "event" }).state).toBe(index.states["state.two"]);
});

it("uses sequence fallback only when comparable time is absent", () => {
  const index = fixtureIndex();
  index.entries.event = { entryId: "event", type: "observation", sequence: 1 };
  expect(resolveRecordingStateIndexItem(index, { ...scope, entryId: "event" }).state).toBe(index.states["state.one"]);
  index.entries.event.sequence = -1;
  expect(resolveRecordingStateIndexItem(index, { ...scope, entryId: "event" })).toStrictEqual({ reason: "Entry event has no linked state snapshot." });
});

it("resolves candidate source IDs without depending on mapper or Studio DTOs", () => {
  const index = fixtureIndex();
  expect(resolveCandidateActionEntryId(index, "entry.state.one", { sourceObservationIds: ["", "missing", "entry.state.one", "entry.action"] })).toBe("entry.action");
  expect(resolveCandidateActionEntryId(index, "entry.action", { sourceObservationIds: ["missing"] })).toBe("entry.action");
  expect(resolveCandidateActionEntryId(null, "original", { sourceObservationIds: ["entry.action"] })).toBe("original");
  expect(resolveCandidateActionEntryId(index, "original", {})).toBe("original");
});

it("retains complete proposal links and the exact missing-lookup projection", () => {
  const index = fixtureIndex();
  index.states["state.one"]!.screenshotRef = ref("shot");
  expect(proposalNodeStateLinkFromIndex(index, "entry.action")).toStrictEqual({ recordingId, actionEntryId: "entry.action", actionId: "action.one", stateSnapshotId: "state.one", stateRef: ref("one"), screenshotRef: ref("shot") });
  expect(proposalNodeStateLinkFromIndex(index, "missing")).toBeUndefined();
  expect(missingRecordingStateLookup({ ...scope, entryId: "", actionId: "a", includeState: true }, "absent")).toStrictEqual({ recordingId, requested: { entryId: "", actionId: "a" }, resolved: null, reason: "absent" });
});
