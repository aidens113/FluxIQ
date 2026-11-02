import { afterEach, expect, it, vi } from "vitest";
import type { RecordingSession } from "../../../../model/index.ts";
import type { NormalizedTimeline } from "../../../../normalization/index.ts";
import { AutomationStudioNormalizationReview } from "../normalization-review.ts";

afterEach(() => vi.restoreAllMocks());

it.each([true, false])("retains original facade/writer receivers, load-or-normalize behavior and the two artifact clock reads (existing=%s)", async (existing) => {
  const raw: RecordingSession = { schemaVersion: "0.1", recordingId: "recording.actual", startedAt: 0,
    environment: { id: "environment.actual", label: "Actual", kind: "test" }, sources: [], actionChannels: [], initialState: { timestamp: 0, namespaces: {} }, timeline: [], notes: [], metadata: {} };
  const normalized: NormalizedTimeline = { schemaVersion: "0.1", normalizedTimelineId: "normalized.actual", recordingId: raw.recordingId,
    sourceRecording: { layer: "raw_recording", artifactId: raw.recordingId }, initialState: raw.initialState, timeline: [], issues: [], generatedAt: 1 };
  let normalizeCalls = 0;
  const facade = {
    async getRecordingSession(recordingId: string, projectId?: string | null) {
      expect(this).toBe(facade);
      expect([recordingId, projectId]).toEqual(["recording.actual", "project.actual"]);
      return raw;
    },
    async listProjectNormalizedTimelines(projectId: string) {
      expect(this).toBe(facade);
      expect(projectId).toBe("project.actual");
      return existing ? [normalized] : [];
    },
    async normalizeRecording(input: { projectId?: string | null; recordingId: string }) {
      expect(this).toBe(facade);
      expect(input).toEqual({ projectId: "project.actual", recordingId: "recording.actual" });
      normalizeCalls += 1;
      return normalized;
    }
  };
  const writes: unknown[][] = [];
  const store = { async writePipelineArtifact(...args: unknown[]) {
    expect(this).toBe(store);
    writes.push(args);
  } };
  vi.spyOn(Date, "now").mockReturnValueOnce(101).mockReturnValueOnce(202);
  const review = await new AutomationStudioNormalizationReview(store, facade).createNormalizationReview({ projectId: "project.actual", recordingId: "recording.actual" });
  expect(normalizeCalls).toBe(existing ? 0 : 1);
  expect(JSON.stringify(review)).toBe('{"schemaVersion":"0.1","reviewId":"review.recording.actual.101","recordingId":"recording.actual","normalizedTimelineId":"normalized.actual","mappings":[],"waitClips":[],"issues":[],"generatedAt":202}');
  expect(review.issues).toBe(normalized.issues);
  expect(writes).toEqual([["project.actual", "normalizationReviews", "review.recording.actual.101", review]]);
});
