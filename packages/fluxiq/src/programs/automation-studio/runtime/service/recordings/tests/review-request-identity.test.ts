import { expect, it } from "vitest";
import type { RecordingSession } from "../../../../model/index.ts";
import type { NormalizedTimeline } from "../../../../normalization/index.ts";
import { AutomationStudioNormalizationReview } from "../normalization-review.ts";

it("keeps requested review identity when an overridden facade returns another recording identity", async () => {
  const raw: RecordingSession = { schemaVersion: "0.1", recordingId: "returned.other", startedAt: 0,
    environment: { id: "environment.actual", label: "Actual", kind: "test" }, sources: [], actionChannels: [], initialState: { timestamp: 0, namespaces: {} }, notes: [], metadata: {},
    timeline: [{ id: "entry.transport", recordingId: "returned.other", type: "observation", observationType: "client.state_snapshot", timestamp: 1, monotonicOffsetMs: 1, sequence: 0, sourceId: "source.actual" }] };
  const normalized: NormalizedTimeline = { schemaVersion: "0.1", normalizedTimelineId: "normalized.actual", recordingId: raw.recordingId, sourceRecording: { layer: "raw_recording", artifactId: raw.recordingId }, initialState: raw.initialState, timeline: [], issues: [], generatedAt: 1 };
  const writer = { async writePipelineArtifact() {} };
  const facade = { async getRecordingSession() { return raw; }, async listProjectNormalizedTimelines() { return [normalized]; }, async normalizeRecording() { return normalized; } };
  const review = await new AutomationStudioNormalizationReview(writer, facade).createNormalizationReview({ projectId: "project.actual", recordingId: "requested.actual" });
  expect(review.recordingId).toBe("requested.actual");
  expect(review.mappings).toEqual([{ rawEntryId: "compacted.high-frequency-state.requested.actual", normalizedEntryIds: [], status: "dropped", reason: "1 high-frequency state entries were preserved in the raw recording but omitted from proposal review mappings." }]);
});
