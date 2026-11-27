// An amendment that changed nothing because the draft already holds it says what the draft holds (t1078).
//
// Live run `run-mwyt3s48-b943f344`, 0023, 0029 and 0034: `repeat step 7 while step 8` and `result step 7` were sent on
// a draft whose step 7 already repeated through step 8 while it succeeds and held the result. Each was refused
// `already_so` with a sentence that named neither what was so nor how the step stood, and was sent again.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceDraftAmendmentFeedback } from "../index.ts";

/** The run's draft at 0023: step 7 reads and repeats through step 8, Next page. */
const steps = [
  { position: 6, id: "d6", effect: "observe", disposition: "kept" },
  { position: 7, id: "d7", effect: "observe", disposition: "kept", result: true, routing: { kind: "repeat", through: "d8", while: "d8" } },
  { position: 8, id: "d8", effect: "mutate", disposition: "kept" }
];

describe("an amendment refused because the draft already holds it", () => {
  const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [{ step: 7, reason: "already_so" }, { step: 7, reason: "already_so" }],
    applied: 0, steps, stepsWithoutProgress: 1
  });
  const next = (feedback.refused as { next: string }[]).map((entry) => entry.next);

  it("says that nothing changed and that sending it again changes nothing", () => {
    expect(next[0]).toContain("already holds exactly what that amendment says for step 7");
    expect(next[0]).toContain("sending it again changes nothing");
  });

  it("shows the step as it stands, in the draft's own numbers", () => {
    expect(next[0]).toContain("it is in the Flow, it repeats through step 8 while it succeeds, it holds the result");
  });

  it("says a step out of the Flow is out, and a repeat over a listing by its listing", () => {
    const out = automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step: 9, reason: "already_so" }], applied: 0, stepsWithoutProgress: 1,
      steps: [{ position: 6, id: "d6", effect: "observe", disposition: "kept" }, { position: 9, id: "d9", effect: "mutate", disposition: "kept", routing: { kind: "repeat", through: "d9", over: "d6" } }, { position: 10, disposition: "dropped" }]
    });
    expect((out.refused as { next: string }[])[0]!.next).toContain("it repeats through step 9, over step 6");
  });

  it("still answers a step the draft does not carry", () => {
    const none = automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals: [{ step: 4, reason: "already_so" }], applied: 0, steps: [], stepsWithoutProgress: 1 });
    expect((none.refused as { next: string }[])[0]!.next).toContain("changes nothing");
  });
});
