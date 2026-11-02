import type { NormalizedTimeline, ObservationEntry, RecordingSession } from "@fluxiq/contracts/recording";
import type { AutomationStudioRecordingMapperBinding } from "../../../../components/automation/importer/recording-mapper/index.ts";
import type { RecordingMappingIo } from "../io.ts";

export const observation = (id: string, offset = 0, observationType = "action.observed"): ObservationEntry => ({
  id, recordingId: "recording.actual", type: "observation", observationType,
  timestamp: offset + 100, monotonicOffsetMs: offset, sequence: offset, sourceId: "source.actual", payload: { value: id }
});

export const recording = (timeline: RecordingSession["timeline"]): RecordingSession => ({
  schemaVersion: "0.1", recordingId: "recording.actual", startedAt: 0,
  environment: { id: "environment.actual", label: "Actual fixture", kind: "test" }, sources: [], actionChannels: [],
  initialState: { timestamp: 0, namespaces: {} }, timeline, notes: [], metadata: {}
});

export const normalized = (timeline: NormalizedTimeline["timeline"]): NormalizedTimeline => ({
  schemaVersion: "0.1", normalizedTimelineId: "normalized.actual", recordingId: "recording.actual",
  sourceRecording: { layer: "raw_recording", artifactId: "recording.actual" }, initialState: { timestamp: 0, namespaces: {} }, timeline, issues: [], generatedAt: 1
});

export const mapper = (implementation: AutomationStudioRecordingMapperBinding["implementation"]): AutomationStudioRecordingMapperBinding => ({
  definition: { id: "mapper.actual", version: "1.0.0", description: "Actual mapper", outputIds: ["action.send", "records.read"] },
  packageId: "package.actual", packageVersion: "1.0.0", implementation
});

export const io: RecordingMappingIo = {
  hasOutput: (_domainId, outputId) => outputId === "action.send" || outputId === "records.read",
  getInput: (_domainId, inputId) => inputId === "missing" ? undefined : ({ definition: { id: inputId, title: inputId, ...(inputId === "state.only" ? {} : { role: "action" as const }) }, mode: "stream" }),
  getOutput: (_domainId, outputId) => ({ definition: { id: outputId, title: outputId, ...(outputId === "records.read" ? { metadata: { recordsPath: "rows" } } : {}) }, mode: "request", dispatch: (request) => ({ ok: true, outputId: request.outputId }) })
};
