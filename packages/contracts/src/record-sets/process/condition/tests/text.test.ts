import { describe, expect, it } from "vitest";
import { automationStudioRecordConditionText } from "../../index.ts";

describe("automationStudioRecordConditionText", () => {
  it("says a condition as its field, each comparison and its value", () => {
    expect(automationStudioRecordConditionText({ field: "name", contains: "Spare Strap", not: true })).toBe("name not contains \"Spare Strap\"");
    expect(automationStudioRecordConditionText({ field: "name", contains: ["a", "b"] })).toBe("name contains [\"a\", \"b\"]");
    expect(automationStudioRecordConditionText({ field: "price", atLeast: 10, lessThan: 50 })).toBe("price atLeast 10 and lessThan 50");
    expect(automationStudioRecordConditionText({ field: "price", atLeast: 10, lessThan: 50, not: true })).toBe("price not (atLeast 10 and lessThan 50)");
    expect(automationStudioRecordConditionText({ field: "badge" })).toBe("badge is present");
    expect(automationStudioRecordConditionText({ field: "badge", is: "absent" })).toBe("badge is absent");
    expect(automationStudioRecordConditionText({ field: "badge", not: true })).toBe("badge not is present");
    expect(automationStudioRecordConditionText({ field: "kind", equals: [1, "one"] })).toBe("kind equals [1, \"one\"]");
  });
});
