import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioRecordingMapperObservation } from "../../../../components/automation/importer/recording-mapper/index.ts";
import type { RecordingMapperCall } from "./call.ts";

/** Fresh per mapper; following objects are the same objects later offered as current. */
export function recordingMapperCalls(timeline: RecordingSession["timeline"], recordingId: string, domainId: string): RecordingMapperCall[] {
  const observations = timeline.map((entry): AutomationStudioRecordingMapperObservation => ({
    observationId: entry.id,
    recordingId,
    domainId,
    type: entry.type,
    timestamp: entry.timestamp,
    payload: recordingEntryPayload(entry),
    metadata: { ...(entry.metadata ?? {}) }
  }));
  return observations.map((observation, index) => ({ observation, following: observations.slice(index + 1, index + 33) }));
}

function recordingEntryPayload(entry: RecordingSession["timeline"][number]): JsonObject {
  const { id: _id, recordingId: _recordingId, timestamp: _timestamp, monotonicOffsetMs: _offset, sequence: _sequence, sourceId: _sourceId, metadata: _metadata, ...payload } = entry;
  return structuredClone(payload) as unknown as JsonObject;
}
