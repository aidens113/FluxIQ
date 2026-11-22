import { expect, it } from "vitest";
import { parseAutomationStudioRecordSchema, storedAutomationStudioRecordSchema, validateAutomationStudioRecords } from "../index.ts";

it("exposes strict schema parsing and retained metadata through the public browser-safe automation entry", () => {
  const parsed = parseAutomationStudioRecordSchema({ schemaVersion: "0.1", primaryKey: ["id"], fields: [
    { id: "id", label: "Id", valueType: "string", semanticType: "id" },
    { id: "price", label: "Price", valueType: "string", semanticType: "currency" },
    { id: "promoted", label: "Promoted", valueType: "boolean", semanticType: "flag", mark: "badge" },
    { id: "private", label: "Private", valueType: "string", handling: "exclude" }
  ] });
  if (!parsed.ok) throw new Error("Public schema parser refused valid metadata");
  expect(storedAutomationStudioRecordSchema(parsed.schema)).toEqual({ ...parsed.schema, fields: parsed.schema.fields.slice(0, 3) });
  expect(validateAutomationStudioRecords([{ id: "one", price: "$12.50", promoted: false, private: "synthetic excluded value" }], parsed.schema).rows).toEqual([{ id: "one", price: "$12.50", promoted: false }]);
  expect(parseAutomationStudioRecordSchema({ schemaVersion: "0.1", fields: [{ id: "x", label: "X", valueType: "string", semanticType: "unknown" }] })).toEqual({ ok: false, issues: ["record_schema.invalid_semantic_type"] });
});
