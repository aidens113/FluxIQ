import { expect, it } from "vitest";
import { appendRecordingEntry, createRecordingSession, normalizeRecordingTimeline } from "../index.ts";

it("never treats an arbitrary payload state key as high-frequency evidence without policy", () => {
  let recording = createRecordingSession({ recordingId: "opaque", startedAt: 0, initialState: { timestamp: 0, namespaces: {} } });
  for (const timestamp of [1, 2, 3, 4]) recording = appendRecordingEntry(recording, { type: "observation", observationType: "machine.phase", timestamp, payload: { state: "phase" } });
  const untouched = normalizeRecordingTimeline(recording, { isStateObservation: () => false });
  expect(untouched.timeline).toHaveLength(4);
  expect(untouched.issues).toEqual([]);
  const classified = normalizeRecordingTimeline(recording, { isStateObservation: () => true });
  expect(classified.timeline.map(entry => entry.timestamp)).toEqual([1, 4]);
  expect(classified.issues).toEqual([{ severity: "info", code: "normalization.state_observations_compacted", message: "2 high-frequency state observations were left in the raw recording and omitted from the normalized proposal timeline.", metadata: { compactedStateObservationCount: 2 } }]);
  expect(recording.timeline).toHaveLength(4);
});
