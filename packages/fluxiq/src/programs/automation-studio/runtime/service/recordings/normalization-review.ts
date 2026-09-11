import type { JsonObject } from "../../../../../core/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import { uniqueStrings } from "../collections.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioRecordingStore } from "./store.ts";
import { recordingTimelineForProposalMapping } from "./timeline.ts";
import type { NormalizationReviewArtifact } from "./types.ts";

// The review written beside a normalized timeline: which raw entries survived
// into it, which were derived or dropped, and the waits between the ones that
// remain. It reads the recording through the service's own accessors so a
// caller that has replaced one still sees it used.
export class AutomationStudioNormalizationReview {
  constructor(
    private readonly recordings: AutomationStudioRecordingStore,
    private readonly facade: AutomationStudioFacadePorts
  ) {}

  async createNormalizationReview(input: { projectId: string; recordingId: string }): Promise<NormalizationReviewArtifact> {
    const recording = await this.facade.getRecordingSession(input.recordingId, input.projectId);
    let normalized = (await this.facade.listProjectNormalizedTimelines(input.projectId)).find((item) => item.recordingId === input.recordingId);
    normalized ??= await this.facade.normalizeRecording({ projectId: input.projectId, recordingId: input.recordingId });
    const rawIds = new Set(recording.timeline.map((entry) => entry.id));
    const normalizedIdsByRawId = new Map<string, string[]>();
    for (const entry of normalized.timeline) {
      const rawEntryIds = uniqueStrings([
        entry.id,
        entry.correlationId ?? "",
        typeof entry.metadata?.normalizedFrom === "string" ? entry.metadata.normalizedFrom : ""
      ]);
      for (const rawEntryId of rawEntryIds) {
        if (!rawIds.has(rawEntryId)) continue;
        normalizedIdsByRawId.set(rawEntryId, [...(normalizedIdsByRawId.get(rawEntryId) ?? []), entry.id]);
      }
    }
    const reviewTimeline = recordingTimelineForProposalMapping(recording.timeline);
    const compactedReviewEntryCount = recording.timeline.length - reviewTimeline.length;
    const mappings: NormalizationReviewArtifact["mappings"] = reviewTimeline.map((entry) => ({
      rawEntryId: entry.id,
      normalizedEntryIds: normalizedIdsByRawId.get(entry.id) ?? [],
      status: "preserved" as const
    }));
    if (compactedReviewEntryCount > 0) {
      mappings.push({
        rawEntryId: `compacted.high-frequency-state.${input.recordingId}`,
        normalizedEntryIds: [],
        status: "dropped",
        reason: `${compactedReviewEntryCount} high-frequency state entries were preserved in the raw recording but omitted from proposal review mappings.`
      });
    }
    for (const entry of normalized.timeline) {
      const sourceId = typeof entry.metadata?.normalizedFrom === "string" ? entry.metadata.normalizedFrom : entry.correlationId;
      if (sourceId && rawIds.has(sourceId)) continue;
      if (!rawIds.has(entry.id)) mappings.push({ rawEntryId: sourceId ?? entry.id, normalizedEntryIds: [entry.id], status: "derived", reason: "Derived during normalization." });
    }
    const sorted = [...normalized.timeline].sort((left, right) => left.monotonicOffsetMs - right.monotonicOffsetMs);
    const waitClips = sorted.slice(1).map((entry, index) => ({
      beforeEntryId: sorted[index]!.id,
      afterEntryId: entry.id,
      waitMs: Math.max(0, entry.monotonicOffsetMs - sorted[index]!.monotonicOffsetMs)
    })).filter((item) => item.waitMs >= 250);
    const review: NormalizationReviewArtifact = {
      schemaVersion: "0.1",
      reviewId: `review.${safeSegment(input.recordingId)}.${Date.now()}`,
      recordingId: input.recordingId,
      normalizedTimelineId: normalized.normalizedTimelineId,
      mappings,
      waitClips,
      issues: normalized.issues,
      generatedAt: Date.now()
    };
    await this.recordings.writePipelineArtifact(input.projectId, "normalizationReviews", review.reviewId, review as unknown as JsonObject);
    return review;
  }
}
