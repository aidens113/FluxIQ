// The type subset's parser: what it accepts, and that it refuses everything else with
// a reason at the right JSON Pointer.
import { describe, expect, it } from "vitest";
import { JSON_TYPE_SCHEMA_LIMITS, jsonTypeSchemaSchema, parseJsonTypeSchema } from "../index.ts";

const LISTINGS = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    listings: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1 },
          price: { type: "number", minimum: 0 },
          url: { type: "string", format: "uri" },
          seller: { type: ["string", "null"] },
          condition: { enum: ["new", "used"] },
          listedOn: { type: "string", format: "date" }
        },
        required: ["title", "price", "url"],
        additionalProperties: false
      }
    },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
    kind: { oneOf: [{ const: "a" }, { const: "b" }], description: "Which kind." }
  },
  required: ["listings"]
};

function codes(value: unknown): string[] {
  const parsed = parseJsonTypeSchema(value);
  return parsed.ok ? [] : parsed.issues.map((issue) => `${issue.path} ${issue.code}`);
}

describe("parseJsonTypeSchema", () => {
  it("accepts the whole subset and drops $schema at the root", () => {
    const parsed = parseJsonTypeSchema(LISTINGS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).not.toHaveProperty("$schema");
    expect(parsed.value.properties?.["listings"]?.items?.required).toEqual(["title", "price", "url"]);
  });

  it("accepts {} as any value", () => {
    expect(parseJsonTypeSchema({})).toEqual({ ok: true, value: {} });
  });

  it("refuses keywords outside the subset and says what to write instead", () => {
    const parsed = parseJsonTypeSchema({ type: "object", properties: { a: { type: "string", nullable: true, pattern: "^x" } } });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.map((issue) => issue.path)).toEqual(["/properties/a/nullable", "/properties/a/pattern"]);
    expect(parsed.issues[0]?.message).toContain('["string", "null"]');
    expect(parsed.issues.every((issue) => issue.code === "type_schema.unknown_keyword")).toBe(true);
  });

  it("refuses $ref, allOf, tuples and $schema below the root", () => {
    expect(codes({ $ref: "#/x" })).toEqual(["/$ref type_schema.unknown_keyword"]);
    expect(codes({ allOf: [{}] })).toEqual(["/allOf type_schema.unknown_keyword"]);
    expect(codes({ type: "array", items: [{}, {}] })).toEqual(["/items type_schema.unknown_keyword"]);
    expect(codes({ type: "object", properties: { a: { $schema: "x" } } })).toEqual(["/properties/a/$schema type_schema.unknown_keyword"]);
  });

  it("refuses a keyword whose kind the type does not name, or with no type", () => {
    expect(codes({ type: "number", minLength: 2 })).toEqual(["/minLength type_schema.keyword_type_mismatch"]);
    expect(codes({ minLength: 2 })).toEqual(["/minLength type_schema.keyword_needs_type"]);
    expect(codes({ type: "integer", minimum: 1 })).toEqual([]);
    expect(codes({ type: ["string", "null"], maxLength: 3 })).toEqual([]);
  });

  it("refuses bad types, formats, bounds and lists", () => {
    expect(codes({ type: "date" })).toEqual(["/type type_schema.bad_type"]);
    expect(codes({ type: ["string", "string"] })).toEqual(["/type/1 type_schema.duplicate"]);
    expect(codes({ type: [] })).toEqual(["/type type_schema.bad_type"]);
    expect(codes({ type: "string", format: "uuid" })).toEqual(["/format type_schema.unknown_format"]);
    expect(codes({ type: "string", minLength: 5, maxLength: 2 })).toEqual(["/minLength type_schema.empty_range"]);
    expect(codes({ type: "array", minItems: -1 })).toEqual(["/minItems type_schema.bad_value"]);
    expect(codes({ type: "number", maximum: Number.POSITIVE_INFINITY })).toEqual(["/maximum type_schema.bad_value"]);
    expect(codes({ enum: [] })).toEqual(["/enum type_schema.bad_value"]);
    expect(codes({ enum: [1, { a: 1 }, { a: 1 }] })).toEqual(["/enum/2 type_schema.duplicate"]);
    expect(codes({ anyOf: [] })).toEqual(["/anyOf type_schema.bad_value"]);
    expect(codes({ const: undefined })).toEqual(["/const type_schema.not_json"]);
  });

  it("refuses a required name that properties does not declare", () => {
    expect(codes({ type: "object", properties: { a: {} }, required: ["a", "b"] })).toEqual(["/required/1 type_schema.required_not_declared"]);
  });

  it("refuses a schema that is not a plain object, boolean schemas included", () => {
    expect(codes(true)).toEqual([" type_schema.not_object"]);
    expect(codes(["string"])).toEqual([" type_schema.not_object"]);
    expect(codes({ type: "object", additionalProperties: false })).toEqual([]);
  });

  it("escapes a property name in the pointer", () => {
    expect(codes({ type: "object", properties: { "a/b~c": { type: "nope" } } })).toEqual(["/properties/a~1b~0c/type type_schema.bad_type"]);
  });

  it("keeps a property named __proto__ as a property", () => {
    const parsed = parseJsonTypeSchema(JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string"}}}'));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Object.keys(parsed.value.properties ?? {})).toEqual(["__proto__"]);
  });

  it("refuses schemas nested past the depth limit", () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let depth = 0; depth <= JSON_TYPE_SCHEMA_LIMITS.maxDepth + 1; depth += 1) schema = { type: "array", items: schema };
    expect(codes(schema).some((issue) => issue.endsWith("type_schema.too_deep"))).toBe(true);
  });

  it("works inside a zod object, with pointers from the document's root", () => {
    const parsed = jsonTypeSchemaSchema.safeParse({ type: "object", properties: { a: { type: "x" } } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(["properties", "a", "type"]);
  });
});
