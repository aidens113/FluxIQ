import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  parseAutomationStudioRecordOutput,
  type AutomationStudioRecordOutput,
  type AutomationStudioRecordParseOptions
} from "../index.ts";

const VALID: AutomationStudioRecordOutput = {
  datasetId: "catalog.products:v1",
  label: "Products",
  recordsPath: "extracted.items",
  schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] },
  writeMode: "append",
  maxRecords: 500
};

function issuesOf(value: unknown, options?: AutomationStudioRecordParseOptions): string[] {
  const result = parseAutomationStudioRecordOutput(value, options);
  return result.ok ? [] : result.issues;
}

describe("parseAutomationStudioRecordOutput", () => {
  it("round-trips a valid record output into fresh objects", () => {
    const result = parseAutomationStudioRecordOutput(VALID);
    expect(result).toEqual({ ok: true, output: VALID });
    if (!result.ok) throw new Error("expected ok");
    expect(result.output).not.toBe(VALID);
    expect(result.output.schema).not.toBe(VALID.schema);
    const { label: _label, maxRecords: _maxRecords, ...minimal } = VALID;
    expect(parseAutomationStudioRecordOutput(minimal)).toEqual({ ok: true, output: minimal });
  });

  it("rejects a record output without recordsPath or with an invalid one", () => {
    const { recordsPath: _recordsPath, ...withoutPath } = VALID;
    expect(issuesOf(withoutPath)).toEqual(["record_output.missing_records_path"]);
    for (const recordsPath of ["", "a..b", "__proto__.x", "items[0]", 5]) {
      expect(issuesOf({ ...VALID, recordsPath })).toEqual(["record_output.invalid_records_path"]);
    }
  });

  it("rejects a bad datasetId", () => {
    for (const datasetId of ["", "has space", "a/b", ".", "..", "d".repeat(201), 3, undefined]) {
      expect(issuesOf({ ...VALID, datasetId })).toEqual(["record_output.invalid_dataset_id"]);
    }
    expect(issuesOf({ ...VALID, datasetId: "d".repeat(200) })).toEqual([]);
    expect(issuesOf({ ...VALID, datasetId: "a.b_c:d-1" })).toEqual([]);
  });

  it("rejects maxRecords above the ceiling or malformed", () => {
    expect(AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling).toBe(10_000);
    expect(issuesOf({ ...VALID, maxRecords: 10_000 })).toEqual([]);
    expect(issuesOf({ ...VALID, maxRecords: 10_001 })).toEqual(["record_output.max_records_above_ceiling"]);
    for (const maxRecords of [0, -1, 1.5, "10", Number.NaN]) {
      expect(issuesOf({ ...VALID, maxRecords })).toEqual(["record_output.invalid_max_records"]);
    }
  });

  it("rejects a missing or unknown writeMode, a blank label, and unknown keys", () => {
    expect(issuesOf({ ...VALID, writeMode: "upsert" })).toEqual(["record_output.invalid_write_mode"]);
    const { writeMode: _writeMode, ...withoutMode } = VALID;
    expect(issuesOf(withoutMode)).toEqual(["record_output.invalid_write_mode"]);
    expect(issuesOf({ ...VALID, label: " " })).toEqual(["record_output.invalid_label"]);
    expect(issuesOf({ ...VALID, sideEffect: "read" })).toEqual(["record_output.unknown_key"]);
    expect(issuesOf("output")).toEqual(["record_output.not_object"]);
  });

  it("passes the nested schema's issues through with their own codes and honours allowEncrypt", () => {
    const encrypted = { ...VALID, schema: { schemaVersion: "0.1", fields: [{ id: "a", label: "A", valueType: "string" }, { id: "b", label: "B", valueType: "string", handling: "encrypt" }] } };
    expect(issuesOf(encrypted)).toEqual(["record_schema.encrypt_unavailable"]);
    expect(issuesOf(encrypted, { allowEncrypt: true })).toEqual([]);
    expect(issuesOf({ ...VALID, schema: undefined })).toEqual(["record_schema.not_object"]);
  });

  it("returns an issue instead of throwing for hostile inputs", () => {
    const hostile = new Proxy({}, { ownKeys: () => { throw new Error("boom"); } });
    expect(parseAutomationStudioRecordOutput(hostile)).toEqual({ ok: false, issues: ["record_output.invalid"] });
  });
});

describe("parseAutomationStudioRecordOutput process", () => {
  const SCHEMA = {
    schemaVersion: "0.1",
    fields: [
      { id: "title", label: "Title", valueType: "string" },
      { id: "price", label: "Price", valueType: "string" },
      { id: "url", label: "Link", valueType: "url" },
      { id: "note", label: "Note", valueType: "string", handling: "exclude" }
    ]
  } as const;
  const WITH_SCHEMA = { ...VALID, schema: SCHEMA };
  const FULL: NonNullable<AutomationStudioRecordOutput["process"]> = {
    dedupe: { by: ["url"] },
    where: [
      { field: "price", lessThan: 50, atLeast: 1 },
      { field: "title", contains: ["case", "tips"], not: true },
      { field: "url", is: "present" },
      { field: "title", equals: ["A", 3] },
      { field: "title", matches: "/^a/i", startsWith: "a", endsWith: ["z"] }
    ],
    sort: [{ field: "price", order: "asc", as: "number" }, { field: "title", order: "desc" }],
    limit: 10,
    columns: ["title", "price", "url"],
    minRows: 0
  };

  function processIssues(process: unknown): string[] {
    return issuesOf({ ...WITH_SCHEMA, process });
  }

  it("round-trips a full declaration into fresh objects, and dedupe false", () => {
    const result = parseAutomationStudioRecordOutput({ ...WITH_SCHEMA, process: FULL });
    expect(result).toEqual({ ok: true, output: { ...WITH_SCHEMA, process: FULL } });
    if (!result.ok) throw new Error("expected ok");
    expect(result.output.process).not.toBe(FULL);
    expect(result.output.process?.where?.[0]).not.toBe(FULL.where?.[0]);
    expect(parseAutomationStudioRecordOutput({ ...WITH_SCHEMA, process: { dedupe: false } })).toEqual({ ok: true, output: { ...WITH_SCHEMA, process: { dedupe: false } } });
    expect(parseAutomationStudioRecordOutput({ ...WITH_SCHEMA, process: {} })).toEqual({ ok: true, output: { ...WITH_SCHEMA, process: {} } });
  });

  it("refuses a field the schema does not have, or does not store", () => {
    expect(processIssues({ sort: [{ field: "rating", order: "asc" }] })).toEqual(["record_output.process_unknown_field"]);
    expect(processIssues({ dedupe: { by: ["missing"] } })).toEqual(["record_output.process_unknown_field"]);
    expect(processIssues({ where: [{ field: "note", is: "absent" }] })).toEqual(["record_output.process_excluded_field"]);
    expect(processIssues({ columns: ["title", "note"] })).toEqual(["record_output.process_excluded_field"]);
  });

  it("refuses more than four sort keys and a malformed key", () => {
    const key = { field: "title", order: "asc" };
    expect(processIssues({ sort: [key, key, key, key] })).toEqual([]);
    expect(processIssues({ sort: [key, key, key, key, key] })).toEqual(["record_output.process_too_many_sort_keys"]);
    for (const sort of [[{ field: "title", order: "up" }], [{ field: "title", order: "asc", as: "money" }], [{ field: "title" }], [{ ...key, extra: 1 }], "title"]) {
      expect(processIssues({ sort })).toEqual(["record_output.process_invalid_sort"]);
    }
  });

  it("refuses a limit outside 1 to 10,000 and a bad minRows", () => {
    expect(processIssues({ limit: 10_000 })).toEqual([]);
    for (const limit of [0, -1, 1.5, 10_001, "5"]) expect(processIssues({ limit })).toEqual(["record_output.process_invalid_limit"]);
    for (const minRows of [-1, 0.5, "1"]) expect(processIssues({ minRows })).toEqual(["record_output.process_invalid_min_rows"]);
  });

  it("refuses repeated, empty or malformed columns and a where over a column the answer drops", () => {
    expect(processIssues({ columns: ["title", "title"] })).toEqual(["record_output.process_invalid_columns"]);
    expect(processIssues({ columns: [] })).toEqual(["record_output.process_invalid_columns"]);
    expect(processIssues({ columns: "title" })).toEqual(["record_output.process_invalid_columns"]);
    expect(processIssues({ columns: ["title"], where: [{ field: "price", lessThan: 5 }] })).toEqual(["record_output.process_where_column_dropped"]);
  });

  it("refuses a malformed dedupe", () => {
    for (const dedupe of [true, { by: [] }, { by: "url" }, { by: ["url", "url"] }, { by: ["url"], extra: 1 }]) {
      expect(processIssues({ dedupe })).toEqual(["record_output.process_invalid_dedupe"]);
    }
  });

  it("refuses a condition the domain would not run", () => {
    const refused = [
      { price: 5 },
      { field: "price", read: { selector: ".x" } },
      { field: "price", is: "absent", lessThan: 5 },
      { field: "price", is: "maybe" },
      { field: "price", lessThan: "5" },
      { field: "price", lessThan: Number.POSITIVE_INFINITY },
      { field: "price", equals: [] },
      { field: "price", equals: " " },
      { field: "price", contains: "" },
      { field: "price", contains: [5] },
      { field: "price", matches: "(" },
      { field: "price", not: "yes" },
      { field: "price", under: 5 },
      "price"
    ];
    for (const condition of refused) expect(processIssues({ where: [condition] })).toEqual(["record_output.process_invalid_condition"]);
    expect(processIssues({ where: "price" })).toEqual(["record_output.process_invalid_where"]);
    expect(processIssues({ where: [] })).toEqual([]);
    expect(processIssues({ where: [{ field: "price" }] })).toEqual([]);
  });

  it("refuses an unknown key and a process that is not an object", () => {
    expect(processIssues({ filter: [] })).toEqual(["record_output.process_unknown_key"]);
    expect(processIssues([])).toEqual(["record_output.process_not_object"]);
  });
});
