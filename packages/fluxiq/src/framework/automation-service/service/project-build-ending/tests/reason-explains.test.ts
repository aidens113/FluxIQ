import { describe, expect, it } from "vitest";
import { automationStudioProjectBuildReasonChecked } from "../reason-checked.ts";

// t748 (t738's open point): the check left out every sentence naming a part with a failure word, so "the save step
// failed because ..." lost the one sentence saying why. Core's record says how each part's tests came out, in counts
// and never by name, so it can back no claim about a named part's test: those claims still give way. A sentence that
// explains why something failed is the supervisor's account of a cause the record does not hold, and stays. A pin
// board stands in for the site.

describe("the supervisor's reason beside Core's record of its tests", () => {
  it("keeps a sentence that says why a step or part failed", () => {
    expect(automationStudioProjectBuildReasonChecked("The save step failed because the board answered that it is full."))
      .toBe("The save step failed because the board answered that it is full.");
    expect(automationStudioProjectBuildReasonChecked("I stopped here. The part that pins the card did not work when the board asked to sign in again."))
      .toBe("I stopped here. The part that pins the card did not work when the board asked to sign in again.");
  });

  it("still leaves out a bare claim that a part failed, and any claim of how a part's test went, explained or not", () => {
    expect(automationStudioProjectBuildReasonChecked("I stopped here. The save step failed. Nothing was removed.")).toBe("I stopped here. Nothing was removed.");
    expect(automationStudioProjectBuildReasonChecked("The part that opens the board never passed its own test because it timed out.")).toBe("");
    expect(automationStudioProjectBuildReasonChecked("The pin step was tested twice and failed due to a slow page.")).toBe("");
  });

  it("keeps the explanation and drops the claim when a reason holds both", () => {
    const reason = "I could not finish. The save step failed because the board was full. The part that opens the board never passed its test.";
    expect(automationStudioProjectBuildReasonChecked(reason)).toBe("I could not finish. The save step failed because the board was full.");
  });
});
