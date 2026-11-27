// The operators t970 adds to a record output's `process`: a filter over a
// column the answer leaves out, `anyOf` alternatives (t1074), `compare` between two columns
// of a row, and `derive`d columns -- parsed, applied, accounted, and stable when
// the collected rows are processed again.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import {
  parseAutomationStudioRecordProcessing,
  processAutomationStudioRecordRows,
  type AutomationStudioRecordCollectedRow,
  type AutomationStudioRecordProcessing
} from "../index.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string" },
    { id: "price", label: "Price", valueType: "string" },
    { id: "was", label: "Was", valueType: "string" },
    { id: "badge", label: "Badge", valueType: "string" },
    { id: "posted", label: "Posted", valueType: "string" },
    { id: "note", label: "Note", valueType: "string", handling: "exclude" }
  ]
};

const NOW = Date.UTC(2026, 10, 19, 12);

const ROWS: Record<string, unknown>[] = [
  { title: "Garden chair", price: "$40", was: "$60", badge: null, posted: "Listed 3 Nov 2026, collection only" },
  { title: "Garden table", price: "$90", was: "$80", badge: "Featured", posted: "Listed 10 Nov 2026" },
  { title: "Patio heater", price: "$120", was: null, badge: null, posted: "Listed 1 Oct 2026" },
  { title: "Bird bath", price: "$25", was: "$25", badge: "Featured", posted: "Listed 18 Nov 2026" },
  { title: "Hammock", price: "$55", was: "$70", badge: null, posted: "no date given" }
];

function collected(values: readonly Record<string, unknown>[]): AutomationStudioRecordCollectedRow[] {
  return values.map((entry, index) => ({ values: entry, nodeId: "read", batchKey: `b${index < 3 ? 1 : 2}` }));
}

function processOf(process: AutomationStudioRecordProcessing, values: readonly Record<string, unknown>[] = ROWS) {
  const parsed = parseAutomationStudioRecordProcessing(process, SCHEMA);
  if (!parsed.ok) throw new Error(`refused: ${parsed.issues.join(", ")}`);
  return processAutomationStudioRecordRows({ rows: collected(values), schema: SCHEMA, process: parsed.processing, now: NOW });
}

function titles(result: { rows: Record<string, unknown>[] }): unknown[] {
  return result.rows.map((row) => row.title);
}

describe("a filter over a column the answer leaves out", () => {
  it("keeps the mark out of the answer and filters by it", () => {
    const result = processOf({ where: [{ field: "badge", is: "absent" }], columns: ["title", "price"] });
    expect(result.rows).toEqual([
      { title: "Garden chair", price: "$40" },
      { title: "Patio heater", price: "$120" },
      { title: "Hammock", price: "$55" }
    ]);
    expect(result.account.conditions?.[0]).toMatchObject({ field: "badge", rejected: 2, alone: 2 });
    expect(result.account.conditions?.[0]?.leftOutOnlyByThis.map((row) => row.label)).toEqual(["Garden table", "Bird bath"]);
  });

  it("gives the same answer when the collected rows are processed again", () => {
    const process: AutomationStudioRecordProcessing = { where: [{ field: "badge", is: "absent" }], columns: ["title", "price"], sort: [{ field: "price", order: "desc" }] };
    expect(processOf(process).rows).toEqual(processOf(process).rows);
  });
});

describe("anyOf", () => {
  it("keeps a row when every condition of any one group holds, across columns (t1074)", () => {
    const result = processOf({ anyOf: [[{ field: "badge", is: "present" }], [{ field: "price", lessThan: 50 }]] });
    expect(titles(result)).toEqual(["Garden chair", "Garden table", "Bird bath"]);
    expect(result.account.filters).toEqual([
      { kind: "any_of", fields: ["badge", "price"], condition: "any of (badge is present; price lessThan 50)", rejected: 2, alone: 2, leftOutOnlyByThis: [{ field: "title", label: "Patio heater" }, { field: "title", label: "Hammock" }] }
    ]);
  });

  it("reads the conditions of one group together: a group holds only when each does (t1074)", () => {
    const result = processOf({ anyOf: [[{ field: "badge", is: "present" }, { field: "price", lessThan: 50 }]] });
    expect(result.account.filters?.[0]?.condition).toBe("any of (badge is present and price lessThan 50)");
    expect(titles(result)).toEqual(["Bird bath"]);
  });

  it("holds together with where: every where condition and one of the groups", () => {
    const result = processOf({ where: [{ field: "title", contains: "garden" }], anyOf: [[{ field: "badge", is: "present" }], [{ field: "price", atMost: 40 }]] });
    expect(titles(result)).toEqual(["Garden chair", "Garden table"]);
  });

  it("refuses an empty group, an empty list and a condition the conditions' parser refuses", () => {
    for (const anyOf of [[], [[]], [[{ field: "price", lessThan: "soon" }]], "badge"]) {
      expect(parseAutomationStudioRecordProcessing({ anyOf }, SCHEMA)).toMatchObject({ ok: false, issues: ["record_output.process_invalid_any_of"] });
    }
    expect(parseAutomationStudioRecordProcessing({ anyOf: [[{ field: "missing", is: "present" }]] }, SCHEMA)).toMatchObject({ ok: false, issues: ["record_output.process_unknown_field"] });
  });
});

describe("compare", () => {
  it("compares two columns of a row as numbers; a side stating none fails whatever not says", () => {
    expect(titles(processOf({ compare: [{ field: "price", lessThan: "was" }] }))).toEqual(["Garden chair", "Hammock"]);
    // Patio heater has no was-price: kept by neither the comparison nor its negation.
    expect(titles(processOf({ compare: [{ field: "price", lessThan: "was", not: true }] }))).toEqual(["Garden table", "Bird bath"]);
    expect(titles(processOf({ compare: [{ field: "price", equals: "was" }] }))).toEqual(["Bird bath"]);
  });

  it("says itself on the account", () => {
    const result = processOf({ compare: [{ field: "price", lessThan: "was" }] });
    expect(result.account.filters?.[0]).toMatchObject({ kind: "compare", fields: ["price", "was"], condition: "price lessThan was", rejected: 3, alone: 3 });
  });

  it("refuses a comparison naming nothing, a column with itself, or a bad kind", () => {
    for (const compare of [[{ field: "price" }], [{ field: "price", lessThan: "price" }], [{ field: "price", lessThan: 5 }], [{ field: "price", lessThan: "was", as: "text" }], []]) {
      expect(parseAutomationStudioRecordProcessing({ compare }, SCHEMA)).toMatchObject({ ok: false, issues: ["record_output.process_invalid_compare"] });
    }
    expect(parseAutomationStudioRecordProcessing({ compare: [{ field: "price", lessThan: "nowhere" }] }, SCHEMA)).toMatchObject({ ok: false, issues: ["record_output.process_unknown_field"] });
  });
});

describe("derive", () => {
  it("reads a date out of a longer value and filters and sorts by it, never answering it", () => {
    const result = processOf({
      derive: [{ id: "listed", from: "posted", pattern: "Listed (.+?)(?:,|$)", as: "date" }],
      where: [{ field: "listed", atLeast: "1 Nov 2026", as: "date" }],
      sort: [{ field: "listed", order: "desc" }]
    });
    expect(titles(result)).toEqual(["Bird bath", "Garden table", "Garden chair"]);
    expect(result.rows.every((row) => !("listed" in row))).toBe(true);
    expect(result.account.conditions?.[0]).toMatchObject({ field: "listed", rejected: 2, undated: 1 });
  });

  it("reads a number, and compares a derived column with a stored one", () => {
    const result = processOf({
      derive: [{ id: "saving", from: "title", pattern: "^(Garden|Bird)", as: "text" }],
      where: [{ field: "saving", is: "present" }],
      compare: [{ field: "price", atMost: "was" }]
    });
    expect(titles(result)).toEqual(["Garden chair", "Bird bath"]);
    const number = processOf({ derive: [{ id: "cost", from: "price", as: "number" }], where: [{ field: "cost", greaterThan: 50 }] });
    expect(titles(number)).toEqual(["Garden table", "Patio heater", "Hammock"]);
  });

  it("refuses a derived id the schema has, a repeated id, a bad pattern, a derived source, or a derived column shown", () => {
    const invalid = { ok: false, issues: ["record_output.process_invalid_derive"] };
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "price", from: "title" }] }, SCHEMA)).toMatchObject(invalid);
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "a", from: "title" }, { id: "a", from: "price" }] }, SCHEMA)).toMatchObject(invalid);
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "a", from: "title", pattern: "(" }] }, SCHEMA)).toMatchObject(invalid);
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "a", from: "title", as: "money" }] }, SCHEMA)).toMatchObject(invalid);
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "a b", from: "title" }] }, SCHEMA)).toMatchObject(invalid);
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "a", from: "title" }, { id: "b", from: "a" }] }, SCHEMA)).toMatchObject({ ok: false, issues: ["record_output.process_unknown_field"] });
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "a", from: "note" }] }, SCHEMA)).toMatchObject({ ok: false, issues: ["record_output.process_excluded_field"] });
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "a", from: "title" }], columns: ["title", "a"] }, SCHEMA)).toMatchObject({ ok: false, issues: ["record_output.process_derived_column_shown"] });
  });

  it("keeps a canonical declaration: text and number defaults dropped", () => {
    expect(parseAutomationStudioRecordProcessing({ derive: [{ id: "a", from: "title", as: "text" }], compare: [{ field: "price", lessThan: "was", as: "number", not: false }] }, SCHEMA))
      .toEqual({ ok: true, processing: { derive: [{ id: "a", from: "title" }], compare: [{ field: "price", lessThan: "was" }] } });
  });
});
