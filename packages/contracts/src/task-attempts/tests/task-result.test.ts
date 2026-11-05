import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS,
  AUTOMATION_STUDIO_TASK_RESULT_KINDS,
  AUTOMATION_STUDIO_TASK_RESULT_LABELS,
  parseAutomationStudioTaskResult,
  type AutomationStudioTaskResult
} from "../index.ts";

const LANDED = { id: "act-1", what: "Added the kettle to the cart", where: "shop.example, product page", classes: ["modify_existing"], state: "landed" } as const;

const ROWS: AutomationStudioTaskResult = {
  attemptId: "attempt-1",
  kind: "rows",
  label: "confirmed",
  timesChecked: 2,
  source: "exploration",
  rows: {
    runId: "run-1",
    datasetId: "catalog.products:v1",
    totalRows: 10,
    truncated: false,
    columns: [{ id: "title", label: "Title" }, { id: "price", label: "Price" }],
    previewRows: [{ title: "Kettle", price: 20 }, { title: "Toaster", price: { amount: 30, tags: ["sale"] } }]
  },
  acts: [],
  checkedWhat: "Right columns, cheapest first, no duplicates",
  from: [{ site: "shop.example", pages: "3 results pages" }]
};

function issuesOf(value: unknown): string[] {
  const result = parseAutomationStudioTaskResult(value);
  return result.ok ? [] : result.issues;
}

function withRows(rows: Record<string, unknown>): unknown {
  return { ...ROWS, rows: { ...ROWS.rows, ...rows } };
}

describe("parseAutomationStudioTaskResult", () => {
  it("returns a fresh result", () => {
    const parsed = parseAutomationStudioTaskResult(ROWS);
    expect(parsed).toEqual({ ok: true, result: ROWS });
    if (!parsed.ok) throw new Error("expected a valid result");
    expect(parsed.result.rows).not.toBe(ROWS.rows);
    expect(parsed.result.rows?.previewRows[1]).not.toBe(ROWS.rows?.previewRows[1]);
    expect(parsed.result.rows?.previewRows[1]?.price).not.toBe(ROWS.rows?.previewRows[1]?.price);
  });

  it("keeps a count of rows skipped as already done, and refuses anything but a whole number from 1", () => {
    const partial = { attemptId: "a", kind: "partial", label: "unverified", timesChecked: 0, source: "exploration", acts: [] };
    const parsed = parseAutomationStudioTaskResult({ ...partial, skippedAsDone: 2 });
    expect(parsed.ok && parsed.result.skippedAsDone).toBe(2);
    const absent = parseAutomationStudioTaskResult(partial);
    expect(absent.ok && "skippedAsDone" in absent.result).toBe(false);
    for (const bad of [0, -1, 1.5, "2", null, Number.NaN]) expect(issuesOf({ ...partial, skippedAsDone: bad })).toEqual(["task_result.invalid_skipped_as_done"]);
  });

  it("takes each kind with what it needs, and refuses a kind without it", () => {
    expect(issuesOf({ attemptId: "a", kind: "partial", label: "unverified", timesChecked: 0, source: "exploration", acts: [] })).toEqual([]);
    expect(issuesOf({ attemptId: "a", kind: "rows", label: "unverified", timesChecked: 0, source: "exploration", acts: [] })).toEqual(["task_result.rows_kind_needs_rows"]);
    expect(issuesOf({ attemptId: "a", kind: "plain_answer", label: "unverified", timesChecked: 0, source: "exploration", acts: [] })).toEqual(["task_result.plain_answer_needs_answer"]);
    expect(issuesOf({ attemptId: "a", kind: "plain_answer", label: "unverified", timesChecked: 0, source: "exploration", acts: [], answerText: { text: "It is open until 9.", author: "model" } })).toEqual([]);
    expect(issuesOf({ attemptId: "a", kind: "done_on_site", label: "confirmed", timesChecked: 1, source: "flow", acts: [LANDED] })).toEqual([]);
    expect(issuesOf({ attemptId: "a", kind: "done_on_site", label: "confirmed", timesChecked: 1, source: "flow", acts: [{ ...LANDED, state: "may_have_landed" }] })).toEqual([]);
    expect(issuesOf({ attemptId: "a", kind: "done_on_site", label: "confirmed", timesChecked: 1, source: "flow", acts: [] })).toEqual(["task_result.done_on_site_needs_an_act"]);
    expect(issuesOf({ attemptId: "a", kind: "done_on_site", label: "confirmed", timesChecked: 1, source: "flow", acts: [{ ...LANDED, state: "not_done" }] })).toEqual(["task_result.done_on_site_needs_an_act"]);
  });

  it("carries a budget-out result in the same record, whichever kind it got to", () => {
    const partial = { ...ROWS, kind: "partial", label: "unverified", timesChecked: 0, missingWhat: "The other 7 rows" };
    expect(issuesOf(partial)).toEqual([]);
    expect(issuesOf({ ...ROWS, label: "unverified", timesChecked: 0 })).toEqual([]);
    expect(issuesOf({ attemptId: "a", kind: "partial", label: "unverified", timesChecked: 0, source: "both", acts: [] })).toEqual([]);
  });

  it("refuses unknown kinds, labels and sources", () => {
    expect(AUTOMATION_STUDIO_TASK_RESULT_KINDS).toEqual(["rows", "done_on_site", "plain_answer", "partial"]);
    expect(AUTOMATION_STUDIO_TASK_RESULT_LABELS).toEqual(["confirmed", "refuted", "unverified"]);
    expect(issuesOf({ ...ROWS, kind: "failure" })).toContain("task_result.invalid_kind");
    expect(issuesOf({ ...ROWS, label: "no_result" })).toContain("task_result.invalid_label");
    expect(issuesOf({ ...ROWS, label: "checked" })).toContain("task_result.invalid_label");
    expect(issuesOf({ ...ROWS, source: "model" })).toContain("task_result.invalid_source");
  });

  it("never lets a label claim a check that did not run", () => {
    expect(issuesOf({ ...ROWS, label: "confirmed", timesChecked: 0 })).toEqual(["task_result.label_needs_a_check"]);
    expect(issuesOf({ ...ROWS, label: "refuted", timesChecked: 0 })).toEqual(["task_result.label_needs_a_check"]);
    expect(issuesOf({ ...ROWS, label: "unverified", timesChecked: 0 })).toEqual([]);
    expect(issuesOf({ ...ROWS, timesChecked: -1 })).toContain("task_result.invalid_times_checked");
  });

  // D9: rows come only from real reads. There is no way to write rows without the run and dataset that store them.
  it("takes rows only by reference to the dataset that stores them", () => {
    const { runId: _runId, ...noRun } = ROWS.rows!;
    expect(issuesOf({ ...ROWS, rows: noRun })).toContain("task_result.invalid_rows_run_id");
    const { datasetId: _datasetId, ...noDataset } = ROWS.rows!;
    expect(issuesOf({ ...ROWS, rows: noDataset })).toContain("task_result.invalid_rows_dataset_id");
    expect(issuesOf(withRows({ datasetId: ".." }))).toContain("task_result.invalid_rows_dataset_id");
    expect(issuesOf(withRows({ rows: [] }))).toContain("task_result.unknown_key");
  });

  it("labels an answer as the model's, and refuses any other author", () => {
    const parsed = parseAutomationStudioTaskResult({ ...ROWS, answerText: { text: "Ten were found.", author: "model" } });
    expect(parsed.ok && parsed.result.answerText).toEqual({ text: "Ten were found.", author: "model" });
    for (const answerText of ["Ten were found.", { text: "Ten were found." }, { text: "Ten were found.", author: "core" }, { text: "", author: "model" }, { text: "x".repeat(4_001), author: "model" }, { text: "x", author: "model", page: "y" }]) {
      expect(issuesOf({ ...ROWS, answerText })).toContain("task_result.invalid_answer_text");
    }
  });

  it("holds preview rows to their columns and their bounds", () => {
    expect(issuesOf(withRows({ previewRows: [{ title: "x", cost: 1 }] }))).toContain("task_result.invalid_preview_rows");
    expect(issuesOf(withRows({ totalRows: 1 }))).toContain("task_result.preview_past_total");
    const many = Array.from({ length: AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS.previewMaxRows + 1 }, () => ({ title: "x" }));
    expect(issuesOf(withRows({ totalRows: 500, previewRows: many }))).toContain("task_result.invalid_preview_rows");
    const huge = [{ title: "x".repeat(AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS.previewMaxBytes) }];
    expect(issuesOf(withRows({ previewRows: huge }))).toContain("task_result.invalid_preview_rows");
    expect(issuesOf(withRows({ previewRows: [{ title: Number.NaN }] }))).toContain("task_result.invalid_preview_rows");
    expect(issuesOf(withRows({ previewRows: [{ title: new Date() }] }))).toContain("task_result.invalid_preview_rows");
    expect(issuesOf(withRows({ previewRows: [{ title: undefined }] }))).toContain("task_result.invalid_preview_rows");
    let deep: unknown = "x";
    for (let depth = 0; depth < 40; depth += 1) deep = [deep];
    expect(issuesOf(withRows({ previewRows: [{ title: deep }] }))).toContain("task_result.invalid_preview_rows");
    expect(issuesOf(withRows({ truncated: "no" }))).toContain("task_result.invalid_truncated");
  });

  it("holds columns to the record schema's own rules", () => {
    expect(issuesOf(withRows({ columns: [{ id: "__proto__", label: "x" }], previewRows: [] }))).toContain("task_result.invalid_columns");
    expect(issuesOf(withRows({ columns: [{ id: "a b", label: "x" }], previewRows: [] }))).toContain("task_result.invalid_columns");
    expect(issuesOf(withRows({ columns: [{ id: "a", label: "x" }, { id: "a", label: "y" }], previewRows: [] }))).toContain("task_result.invalid_columns");
    expect(issuesOf(withRows({ columns: [{ id: "a", label: "" }], previewRows: [] }))).toContain("task_result.invalid_columns");
  });

  it("does not let a key named `__proto__` reach a row's prototype", () => {
    const row: unknown = JSON.parse("{\"title\":{\"__proto__\":{\"polluted\":true}}}");
    const parsed = parseAutomationStudioTaskResult(withRows({ previewRows: [row] }));
    expect(parsed.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("holds nothing it does not name: no address into a page, page text or token", () => {
    for (const key of ["selector", "pageText", "token", "failure", "error", "reason"]) {
      expect(issuesOf({ ...ROWS, [key]: "x" }), key).toEqual(["task_result.unknown_key"]);
    }
  });

  it("refuses an address or a token in the words a person reads", () => {
    expect(issuesOf({ ...ROWS, checkedWhat: "li:nth-child(2)" })).toEqual(["task_result.invalid_checked_what"]);
    expect(issuesOf({ ...ROWS, missingWhat: "Bearer abc" })).toEqual(["task_result.invalid_missing_what"]);
    expect(issuesOf({ ...ROWS, from: [{ site: "https://shop.example/cart", pages: "cart" }] })).toEqual(["task_result.invalid_from"]);
    expect(issuesOf({ ...ROWS, from: [{ site: "shop.example", pages: "#results" }] })).toEqual(["task_result.invalid_from"]);
    expect(issuesOf({ ...ROWS, from: [{ site: "shop.example", pages: "results", selector: "#x" }] })).toEqual(["task_result.invalid_from"]);
  });

  it("keeps a nested act's issues under its own codes", () => {
    expect(issuesOf({ ...ROWS, acts: [{ ...LANDED, state: "failed" }] })).toEqual(["attempt_act.invalid_state"]);
    expect(issuesOf({ ...ROWS, acts: "none" })).toEqual(["task_result.invalid_acts"]);
  });

  it("refuses what is not a record, and never throws", () => {
    for (const value of [null, 1, "result", []]) expect(issuesOf(value)).toEqual(["task_result.not_object"]);
    const hostile = { ...ROWS, get kind(): string { throw new Error("no"); } };
    expect(issuesOf(hostile)).toEqual(["task_result.invalid"]);
  });
});
