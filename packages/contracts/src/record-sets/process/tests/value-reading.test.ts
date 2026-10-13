import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES,
  automationStudioRecordAutoSortKind,
  readAutomationStudioRecordDate,
  readAutomationStudioRecordNumber,
  readAutomationStudioRecordSortValue,
  sortAutomationStudioRecordRows
} from "../index.ts";

describe("AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES", () => {
  it("covers every kind of reading", () => {
    const kinds = new Set(AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES.map((entry) => entry.kind));
    expect([...kinds].sort()).toEqual(["auto", "date", "number", "text"]);
  });

  for (const entry of AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES) {
    if (entry.kind === "auto") {
      it(`reads the column ${JSON.stringify(entry.column)} as ${entry.expected}`, () => {
        expect(automationStudioRecordAutoSortKind(entry.column, entry.now)).toBe(entry.expected);
      });
    } else {
      it(`reads ${JSON.stringify(entry.text)} as the ${entry.kind} ${String(entry.expected)}`, () => {
        expect(readAutomationStudioRecordSortValue(entry.text, entry.kind, entry.now) ?? null).toBe(entry.expected);
        if (entry.kind === "number") expect(readAutomationStudioRecordNumber(entry.text) ?? null).toBe(entry.expected);
        if (entry.kind === "date") expect(readAutomationStudioRecordDate(entry.text, entry.now) ?? null).toBe(entry.expected);
      });
    }
  }
});

describe("readAutomationStudioRecordSortValue on stored cells", () => {
  const now = Date.UTC(2026, 9, 6);

  it("reads a stored number as itself and a blank or missing cell as unreadable", () => {
    expect(readAutomationStudioRecordSortValue(1e-7, "number", now)).toBe(1e-7);
    expect(readAutomationStudioRecordSortValue(Number.NaN, "number", now)).toBeUndefined();
    expect(readAutomationStudioRecordSortValue("   ", "text", now)).toBeUndefined();
    expect(readAutomationStudioRecordSortValue(null, "date", now)).toBeUndefined();
    expect(readAutomationStudioRecordSortValue(undefined, "number", now)).toBeUndefined();
    expect(readAutomationStudioRecordSortValue(true, "text", now)).toBe("true");
  });
});

// t510 (F6): a column of times left, or of dates on one day with their times, sorted soonest first.
describe("sortAutomationStudioRecordRows on times of day and times left", () => {
  const now = Date.UTC(2026, 9, 6, 12);
  const rows = (cells: readonly string[]) => cells.map((due) => ({ values: { due } }));
  const order = (cells: readonly string[]) => sortAutomationStudioRecordRows(rows(cells), [{ field: "due", order: "asc" }], now).map((row) => row.values.due);

  it("orders dates on one day by their times", () => {
    expect(order(["(Fri 2 Oct, 16:45)", "(Fri 2 Oct, 09:10)", "(Thu 1 Oct, 23:00)"])).toEqual(["(Thu 1 Oct, 23:00)", "(Fri 2 Oct, 09:10)", "(Fri 2 Oct, 16:45)"]);
  });

  it("orders times left by when they run out, not by their first number", () => {
    expect(order(["1d 0h left", "5h 12m left", "2d 3h left", "40m left"])).toEqual(["40m left", "5h 12m left", "1d 0h left", "2d 3h left"]);
  });
});

// Supervisor decision (t510): a date with no year is the occurrence nearest the read, within six months either way.
describe("readAutomationStudioRecordDate on a date with no year across the turn of a year", () => {
  it("reads a date just ahead as next year's and one just past as last year's", () => {
    expect(readAutomationStudioRecordDate("Jan 2, 09:00", Date.UTC(2026, 11, 30, 12))).toBe(Date.UTC(2027, 0, 2, 9));
    expect(readAutomationStudioRecordDate("30 Dec", Date.UTC(2027, 0, 3, 12))).toBe(Date.UTC(2026, 11, 30));
  });
});
