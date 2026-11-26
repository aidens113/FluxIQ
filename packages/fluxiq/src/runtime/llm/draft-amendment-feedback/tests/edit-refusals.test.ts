// The words for the refusal the edit grammar added (`../refusal-reasons.ts`, `../fallback.ts`). A change outside the
// seven edits is no amendment the loop reads (`../../evidence-loop-decision.ts`), so it is never refused here.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceDraftAmendmentFeedback } from "../index.ts";

describe("framework draft edit refusals", () => {
  const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [{ step: 2, reason: "not_a_read" }],
    applied: 0, steps: [], stepsWithoutProgress: 1
  });

  it("tells not_a_read with the way out", () => {
    const reasons = feedback.reasons as Record<string, string>;
    expect(reasons.not_a_read).toContain("does not read");
    const next = (feedback.refused as { next: string }[]).map((entry) => entry.next);
    expect(next[0]).toContain('"change": "result"');
  });
});
