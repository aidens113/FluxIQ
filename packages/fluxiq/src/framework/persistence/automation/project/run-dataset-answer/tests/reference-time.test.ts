import { expect, it } from "vitest";
import { automationStudioRunDatasetProcessingReference } from "../reference-time.ts";

it("uses a validated immutable logical reference without changing the current segment's actual start", () => {
  expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: JSON.stringify({ metadata: { processingReferenceTimeMs: 100, explorationAttempt: { attemptId: "attempt" } } }) })).toBe(100);
  expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: "{}" })).toBe(500);
});

it("does not substitute a current/start clock for missing or corrupt carried provenance", () => {
  for (const reference of [null, "100", -1, 0.5]) expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: JSON.stringify({ metadata: { processingReferenceTimeMs: reference } }) })).toBeUndefined();
  expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: JSON.stringify({ metadata: { explorationAttempt: { attemptId: "old" } } }) })).toBeUndefined();
  expect(automationStudioRunDatasetProcessingReference({ started_at_ms: 500, summary_json: "broken" })).toBeUndefined();
  expect(automationStudioRunDatasetProcessingReference(undefined)).toBeUndefined();
});
