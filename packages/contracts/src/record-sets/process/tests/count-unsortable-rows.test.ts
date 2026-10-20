import { describe, expect, it } from "vitest";
import { countAutomationStudioRecordUnsortableRows } from "../index.ts";

const NOW = Date.UTC(2026, 8, 28, 12);
const rowsOf = (cells: readonly Record<string, unknown>[]) => cells.map((values) => ({ values }));

describe("countAutomationStudioRecordUnsortableRows", () => {
  it("counts the rows a declared kind cannot read, blank and missing included", () => {
    const rows = rowsOf([{ posted: null }, { posted: "2026-01-01" }, { posted: "Apply today" }, { posted: "2026-09-01" }, {}, { posted: "  " }]);
    expect(countAutomationStudioRecordUnsortableRows(rows, [{ field: "posted", order: "desc", as: "date" }], NOW)).toBe(4);
  });

  it("decides an auto key's kind over the rows given, as the sort does", () => {
    const rows = rowsOf([{ salary: "competitive" }, { salary: "90,000" }, { salary: "70,000" }]);
    expect(countAutomationStudioRecordUnsortableRows(rows, [{ field: "salary", order: "asc", as: "auto" }], NOW)).toBe(1);
    expect(countAutomationStudioRecordUnsortableRows(rows, [{ field: "salary", order: "asc" }], NOW)).toBe(1);
    expect(countAutomationStudioRecordUnsortableRows(rows, [{ field: "salary", order: "asc", as: "text" }], NOW)).toBe(0);
  });

  it("counts a row once however many of its keys it cannot be read by", () => {
    const rows = rowsOf([{ a: "x", b: "y" }, { a: "1", b: "2" }, { a: "3" }]);
    const keys = [{ field: "a", order: "asc", as: "number" }, { field: "b", order: "asc", as: "number" }] as const;
    expect(countAutomationStudioRecordUnsortableRows(rows, keys, NOW)).toBe(2);
  });

  it("is zero with no keys or no rows", () => {
    expect(countAutomationStudioRecordUnsortableRows(rowsOf([{ a: "x" }]), [], NOW)).toBe(0);
    expect(countAutomationStudioRecordUnsortableRows([], [{ field: "a", order: "asc" }], NOW)).toBe(0);
  });
});
