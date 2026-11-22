import { expect, it } from "vitest";
import { automationStudioRunDatasetProcessingReference } from "../reference-time.ts";

it("uses a validated immutable logical reference without changing the current segment's actual start", () => {
  expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: JSON.stringify({ metadata: { processingReferenceTimeMs: 100, explorationAttempt: { attemptId: "attempt" } } }) })).toEqual({ ok: true, referenceTimeMs: 100 });
  expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: "{}" })).toEqual({ ok: true, referenceTimeMs: 500 });
});

it("does not substitute a current/start clock for missing or corrupt carried provenance", () => {
  for (const reference of [null, "100", -1, 0.5]) expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: JSON.stringify({ metadata: { processingReferenceTimeMs: reference } }) })).toEqual({ ok: false, reason: "processing_reference_missing" });
  expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: JSON.stringify({ metadata: { explorationAttempt: { attemptId: "old" } } }) })).toEqual({ ok: false, reason: "processing_reference_missing" });
  expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: "broken" })).toEqual({ ok: false, reason: "processing_reference_invalid" });
  expect(automationStudioRunDatasetProcessingReference(undefined)).toEqual({ ok: false, reason: "processing_reference_missing" });
});
