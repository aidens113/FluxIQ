import { expect, it } from "vitest";
import { createRecordingNormalizationReview } from "../create.ts";
import { recordingTimelineForProposalMapping } from "../../timeline.ts";
import { normalized, observation, recording } from "../../tests/fixtures.ts";

it("preserves raw mappings, the synthetic compacted row and the exact derived semantics", () => {
  const raw = recording([observation("entry.a"), observation("entry.transport", 10, "transport.state"), observation("entry.unmatched", 20)]);
  const result = normalized([
    observation("entry.a"),
    { ...observation("entry.a.derived", 100), correlationId: "entry.a", metadata: { normalizedFrom: "entry.a" } },
    { ...observation("entry.derived", 300), correlationId: "foreign.source" },
    observation("entry.transport", 10, "transport.state")
  ]);
  const rawBytes = JSON.stringify(raw), normalizedBytes = JSON.stringify(result);
  const filtered = recordingTimelineForProposalMapping(raw.timeline, { isStateObservation: (entry) => entry.observationType === "transport.state" });
  const review = createRecordingNormalizationReview(raw, result, filtered);
  expect(review.mappings).toEqual([
    { rawEntryId: "entry.a", normalizedEntryIds: ["entry.a", "entry.a.derived"], status: "preserved" },
    { rawEntryId: "entry.unmatched", normalizedEntryIds: [], status: "preserved" },
    { rawEntryId: "compacted.high-frequency-state.recording.actual", normalizedEntryIds: [], status: "dropped", reason: "1 high-frequency state entries were preserved in the raw recording but omitted from proposal review mappings." },
    { rawEntryId: "foreign.source", normalizedEntryIds: ["entry.derived"], status: "derived", reason: "Derived during normalization." }
  ]);
  expect(review.issues).toBe(result.issues);
  expect(Object.keys(review)).toEqual(["recordingId", "normalizedTimelineId", "mappings", "waitClips", "issues"]);
  expect(JSON.stringify(raw)).toBe(rawBytes);
  expect(JSON.stringify(result)).toBe(normalizedBytes);
});

it("sorts only a copy and includes the 250-ms wait threshold exactly", () => {
  const raw = recording([]);
  const result = normalized([observation("entry.last", 500), observation("entry.first", 0), observation("entry.short", 249), observation("entry.threshold", 499)]);
  const originalOrder = result.timeline.map((entry) => entry.id);
  expect(createRecordingNormalizationReview(raw, result, []).waitClips).toEqual([{ beforeEntryId: "entry.short", afterEntryId: "entry.threshold", waitMs: 250 }]);
  expect(result.timeline.map((entry) => entry.id)).toEqual(originalOrder);
});

it("prefers normalizedFrom over correlation for derivation while retaining all raw associations", () => {
  const raw = recording([observation("entry.a"), observation("entry.b")]);
  const result = normalized([{ ...observation("entry.derived"), correlationId: "entry.a", metadata: { normalizedFrom: "entry.b" } }]);
  expect(createRecordingNormalizationReview(raw, result, raw.timeline).mappings).toEqual([
    { rawEntryId: "entry.a", normalizedEntryIds: ["entry.derived"], status: "preserved" },
    { rawEntryId: "entry.b", normalizedEntryIds: ["entry.derived"], status: "preserved" }
  ]);
});
