import type { JsonObject } from "@fluxiq/contracts/core";
import type { ObservationEntry } from "@fluxiq/contracts/recording";
import { describe, expect, it, vi } from "vitest";
import { buildRecordingStateIndex, recordingEntryActionType, recordingEntryIndexedTimestamp, recordingEntryIsActionLike, recordingEntryObjectRefs, validateRecordingIndex } from "../../index.ts";
import { observations, ports, projectId, ref, references } from "../../tests/fixture.ts";
import { recordingFixture, snapshotEntry } from "../../tests/timeline.ts";

describe("recording entry projection", () => {
  it("keeps every finite timestamp precedence and uses embedded state only through policy", () => {
    const state = { timestamp: 12, namespaces: {} };
    const policy = { ...observations, embeddedState: () => state };
    const entry = { ...snapshotEntry(), timestamp: 13, metadata: { eventTimestampMs: 1, actionTimestampMs: 2, stateTimestampMs: 3 }, payload: { metadata: { eventTimestampMs: 4, actionTimestampMs: 5, stateTimestampMs: 6, stateSnapshotTimestamp: 7 }, eventTimestampMs: 8, actionTimestampMs: 9, stateTimestampMs: 10, stateSnapshotTimestamp: 11 } } satisfies ObservationEntry;
    const invalidate = [
      () => entry.metadata.eventTimestampMs = Number.NaN,
      () => entry.metadata.actionTimestampMs = Number.NaN,
      () => entry.metadata.stateTimestampMs = Number.NaN,
      () => entry.payload.metadata.eventTimestampMs = Number.NaN,
      () => entry.payload.metadata.actionTimestampMs = Number.NaN,
      () => entry.payload.metadata.stateTimestampMs = Number.NaN,
      () => entry.payload.metadata.stateSnapshotTimestamp = Number.NaN,
      () => entry.payload.eventTimestampMs = Number.NaN,
      () => entry.payload.actionTimestampMs = Number.NaN,
      () => entry.payload.stateTimestampMs = Number.NaN,
      () => entry.payload.stateSnapshotTimestamp = Number.NaN,
      () => state.timestamp = Number.NaN,
      () => entry.timestamp = Number.NaN
    ];
    for (const [position, clear] of invalidate.entries()) {
      expect(recordingEntryIndexedTimestamp(entry, policy)).toBe(position + 1);
      clear();
    }
    expect(recordingEntryIndexedTimestamp(entry, policy)).toBeUndefined();
    entry.timestamp = 99;
    state.timestamp = 12;
    expect(recordingEntryIndexedTimestamp(entry, observations)).toBe(99);
  });

  it("collects recursive refs cycle-safely, without retaining rejected or duplicate strings", () => {
    const metadata: JsonObject = { nested: [ref("z"), ref("a"), ref("z"), ref("foreign", "other"), "not a ref"] };
    metadata.self = metadata;
    const entry = { ...snapshotEntry(), metadata, payload: { stateRef: ref("one"), nested: { ref: ref("a") } } };
    expect(recordingEntryObjectRefs(projectId, entry, references)).toEqual([ref("a"), ref("one"), ref("z")].sort());
    expect(entry.metadata.self).toBe(metadata);
  });

  it("retains a malformed primary state pointer for validation instead of dropping the state", () => {
    const entry = { ...snapshotEntry(), payload: { snapshotId: "state.bad", stateRef: "malformed" } };
    const index = buildRecordingStateIndex(projectId, recordingFixture([entry]), ports);
    expect(index.states["state.bad"]).toStrictEqual({ stateSnapshotId: "state.bad", entryId: entry.id, timestamp: 10, monotonicOffsetMs: 10, stateRef: "malformed", objectRefs: ["malformed"], linkedActionIds: [] });
    expect(validateRecordingIndex(index, references)).toStrictEqual([
      { code: "invalid_object_ref", path: "states.state.bad.objectRefs", message: "Invalid asset malformed" },
      { code: "invalid_object_ref", path: "states.state.bad.objectRefs", message: "Invalid asset malformed" }
    ]);
  });

  it("requires the supplied snapshot policy and clock, including per-state time fallback", () => {
    const entry = snapshotEntry("entry.state", Number.NaN);
    const clock = vi.fn().mockReturnValueOnce(500).mockReturnValueOnce(501);
    const index = buildRecordingStateIndex(projectId, recordingFixture([entry]), { ...ports, now: clock });
    expect(index.summary.updatedAt).toBe(500);
    expect(index.states["state.one"]!.timestamp).toBe(501);
    expect(index.entries[entry.id]!.timestamp).toBeUndefined();
    expect(clock).toHaveBeenCalledTimes(2);
    const ignored = buildRecordingStateIndex(projectId, recordingFixture([entry]), { ...ports, observations: { ...observations, isSnapshot: () => false } });
    expect(ignored.summary.stateSnapshotCount).toBe(0);
    expect(ignored.states).toEqual({});
  });

  it("keeps legacy action-like extension detection and action label precedence", () => {
    const entry = { ...snapshotEntry(), action: { kind: "legacy" }, actionType: " primary ", eventType: " event ", outputId: " output " };
    expect(recordingEntryIsActionLike(entry)).toBe(true);
    expect(recordingEntryActionType(entry)).toBe("primary");
    entry.actionType = " ";
    expect(recordingEntryActionType(entry)).toBe("event");
    entry.eventType = " ";
    expect(recordingEntryActionType(entry)).toBe("output");
  });
});
