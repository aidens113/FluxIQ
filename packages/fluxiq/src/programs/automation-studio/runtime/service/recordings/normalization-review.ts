import type { JsonObject } from "../../../../../core/index.ts";
import { createRecordingNormalizationReview } from "../../../../../runtime/recording/mapping/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioRecordingStore } from "./store.ts";
import { recordingTimelineForProposalMapping } from "./timeline.ts";
import type { NormalizationReviewArtifact } from "./types.ts";

/** Studio retains load-or-normalize, the original facade receivers and artifact persistence. */
export class AutomationStudioNormalizationReview {
  constructor(
    private readonly recordings: Pick<AutomationStudioRecordingStore, "writePipelineArtifact">,
    private readonly facade: Pick<AutomationStudioFacadePorts, "getRecordingSession" | "listProjectNormalizedTimelines" | "normalizeRecording">
  ) {}

  async createNormalizationReview(input: { projectId: string; recordingId: string }): Promise<NormalizationReviewArtifact> {
    const recording = await this.facade.getRecordingSession(input.recordingId, input.projectId);
    let normalized = (await this.facade.listProjectNormalizedTimelines(input.projectId)).find((item) => item.recordingId === input.recordingId);
    normalized ??= await this.facade.normalizeRecording({ projectId: input.projectId, recordingId: input.recordingId });
    const content = createRecordingNormalizationReview({ recordingId: input.recordingId, timeline: recording.timeline }, normalized, recordingTimelineForProposalMapping(recording.timeline));
    const review: NormalizationReviewArtifact = {
      schemaVersion: "0.1",
      reviewId: `review.${safeSegment(input.recordingId)}.${Date.now()}`,
      recordingId: input.recordingId,
      normalizedTimelineId: content.normalizedTimelineId,
      mappings: content.mappings,
      waitClips: content.waitClips,
      issues: content.issues,
      generatedAt: Date.now()
    };
    await this.recordings.writePipelineArtifact(input.projectId, "normalizationReviews", review.reviewId, review as unknown as JsonObject);
    return review;
  }
}
