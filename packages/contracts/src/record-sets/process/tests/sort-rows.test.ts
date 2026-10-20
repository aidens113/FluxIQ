// `sortAutomationStudioRecordRows` on its own. Cases moved from the downstream
// page-side sort's tests (`order-rows`, t728), so its parity copy can go.
import { describe, expect, it } from "vitest";
import { sortAutomationStudioRecordRows, type AutomationStudioRecordSortKey } from "../index.ts";

const NOW = Date.UTC(2026, 8, 28, 12);

function titles(cells: readonly Record<string, unknown>[], keys: readonly AutomationStudioRecordSortKey[]): unknown[] {
  return sortAutomationStudioRecordRows(cells.map((values) => ({ values })), keys, NOW).map((row) => row.values.title);
}

describe("sortAutomationStudioRecordRows", () => {
  it("orders newest first over dates a listing states relative to the read", () => {
    const rows = [
      { title: "month", posted: "Posted 30+ days ago" },
      { title: "hours", posted: "5 hours ago" },
      { title: "yesterday", posted: "Yesterday" },
      { title: "week", posted: "a week ago" },
      { title: "just", posted: "Just posted" },
      { title: "days", posted: "3 days ago" }
    ];
    expect(titles(rows, [{ field: "posted", order: "desc" }])).toEqual(["just", "hours", "yesterday", "days", "week", "month"]);
  });

  it("orders numbers by the number a value states", () => {
    const rows = [
      { title: "low", salary: "£65,000 to £80,000" },
      { title: "high", salary: "£120,000" },
      { title: "mid", salary: "£95,500.50 a year" }
    ];
    expect(titles(rows, [{ field: "salary", order: "desc" }])).toEqual(["high", "mid", "low"]);
  });

  it("orders text as a person reads it, and auto reads a mostly numeric column as numbers", () => {
    const rows = [{ title: "item 10" }, { title: "Item 9" }, { title: "apple" }];
    expect(titles(rows, [{ field: "title", order: "asc", as: "text" }])).toEqual(["apple", "Item 9", "item 10"]);
    expect(titles(rows, [{ field: "title", order: "asc" }])).toEqual(["Item 9", "item 10", "apple"]);
  });

  it("puts a value that cannot be read last in either direction, in incoming order", () => {
    const rows = [{ title: "none", posted: null }, { title: "old", posted: "2026-01-01" }, { title: "prose", posted: "Apply today" }, { title: "new", posted: "2026-09-01" }, { title: "absent" }];
    expect(titles(rows, [{ field: "posted", order: "desc", as: "date" }])).toEqual(["new", "old", "none", "prose", "absent"]);
    expect(titles(rows, [{ field: "posted", order: "asc", as: "date" }])).toEqual(["old", "new", "none", "prose", "absent"]);
  });

  it("breaks ties by the next key and then by incoming order", () => {
    const rows = [
      { title: "1", company: "B", salary: "10" },
      { title: "2", company: "A", salary: "10" },
      { title: "3", company: "A", salary: "30" },
      { title: "4", company: "B", salary: "10" }
    ];
    expect(titles(rows, [{ field: "company", order: "asc" }, { field: "salary", order: "desc" }])).toEqual(["3", "2", "1", "4"]);
  });

  it("returns a new array and leaves rows without keys in their order", () => {
    const rows = [{ values: { title: "b" } }, { values: { title: "a" } }];
    const sorted = sortAutomationStudioRecordRows(rows, [], NOW);
    expect(sorted).toEqual(rows);
    expect(sorted).not.toBe(rows);
  });
});
