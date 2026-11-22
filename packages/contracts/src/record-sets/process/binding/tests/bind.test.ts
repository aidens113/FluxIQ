import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../../schema.ts";
import { bindAutomationStudioRecordProcessing } from "../../index.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "id", label: "Product id", valueType: "string" },
    { id: "title", label: "Product name", valueType: "string" },
    { id: "price", label: "Current cost", valueType: "string" },
    { id: "previous", label: "Previous cost", valueType: "string" },
    { id: "secret", label: "Private note", valueType: "string", handling: "exclude" }
  ]
};

describe("binding a declared processing to retained fields", () => {
  it("binds unique normalized labels in every existing operator, preserving exact derived ids", () => {
    const declaration = {
      derive: [{ id: "amount", from: " CURRENT   COST ", as: "number" }],
      where: [{ field: "amount", atMost: 30 }],
      anyOf: [[{ field: "product name", contains: "Alpha" }, { field: "Product id", equals: "a" }]],
      compare: [{ field: "Current cost", lessThan: "Previous cost" }],
      dedupe: { by: ["Product id"] },
      sort: [{ field: "amount", order: "asc", as: "number" }],
      columns: ["Product name", "Current cost"]
    };
    const snapshot = structuredClone(declaration);
    const result = bindAutomationStudioRecordProcessing(declaration, SCHEMA);
    expect(result).toMatchObject({
      ok: true,
      processing: {
        derive: [{ id: "amount", from: "price", as: "number" }],
        where: [{ field: "amount", atMost: 30 }],
        anyOf: [[{ field: "title", contains: "Alpha" }, { field: "id", equals: "a" }]],
        compare: [{ field: "price", lessThan: "previous" }], dedupe: { by: ["id"] },
        sort: [{ field: "amount", order: "asc", as: "number" }], columns: ["title", "price"]
      }
    });
    expect(declaration).toEqual(snapshot);
    if (!result.ok) throw new Error("Expected bound declaration");
    expect(result.bindings[" CURRENT   COST "]).toBe("price");
    expect(result.bindings).not.toHaveProperty("amount");
  });

  it("keeps an exact id authoritative even when a different field has that label", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [
      { id: "price", label: "Current cost", valueType: "number" },
      { id: "other", label: "Price", valueType: "number" }
    ] };
    expect(bindAutomationStudioRecordProcessing({ columns: ["price", " PRICE "] }, schema)).toMatchObject({
      ok: true, processing: { columns: ["price", "other"] }, bindings: { price: "price", " PRICE ": "other" }
    });
  });

  it("reports missing fields rather than guessing synonyms or dropping a condition", () => {
    const result = bindAutomationStudioRecordProcessing({ where: [{ field: "sale price", atMost: 30 }] }, SCHEMA);
    expect(result).toMatchObject({ ok: false, unresolved: [{ field: "sale price", reason: "missing" }] });
    if (result.ok) throw new Error("Expected unresolved field");
    expect(result.issues).toContain("record_output.process_binding_missing_field");
    expect(result).not.toHaveProperty("processing");
  });

  it("rejects an ambiguous normalized label instead of choosing the first field", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [
      { id: "first", label: "Unit price", valueType: "number" },
      { id: "second", label: "unit  PRICE", valueType: "number" }
    ] };
    expect(bindAutomationStudioRecordProcessing({ sort: [{ field: "UNIT PRICE", order: "asc" }] }, schema))
      .toMatchObject({ ok: false, unresolved: [{ field: "UNIT PRICE", reason: "ambiguous" }] });
  });

  it.each(["secret", " PRIVATE NOTE "])("keeps the exclusion authoritative for %s", (field) => {
    const result = bindAutomationStudioRecordProcessing({ columns: [field] }, SCHEMA);
    expect(result).toMatchObject({ ok: false, unresolved: [{ field, reason: "excluded" }] });
    expect(result).not.toHaveProperty("processing");
  });

  it("uses the existing strict grammar after binding instead of accepting a second dialect", () => {
    const result = bindAutomationStudioRecordProcessing({ columns: ["Product name"], limit: 0, invented: true }, SCHEMA);
    expect(result).toMatchObject({ ok: false, unresolved: [] });
    if (result.ok) throw new Error("Expected invalid processing");
    expect(result.issues).toContain("record_output.process_invalid_limit");
    expect(result.issues).toContain("record_output.process_unknown_key");
  });

  it("does not treat a derived id as a stored source field", () => {
    expect(bindAutomationStudioRecordProcessing({ derive: [{ id: "amount", from: "amount", as: "number" }] }, SCHEMA))
      .toMatchObject({ ok: false, unresolved: [{ field: "amount", reason: "missing" }] });
  });
});
