import { describe, expect, it } from "vitest";
import { automationStudioCandidateStartedWithSaid } from "../started-with.ts";

// What the judge of a trial is told the site already held (t471).

describe("what a trial started with, as the judge is told it", () => {
  it("says each kept act and each act still in place by its id and what it did, then each difference", () => {
    expect(automationStudioCandidateStartedWithSaid({
      cannotUndo: [{ act: "act-1", did: "press \"Confirm\" button" }, { act: "act-2", did: "press \"Confirm\" button" }],
      acts: [{ act: "act-3", did: "press \"Add\" button" }],
      differs: ["new: x"],
      instruction: "words for the model"
    })).toEqual([
      "already done by this build (act-1): press \"Confirm\" button",
      "already done by this build (act-2): press \"Confirm\" button",
      "already done by this build (act-3): press \"Add\" button",
      "not as the build found it: new: x"
    ]);
  });

  it("says nothing for a clean start, and skips entries of the wrong shape", () => {
    expect(automationStudioCandidateStartedWithSaid(undefined)).toEqual([]);
    expect(automationStudioCandidateStartedWithSaid({ acts: [7, null, { act: "act-1" }], differs: [3, "new: y"] })).toEqual(["not as the build found it: new: y"]);
  });

  it("says at most twenty", () => {
    const acts = Array.from({ length: 30 }, (_, n) => ({ act: `act-${n + 1}`, did: "press" }));
    expect(automationStudioCandidateStartedWithSaid({ acts })).toHaveLength(20);
  });
});
