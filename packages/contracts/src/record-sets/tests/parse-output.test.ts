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
