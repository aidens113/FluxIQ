// Date conditions relative to the run's now (t800, K1): a bound written as
// today, yesterday, now or "<n> <unit> ago", and `within: "<n> <unit>"`. The
// shared parity table runs through Core's parser and judge here, and through
// the downstream domain's grammar and page filter there. A library's events
// and returns, made up.
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RECORD_CONDITION_DATE_CASES,
  automationStudioRecordConditionHolds,
  automationStudioRecordConditionText,
  parseAutomationStudioRecordCondition,
  processAutomationStudioRecordRows,
  readAutomationStudioRecordConditionDateBound,
  readAutomationStudioRecordConditionWithin,
  automationStudioRecordDateStatesOnlyDay
} from "../../index.ts";
import type { AutomationStudioRecordConditionTest } from "../../types.ts";
import type { AutomationStudioRecordSchema } from "../../../schema.ts";

const NOW = Date.UTC(2026, 9, 6, 12);
const DAY = 86_400_000;

describe("the date condition parity cases", () => {
  it("each refused case is refused where it is written, and each other parses and judges its row as the table says", () => {
    expect(AUTOMATION_STUDIO_RECORD_CONDITION_DATE_CASES.length).toBeGreaterThan(40);
    for (const { written, cell, now, expected } of AUTOMATION_STUDIO_RECORD_CONDITION_DATE_CASES) {
      const label = `${JSON.stringify(written)} of ${JSON.stringify(cell)}`;
      const parsed = parseAutomationStudioRecordCondition({ field: "when", ...written });
      if (expected === "refused") {
        expect(parsed, label).toBeNull();
        continue;
      }
      expect(parsed, label).not.toBeNull();
      expect(automationStudioRecordConditionHolds(parsed!, cell, now), label).toBe(expected);
      // As written, `as` and all, the judge reads it the same.
      expect(automationStudioRecordConditionHolds(written as AutomationStudioRecordConditionTest, cell, now), label).toBe(expected);
    }
  });

  it("keep at run end exactly the rows each case keeps, at the run's now", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "when", label: "When", valueType: "string" }] };
    for (const { written, cell, now, expected } of AUTOMATION_STUDIO_RECORD_CONDITION_DATE_CASES) {
      if (expected === "refused") continue;
      const where = [parseAutomationStudioRecordCondition({ field: "when", ...written })!];
      const result = processAutomationStudioRecordRows({ rows: [{ values: { when: cell }, nodeId: "n1", batchKey: "b1" }], schema, process: { where }, now });
      expect(result.account.kept, JSON.stringify(written)).toBe(expected ? 1 : 0);
    }
  });
});

describe("a relative date bound", () => {
  it("names today and yesterday as whole days and now and n units ago as instants, at the now given", () => {
    expect(readAutomationStudioRecordConditionDateBound("today", NOW)).toEqual({ at: Date.UTC(2026, 9, 6), wholeDay: true });
    expect(readAutomationStudioRecordConditionDateBound("Yesterday", NOW)).toEqual({ at: Date.UTC(2026, 9, 5), wholeDay: true });
    expect(readAutomationStudioRecordConditionDateBound("now", NOW)).toEqual({ at: NOW, wholeDay: false });
    expect(readAutomationStudioRecordConditionDateBound("7 days ago", NOW)).toEqual({ at: NOW - 7 * DAY, wholeDay: false });
    expect(readAutomationStudioRecordConditionDateBound("1 week ago", NOW)).toEqual({ at: NOW - 7 * DAY, wholeDay: false });
    expect(readAutomationStudioRecordConditionDateBound("an  hour ago", NOW)).toEqual({ at: NOW - 3_600_000, wholeDay: false });
    // An absolute bound names its date whatever now is.
    expect(readAutomationStudioRecordConditionDateBound("2026-09-19", 0)).toEqual({ at: Date.UTC(2026, 8, 19), wholeDay: true });
  });

  it("moves with the run: the same condition keeps a different row on another day", () => {
    const condition = parseAutomationStudioRecordCondition({ field: "returned", atLeast: "yesterday" })!;
    expect(automationStudioRecordConditionHolds(condition, "2026-10-05", NOW)).toBe(true);
    expect(automationStudioRecordConditionHolds(condition, "2026-10-05", NOW + 2 * DAY)).toBe(false);
  });
});

describe("a within", () => {
  it("is the span from n units before now up to now", () => {
    expect(readAutomationStudioRecordConditionWithin("7 days", NOW)).toEqual({ from: NOW - 7 * DAY, to: NOW, wholeDays: true });
    expect(readAutomationStudioRecordConditionWithin("1 Hour", NOW)).toEqual({ from: NOW - 3_600_000, to: NOW, wholeDays: false });
    expect(readAutomationStudioRecordConditionWithin("2 weeks", NOW)).toEqual({ from: NOW - 14 * DAY, to: NOW, wholeDays: true });
    for (const written of ["7", "days", "0 days", "-1 days", "1.5 days", "3 months", "1 year", "a week", "7 days ago"]) {
      expect(readAutomationStudioRecordConditionWithin(written, NOW), written).toBeUndefined();
    }
  });

  it("parses as a canonical date condition, said as a date", () => {
    expect(parseAutomationStudioRecordCondition({ field: "returned", within: "7 days", as: "date" })).toEqual({ field: "returned", within: "7 days" });
    expect(automationStudioRecordConditionText({ field: "returned", within: "7 days" })).toBe("returned within \"7 days\" as a date");
    expect(automationStudioRecordConditionText({ field: "returned", within: "7 days", not: true })).toBe("returned not within \"7 days\" as a date");
  });

  it("counts the rows it could not date at run end, as a date bound does", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "returned", label: "Returned", valueType: "string" }] };
    const row = (title: string, returned: string) => ({ values: { title, returned }, nodeId: "n1", batchKey: "b1" });
    const result = processAutomationStudioRecordRows({
      rows: [row("Atlas of rivers", "2 days ago"), row("Garden birds", "3 weeks ago"), row("Night sky", "Not yet returned")],
      schema,
      process: { where: [{ field: "returned", within: "7 days" }] },
      now: NOW
    });
    expect(result.rows.map((kept) => kept.title)).toEqual(["Atlas of rivers"]);
    expect(result.account.conditions?.[0]).toMatchObject({ condition: "returned within \"7 days\" as a date", rejected: 2, undated: 1 });
  });
});

describe("a value that states only a day", () => {
  it("is told from one that states a moment", () => {
    for (const day of ["2026-10-01", "1 Oct 2026", "Oct 1, 2026", "Posted yesterday", "Today", "3 days ago", "2w", "1mo"]) {
      expect(automationStudioRecordDateStatesOnlyDay(day, NOW), day).toBe(true);
    }
    for (const moment of ["2026-10-01 09:00", "Today 09:00", "5 hours ago", "30 minutes ago", "45m", "just now", "1d 0h left", "Date to be confirmed"]) {
      expect(automationStudioRecordDateStatesOnlyDay(moment, NOW), moment).toBe(false);
    }
  });
});
