import { expect, it } from "vitest";
import { decodeRecordingEntry, RecordingIngressShapes } from "../index.ts";

const guards = { target: RecordingIngressShapes.jsonObject, evidence: RecordingIngressShapes.jsonObject };

it("retains the complete action contract, original opaque target and evidence without rewriting", () => {
  const entry = {
    type: "action", id: "entry", timestamp: 8, monotonicOffsetMs: 3, sourceId: "source", confidence: 0.9,
    correlationId: "correlation", causationId: "cause", metadata: { retained: [1, 2] },
    actionType: "machine.activate", outputId: "machine.activate", parameters: { handle: "opaque", intent: "activate" },
    origin: "operator", startedAt: 5, completedAt: 8, confirmationInputId: "activated", confirmationTimeoutMs: 77,
    target: { device: "machine", reference: { token: "opaque" } },
    visualTarget: { entityId: "control", entityKind: "switch", statePath: { namespace: "machine", path: "controls.active" }, anchor: { type: "point", x: 2, y: 3 }, visualFrameId: "frame", visualLayerId: "layer", stateSnapshotId: "state", confidence: 0.8, source: "operator", metadata: { opaque: true } },
    result: { status: "succeeded", message: "Done", evidence: [{ artifact: "original-domain-proof", fields: [1, 2] }], metadata: { original: true } }
  };
  const decoded = decodeRecordingEntry(entry, guards);
  expect(decoded).toBe(entry);
  expect(decoded).toEqual(entry);
});

it("retains rich observation signals and refuses malformed known fields or entry variants", () => {
  const entry = { type: "observation", observationType: "machine.state", payload: { count: 2 }, signals: { count: { type: "integer", value: 2, observedAt: 5, provenance: { extractorId: "extractor", extractorVersion: "1", inputs: ["source"], computationHash: "hash" }, presentation: { label: "Count" }, metadata: { exact: true } } } };
  expect(decodeRecordingEntry(entry, guards)).toBe(entry);
  expect(() => decodeRecordingEntry({ ...entry, signals: { count: { ...entry.signals.count, observedAt: "5" } } }, guards)).toThrow("recording.invalid_entry");
  expect(() => decodeRecordingEntry({ type: "action", actionType: "act", parameters: {}, origin: "operator" }, guards)).toThrow("recording.invalid_entry");
  expect(() => decodeRecordingEntry({ type: "state_checkpoint", state: { timestamp: 1, namespaces: {} } }, guards)).toThrow("recording.invalid_entry");
  expect(() => decodeRecordingEntry({ type: "marker", label: "note", timestamp: Number.NaN }, guards)).toThrow("recording.invalid_entry");
});
