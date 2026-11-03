// A read's date bound is said as one (t790, run `run-mvswewhy-e4e469d4`): its
// `as` is a suffix, never a relation, and a bound written as text is a date
// bound whether or not the condition still carries `as`. A library's loans,
// made up.
import { describe, expect, it } from "vitest";
import { automationStudioResultReadConditionText } from "../condition.ts";

describe("a read condition with a date bound", () => {
  it("is said with its bounds and as a date", () => {
    expect(automationStudioResultReadConditionText({ field: "due", atLeast: "2026-10-01", as: "date" }, undefined, [])).toBe("due atLeast \"2026-10-01\" as a date");
    expect(automationStudioResultReadConditionText({ field: "due", atLeast: "2026-10-01", atMost: "2026-10-31" }, undefined, [])).toBe("due atLeast \"2026-10-01\" and atMost \"2026-10-31\" as a date");
    expect(automationStudioResultReadConditionText({ field: "copies", atLeast: 2 }, undefined, [])).toBe("copies atLeast 2");
  });
});
