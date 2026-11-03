// A date bound's readings and settled rows say the date Core read, never the
// number in it (t790, run `run-mvswewhy-e4e469d4`, where "on or after" a day
// could only be written as a pattern). An events calendar, made up.
import { describe, expect, it } from "vitest";
import { automationStudioResultConditionReadings } from "../condition-readings.ts";
import { automationStudioResultSettledRows } from "../settled-rows.ts";

const NOW = Date.UTC(2026, 9, 6, 12);
const ON_OR_AFTER = { field: "starts", atLeast: "2026-09-19", as: "date" as const };

describe("a date bound's readings", () => {
  it("say the day Core read, or that the value states no date Core can read", () => {
    const lines = automationStudioResultConditionReadings({
      condition: ON_OR_AFTER,
      column: "starts",
      kept: [{ label: "Poetry night", value: "Monday 21 September 2026 at 19:00" }],
      leftOut: [{ label: "Book swap", value: "18 Sep 2026" }, { label: "Craft fair", value: "Date to be confirmed" }],
      now: NOW
    });
    expect(lines).toEqual([
      "kept \"Poetry night\": starts read as 2026-09-21 19:00 UTC from \"Monday 21 September 2026 at 19:00\"",
      "left out \"Book swap\": starts read as 2026-09-18 from \"18 Sep 2026\"",
      "left out \"Craft fair\": starts read as no date Core can read from \"Date to be confirmed\""
    ]);
  });
});

describe("a date bound's settled rows", () => {
  const leftOut = [
    { row: "Book swap — starts: 18 Sep 2026", cell: { label: "Book swap", value: "18 Sep 2026" } },
    { row: "Craft fair — starts: Date to be confirmed", cell: { label: "Craft fair", value: "Date to be confirmed" } }
  ];

  it("settle a row whose date fails the bound, as a date, and leave an undated row to be quoted", () => {
    const settled = automationStudioResultSettledRows({ condition: ON_OR_AFTER, column: "starts", number: 1, wording: "starts atLeast \"2026-09-19\" as a date", leftOut, now: NOW });
    expect(settled?.leftOutSettled).toEqual(["Book swap — starts: 18 Sep 2026"]);
    expect(settled?.settled).toContain("Core read starts as a date on each row in leftOutSettled");
    expect(settled?.settled).not.toContain("as a number");
  });
});
