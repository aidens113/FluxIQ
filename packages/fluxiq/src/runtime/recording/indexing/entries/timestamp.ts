import type { JsonObject } from "@fluxiq/contracts/core";
import type { TimelineEntry } from "@fluxiq/contracts/recording";
import type { RecordingIndexObservationPolicy } from "../policy/index.ts";

export function recordingEntryObservationPayload(entry: TimelineEntry<unknown, unknown>): JsonObject {
  return entry.type === "observation" && isObject(entry.payload) ? entry.payload : {};
}

export function recordingEntryIndexedTimestamp(entry: TimelineEntry<unknown, unknown>, observations: RecordingIndexObservationPolicy): number | undefined {
  const payload = recordingEntryObservationPayload(entry);
  const payloadMetadata = isObject(payload.metadata) ? payload.metadata : {};
  const entryMetadata = isObject(entry.metadata) ? entry.metadata : {};
  const payloadState = entry.type === "observation" ? observations.embeddedState(entry) : undefined;
  return firstRecordingIndexFiniteNumber(
    entryMetadata.eventTimestampMs,
    entryMetadata.actionTimestampMs,
    entryMetadata.stateTimestampMs,
    payloadMetadata.eventTimestampMs,
    payloadMetadata.actionTimestampMs,
    payloadMetadata.stateTimestampMs,
    payloadMetadata.stateSnapshotTimestamp,
    payload.eventTimestampMs,
    payload.actionTimestampMs,
    payload.stateTimestampMs,
    payload.stateSnapshotTimestamp,
    payloadState?.timestamp,
    entry.timestamp
  );
}

export function firstRecordingIndexFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
