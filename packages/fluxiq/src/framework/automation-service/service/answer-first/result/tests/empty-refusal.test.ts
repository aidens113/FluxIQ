// The completion refusal for an empty result: why it is empty, every read outside the result that kept rows, and the
// `result` edit on that read's step, or running the read (t1037: `take` is no edit).
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultPort } from "../index.ts";
import { look, page, seats, SEAT_REQUEST, step } from "./support.ts";

describe("the empty-result refusal", () => {
  it("names the looks that kept rows and the one-call fix, and never makes a look the result", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([look("c3", seats("A", 12)), look("c4", []), look("c5", seats("B", 5))]);
    expect(port.emptyRefusal()).toBe(`The result holds no rows: the draft has no read step. Reads that are not the result kept rows: call c3 (12 rows), call c5 (5 rows). Every read that worked is a step of the draft: amend_draft with change "result" on that read's step makes it the result, with no new act; or run the read of the list asked for, and it joins the draft.`);
    expect(port.answer().rows).toEqual([]);
  });

  it("says what the output step read when it kept nothing, and that no look kept rows either", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", [], { place: "page=1" })]);
    expect(port.emptyRefusal()).toBe("The result holds no rows: step 9 (v1) kept no rows on page=1 (0). No read outside the draft kept rows either.");
  });

  it("is none where the result holds rows", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([page(step(9), "c1", seats("A", 1), { place: "page=1" })]);
    expect(port.emptyRefusal()).toBeUndefined();
  });
});
