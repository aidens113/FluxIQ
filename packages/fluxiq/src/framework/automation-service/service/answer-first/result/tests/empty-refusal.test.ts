// The completion refusal for an empty result: why it is empty, every look that kept rows, and `take`.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstResultPort } from "../index.ts";
import { look, page, seats, SEAT_REQUEST, step } from "./support.ts";

describe("the empty-result refusal", () => {
  it("names the looks that kept rows and the one-call fix, and never makes a look the result", () => {
    const port = automationStudioAnswerFirstResultPort(SEAT_REQUEST);
    port.record([look("c3", seats("A", 12)), look("c4", []), look("c5", seats("B", 5))]);
    expect(port.emptyRefusal()).toBe('The result holds no rows: the draft has no read step. Reads outside the draft kept rows, and they are not the result: call c3 (12 rows), call c5 (5 rows). A read is the result only as a draft step: amend_draft with change "take" and the read\'s call id makes it one, with no new act.');
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
