// The rows a text test left out that Core settles itself (t624,
// `../settled-rows.ts`): only where the row's aligned witness found the value
// and that value fails the condition as written, by Core's own semantics.
import type { AutomationStudioRecordCondition } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultLeftOutObservation } from "../../read-condition.ts";
import { automationStudioResultSettledRows } from "../settled-rows.ts";

const found = (value: string): AutomationStudioResultLeftOutObservation => ({ source: "read", readKind: "text", page: 1, item: 1, state: "present", value });
const unread = (state: "absent" | "unavailable" | "withheld"): AutomationStudioResultLeftOutObservation => ({ source: "read", page: 1, item: 1, state });

const settle = (condition: Omit<AutomationStudioRecordCondition, "field">, witnesses: Array<AutomationStudioResultLeftOutObservation | null | undefined>, named: string | null = "shelf") =>
  automationStudioResultSettledRows({
    condition: { field: named ?? "value", ...condition },
    column: named ?? undefined,
    number: 2,
    wording: "shelf contains [\"On shelf today\"]",
    leftOut: witnesses.map((witness, at) => ({ row: `Row ${at + 1}`, cell: undefined, witness }))
  });

describe("a text test's left-out rows", () => {
  it("are settled where the witness found a value that fails the test, and the sentence asks for the one quote", () => {
    const settled = settle({ contains: ["On shelf today"] }, [found("On shelf tomorrow"), found("On loan, due Nov 2")]);
    expect(settled?.leftOutSettled).toEqual(["Row 1", "Row 2"]);
    expect(settled?.settled).toContain("Core tested that value against condition 2 (shelf contains [\"On shelf today\"]) as written: each fails it");
    expect(settled?.settled).toContain("quote, once, in a sentence that names condition 2 (shelf contains [\"On shelf today\"]) or shelf, the request's own words asking only for rows whose shelf says what the condition looks for");
  });

  it("are settled for startsWith, endsWith, matches and a text equals, each as Core's semantics reads it", () => {
    expect(settle({ startsWith: "On shelf" }, [found("Request from another branch"), found("on shelf tomorrow")])?.leftOutSettled).toEqual(["Row 1"]);
    expect(settle({ endsWith: "today" }, [found("On shelf tomorrow"), found("ON SHELF TODAY")])?.leftOutSettled).toEqual(["Row 1"]);
    expect(settle({ matches: "today$" }, [found("On shelf tomorrow"), found("On shelf Today")])?.leftOutSettled).toEqual(["Row 1"]);
    expect(settle({ equals: ["On shelf today", "In the reading room"] }, [found("On shelf  TODAY"), found("On loan")])?.leftOutSettled).toEqual(["Row 2"]);
  });

  it("are settled for a negated test where the witness found the text it leaves out, said as leaving those rows out", () => {
    const settled = settle({ contains: ["Sampler"], not: true }, [found("Harbour Tales, Sampler Edition"), found("Harbour Tales, Complete")], "title");
    expect(settled?.leftOutSettled).toEqual(["Row 1"]);
    expect(settled?.settled).toContain("the request's own words leaving out rows whose title says what the condition looks for");
  });

  it("are never settled by a witness that found no value, could not read it, was withheld, or is missing", () => {
    expect(settle({ contains: ["On shelf today"] }, [unread("absent"), unread("unavailable"), unread("withheld"), null, undefined])).toBeUndefined();
  });

  it("are never settled where the found value passes the test: Core settles only what fails as written", () => {
    expect(settle({ contains: ["On shelf today"] }, [found("On shelf today, front desk")])).toBeUndefined();
  });

  it("settle nothing for a condition mixing a text test with a bound, or a numeric equals", () => {
    expect(settle({ contains: ["4"], atLeast: 4 }, [found("3 stars")])).toBeUndefined();
    expect(settle({ equals: [4, "four"] }, [found("three")], "stars")).toBeUndefined();
  });

  it("are said by the value it tests where no column names it", () => {
    const settled = settle({ contains: ["On shelf today"] }, [found("On shelf tomorrow")], null);
    expect(settled?.leftOutSettled).toEqual(["Row 1"]);
    expect(settled?.settled).toContain("the read found the value it tests");
  });
});
