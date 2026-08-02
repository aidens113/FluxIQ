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
} from "./index";
import { normalizeRecordingTimeline } from "../normalization";

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
