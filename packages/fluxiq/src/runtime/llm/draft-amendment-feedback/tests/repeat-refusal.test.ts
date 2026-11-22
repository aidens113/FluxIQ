import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceDraftAmendmentFeedback } from "../index.ts";

describe("repeat amendment refusal feedback", () => {
  it("names the held repeat and the routed body with concrete repair instructions", () => {
    const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [
        { step: 2, reason: "holds_a_repeat", repeat: 3, holds: "over" },
        { step: 5, reason: "span_holds_routing", repeat: 3, through: 5, routed: 5 }
      ],
      applied: 0, steps: [], stepsWithoutProgress: 1, maxStepsWithoutProgress: 4
    });
    const next = (feedback.refused as { next: string }[]).map((entry) => entry.next);
    expect(next[0]).toContain("Step 2 stays in the Flow");
    expect(next[0]).toContain('{"step": 3, "change": "unrepeat"}');
    expect(next[1]).toContain("step 3's repeat through step 5");
    expect(next[1]).toContain("Take off the inner routing");
    expect(feedback.refused).toEqual([
      expect.objectContaining({ step: 2, reason: "holds_a_repeat", repeat: 3, holds: "over" }),
      expect.objectContaining({ step: 5, reason: "span_holds_routing", repeat: 3, through: 5, routed: 5 })
    ]);
    expect(feedback.reasons).toMatchObject({ holds_a_repeat: expect.any(String), span_holds_routing: expect.any(String) });
  });
});
