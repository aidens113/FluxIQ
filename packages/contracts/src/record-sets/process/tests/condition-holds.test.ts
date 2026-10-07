import { describe, expect, it } from "vitest";
import { automationStudioRecordConditionHolds, automationStudioRecordConditionPattern } from "../index.ts";

describe("automationStudioRecordConditionHolds", () => {
  it("tests presence when the condition compares nothing", () => {
    expect(automationStudioRecordConditionHolds({ field: "badge" }, "Plus")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "badge" }, undefined)).toBe(false);
    expect(automationStudioRecordConditionHolds({ field: "badge" }, "  ")).toBe(false);
    expect(automationStudioRecordConditionHolds({ field: "badge", is: "absent" }, null)).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "badge", is: "absent" }, "Sponsored")).toBe(false);
  });

  it("compares the first number in the value, failing a value with none", () => {
    expect(automationStudioRecordConditionHolds({ field: "price", lessThan: 50 }, "$49.00")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "price", lessThan: 50 }, "EUR 169,00")).toBe(false);
    expect(automationStudioRecordConditionHolds({ field: "price", atLeast: 4, atMost: 5 }, "4.0 out of 5")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "price", greaterThan: 0 }, "free")).toBe(false);
    expect(automationStudioRecordConditionHolds({ field: "price", greaterThan: 0 }, undefined)).toBe(false);
    expect(automationStudioRecordConditionHolds({ field: "price", atMost: 1e-6 }, 1e-7)).toBe(true);
  });

  it("compares text with layout and case ignored, any of a list", () => {
    expect(automationStudioRecordConditionHolds({ field: "title", contains: ["ear tips", "charging case"] }, "Spare  Charging\nCase")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "title", startsWith: "spare" }, "  Spare case")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "title", endsWith: "CASE" }, "Spare case ")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "title", matches: "^spare\\b" }, "Spare case")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "title", matches: "/^spare/" }, "Spare case")).toBe(false);
  });

  it("reads equals as a number against the number and a string against the text", () => {
    expect(automationStudioRecordConditionHolds({ field: "rating", equals: 4 }, "4.0 stars")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "rating", equals: ["new", "used"] }, " Used ")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "rating", equals: "new" }, "brand new")).toBe(false);
  });

  it("inverts the whole verdict with not, a missing value included", () => {
    expect(automationStudioRecordConditionHolds({ field: "title", contains: "case", not: true }, undefined)).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "title", contains: "case", not: true }, "Case")).toBe(false);
    expect(automationStudioRecordConditionHolds({ field: "badge", is: "absent", not: true }, "Plus")).toBe(true);
  });

  it("refuses a pattern it could not run", () => {
    expect(automationStudioRecordConditionPattern("(")).toBeUndefined();
    expect(automationStudioRecordConditionPattern("/a/q")).toBeUndefined();
    expect(automationStudioRecordConditionPattern("x".repeat(201))).toBeUndefined();
    expect(automationStudioRecordConditionPattern("/a/gi")?.flags).toBe("i");
  });
});
