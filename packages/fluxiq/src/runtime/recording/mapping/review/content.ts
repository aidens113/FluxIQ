import type { NormalizedTimeline } from "@fluxiq/contracts/recording";

export type RecordingNormalizationReviewContent = {
  recordingId: string;
  normalizedTimelineId: string;
  mappings: Array<{ rawEntryId: string; normalizedEntryIds: string[]; status: "preserved" | "derived" | "dropped"; reason?: string }>;
  waitClips: Array<{ beforeEntryId: string; afterEntryId: string; waitMs: number }>;
  issues: NormalizedTimeline["issues"];
};
