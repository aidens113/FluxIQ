import type { ObservationEntry, RecordingSession, TimelineEntry } from "@fluxiq/contracts/recording";
import { recordingId, ref } from "./fixture.ts";

export function snapshotEntry(id = "entry.state", timestamp = 10): ObservationEntry {
  return { id, recordingId, type: "observation", observationType: "machine.capture", timestamp, monotonicOffsetMs: timestamp, sequence: 0, sourceId: "machine", payload: { snapshotId: "state.one", stateRef: ref("one") } };
}

export function recordingFixture(timeline: TimelineEntry<unknown, unknown>[]): RecordingSession<unknown, unknown> {
  return { schemaVersion: "0.1", recordingId, startedAt: 1, environment: { id: "machine", kind: "machine", label: "Machine" }, sources: [], actionChannels: [], initialState: { timestamp: 1, namespaces: {} }, timeline, notes: [], metadata: { preserved: true } };
}
