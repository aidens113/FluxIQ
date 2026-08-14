import { describe, expect, it } from "vitest";
import {
  AutomationInMemoryStateStore,
  appendRecordingNote,
  appendRecordingEntry,
  appendRecordingStateCheckpoint,
  buildSignalRegistryFromSchemas,
  createRecordingSession,
  diffStateSnapshots,
  discoverSignalDefinitions,
  finalizeRecordingSession,
  stateValue,
  validateRecordingSession
} from "./index.ts";
import { normalizeRecordingTimeline } from "../normalization/index.ts";

describe("automation studio state, signals, and recording framework", () => {
  it("reads, writes, snapshots, restores, subscribes, and diffs state", () => {
    const store = new AutomationInMemoryStateStore({ timestamp: 1, namespaces: {} });
    const events: unknown[] = [];
    const unsubscribe = store.subscribe((event) => events.push(event));

    store.registerSchema({ namespace: "runtime", path: "step", type: "string", label: "Step" });
    const write = store.write("runtime", "step", stateValue("string", "start", 2));

    expect(store.read("runtime", "step")?.value).toBe("start");
    expect(write.deltas).toHaveLength(1);
    expect(store.schemas()).toContainEqual(expect.objectContaining({ namespace: "runtime", path: "step" }));

    const next = { timestamp: 3, namespaces: { runtime: { schemaId: "runtime", schemaVersion: "0.1", values: { step: stateValue("string", "done", 3) } } } };
    expect(store.diff(next).map((delta) => delta.change)).toEqual(["changed"]);
    store.restore(next);
    expect(store.snapshot().namespaces.runtime?.values.step?.value).toBe("done");
    unsubscribe();
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("builds signal registries from schemas and observed state", () => {
    const registry = buildSignalRegistryFromSchemas([
      { namespace: "app", path: "visible", type: "boolean", volatility: "normal", label: "Visible" }
    ], { registryId: "registry.test" });

    expect(registry.definitions[0]).toMatchObject({ path: "app.visible", comparator: { kind: "exact" } });

    const discovered = discoverSignalDefinitions({
      timestamp: 1,
      namespaces: {
        runtime: { schemaId: "runtime", schemaVersion: "0.1", values: { count: stateValue("number", 2, 1) } }
      }
    });
    expect(discovered.definitions[0]).toMatchObject({ path: "runtime.count", comparator: { kind: "numeric" } });
  });

  it("records checkpoints and normalizes state deltas with raw evidence links", () => {
    const initial = {
      timestamp: 1,
      namespaces: {
        app: { schemaId: "app", schemaVersion: "0.1", values: { open: stateValue("boolean", false, 1) } }
      }
    };
    const current = {
      timestamp: 2,
      namespaces: {
        app: { schemaId: "app", schemaVersion: "0.1", values: { open: stateValue("boolean", true, 2) } }
      }
    };
    const recording = finalizeRecordingSession(appendRecordingNote(appendRecordingStateCheckpoint(createRecordingSession({
      recordingId: "recording.test",
      taskId: "task.test",
      initialState: initial
    }), current), {
      text: "dialog opened",
      source: "typed",
      scope: "state"
    }), 4);

    expect(validateRecordingSession(recording).ok).toBe(true);
    expect(diffStateSnapshots(initial, current).map((delta) => delta.change)).toEqual(["became_true"]);

    const normalized = normalizeRecordingTimeline(recording);
    expect(normalized.sourceRecording).toEqual({ layer: "raw_recording", artifactId: "recording.test" });
    expect(normalized.timeline.some((entry) => entry.type === "state_delta")).toBe(true);
  });

  it("compacts high-frequency state checkpoints to action context during normalization", () => {
    let recording = createRecordingSession({
      recordingId: "recording.high-frequency-state",
      taskId: "task.high-frequency-state",
      startedAt: 0,
      initialState: {
        timestamp: 0,
        namespaces: {
          web: { schemaId: "web", schemaVersion: "0.1", values: { frame: stateValue("integer", 0, 0) } }
        }
      }
    });
    for (const offset of [100, 500, 900]) {
      recording = appendRecordingStateCheckpoint(recording, {
        timestamp: offset,
        namespaces: {
          web: { schemaId: "web", schemaVersion: "0.1", values: { frame: stateValue("integer", offset, offset) } }
        }
      }, { timestamp: offset });
    }
    recording = appendRecordingEntry(recording, {
      id: "action.click",
      type: "action",
      actionType: "click",
      parameters: {},
      origin: "operator",
      timestamp: 1_000,
      monotonicOffsetMs: 1_000,
      startedAt: 1_000,
      sourceId: "operator"
    });
    for (const offset of [1_100, 1_500, 2_000]) {
      recording = appendRecordingStateCheckpoint(recording, {
        timestamp: offset,
        namespaces: {
          web: { schemaId: "web", schemaVersion: "0.1", values: { frame: stateValue("integer", offset, offset) } }
        }
      }, { timestamp: offset });
    }

    const normalized = normalizeRecordingTimeline(recording);
    const rawCheckpointCount = recording.timeline.filter((entry) => entry.type === "state_checkpoint").length;
    const normalizedCheckpoints = normalized.timeline.filter((entry) => entry.type === "state_checkpoint");

    expect(rawCheckpointCount).toBe(6);
    expect(normalizedCheckpoints.map((entry) => entry.monotonicOffsetMs)).toEqual([100, 900, 1_100, 2_000]);
    expect(normalized.issues).toContainEqual(expect.objectContaining({ code: "normalization.state_checkpoints_compacted" }));
  });

  it("compacts high-frequency client state snapshot observations during normalization", () => {
    let recording = createRecordingSession({
      recordingId: "recording.high-frequency-snapshots",
      taskId: "task.high-frequency-snapshots",
      startedAt: 0,
      initialState: { timestamp: 0, namespaces: {} }
    });
    for (const offset of [100, 500, 900]) {
      recording = appendRecordingEntry(recording, {
        id: `snapshot.${offset}`,
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: offset,
        payload: { state: { timestamp: offset, namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { frame: { type: "integer", value: offset, observedAt: offset } } } } } }
      });
    }
    recording = appendRecordingEntry(recording, {
      id: "action.click.snapshot",
      type: "action",
      actionType: "click",
      parameters: {},
      origin: "operator",
      timestamp: 1_000,
      monotonicOffsetMs: 1_000,
      startedAt: 1_000,
      sourceId: "operator"
    });
    for (const offset of [1_100, 1_500, 2_000]) {
      recording = appendRecordingEntry(recording, {
        id: `snapshot.${offset}`,
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: offset,
        payload: { state: { timestamp: offset, namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { frame: { type: "integer", value: offset, observedAt: offset } } } } } }
      });
    }

    const normalized = normalizeRecordingTimeline(recording);

    expect(recording.timeline.filter((entry) => entry.type === "observation" && entry.observationType === "client.state_snapshot")).toHaveLength(6);
    expect(normalized.timeline.filter((entry) => entry.type === "observation").map((entry) => entry.monotonicOffsetMs)).toEqual([100, 900, 1_100, 2_000]);
    expect(normalized.issues).toContainEqual(expect.objectContaining({ code: "normalization.state_observations_compacted" }));
  });

  it("suffixes duplicate timeline entry ids while preserving the first id", () => {
    const initial = { timestamp: 1, namespaces: {} };
    const first = appendRecordingEntry(createRecordingSession({
      recordingId: "recording.duplicate-ids",
      taskId: "task.duplicate-ids",
      initialState: initial
    }), {
      id: "web.duplicate",
      type: "marker",
      label: "First",
      timestamp: 2
    });
    const second = appendRecordingEntry(first, {
      id: "web.duplicate",
      type: "marker",
      label: "Second",
      timestamp: 3
    });

    expect(second.timeline.map((entry) => entry.id)).toEqual(["web.duplicate", "web.duplicate.2"]);
    expect(validateRecordingSession(second).ok).toBe(true);
  });
});
