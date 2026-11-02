import { RECORDING_STATE_INDEX_SCHEMA_VERSION, type RecordingIndex } from "@fluxiq/contracts/recording";

export function isRecordingIndex(value: unknown): value is RecordingIndex {
  if (!isObject(value)) return false;
  return value.schemaVersion === RECORDING_STATE_INDEX_SCHEMA_VERSION
    && typeof value.projectId === "string"
    && typeof value.recordingId === "string"
    && isObject(value.summary)
    && isObject(value.timeline)
    && isObject(value.entries)
    && isObject(value.actions)
    && isObject(value.states)
    && isObject(value.proposals);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
