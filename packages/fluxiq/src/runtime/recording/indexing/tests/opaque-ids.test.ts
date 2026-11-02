import type { RecordingIndex } from "@fluxiq/contracts/recording";
import assert from "node:assert/strict";
import { expect, it } from "vitest";
import { buildRecordingStateIndex, emptyRecordingIndex, finalizeRecordingStateLinks, resolveRecordingStateIndexItem, validateRecordingIndex } from "../index.ts";
import { fixtureIndex, ports, projectId, recordingId, ref, references } from "./fixture.ts";
import { recordingFixture, snapshotEntry } from "./timeline.ts";

it.each(["constructor", "__proto__", "toString"])("does not resolve inherited dictionary members as indexed IDs: %s", (id) => {
  const index = emptyRecordingIndex({ projectId, recordingId, updatedAt: 1 });
  expect(resolveRecordingStateIndexItem(index, { projectId, recordingId, stateSnapshotId: id })).toStrictEqual({ reason: `State snapshot ${id} is not indexed for recording ${recordingId}.` });
  expect(resolveRecordingStateIndexItem(index, { projectId, recordingId, actionId: id })).toStrictEqual({ reason: `Action ${id} is not indexed for recording ${recordingId}.` });
  expect(resolveRecordingStateIndexItem(index, { projectId, recordingId, entryId: id })).toStrictEqual({ reason: `Entry ${id} is not indexed for recording ${recordingId}.` });
});

it("indexes actual constructor and __proto__ entry/state IDs without changing dictionary prototypes", () => {
  const first = { ...snapshotEntry("__proto__", 10), payload: { snapshotId: "constructor", stateRef: ref("one") } };
  const second = { ...snapshotEntry("entry.two", 12), payload: { snapshotId: "__proto__", stateRef: ref("two") } };
  const action = { id: "constructor", recordingId, type: "action" as const, actionType: "mark", parameters: {}, origin: "operator" as const, startedAt: 11, timestamp: 11, monotonicOffsetMs: 11, sequence: 1, sourceId: "machine" };
  const recording = recordingFixture([first, action, second]);
  const before = structuredClone(recording);
  const index = buildRecordingStateIndex(projectId, recording, ports);
  for (const dictionary of [index.entries, index.states, index.actions, index.proposals]) expect(Object.getPrototypeOf(dictionary)).toBe(Object.prototype);
  expect(Object.keys(index.entries)).toEqual(["__proto__", "constructor", "entry.two"]);
  expect(Object.keys(index.states)).toEqual(["__proto__", "constructor"]);
  expect(index.actions["action.constructor"]!.stateAtActionId).toBe("constructor");
  expect(index.entries["__proto__"]!.stateSnapshotId).toBe("constructor");
  expect(index.states["__proto__"]!.stateRef).toBe(ref("two"));
  expect(validateRecordingIndex(index, references)).toStrictEqual([]);
  expect(recording).toStrictEqual(before);
  const hydrated: RecordingIndex = JSON.parse(JSON.stringify(index));
  // An own constructor ID is state data; native strict equality preserves that distinction.
  assert.deepStrictEqual(hydrated, index);
  expect(JSON.stringify(hydrated)).toBe(JSON.stringify(index));
  expect(resolveRecordingStateIndexItem(hydrated, { projectId, recordingId, stateSnapshotId: "__proto__" })).toStrictEqual({ state: hydrated.states["__proto__"], reason: "" });
  assert.deepStrictEqual(finalizeRecordingStateLinks(hydrated), { index: hydrated, warnings: [] });
});

it("keeps real constructor and __proto__ action IDs loaded from JSON", () => {
  const base = fixtureIndex();
  delete base.entries["entry.action"];
  const entries = Object.fromEntries(["constructor", "__proto__"].map((id) => [id, { entryId: id, type: "action", timestamp: 11, actionId: id, stateSnapshotId: "state.one" }]));
  const actions = Object.fromEntries(["constructor", "__proto__"].map((id) => [id, { actionId: id, entryId: id, actionType: "mark", stateAtActionId: "state.one" }]));
  const hydrated: RecordingIndex = JSON.parse(JSON.stringify({ ...base, entries: { ...base.entries, ...entries }, actions }));
  expect(validateRecordingIndex(hydrated, references)).toStrictEqual([]);
  for (const id of ["constructor", "__proto__"]) {
    expect(Object.hasOwn(hydrated.actions, id)).toBe(true);
    expect(resolveRecordingStateIndexItem(hydrated, { projectId, recordingId, actionId: id })).toStrictEqual({ state: hydrated.states["state.one"], reason: "" });
  }
  const result = finalizeRecordingStateLinks(hydrated);
  expect(result.index.states["state.one"]!.linkedActionIds).toEqual(["__proto__", "constructor"]);
  expect(Object.getPrototypeOf(result.index.actions)).toBe(Object.prototype);
});

it("reports inherited state/action IDs as missing in explicit index links", () => {
  const index = fixtureIndex();
  index.entries["entry.action"]!.stateSnapshotId = "constructor";
  index.entries["entry.action"]!.actionId = "__proto__";
  index.actions["action.one"]!.stateAtActionId = "constructor";
  index.states["state.one"]!.linkedActionIds = ["__proto__"];
  expect(validateRecordingIndex(index, references).map(({ code, path }) => ({ code, path }))).toStrictEqual([
    { code: "missing_state", path: "entries.entry.action.stateSnapshotId" },
    { code: "missing_action", path: "entries.entry.action.actionId" },
    { code: "missing_state", path: "actions.action.one.stateAtActionId" },
    { code: "missing_action", path: "states.state.one.linkedActionIds" }
  ]);
});
