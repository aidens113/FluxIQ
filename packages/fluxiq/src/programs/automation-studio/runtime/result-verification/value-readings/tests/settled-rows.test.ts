// The rows a text test left out that Core settles itself (t624,
// `../settled-rows.ts`): only where the row's aligned witness found the value
// and that value fails the condition as written, by Core's own semantics --
// or found no value, where the test is not negated (t636). And a numeric
// bound's row whose value the read found empty (t636).
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

  it("are never settled by a witness that could not read the value, was withheld, or is missing", () => {
    expect(settle({ contains: ["On shelf today"] }, [unread("unavailable"), unread("withheld"), null, undefined])).toBeUndefined();
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

describe("a text test's left-out rows whose witness found no value (t636)", () => {
  it("are settled for a test that is not negated, and the sentence says the read found no value, not that a value failed", () => {
    const settled = settle({ contains: ["On shelf today"] }, [unread("absent"), unread("absent")]);
    expect(settled?.leftOutSettled).toEqual(["Row 1", "Row 2"]);
    expect(settled?.settled).toContain("the read found no shelf, as that row's witness in leftOutObservations gives it, and a row with no value fails condition 2 (shelf contains [\"On shelf today\"]) as written");
    expect(settled?.settled).toContain("the request's own words asking only for rows whose shelf says what the condition looks for");
  });

  it("are settled for startsWith, endsWith, matches and a text equals alike", () => {
    for (const condition of [{ startsWith: "On shelf" }, { endsWith: "today" }, { matches: "today$" }, { equals: "On shelf today" }]) {
      expect(settle(condition, [unread("absent")])?.leftOutSettled).toEqual(["Row 1"]);
    }
  });

  it("are said beside rows whose found value fails, and where no column names the value", () => {
    const mixed = settle({ contains: ["On shelf today"] }, [found("On loan"), unread("absent")]);
    expect(mixed?.leftOutSettled).toEqual(["Row 1", "Row 2"]);
    expect(mixed?.settled).toContain("the read found shelf or found no shelf");
    expect(settle({ contains: ["On shelf today"] }, [unread("absent")], null)?.settled).toContain("the read found no value to test");
  });

  it("are never settled for a negated test: a row with no value passes it, so absence is no failure", () => {
    expect(settle({ contains: ["Sampler"], not: true }, [unread("absent"), unread("absent")], "title")).toBeUndefined();
    expect(settle({ contains: ["Sampler"], not: true }, [unread("absent"), found("Harbour Tales, Sampler Edition")], "title")?.leftOutSettled).toEqual(["Row 2"]);
  });
});

/** A bound's left-out row, said as the read account says it, with the cell Core reads and its witness. */
const boundRow = (label: string, value: string, witness?: AutomationStudioResultLeftOutObservation | null) => ({
  row: `${label} — pages: ${value.trim() ? value : "(no value)"}`,
  cell: value.trim() ? { label, value } : undefined,
  ...(witness === undefined ? {} : { witness })
});

const bound = (condition: Omit<AutomationStudioRecordCondition, "field">, leftOut: ReturnType<typeof boundRow>[]) =>
  automationStudioResultSettledRows({ condition: { field: "pages", ...condition }, column: "pages", number: 1, wording: "pages atMost 300", leftOut });

describe("a numeric bound's left-out rows whose value the read found empty (t636)", () => {
  it("are settled where the witness found an empty value or none, or the row says (no value) with no witness", () => {
    const settled = bound({ atMost: 300 }, [boundRow("Atlas of Rivers", "", found("")), boundRow("Field Notes", "", unread("absent")), boundRow("Pocket Herbal", "")]);
    expect(settled?.leftOutSettled).toEqual(["Atlas of Rivers — pages: (no value)", "Field Notes — pages: (no value)", "Pocket Herbal — pages: (no value)"]);
    expect(settled?.settled).toContain("On each row in leftOutSettled the read found no pages, and a row with no number fails condition 1 (pages atMost 300) as written");
    expect(settled?.settled).toContain("quote, once, in a sentence that names condition 1 (pages atMost 300) or pages, the request's own words stating that bound");
  });

  it("are said beside rows whose number fails the bound, and the numbers-only sentence is unchanged", () => {
    const mixed = bound({ atMost: 300 }, [boundRow("Long Atlas", "412 pages", found("412 pages")), boundRow("Atlas of Rivers", "", found(""))]);
    expect(mixed?.leftOutSettled).toEqual(["Long Atlas — pages: 412 pages", "Atlas of Rivers — pages: (no value)"]);
    expect(mixed?.settled).toContain("where the row states a number, that number fails it, and where the read found no pages, a row with no number fails every bound");
    expect(bound({ atMost: 300 }, [boundRow("Long Atlas", "412 pages")])?.settled).toContain("Core read pages as a number on each row in leftOutSettled, and each fails condition 1 (pages atMost 300) as written");
  });

  it("are never settled where the witness could not read the value or it was withheld", () => {
    expect(bound({ atMost: 300 }, [boundRow("Atlas of Rivers", "", unread("unavailable")), boundRow("Field Notes", "", unread("withheld"))])).toBeUndefined();
  });

  it("are never settled for a negated bound, which a row with no number passes", () => {
    expect(bound({ atMost: 300, not: true }, [boundRow("Atlas of Rivers", "", found("")), boundRow("Pocket Herbal", "")])).toBeUndefined();
  });

  it("are never settled where the value states no number but is not empty: Core did not find it empty", () => {
    expect(bound({ atMost: 300 }, [boundRow("Atlas of Rivers", "length not listed", found("length not listed"))])).toBeUndefined();
  });
});
