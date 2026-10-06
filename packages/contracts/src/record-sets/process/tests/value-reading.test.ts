import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES,
  automationStudioRecordAutoSortKind,
  readAutomationStudioRecordDate,
  readAutomationStudioRecordNumber,
  readAutomationStudioRecordSortValue
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
