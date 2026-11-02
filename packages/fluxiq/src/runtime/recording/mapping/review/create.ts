import type { NormalizedTimeline, RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingNormalizationReviewContent } from "./content.ts";

/** Pure review content; artifact identity, clock and persistence belong to the caller. */
export function createRecordingNormalizationReview(recording: Pick<RecordingSession, "recordingId" | "timeline">, normalized: NormalizedTimeline, reviewTimeline: RecordingSession["timeline"]): RecordingNormalizationReviewContent {
  const rawIds = new Set(recording.timeline.map((entry) => entry.id));
  const normalizedIdsByRawId = new Map<string, string[]>();
  for (const entry of normalized.timeline) {
    const rawEntryIds = [...new Set([entry.id, entry.correlationId ?? "", typeof entry.metadata?.normalizedFrom === "string" ? entry.metadata.normalizedFrom : ""].filter(Boolean))];
    for (const rawEntryId of rawEntryIds) {
      if (!rawIds.has(rawEntryId)) continue;
      normalizedIdsByRawId.set(rawEntryId, [...(normalizedIdsByRawId.get(rawEntryId) ?? []), entry.id]);
    }
  }
  const compactedReviewEntryCount = recording.timeline.length - reviewTimeline.length;
  const mappings: RecordingNormalizationReviewContent["mappings"] = reviewTimeline.map((entry) => ({ rawEntryId: entry.id, normalizedEntryIds: normalizedIdsByRawId.get(entry.id) ?? [], status: "preserved" }));
  if (compactedReviewEntryCount > 0) mappings.push({
    rawEntryId: `compacted.high-frequency-state.${recording.recordingId}`, normalizedEntryIds: [], status: "dropped",
    reason: `${compactedReviewEntryCount} high-frequency state entries were preserved in the raw recording but omitted from proposal review mappings.`
  });
  for (const entry of normalized.timeline) {
    const sourceId = typeof entry.metadata?.normalizedFrom === "string" ? entry.metadata.normalizedFrom : entry.correlationId;
    if (sourceId && rawIds.has(sourceId)) continue;
    if (!rawIds.has(entry.id)) mappings.push({ rawEntryId: sourceId ?? entry.id, normalizedEntryIds: [entry.id], status: "derived", reason: "Derived during normalization." });
  }
  const sorted = [...normalized.timeline].sort((left, right) => left.monotonicOffsetMs - right.monotonicOffsetMs);
  const waitClips = sorted.slice(1).map((entry, index) => ({ beforeEntryId: sorted[index]!.id, afterEntryId: entry.id, waitMs: Math.max(0, entry.monotonicOffsetMs - sorted[index]!.monotonicOffsetMs) })).filter((item) => item.waitMs >= 250);
  return { recordingId: recording.recordingId, normalizedTimelineId: normalized.normalizedTimelineId, mappings, waitClips, issues: normalized.issues };
}
