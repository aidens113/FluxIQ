import { describe, expect, it } from "vitest";
import { mergeAutomationStudioRecordSchemas, type AutomationStudioRecordSchema } from "../index.ts";

const base: AutomationStudioRecordSchema = {
  schemaVersion: "0.1", primaryKey: ["id"],
  fields: [{ id: "id", label: "Id", valueType: "string", semanticType: "id", required: true }, { id: "price", label: "Price", valueType: "string", semanticType: "currency", required: true }]
};

describe("compatible retained record schemas", () => {
  it("keeps encryption disabled by default and preserves an explicit caller's validation option", () => {
    const encrypted: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "secret", label: "Secret", valueType: "string", handling: "encrypt" }] };
    expect(mergeAutomationStudioRecordSchemas(encrypted, encrypted)).toEqual({ ok: false, issues: ["record_schema.encrypt_unavailable"] });
    expect(mergeAutomationStudioRecordSchemas(encrypted, encrypted, { allowEncrypt: true })).toEqual({ ok: true, schema: encrypted });
  });

  it("unions additive pages, makes non-universal fields optional and retains metadata", () => {
    const next: AutomationStudioRecordSchema = { ...base, fields: [base.fields[0]!, { id: "promoted", label: "Promoted", valueType: "boolean", semanticType: "flag", mark: "badge", required: true }] };
    const before = structuredClone([base, next]);
    const merged = mergeAutomationStudioRecordSchemas(base, next);
    expect(merged).toEqual({ ok: true, schema: { ...base, fields: [base.fields[0], { ...base.fields[1], required: false }, { ...next.fields[1], required: false }] } });
    expect([base, next]).toEqual(before);
    if (!merged.ok) throw new Error("expected compatible schemas");
    expect(mergeAutomationStudioRecordSchemas(merged.schema, base)).toEqual(merged);
  });

  it("normalizes omitted include handling and retains known semantic metadata", () => {
    const next: AutomationStudioRecordSchema = { ...base, fields: [{ ...base.fields[0]!, handling: "include" }, { id: "price", label: "Price", valueType: "string", required: true }] };
    expect(mergeAutomationStudioRecordSchemas(base, next)).toEqual({ ok: true, schema: base });
  });

  it.each([
    ["value_type", { valueType: "number" }],
    ["semantic_type", { semanticType: "count" }],
    ["handling", { handling: "exclude" }]
  ] as const)("refuses conflicting %s without modifying either schema", (reason, patch) => {
    const next: AutomationStudioRecordSchema = { ...base, fields: [base.fields[0]!, { ...base.fields[1]!, ...patch }] };
    expect(mergeAutomationStudioRecordSchemas(base, next)).toEqual({ ok: false, issues: [`record_schema.union_${reason}_conflict`] });
  });

  it("refuses different identity declarations, including an unvalidated identity", () => {
    const { primaryKey: _identity, ...unknown } = base;
    expect(mergeAutomationStudioRecordSchemas(base, unknown)).toEqual({ ok: false, issues: ["record_schema.union_primary_key_conflict"] });
    expect(mergeAutomationStudioRecordSchemas(base, { ...base, primaryKey: ["price"] })).toEqual({ ok: false, issues: ["record_schema.union_primary_key_conflict"] });
  });

  it("refuses conflicting mark declarations", () => {
    const a: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "mark", label: "Mark", valueType: "string", mark: "badge" }] };
    expect(mergeAutomationStudioRecordSchemas(a, { ...a, fields: [{ ...a.fields[0]!, mark: "state" }] })).toEqual({ ok: false, issues: ["record_schema.union_mark_conflict"] });
  });

  it("reports union overflow rather than losing later fields", () => {
    const schema = (start: number): AutomationStudioRecordSchema => ({ schemaVersion: "0.1", fields: Array.from({ length: 150 }, (_, index) => ({ id: `f${start + index}`, label: `Field ${start + index}`, valueType: "string" })) });
    expect(mergeAutomationStudioRecordSchemas(schema(0), schema(100))).toEqual({ ok: false, issues: ["record_schema.too_many_fields"] });
  });
});
