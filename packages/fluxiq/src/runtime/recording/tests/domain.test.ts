import { expect, it } from "vitest";
import { stateValue } from "../../state/index.ts";
import { createRecordingSession, processRecordingDomainEvent, RecordingDomainRegistry } from "../index.ts";

it("validates before invoking reducers and preserves reducer/extractor ordering", async () => {
  const calls: string[] = [];
  const registry = new RecordingDomainRegistry();
  registry.register({
    domainId: "machine", label: "Machine", schemaVersion: "1", events: [{
      eventType: "advanced", label: "Advanced", payloadSchema: { type: "object", properties: { count: { type: "integer", required: true } } },
      stateReducer: ({ event, recording, previousState }) => {
        calls.push(`reduce:${recording.timeline.length}:${previousState.timestamp}`);
        return { state: { timestamp: event.timestamp!, namespaces: { machine: { schemaId: "machine", schemaVersion: "1", values: { count: stateValue("integer", event.payload!.count, event.timestamp!) } } } }, metadata: { reduced: true } };
      },
      observationExtractor: ({ recording, previousState }) => {
        calls.push(`extract:${recording.timeline.length}:${previousState.timestamp}`);
        return { observationType: "counted", payload: { observed: true } };
      }
    }]
  });
  const recording = createRecordingSession({ recordingId: "domain", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
  const rejected = await processRecordingDomainEvent(registry, recording, { recordingId: "domain", domainId: "machine", eventType: "advanced", payload: { count: "wrong" } });
  expect(rejected.accepted).toBe(false);
  expect(rejected.recording).toBe(recording);
  expect(calls).toEqual([]);
  const processed = await processRecordingDomainEvent(registry, recording, { recordingId: "domain", domainId: "machine", eventType: "advanced", eventId: "advance.1", timestamp: 2, payload: { count: 3 } });
  expect(calls).toEqual(["reduce:1:1", "extract:1:1"]);
  expect(processed.recording.timeline.map(entry => entry.type)).toEqual(["domain_event", "state_delta", "state_checkpoint", "observation"]);
  expect(processed.stateDeltas).toMatchObject([{ namespace: "machine", path: "count", change: "added" }]);
  expect(recording.timeline).toEqual([]);
});
