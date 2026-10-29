// A `where` date bound (t790, run `run-mvswewhy-e4e469d4`): a request asking for
// rows "on or after" a day had only a pattern to say it with. An events
// calendar, made up.
import { describe, expect, it } from "vitest";
import {
  automationStudioRecordConditionHolds,
  automationStudioRecordConditionText,
  parseAutomationStudioRecordCondition,
  processAutomationStudioRecordRows,
  readAutomationStudioRecordConditionDate,
  readAutomationStudioRecordConditionDateBound
} from "../index.ts";
import type { AutomationStudioRecordSchema } from "../../schema.ts";

const NOW = Date.UTC(2026, 9, 6, 12);
const ON_OR_AFTER = { field: "starts", atLeast: "2026-09-19", as: "date" as const };

describe("a date bound as written", () => {
  it("names one date where it says its year", () => {
    for (const written of ["2026-09-19", "19 September 2026", "Saturday 19 September 2026", "19 Sep 2026", "Sep 19, 2026", "19/09/2026"]) {
      expect(readAutomationStudioRecordConditionDateBound(written), written).toEqual({ at: Date.UTC(2026, 8, 19), wholeDay: true });
    }
    expect(readAutomationStudioRecordConditionDateBound("2026-09-19 18:30")).toEqual({ at: Date.UTC(2026, 8, 19, 18, 30), wholeDay: false });
  });

  it("names none where it is relative, has no year, or reads either way", () => {
    for (const written of ["Sep 19", "3 days ago", "today", "yesterday", "02/03/2026", "next week", "2026"]) {
      expect(readAutomationStudioRecordConditionDateBound(written), written).toBeUndefined();
    }
  });
});

describe("a row's date for a date bound", () => {
  it("reads the formats a listing writes", () => {
    expect(readAutomationStudioRecordConditionDate("Monday 21 September 2026 at 04:00", NOW)).toBe(Date.UTC(2026, 8, 21, 4));
    expect(readAutomationStudioRecordConditionDate("21 Sep 2026", NOW)).toBe(Date.UTC(2026, 8, 21));
    expect(readAutomationStudioRecordConditionDate("2026-09-21", NOW)).toBe(Date.UTC(2026, 8, 21));
    expect(readAutomationStudioRecordConditionDate("Sep 21, 2026", NOW)).toBe(Date.UTC(2026, 8, 21));
    expect(readAutomationStudioRecordConditionDate("21/09/2026", NOW)).toBe(Date.UTC(2026, 8, 21));
    expect(readAutomationStudioRecordConditionDate("05/05/2026", NOW)).toBe(Date.UTC(2026, 4, 5));
  });

  it("reads no date where the day and month could each be the other", () => {
    expect(readAutomationStudioRecordConditionDate("02/03/2026", NOW)).toBeUndefined();
    expect(readAutomationStudioRecordConditionDate("Doors open", NOW)).toBeUndefined();
  });
});

describe("a date bound holding of a row", () => {
  it("keeps the rows on or after its day, the row's own day compared", () => {
    expect(automationStudioRecordConditionHolds(ON_OR_AFTER, "Saturday 19 September 2026 at 00:10", NOW)).toBe(true);
    expect(automationStudioRecordConditionHolds(ON_OR_AFTER, "Monday 28 September 2026 at 04:00", NOW)).toBe(true);
    expect(automationStudioRecordConditionHolds(ON_OR_AFTER, "Friday 18 September 2026 at 23:59", NOW)).toBe(false);
    expect(automationStudioRecordConditionHolds(ON_OR_AFTER, "18 Sep 2026", NOW)).toBe(false);
  });

  it("keeps the days between two bounds, both included", () => {
    const between = { field: "starts", atLeast: "19 September 2026", atMost: "2026-09-21", as: "date" as const };
    expect(automationStudioRecordConditionHolds(between, "Sep 19, 2026", NOW)).toBe(true);
    expect(automationStudioRecordConditionHolds(between, "Monday 21 September 2026 at 22:00", NOW)).toBe(true);
    expect(automationStudioRecordConditionHolds(between, "22/09/2026", NOW)).toBe(false);
    expect(automationStudioRecordConditionHolds({ field: "starts", lessThan: "2026-09-19", as: "date" }, "2026-09-18", NOW)).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "starts", greaterThan: "2026-09-19", as: "date" }, "2026-09-19", NOW)).toBe(false);
  });

  it("measures a relative row date from now", () => {
    expect(automationStudioRecordConditionHolds({ field: "starts", atLeast: "2026-10-01", as: "date" }, "3 days ago", NOW)).toBe(true);
    expect(automationStudioRecordConditionHolds({ field: "starts", atLeast: "2026-10-05", as: "date" }, "3 days ago", NOW)).toBe(false);
  });

  it("never keeps a row whose date it cannot read, not or no not", () => {
    for (const cell of ["Doors open", "02/03/2026", "", undefined]) {
      expect(automationStudioRecordConditionHolds(ON_OR_AFTER, cell, NOW)).toBe(false);
      expect(automationStudioRecordConditionHolds({ ...ON_OR_AFTER, not: true }, cell, NOW)).toBe(false);
    }
    expect(automationStudioRecordConditionHolds({ ...ON_OR_AFTER, not: true }, "2026-09-01", NOW)).toBe(true);
  });
});

describe("parsing a date bound", () => {
  it("accepts one, as the canonical condition with no as, which its text bound already says", () => {
    expect(parseAutomationStudioRecordCondition(ON_OR_AFTER)).toEqual({ field: "starts", atLeast: "2026-09-19" });
    expect(parseAutomationStudioRecordCondition({ field: "starts", atLeast: "2026-09-19" })).toEqual({ field: "starts", atLeast: "2026-09-19" });
    expect(automationStudioRecordConditionText({ field: "starts", atLeast: "2026-09-19" })).toBe("starts atLeast \"2026-09-19\" as a date");
    expect(parseAutomationStudioRecordCondition({ field: "seats", atLeast: 4, as: "number" })).toEqual({ field: "seats", atLeast: 4 });
  });

  it("refuses one it cannot read, mixed kinds, and an as that says otherwise", () => {
    for (const refused of [
      { field: "starts", atLeast: "Sep 19", as: "date" },
      { field: "starts", atLeast: "02/03/2026", as: "date" },
      { field: "starts", atLeast: "3 days ago" },
      { field: "starts", atLeast: "2026-09-19", atMost: 30 },
      { field: "starts", atLeast: 4, as: "date" },
      { field: "starts", atLeast: "2026-09-19", as: "number" },
      { field: "starts", as: "date" },
      { field: "starts", atLeast: "2026-09-19", as: "day" }
    ]) expect(parseAutomationStudioRecordCondition(refused), JSON.stringify(refused)).toBeNull();
  });

  it("is said as a date", () => {
    expect(automationStudioRecordConditionText(ON_OR_AFTER)).toBe("starts atLeast \"2026-09-19\" as a date");
    expect(automationStudioRecordConditionText({ field: "starts", atLeast: "2026-09-19", atMost: "2026-09-21", as: "date", not: true }))
      .toBe("starts not (atLeast \"2026-09-19\" and atMost \"2026-09-21\" as a date)");
  });
});

describe("processing with a date bound", () => {
  const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "event", label: "Event", valueType: "string" }, { id: "starts", label: "Starts", valueType: "string" }] };
  const row = (event: string, starts: string) => ({ values: { event, starts }, nodeId: "n1", batchKey: "b1" });

  it("keeps the dated rows the bound holds of, and counts the rows it could not date", () => {
    const result = processAutomationStudioRecordRows({
      rows: [row("Poetry night", "Monday 21 September 2026 at 19:00"), row("Book swap", "Friday 18 September 2026 at 10:00"), row("Craft fair", "Date to be confirmed")],
      schema,
      process: { where: [ON_OR_AFTER] },
      now: NOW
    });
    expect(result.rows).toEqual([{ event: "Poetry night", starts: "Monday 21 September 2026 at 19:00" }]);
    expect(result.account.conditions?.[0]).toMatchObject({ condition: "starts atLeast \"2026-09-19\" as a date", rejected: 2, alone: 2, undated: 1 });
    expect(result.account.conditions?.[0]?.leftOutOnlyByThis.map((left) => left.label)).toEqual(["Book swap", "Craft fair"]);
  });
});
