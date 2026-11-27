import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import {
  bindAutomationStudioRecordProcessing,
  parseAutomationStudioRecordProcessing,
  processAutomationStudioRecordRows,
  stampAutomationStudioRecordProcessing,
  type AutomationStudioRecordProcessingDeclaration
} from "../index.ts";

const SOURCE = "8c".repeat(32);
const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "id", label: "Product id", valueType: "string" },
    { id: "title", label: "Product name", valueType: "string" },
    { id: "price", label: "Current cost", valueType: "string" },
    { id: "previous", label: "Previous cost", valueType: "string" },
    { id: "secret", label: "Private note", valueType: "string", handling: "exclude" }
  ],
  primaryKey: ["id"]
};
const DECLARATION: AutomationStudioRecordProcessingDeclaration = { version: 1, source: SOURCE, revision: 1, bindings: { "Current cost": "price", "Product name": "title" } };

function parseDeclaration(declaration: unknown) {
  return parseAutomationStudioRecordProcessing({ columns: ["title"], declaration }, SCHEMA);
}

function invalid(declaration: unknown) {
  expect(parseDeclaration(declaration)).toMatchObject({ ok: false, issues: ["record_output.process_invalid_declaration"] });
}

describe("processing declaration provenance", () => {
  it("keeps legacy parsing and JSON unchanged without provenance", () => {
    const legacy = { where: [{ field: "price", atMost: 30 }], columns: ["title"] };
    const parsed = parseAutomationStudioRecordProcessing(legacy, SCHEMA);
    expect(parsed).toEqual({ ok: true, processing: legacy });
    if (!parsed.ok) throw new Error("Expected legacy processing");
    expect(Object.hasOwn(parsed.processing, "declaration")).toBe(false);
    expect(JSON.stringify(parsed.processing)).toBe(JSON.stringify(legacy));
  });

  it("copies strict metadata and roundtrips canonical provenance regardless of binding insertion order", () => {
    const original = { ...DECLARATION, bindings: { "Product name": "title", "Current cost": "price" } };
    const parsed = parseDeclaration(original);
    const reversed = parseDeclaration(DECLARATION);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !reversed.ok) throw new Error("Expected valid provenance");
    expect(parsed.processing.declaration).toEqual(DECLARATION);
    expect(parsed.processing.declaration).not.toBe(original);
    expect(parsed.processing.declaration?.bindings).not.toBe(original.bindings);
    expect(JSON.stringify(parsed.processing)).toBe(JSON.stringify(reversed.processing));
    expect(parseAutomationStudioRecordProcessing(JSON.parse(JSON.stringify(parsed.processing)), SCHEMA)).toEqual(parsed);
    original.bindings["Current cost"] = "previous";
    expect(parsed.processing.declaration?.bindings["Current cost"]).toBe("price");
  });

  it("stamps actual stored-source bindings and roundtrips derived comparisons without virtual binding targets", () => {
    const raw = {
      derive: [{ id: "amount", from: " CURRENT COST ", as: "number" }],
      where: [{ field: "amount", atMost: 30 }],
      compare: [{ field: "amount", lessThan: "Previous cost" }],
      columns: ["Product name"]
    };
    const snapshot = structuredClone(raw);
    const stamped = stampAutomationStudioRecordProcessing(raw, SCHEMA, { source: SOURCE, revision: 3 });
    expect(stamped.ok).toBe(true);
    if (!stamped.ok) throw new Error("Expected framework stamp");
    expect(stamped.processing).toEqual({
      derive: [{ id: "amount", from: "price", as: "number" }],
      where: [{ field: "amount", atMost: 30 }],
      compare: [{ field: "amount", lessThan: "previous" }],
      columns: ["title"],
      declaration: { version: 1, source: SOURCE, revision: 3, bindings: { " CURRENT COST ": "price", "Previous cost": "previous", "Product name": "title" } }
    });
    expect(stamped.processing.declaration?.bindings).not.toHaveProperty("amount");
    expect(parseAutomationStudioRecordProcessing(JSON.parse(JSON.stringify(stamped.processing)), SCHEMA)).toEqual({ ok: true, processing: stamped.processing });
    expect(raw).toEqual(snapshot);
  });

  it.each([DECLARATION, null, undefined])("refuses caller/model-supplied provenance at binding and stamping boundaries: %j", (declaration) => {
    const raw = { columns: ["Product name"], declaration };
    const expected = { ok: false, issues: ["record_output.process_declaration_framework_owned"], unresolved: [] };
    expect(bindAutomationStudioRecordProcessing(raw, SCHEMA)).toEqual(expected);
    expect(stampAutomationStudioRecordProcessing(raw, SCHEMA, { source: SOURCE, revision: 2 })).toEqual(expected);
  });

  it.each(["", "a".repeat(63), "a".repeat(65), "A".repeat(64), `sha256:${SOURCE}`, ` ${SOURCE}`, 64, null])("refuses a noncanonical source digest: %j", (source) => {
    invalid({ ...DECLARATION, source });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, "1", undefined])("refuses an invalid revision: %j", (revision) => {
    invalid({ ...DECLARATION, revision });
  });

  it.each([0, 2, "1", null])("refuses an unknown declaration version: %j", (version) => {
    invalid({ ...DECLARATION, version });
  });

  it.each([null, [], { "": "price" }, { "  ": "price" }, { Cost: 24 }, { Cost: "missing" }, { Cost: "secret" }, { Cost: "amount" }])("refuses malformed, unknown, excluded or derived binding targets: %j", (bindings) => {
    invalid({ ...DECLARATION, bindings });
  });

  it("requires exactly the four provenance fields and never drops invalid metadata", () => {
    invalid(null);
    invalid(undefined);
    invalid({ version: 1, source: SOURCE, bindings: {} });
    invalid({ version: 1, source: SOURCE, revision: 1 });
    invalid({ ...DECLARATION, mode: "automatic" });
    invalid({ ...DECLARATION, clock: 1 });
  });

  it("validates framework digest/revision and refuses unavailable fields before returning a stamp", () => {
    expect(stampAutomationStudioRecordProcessing({ columns: ["Product name"] }, SCHEMA, { source: "bad", revision: 1 }))
      .toMatchObject({ ok: false, issues: ["record_output.process_invalid_declaration"], unresolved: [] });
    expect(stampAutomationStudioRecordProcessing({ columns: ["Product name"] }, SCHEMA, { source: SOURCE, revision: 0 }))
      .toMatchObject({ ok: false, issues: ["record_output.process_invalid_declaration"], unresolved: [] });
    expect(stampAutomationStudioRecordProcessing({ columns: ["Private note"] }, SCHEMA, { source: SOURCE, revision: 1 }))
      .toMatchObject({ ok: false, unresolved: [{ field: "Private note", reason: "excluded" }] });
  });

  it("permits an empty map when there are no field references and preserves the existing strict processing grammar", () => {
    expect(stampAutomationStudioRecordProcessing({ minRows: 0 }, SCHEMA, { source: SOURCE, revision: 1 }))
      .toMatchObject({ ok: true, bindings: {}, processing: { minRows: 0, declaration: { ...DECLARATION, bindings: {} } } });
    expect(parseAutomationStudioRecordProcessing({ declaration: DECLARATION, invented: true }, SCHEMA))
      .toMatchObject({ ok: false, issues: ["record_output.process_unknown_key"] });
  });

  it("keeps special written labels as own data keys across stamping and JSON without changing object prototypes", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [
      { id: "price", label: "__proto__", valueType: "string" },
      { id: "title", label: "constructor", valueType: "string" }
    ] };
    const stamped = stampAutomationStudioRecordProcessing({ columns: ["__proto__", "constructor"] }, schema, { source: SOURCE, revision: 1 });
    expect(stamped.ok).toBe(true);
    if (!stamped.ok) throw new Error("Expected special-label bindings");
    const bindings = stamped.processing.declaration!.bindings;
    expect(Object.getPrototypeOf(bindings)).toBe(Object.prototype);
    expect(Object.hasOwn(bindings, "__proto__")).toBe(true);
    expect(bindings["__proto__"]).toBe("price");
    expect(bindings["constructor"]).toBe("title");
    expect(parseAutomationStudioRecordProcessing(JSON.parse(JSON.stringify(stamped.processing)), schema)).toEqual({ ok: true, processing: stamped.processing });
  });

  it("does not opt existing evaluator callers into automatic mode merely by parsing metadata", () => {
    const stamped = stampAutomationStudioRecordProcessing({ columns: ["Product name"] }, SCHEMA, { source: SOURCE, revision: 1 });
    if (!stamped.ok) throw new Error("Expected framework stamp");
    const rows = [{ id: "one", title: "Same" }, { id: "two", title: "Same" }].map((values) => ({ values, nodeId: "read", batchKey: "capture" }));
    const result = processAutomationStudioRecordRows({ rows, schema: SCHEMA, process: stamped.processing, now: 1 });
    expect(result.rows).toEqual([{ title: "Same" }]);
    expect(result).not.toHaveProperty("state");
  });
});
