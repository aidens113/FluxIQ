import { describe, expect, it } from "vitest";
import { automationStudioRecordConditionHolds, automationStudioRecordConditionPattern } from "../../index.ts";

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
    expect(automationStudioRecordConditionPattern("/ear tips/z")).toBeUndefined();
    expect(automationStudioRecordConditionPattern("")).toBeUndefined();
    expect(automationStudioRecordConditionPattern("a".repeat(200))).toBeDefined();
    expect(automationStudioRecordConditionHolds({ field: "title", matches: "(unclosed" }, "anything")).toBe(false);
  });

  // t728 (lane S): the browser asks this of one value it read, with a condition
  // that names no field or names it as `undefined`; the verdict is the same as
  // with the field named.
  it("accepts a condition with no field, judging the one value it is given", () => {
    expect(automationStudioRecordConditionHolds({}, "Sponsored")).toBe(true);
    expect(automationStudioRecordConditionHolds({}, undefined)).toBe(false);
    expect(automationStudioRecordConditionHolds({ is: "absent" }, undefined)).toBe(true);
    expect(automationStudioRecordConditionHolds({ lessThan: 50 }, "$49.00")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: undefined, atLeast: undefined, contains: "case", not: undefined }, "Spare case")).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: undefined, contains: "case", not: true }, "Spare case")).toBe(false);
  });

  // Core's rule, which wins over the browser's old blank-is-present reading
  // (t728): a blank string is a value the page did not have.
  it("reads a blank string as absent", () => {
    expect(automationStudioRecordConditionHolds({}, "")).toBe(false);
    expect(automationStudioRecordConditionHolds({ is: "present" }, " \n ")).toBe(false);
    expect(automationStudioRecordConditionHolds({ is: "absent" }, "")).toBe(true);
    expect(automationStudioRecordConditionHolds({ equals: "" }, "")).toBe(false);
    expect(automationStudioRecordConditionHolds({ contains: "case", not: true }, "")).toBe(true);
    expect(automationStudioRecordConditionHolds({ atLeast: 0 }, "")).toBe(false);
  });

  // Moved from the downstream domain's `condition-match` tests (t728), so its
  // parity copy can go.
  it("holds every bound to the number the value states, two bounds being one range", () => {
    expect(automationStudioRecordConditionHolds({ atLeast: 4 }, "4.0")).toBe(true);
    expect(automationStudioRecordConditionHolds({ atLeast: 4 }, "3.7 out of 5 stars")).toBe(false);
    expect(automationStudioRecordConditionHolds({ atMost: 50 }, "50.00 USD")).toBe(true);
    expect(automationStudioRecordConditionHolds({ atMost: 50 }, "$50.01")).toBe(false);
    expect(automationStudioRecordConditionHolds({ lessThan: 50 }, "$1,299.00")).toBe(false);
    expect(automationStudioRecordConditionHolds({ lessThan: 500 }, "EUR 1.165,00")).toBe(false);
    expect(automationStudioRecordConditionHolds({ greaterThan: 0 }, "$0.00")).toBe(false);
    expect(automationStudioRecordConditionHolds({ greaterThan: 0 }, "$0.01")).toBe(true);
    expect(automationStudioRecordConditionHolds({ atLeast: 10, atMost: 50 }, "$49.00")).toBe(true);
    expect(automationStudioRecordConditionHolds({ atLeast: 10, atMost: 50 }, "$9.99")).toBe(false);
    expect(automationStudioRecordConditionHolds({ atLeast: 70_000 }, "£72k – £80k per annum")).toBe(true);
    expect(automationStudioRecordConditionHolds({ atLeast: 70_000 }, "£65k")).toBe(false);
    for (const bound of [{ atLeast: 4 }, { atMost: 4 }, { lessThan: 4 }, { greaterThan: 4 }]) {
      expect(automationStudioRecordConditionHolds(bound, "Free")).toBe(false);
      expect(automationStudioRecordConditionHolds(bound, undefined)).toBe(false);
    }
  });

  it("reads a list under equals as any of it, numbers against the number and strings against the text", () => {
    expect(automationStudioRecordConditionHolds({ equals: 4 }, "4.00 out of 5 stars")).toBe(true);
    expect(automationStudioRecordConditionHolds({ equals: 49 }, "$49.00")).toBe(true);
    expect(automationStudioRecordConditionHolds({ equals: "Plus" }, " Plus\n ")).toBe(true);
    expect(automationStudioRecordConditionHolds({ equals: "Plus" }, "Plus eligible")).toBe(false);
    expect(automationStudioRecordConditionHolds({ equals: [4, "free"] }, "Free")).toBe(true);
    expect(automationStudioRecordConditionHolds({ equals: [4, "free"] }, "$4.00")).toBe(true);
    expect(automationStudioRecordConditionHolds({ equals: [4, "free"] }, "$5.00")).toBe(false);
    expect(automationStudioRecordConditionHolds({ equals: "Plus" }, undefined)).toBe(false);
  });

  it("anchors startsWith and endsWith to the value's words", () => {
    const title = "Acme  Wireless\n Earbuds  Charging Case (Black)";
    expect(automationStudioRecordConditionHolds({ contains: ["ear tips", "screen protector"] }, title)).toBe(false);
    expect(automationStudioRecordConditionHolds({ startsWith: "acme wireless" }, title)).toBe(true);
    expect(automationStudioRecordConditionHolds({ startsWith: "wireless" }, title)).toBe(false);
    expect(automationStudioRecordConditionHolds({ endsWith: "(black)" }, title)).toBe(true);
    expect(automationStudioRecordConditionHolds({ endsWith: "case" }, title)).toBe(false);
  });

  it("reads a delimited pattern's flags, any of a list, and drops a stateful flag", () => {
    const title = "Acme Wireless Earbuds -- Charging Case";
    expect(automationStudioRecordConditionHolds({ matches: "ear ?tips|charging case" }, title)).toBe(true);
    expect(automationStudioRecordConditionHolds({ matches: "/Charging Case/" }, title)).toBe(true);
    expect(automationStudioRecordConditionHolds({ matches: "/charging case/" }, title)).toBe(false);
    expect(automationStudioRecordConditionHolds({ matches: "/charging case/i" }, title)).toBe(true);
    expect(automationStudioRecordConditionHolds({ matches: ["^Zeta", "Case$"] }, title)).toBe(true);
    const stateful = { matches: "/Case/g" };
    expect(automationStudioRecordConditionHolds(stateful, title)).toBe(true);
    expect(automationStudioRecordConditionHolds(stateful, title)).toBe(true);
  });

  it("requires every comparison a condition names, and not inverts them together", () => {
    expect(automationStudioRecordConditionHolds({ atLeast: 4, atMost: 5 }, "4.3 out of 5 stars")).toBe(true);
    expect(automationStudioRecordConditionHolds({ startsWith: "Acme", contains: "earbuds" }, "Acme Wireless Earbuds")).toBe(true);
    expect(automationStudioRecordConditionHolds({ startsWith: "Acme", contains: "earbuds" }, "Acme Charging Case")).toBe(false);
    expect(automationStudioRecordConditionHolds({ contains: "acme", matches: "Case$", not: true }, "Acme Charging Case")).toBe(false);
    expect(automationStudioRecordConditionHolds({ contains: "acme", matches: "Case$", not: true }, "Acme Earbuds")).toBe(true);
    expect(automationStudioRecordConditionHolds({ lessThan: 50, not: true }, "$79.99")).toBe(true);
    expect(automationStudioRecordConditionHolds({ not: false, contains: "case" }, "Acme Case")).toBe(true);
  });
});
