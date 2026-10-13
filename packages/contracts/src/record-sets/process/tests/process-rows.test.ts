import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import {
  processAutomationStudioRecordRows,
  readAutomationStudioRecordDate,
  type AutomationStudioRecordCollectedRow,
  type AutomationStudioRecordProcessing
} from "../index.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string" },
    { id: "price", label: "Price", valueType: "string" },
    { id: "url", label: "Link", valueType: "url" },
    { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }
  ]
};

const NOW = Date.UTC(2026, 9, 6, 12);

function rows(nodeId: string, batchKey: string, ...values: Record<string, unknown>[]): AutomationStudioRecordCollectedRow[] {
  return values.map((entry) => ({ values: entry, nodeId, batchKey }));
}

function processOf(collected: readonly AutomationStudioRecordCollectedRow[], process?: AutomationStudioRecordProcessing) {
  return processAutomationStudioRecordRows({ rows: collected, schema: SCHEMA, ...(process === undefined ? {} : { process }), now: NOW });
}

function again(answer: readonly Record<string, unknown>[], process?: AutomationStudioRecordProcessing) {
  return processOf(rows("again", "again", ...answer), process).rows;
}

const A = { title: "Alpha", price: "$30", url: "/a" };
const B = { title: "Beta", price: "$10", url: "/b" };
const C = { title: "Gamma  Ray", price: "$20", url: "/c" };
const C_AGAIN = { title: " gamma ray ", price: "$20", url: "/C" };
const D = { title: "Delta", price: "$40", url: "/d" };

describe("processAutomationStudioRecordRows", () => {
  it("drops a row equal to an earlier one with case and layout ignored, keeping the first", () => {
    const result = processOf(rows("n1", "b1", A, B, C, C_AGAIN, D));
    expect(result.rows).toEqual([A, B, C, D]);
    expect(result.account).toMatchObject({ collected: 5, duplicates: 1, filteredOut: 0, cut: 0, kept: 4 });
    expect(result.rows[2]).not.toBe(C);
  });

  it("never merges rows whose compared values are all empty", () => {
    const empty = { title: "  ", price: null };
    const result = processOf(rows("n1", "b1", empty, {}, empty, A));
    expect(result.rows).toHaveLength(4);
    expect(result.account.duplicates).toBe(0);
  });

  it("compares non-string values by their JSON", () => {
    const result = processOf(rows("n1", "b1", { title: "X", price: 5 }, { title: "x", price: 5 }, { title: "x", price: 6 }, { title: "x", price: { amount: 6 } }));
    expect(result.rows).toEqual([{ title: "X", price: 5 }, { title: "x", price: 6 }, { title: "x", price: { amount: 6 } }]);
  });

  it("dedupes by the named fields, keeping the first, and never merges a row with none of them", () => {
    const shared = { title: "Other offer", price: "$99", url: "/a" };
    const unlinked = { title: "No link" };
    const result = processOf(rows("n1", "b1", A, shared, unlinked, { ...unlinked, price: "$1" }, B), { dedupe: { by: ["url"] } });
    expect(result.rows).toEqual([A, unlinked, { ...unlinked, price: "$1" }, B]);
    expect(result.account.duplicates).toBe(1);
  });

  it("keeps every row with dedupe false", () => {
    expect(processOf(rows("n1", "b1", A, A, A), { dedupe: false }).rows).toEqual([A, A, A]);
  });

  it("sorts and limits over every row of every batch", () => {
    const collected = [...rows("n1", "b1", A, B), ...rows("n1", "b2", C, D)];
    const result = processOf(collected, { sort: [{ field: "price", order: "desc" }], limit: 3 });
    expect(result.rows).toEqual([D, A, C]);
    expect(result.account).toMatchObject({ collected: 4, cut: 1, kept: 3 });
    expect(processOf(collected, { sort: [{ field: "price", order: "asc", as: "number" }], limit: 2 }).rows).toEqual([B, C]);
  });

  it("puts unreadable values after readable ones in either direction, in capture order", () => {
    const free = { title: "Free", price: "ask" };
    const none = { title: "None" };
    const collected = rows("n1", "b1", free, A, none, B);
    expect(processOf(collected, { sort: [{ field: "price", order: "asc", as: "number" }] }).rows).toEqual([B, A, free, none]);
    expect(processOf(collected, { sort: [{ field: "price", order: "desc", as: "number" }] }).rows).toEqual([A, B, free, none]);
  });

  it("sorts newest first over relative and absolute dates", () => {
    const old = { title: "Old", price: "2026-09-01" };
    const recent = { title: "Recent", price: "2 days ago" };
    const today = { title: "Today", price: "just posted" };
    const result = processOf(rows("n1", "b1", old, today, recent), { sort: [{ field: "price", order: "desc" }] });
    expect(result.rows).toEqual([today, recent, old]);
  });

  // t515 (live run `run-mv6v2kzn-d593231f`): an answer sorted newest first by a
  // column its `columns` leave out carried no record of the order, so nothing
  // the judge was shown could confirm it. The sort's reading is kept on the
  // account, taken before the columns are applied; the column is never added.
  it("records how the sort read a key the answer's columns leave out, in answer order", () => {
    const old = { title: "Old", price: "2026-09-01", url: "/o" };
    const recent = { title: "Recent", price: "2 days ago", url: "/r" };
    const today = { title: "Today", price: "just posted", url: "/t" };
    const undated = { title: "Undated", price: "ask", url: "/u" };
    const result = processOf(rows("n1", "b1", old, undated, today, recent), { sort: [{ field: "price", order: "desc" }, { field: "url", order: "asc" }], columns: ["title"] });
    expect(result.rows).toEqual([{ title: "Today" }, { title: "Recent" }, { title: "Old" }, { title: "Undated" }]);
    expect(result.account.hiddenSortKeys).toEqual([
      {
        field: "price", position: 0, order: "desc", kind: "date", read: 3, inOrder: true,
        readings: [readAutomationStudioRecordDate("just posted", NOW), readAutomationStudioRecordDate("2 days ago", NOW), readAutomationStudioRecordDate("2026-09-01", NOW), null]
      },
      { field: "url", position: 1, order: "asc", kind: "text", read: 4 }
    ]);
  });

  it("records no hidden sort key when the answer keeps the key, has no columns, or no sort", () => {
    const collected = rows("n1", "b1", A, B);
    expect(processOf(collected, { sort: [{ field: "price", order: "desc" }], columns: ["title", "price"] }).account).not.toHaveProperty("hiddenSortKeys");
    expect(processOf(collected, { sort: [{ field: "price", order: "desc" }] }).account).not.toHaveProperty("hiddenSortKeys");
    expect(processOf(collected, { columns: ["title"] }).account).not.toHaveProperty("hiddenSortKeys");
  });

  it("filters with where before dedupe and counts what it filtered out", () => {
    const result = processOf(rows("n1", "b1", A, B, C, C_AGAIN, D), {
      where: [{ field: "price", lessThan: 25 }, { field: "title", contains: "delta", not: true }]
    });
    expect(result.rows).toEqual([B, C]);
    expect(result.account).toMatchObject({ collected: 5, filteredOut: 2, duplicates: 1, kept: 2 });
  });

  it("keeps the named columns in their order", () => {
    const result = processOf(rows("n1", "b1", A, { title: "Untitled price" }), { columns: ["url", "title"] });
    expect(result.rows).toEqual([{ url: "/a", title: "Alpha" }, { title: "Untitled price" }]);
    expect(Object.keys(result.rows[0]!)).toEqual(["url", "title"]);
  });

  it("accounts two passes of one node by batch, counting each pass's new rows", () => {
    const collected = [...rows("n1", "b1", A, B, C), ...rows("n1", "b2", C, D)];
    const result = processOf(collected);
    expect(result.rows).toEqual([A, B, C, D]);
    expect(result.account).toEqual({
      collected: 5,
      duplicates: 1,
      filteredOut: 0,
      cut: 0,
      kept: 4,
      passes: [
        { node: "n1", pass: 1, rows: 3, newRows: 3 },
        { node: "n1", pass: 2, rows: 2, newRows: 1 }
      ]
    });
  });

  it("numbers passes per node in first-appearance order", () => {
    const collected = [...rows("n1", "b1", A), ...rows("n2", "b1", B), ...rows("n1", "b2", A, C)];
    expect(processOf(collected).account.passes).toEqual([
      { node: "n1", pass: 1, rows: 1, newRows: 1 },
      { node: "n2", pass: 1, rows: 1, newRows: 1 },
      { node: "n1", pass: 2, rows: 2, newRows: 1 }
    ]);
  });

  it("flags an answer that kept nothing and one below minRows", () => {
    const none = processOf(rows("n1", "b1", A, B), { where: [{ field: "price", greaterThan: 100 }] });
    expect(none.rows).toEqual([]);
    expect(none.account).toMatchObject({ kept: 0, keptNone: true, belowMinRows: 1, filteredOut: 2 });
    const few = processOf(rows("n1", "b1", A, B), { minRows: 3 });
    expect(few.account.belowMinRows).toBe(3);
    expect(few.account.keptNone).toBeUndefined();
    expect(processOf([], { minRows: 0 }).account).toEqual({ collected: 0, duplicates: 0, filteredOut: 0, cut: 0, kept: 0, keptNone: true, passes: [] });
    expect(processOf(rows("n1", "b1", A)).account.belowMinRows).toBeUndefined();
  });

  it("is idempotent: processing the answer again gives the same rows", () => {
    const collected = [...rows("n1", "b1", A, B, C, C_AGAIN), ...rows("n1", "b2", C, D, { title: "Free", price: "ask" })];
    const declarations: (AutomationStudioRecordProcessing | undefined)[] = [
      undefined,
      { dedupe: { by: ["url"] } },
      { sort: [{ field: "price", order: "desc" }], limit: 3 },
      { where: [{ field: "price", atMost: 30 }], sort: [{ field: "title", order: "asc", as: "text" }], columns: ["title", "price"] },
      { dedupe: false, sort: [{ field: "price", order: "asc" }, { field: "title", order: "desc" }] }
    ];
    for (const process of declarations) {
      const answer = processOf(collected, process).rows;
      expect(again(answer, process)).toEqual(answer);
    }
  });

  // t493, live run `run-mv6bg8d8-1a461436`: a `where` on the saved answer left out
  // three items sold with a part the request excludes, and its account said only
  // `filteredOut: 5`. Each condition now names the rows it alone left out.
  it("names, per where condition, the rows it alone left out, each once by its label column", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] };
    const tips = { name: "Spare Strap for Trail Watch, Silicone, Black", price: "$9" };
    const dock = { name: "Charging Dock for Trail Watch, White", price: "$19" };
    const watchA = { name: "Trail Watch 2, GPS, Heart Rate, Charging Dock, Black", price: "$49" };
    const watchB = { name: "Trail Watch Lite, GPS, Ivory with Charging Dock", price: "$39" };
    const both = { name: "Charging Dock with Spare Strap bundle", price: "$25" };
    const kept = { name: "Trail Watch Mini, GPS, Sage", price: "$29" };
    const collected = [...rows("read", "b1", tips, watchA, kept, dock), ...rows("read", "b2", watchA, watchB, both)];
    const result = processAutomationStudioRecordRows({
      rows: collected, schema, now: NOW,
      process: { where: [{ field: "name", contains: "Spare Strap", not: true }, { field: "name", contains: ["Charging Dock"], not: true }, { field: "price", atMost: 100 }] }
    });
    expect(result.rows).toEqual([kept]);
    expect(result.account).toMatchObject({ collected: 7, filteredOut: 6, kept: 1 });
    expect(result.account.conditions).toEqual([
      { field: "name", condition: "name not contains \"Spare Strap\"", rejected: 2, alone: 1, leftOutOnlyByThis: [{ field: "name", label: tips.name }] },
      { field: "name", condition: "name not contains [\"Charging Dock\"]", rejected: 5, alone: 4, leftOutOnlyByThis: [{ field: "name", label: watchA.name }, { field: "name", label: dock.name }, { field: "name", label: watchB.name }] },
      { field: "price", condition: "price atMost 100", rejected: 0, alone: 0, leftOutOnlyByThis: [] }
    ]);
  });

  it("labels a left-out row by its first stored column holding text, and names no condition without a where", () => {
    const result = processOf(rows("n1", "b1", { title: " ", price: "$30", url: "/x" }, A), { where: [{ field: "price", lessThan: 25 }] });
    expect(result.account.conditions).toEqual([
      { field: "price", condition: "price lessThan 25", rejected: 2, alone: 2, leftOutOnlyByThis: [{ field: "price", label: "$30" }, { field: "title", label: "Alpha" }] }
    ]);
    expect(processOf(rows("n1", "b1", A, B)).account).not.toHaveProperty("conditions");
    expect(processOf(rows("n1", "b1", A, B), { where: [] }).account).not.toHaveProperty("conditions");
  });

  it("leaves its input unmodified", () => {
    const collected = rows("n1", "b1", B, A);
    const snapshot = structuredClone(collected);
    processOf(collected, { sort: [{ field: "price", order: "asc" }], columns: ["title"] });
    expect(collected).toEqual(snapshot);
  });
});
