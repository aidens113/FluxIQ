import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import {
  processAutomationStudioRecordRows,
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

  it("leaves its input unmodified", () => {
    const collected = rows("n1", "b1", B, A);
    const snapshot = structuredClone(collected);
    processOf(collected, { sort: [{ field: "price", order: "asc" }], columns: ["title"] });
    expect(collected).toEqual(snapshot);
  });
});
