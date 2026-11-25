// The words for the two refusals of the reduced edit grammar (`../refusal-reasons.ts`, `../fallback.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceDraftAmendmentFeedback } from "../index.ts";

describe("framework draft edit refusals", () => {
  const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [{ step: 3, reason: "not_an_edit" }, { step: 2, reason: "not_a_read" }],
    applied: 0, steps: [], stepsWithoutProgress: 1, maxStepsWithoutProgress: 4
  });

  it("tells not_an_edit with the six edits and not_a_read with the way out", () => {
    const reasons = feedback.reasons as Record<string, string>;
    for (const edit of ["keep", "drop", "result", "repeat", "unrepeat", "bind"]) expect(reasons.not_an_edit).toContain(edit);
    expect(reasons.not_a_read).toContain("does not read");
    const next = (feedback.refused as { next: string }[]).map((entry) => entry.next);
    expect(next[0]).toContain("Step 3");
    expect(next[1]).toContain('"change": "result"');
  });
});
