import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS,
  parseAutomationStudioRecordSchema,
  type AutomationStudioRecordParseOptions,
  type AutomationStudioRecordSchema
} from "../index.ts";

const VALID: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string", required: true },
    { id: "price", label: "Price", valueType: "number" },
    { id: "in_stock", label: "In stock", valueType: "boolean", handling: "include" },
    { id: "link", label: "Link", valueType: "url" },
    { id: "listed-at", label: "Listed at", valueType: "datetime" },
    { id: "details", label: "Details", valueType: "json", required: false },
    { id: "session", label: "Session", valueType: "string", handling: "exclude" }
  ],
  primaryKey: ["link"]
};

function issuesOf(value: unknown, options?: AutomationStudioRecordParseOptions): string[] {
  const result = parseAutomationStudioRecordSchema(value, options);
  return result.ok ? [] : result.issues;
}

function withFields(fields: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { schemaVersion: "0.1", fields, ...extra };
}

function manyFields(count: number): Array<{ id: string; label: string; valueType: "string" }> {
  return Array.from({ length: count }, (_, index) => ({ id: `f${index}`, label: `Field ${index}`, valueType: "string" as const }));
}

describe("parseAutomationStudioRecordSchema", () => {
  it("round-trips a valid schema into fresh objects", () => {
    const result = parseAutomationStudioRecordSchema(VALID);
    expect(result).toEqual({ ok: true, schema: VALID });
    if (!result.ok) throw new Error("expected ok");
    expect(result.schema).not.toBe(VALID);
    expect(result.schema.fields[0]).not.toBe(VALID.fields[0]);
    expect(result.schema.primaryKey).not.toBe(VALID.primaryKey);
  });

  it("treats explicitly undefined optional properties as absent", () => {
    const result = parseAutomationStudioRecordSchema(withFields([{ id: "a", label: "A", valueType: "string", required: undefined, handling: undefined }], { primaryKey: undefined }));
    expect(result).toEqual({ ok: true, schema: { schemaVersion: "0.1", fields: [{ id: "a", label: "A", valueType: "string" }] } });
  });

  it("rejects a duplicate field id or label", () => {
    expect(issuesOf(withFields([{ id: "a", label: "A", valueType: "string" }, { id: "a", label: "B", valueType: "string" }]))).toEqual(["record_schema.duplicate_field_id"]);
    expect(issuesOf(withFields([{ id: "a", label: "Same", valueType: "string" }, { id: "b", label: "Same", valueType: "string" }]))).toEqual(["record_schema.duplicate_field_label"]);
  });

  it("rejects a bad field id pattern and reserved ids", () => {
    for (const id of ["", "has space", "dot.ted", "a".repeat(101), 7]) {
      expect(issuesOf(withFields([{ id, label: "A", valueType: "string" }]))).toEqual(["record_schema.invalid_field_id"]);
    }
    expect(issuesOf(withFields([{ id: "a".repeat(100), label: "A", valueType: "string" }]))).toEqual([]);
    for (const id of AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.reservedFieldIds) {
      expect(issuesOf(withFields([{ id, label: "A", valueType: "string" }]))).toEqual(["record_schema.reserved_field_id"]);
    }
  });

  it("rejects more than 200 fields and accepts exactly 200", () => {
    expect(AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields).toBe(200);
    expect(issuesOf(withFields(manyFields(200)))).toEqual([]);
    expect(issuesOf(withFields(manyFields(201)))).toEqual(["record_schema.too_many_fields"]);
  });

  it("rejects an unknown valueType, handling, or required flag", () => {
    expect(issuesOf(withFields([{ id: "a", label: "A", valueType: "integer" }]))).toEqual(["record_schema.invalid_value_type"]);
    expect(issuesOf(withFields([{ id: "a", label: "A", valueType: "string", handling: "hide" }]))).toEqual(["record_schema.invalid_handling"]);
    expect(issuesOf(withFields([{ id: "a", label: "A", valueType: "string", required: "yes" }]))).toEqual(["record_schema.invalid_required"]);
  });

  it("enforces label bounds", () => {
    expect(issuesOf(withFields([{ id: "a", label: "", valueType: "string" }]))).toEqual(["record_schema.invalid_field_label"]);
    expect(issuesOf(withFields([{ id: "a", label: "   ", valueType: "string" }]))).toEqual(["record_schema.invalid_field_label"]);
    expect(issuesOf(withFields([{ id: "a", label: "L".repeat(201), valueType: "string" }]))).toEqual(["record_schema.invalid_field_label"]);
    expect(issuesOf(withFields([{ id: "a", label: "L".repeat(200), valueType: "string" }]))).toEqual([]);
  });

  it("refuses encrypt by default and accepts it only with allowEncrypt", () => {
    const schema = withFields([{ id: "a", label: "A", valueType: "string" }, { id: "b", label: "B", valueType: "string", handling: "encrypt" }]);
    expect(issuesOf(schema)).toEqual(["record_schema.encrypt_unavailable"]);
    expect(issuesOf(schema, {})).toEqual(["record_schema.encrypt_unavailable"]);
    expect(issuesOf(schema, { allowEncrypt: false })).toEqual(["record_schema.encrypt_unavailable"]);
    expect(parseAutomationStudioRecordSchema(schema, { allowEncrypt: true }).ok).toBe(true);
  });

  it("validates primaryKey references", () => {
    const fields = [
      { id: "a", label: "A", valueType: "string" },
      { id: "hidden", label: "Hidden", valueType: "string", handling: "exclude" },
      { id: "sealed", label: "Sealed", valueType: "string", handling: "encrypt" }
    ];
    expect(issuesOf(withFields(fields, { primaryKey: ["a"] }), { allowEncrypt: true })).toEqual([]);
    expect(issuesOf(withFields(fields, { primaryKey: ["sealed"] }), { allowEncrypt: true })).toEqual(["record_schema.primary_key_encrypted_field"]);
    expect(issuesOf(withFields(fields, { primaryKey: ["hidden"] }), { allowEncrypt: true })).toEqual(["record_schema.primary_key_excluded_field"]);
    expect(issuesOf(withFields(fields, { primaryKey: ["missing"] }), { allowEncrypt: true })).toEqual(["record_schema.primary_key_unknown_field"]);
    expect(issuesOf(withFields(fields, { primaryKey: ["a", "a"] }), { allowEncrypt: true })).toEqual(["record_schema.primary_key_duplicate_field"]);
    for (const primaryKey of [[], "a", [1], null]) {
      expect(issuesOf(withFields(fields, { primaryKey }), { allowEncrypt: true })).toEqual(["record_schema.invalid_primary_key"]);
    }
  });

  it("rejects unknown keys, a wrong version, and malformed field lists", () => {
    expect(issuesOf({ ...VALID, digest: "x" })).toEqual(["record_schema.unknown_key"]);
    expect(issuesOf(withFields([{ id: "a", label: "A", valueType: "string", sensitive: true }]))).toEqual(["record_schema.unknown_field_key"]);
    expect(issuesOf({ ...VALID, schemaVersion: "0.2" })).toEqual(["record_schema.invalid_schema_version"]);
    expect(issuesOf({ schemaVersion: "0.1" })).toEqual(["record_schema.invalid_fields"]);
    expect(issuesOf(withFields([]))).toEqual(["record_schema.no_fields"]);
    expect(issuesOf(withFields(["a"]))).toEqual(["record_schema.invalid_field"]);
    expect(issuesOf(withFields([{ id: "a", label: "A", valueType: "string", handling: "exclude" }]))).toEqual(["record_schema.no_stored_fields"]);
    expect(issuesOf([VALID])).toEqual(["record_schema.not_object"]);
    expect(issuesOf(null)).toEqual(["record_schema.not_object"]);
  });

  it("lists each issue code once", () => {
    expect(issuesOf(withFields([{ id: "bad id", label: "A", valueType: "string" }, { id: "also bad", label: "B", valueType: "string" }]))).toEqual(["record_schema.invalid_field_id"]);
  });

  it("returns an issue instead of throwing for hostile inputs", () => {
    const hostile = new Proxy({}, { ownKeys: () => { throw new Error("boom"); } });
    expect(parseAutomationStudioRecordSchema(hostile)).toEqual({ ok: false, issues: ["record_schema.invalid"] });
  });
});
