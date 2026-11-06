import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_CONVERSATION_ATTEMPT_SUMMARY as SUMMARY } from "../summary.ts";

// The chat model reads this to choose between starting an attempt and asking the person. The same
// words typed again once read as a request to do it twice, and the attempt never started
// (run-mw4907db-c3992394). These pin one consistent rule.
describe("the answer-first command summary", () => {
  it("says the same words again start as usual and do not do it twice", () => {
    expect(SUMMARY).toContain("The same words again are not a request to do it twice: start it as usual, and it checks what it already did, does not do that again, and reports the result.");
  });

  it("asks only when the person's own words ask for a repeat, and once, before starting", () => {
    expect(SUMMARY).toContain("Only when the person's own words ask for something done before to be done again, ask them once before starting whether they want it done again, and start only when they answer yes.");
  });

  it("no longer carries the older sentence that a model read as a reason to ask", () => {
    expect(SUMMARY).not.toContain("Where a person asks for something done before to be done a second time");
  });

  it("names no site, product or count", () => {
    expect(SUMMARY).not.toMatch(/\d/u);
  });
});
