// What the amendment handler tells the model about a refusal about a listing
// read page by page (`../../draft-amendment-feedback/index.ts`, `rowAct`, told by
// `../amendment.ts`, t690). Split from `../../tests/draft-amendment-feedback.test.ts`,
// which is at the line limit, as `./refusal-way-out.test.ts` was. In t688's
// Lab run (steps 0183-0184) step 13 already read the list page by page, repeating while the next-page press at 14 succeeded,
// and Core's `next` named 14 as the row act: the model sent `14 repeat over
// 13`, which pressed Next once per row and broke the page loop.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceDraftAmendmentFeedback } from "../../index.ts";

type Steps = Parameters<typeof automationStudioLlmEvidenceDraftAmendmentFeedback>[0]["steps"];
const look = (position: number) => ({ position, effect: "observe", effectApplied: false, disposition: "taken" });
const act = (position: number, disposition = "kept") => ({ position, effect: "mutate", effectApplied: true, disposition });
const read = (position: number, disposition = "taken") => ({ position, effect: "observe", effectApplied: true, disposition });
/** A look, the way to the list, and trial reads, with the kept read at 13. */
const before = [look(1), act(2), act(3), look(4), read(5), read(6), look(7), act(8, "taken"), look(9), read(10), read(11), read(12)];
const nextOf = (refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: Steps): string | undefined => {
  const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals: [refusal], applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8 });
  return (feedback.refused as { next?: string }[])[0]?.next;
};

describe("a refusal about a listing read page by page", () => {
  it("says its page loop is in place, and never a repeat over it on the page press", () => {
    const paged = [...before, { ...read(13, "kept"), id: "s13", routing: { kind: "repeat", through: "s14", while: "s14" } }, { ...act(14), id: "s14" }];
    for (const refusal of [{ step: 13, reason: "changes_nothing" as const }, { step: 13, reason: "over_not_before" as const, over: 13 }]) {
      const next = nextOf(refusal, paged);
      expect(next).toContain("Step 13 already reads the list page by page: steps 13 through 14 run again while step 14 succeeds");
      expect(next).toContain("never repeat step 14 over step 13");
      expect(next).not.toContain(`"change": "repeat", "over"`);
    }
  });

  it("tells a press after a read with no page loop both forms Core accepts", () => {
    const plain = nextOf({ step: 13, reason: "changes_nothing" }, [...before, read(13, "kept"), act(14)]);
    expect(plain).toContain(`the repeat goes on it: send {"step": 14, "change": "repeat", "over": 13}`);
    expect(plain).toContain(`If it moves the list on to its next page instead, it is no row's act: the page loop goes on the read, send {"step": 13, "change": "repeat", "while": 14}`);
    const taken = nextOf({ step: 13, reason: "changes_nothing" }, [...before, read(13, "kept"), act(14, "taken")]);
    expect(taken).toContain(`add step 14, then send {"step": 13, "change": "repeat", "while": 14}`);
  });
});
