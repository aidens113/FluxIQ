import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  validateAutomationStudioRecords,
  type AutomationStudioRecordField,
  type AutomationStudioRecordSchema
} from "../index.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string", required: true },
    { id: "price", label: "Price", valueType: "number" },
    { id: "session", label: "Session", valueType: "string", handling: "exclude" },
    { id: "link", label: "Link", valueType: "url" },
    { id: "card", label: "Card", valueType: "string", handling: "encrypt" },
    { id: "listed", label: "Listed", valueType: "datetime" },
    { id: "details", label: "Details", valueType: "json" },
    { id: "in_stock", label: "In stock", valueType: "boolean", handling: "include" }
  ]
};

function single(field: Omit<AutomationStudioRecordField, "id" | "label">): AutomationStudioRecordSchema {
  return { schemaVersion: "0.1", fields: [{ id: "v", label: "V", ...field }] };
}

function accepts(field: Omit<AutomationStudioRecordField, "id" | "label">, value: unknown): unknown {
  const result = validateAutomationStudioRecords([{ v: value }], single(field));
  return result.rows.length === 1 ? result.rows[0]?.v : "INVALID";
}

function nestedArrays(levels: number): unknown {
  let value: unknown = 1;
  for (let index = 0; index < levels; index += 1) value = [value];
  return value;
}

describe("validateAutomationStudioRecords", () => {
  it("copies only include fields, in schema order, dropping exclude, encrypt, and unknown keys", () => {
    const row = { sneaky: "x", in_stock: true, details: { a: [1, "two"] }, listed: "2026-09-15T10:00:00Z", card: "4111", link: "https://example.com/p/1", session: "secret-cookie", price: 9.5, title: "Lamp" };
    const result = validateAutomationStudioRecords([row], SCHEMA);
    expect(result).toEqual({
      rows: [{ title: "Lamp", price: 9.5, link: "https://example.com/p/1", listed: "2026-09-15T10:00:00Z", details: { a: [1, "two"] }, in_stock: true }],
      invalidCount: 0,
      truncated: false,
      issues: []
    });
    const kept = result.rows[0]!;
    expect(Object.keys(kept)).toEqual(["title", "price", "link", "listed", "details", "in_stock"]);
    expect(kept).not.toHaveProperty("session");
    expect(kept).not.toHaveProperty("card");
    expect(kept).not.toHaveProperty("sneaky");
    expect(kept).not.toBe(row);
    expect(kept.details).not.toBe(row.details);
  });

  it("coerces or rejects each value type", () => {
    expect(accepts({ valueType: "string" }, "text")).toBe("text");
    expect(accepts({ valueType: "string" }, 5)).toBe("5");
    expect(accepts({ valueType: "string" }, false)).toBe("false");
    expect(accepts({ valueType: "string" }, { a: 1 })).toBe("INVALID");
    expect(accepts({ valueType: "string" }, Number.NaN)).toBe("INVALID");

    expect(accepts({ valueType: "number" }, -1.5)).toBe(-1.5);
    expect(accepts({ valueType: "number" }, "1.5")).toBe("INVALID");
    expect(accepts({ valueType: "number" }, Number.POSITIVE_INFINITY)).toBe("INVALID");
    expect(accepts({ valueType: "number" }, Number.NaN)).toBe("INVALID");

    expect(accepts({ valueType: "boolean" }, false)).toBe(false);
    expect(accepts({ valueType: "boolean" }, "true")).toBe("INVALID");
    expect(accepts({ valueType: "boolean" }, 0)).toBe("INVALID");

    expect(accepts({ valueType: "url" }, "https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(accepts({ valueType: "url" }, "http://localhost:3000")).toBe("http://localhost:3000");
    expect(accepts({ valueType: "url" }, "javascript:alert(1)")).toBe("INVALID");
    expect(accepts({ valueType: "url" }, "ftp://example.com")).toBe("INVALID");
    expect(accepts({ valueType: "url" }, "/relative/path")).toBe("INVALID");
    expect(accepts({ valueType: "url" }, 42)).toBe("INVALID");

    expect(accepts({ valueType: "datetime" }, "2026-09-15T10:00:00Z")).toBe("2026-09-15T10:00:00Z");
    expect(accepts({ valueType: "datetime" }, "not a date")).toBe("INVALID");
    expect(accepts({ valueType: "datetime" }, 1_789_000_000_000)).toBe("INVALID");

    expect(accepts({ valueType: "json" }, [1, { b: null }])).toEqual([1, { b: null }]);
    expect(accepts({ valueType: "json" }, "plain")).toBe("plain");
    expect(accepts({ valueType: "json" }, new Date())).toBe("INVALID");
    expect(accepts({ valueType: "json" }, { a: Number.NaN })).toBe("INVALID");
    expect(accepts({ valueType: "json" }, { a: undefined })).toBe("INVALID");
    expect(accepts({ valueType: "json" }, nestedArrays(AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.jsonCellMaxDepth))).toEqual(nestedArrays(AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.jsonCellMaxDepth));
    expect(accepts({ valueType: "json" }, nestedArrays(AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.jsonCellMaxDepth + 1))).toBe("INVALID");
  });

  it("keeps an own __proto__ key of a json cell as data, never as a prototype", () => {
    const row = JSON.parse("{\"title\":\"x\",\"details\":{\"__proto__\":{\"polluted\":true}}}") as unknown;
    const result = validateAutomationStudioRecords([row], SCHEMA);
    const details = result.rows[0]?.details as Record<string, unknown>;
    expect(Object.getPrototypeOf(details)).toBe(Object.prototype);
    expect(Object.hasOwn(details, "__proto__")).toBe(true);
    expect((details as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it("counts a row with a missing required field as invalid and omits absent optional fields", () => {
    const result = validateAutomationStudioRecords([{ price: 1 }, { title: null }, { title: "ok", price: null, link: undefined }], SCHEMA);
    expect(result.rows).toEqual([{ title: "ok" }]);
    expect(result.invalidCount).toBe(2);
    expect(result.issues).toEqual(["records.required_missing"]);
  });

  it("counts non-object and wrong-typed rows as invalid without listing their values", () => {
    const result = validateAutomationStudioRecords(["row", ["title"], null, new (class Row { title = "x"; })(), { title: "Lamp", price: "secret-price" }], SCHEMA);
    expect(result.rows).toEqual([]);
    expect(result.invalidCount).toBe(5);
    expect(result.issues).toEqual(["records.row_not_object", "records.invalid_value"]);
    expect(JSON.stringify(result.issues)).not.toContain("secret-price");
  });

  it("passes a row of exactly 64 KiB and rejects one byte more, measured in UTF-8 bytes", () => {
    const limit = AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.rowMaxBytes;
    expect(limit).toBe(65_536);
    const schema = single({ valueType: "string" });
    const overhead = JSON.stringify({ v: "" }).length;
    const exact = `${"é".repeat(1_000)}${"x".repeat(limit - overhead - 2_000)}`;
    expect(new TextEncoder().encode(JSON.stringify({ v: exact })).byteLength).toBe(limit);

    const passing = validateAutomationStudioRecords([{ v: exact }], schema);
    expect(passing.rows).toHaveLength(1);
    expect(passing.invalidCount).toBe(0);

    const over = validateAutomationStudioRecords([{ v: `${exact}x` }], schema);
    expect(over.rows).toEqual([]);
    expect(over.invalidCount).toBe(1);
    expect(over.issues).toEqual(["records.row_too_large"]);
  });

  it("keeps N rows at maxRecords N and truncates at N+1", () => {
    const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ title: `t${index}` }));
    const atLimit = validateAutomationStudioRecords(rows(3), SCHEMA, { maxRecords: 3 });
    expect(atLimit.rows).toHaveLength(3);
    expect(atLimit.truncated).toBe(false);
    const overLimit = validateAutomationStudioRecords(rows(4), SCHEMA, { maxRecords: 3 });
    expect(overLimit.rows).toEqual(rows(3));
    expect(overLimit.truncated).toBe(true);
    expect(overLimit.invalidCount).toBe(0);

    const { maxRecordsDefault } = AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS;
    expect(validateAutomationStudioRecords(rows(maxRecordsDefault), SCHEMA, { maxRecords: undefined }).truncated).toBe(false);
    const overDefault = validateAutomationStudioRecords(rows(maxRecordsDefault + 1), SCHEMA);
    expect(overDefault.truncated).toBe(true);
    expect(overDefault.rows).toHaveLength(maxRecordsDefault);
  });

  it("returns an issue for a non-array input or an invalid maxRecords", () => {
    for (const input of [undefined, null, "rows", { 0: { title: "x" }, length: 1 }]) {
      expect(validateAutomationStudioRecords(input, SCHEMA)).toEqual({ rows: [], invalidCount: 0, truncated: false, issues: ["records.not_array"] });
    }
    for (const maxRecords of [0, 1.5, AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling + 1]) {
      expect(validateAutomationStudioRecords([{ title: "x" }], SCHEMA, { maxRecords }).issues).toEqual(["records.invalid_max_records"]);
    }
  });

  it("counts a hostile row as invalid instead of throwing", () => {
    const hostile = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error("boom"); } });
    const result = validateAutomationStudioRecords([hostile, { title: "ok" }], SCHEMA);
    expect(result.rows).toEqual([{ title: "ok" }]);
    expect(result.invalidCount).toBe(1);
    expect(result.issues).toEqual(["records.invalid_row"]);
  });
});
