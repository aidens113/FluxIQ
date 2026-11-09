// The validator: every error, each at its JSON Pointer, with JSON Schema's meaning.
import { describe, expect, it } from "vitest";
import { parseJsonTypeSchema, validateJsonValue, type JsonTypeSchema } from "../index.ts";

function schemaOf(value: unknown): JsonTypeSchema {
  const parsed = parseJsonTypeSchema(value);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.value;
}

const LISTINGS = schemaOf({
  type: "object",
  properties: {
    listings: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: { title: { type: "string", minLength: 1 }, price: { type: "number", minimum: 0 }, url: { type: "string", format: "uri" }, count: { type: "integer" } },
        required: ["title", "price", "url"],
        additionalProperties: false
      }
    }
  },
  required: ["listings"]
});

function errorsOf(schema: JsonTypeSchema, value: unknown): string[] {
  return validateJsonValue(schema, value).map((error) => `${error.path} ${error.code}`);
}

describe("validateJsonValue", () => {
  it("passes a value that fits", () => {
    expect(validateJsonValue(LISTINGS, { listings: [{ title: "Lens hood", price: 4.5, url: "https://market.example/1", count: 2 }] })).toEqual([]);
  });

  it("returns every error, each at its own pointer", () => {
    const value = {
      listings: [
        { title: "", price: -1, url: "not a uri" },
        { price: "3", url: "https://x.example", extra: true, count: 1.5 }
      ]
    };
    expect(errorsOf(LISTINGS, value)).toEqual([
      "/listings/0/title min_length",
      "/listings/0/price minimum",
      "/listings/0/url format",
      "/listings/1/title required",
      "/listings/1/price type",
      "/listings/1/extra additional_property",
      "/listings/1/count type"
    ]);
  });

  it("reports a missing root field and too many items", () => {
    expect(errorsOf(LISTINGS, {})).toEqual(["/listings required"]);
    const item = { title: "a", price: 1, url: "https://a.example" };
    expect(errorsOf(LISTINGS, { listings: [item, item, item, item] })).toEqual(["/listings max_items"]);
  });

  it("treats an integer as a number, and a fraction as not an integer", () => {
    expect(errorsOf(schemaOf({ type: "number" }), 3)).toEqual([]);
    expect(errorsOf(schemaOf({ type: "integer" }), 3.5)).toEqual([" type"]);
    expect(errorsOf(schemaOf({ type: "integer" }), 3.0)).toEqual([]);
  });

  it("checks nullable types, enum and const by deep equality", () => {
    const schema = schemaOf({ type: ["string", "null"] });
    expect(errorsOf(schema, null)).toEqual([]);
    expect(errorsOf(schema, 1)).toEqual([" type"]);
    expect(errorsOf(schemaOf({ enum: [{ a: 1, b: 2 }, "x"] }), { b: 2, a: 1 })).toEqual([]);
    expect(errorsOf(schemaOf({ enum: ["x"] }), "y")).toEqual([" enum"]);
    expect(errorsOf(schemaOf({ const: [1, 2] }), [2, 1])).toEqual([" const"]);
  });

  it("checks anyOf and oneOf as one error each", () => {
    const anyOf = schemaOf({ anyOf: [{ type: "string" }, { type: "integer" }] });
    expect(errorsOf(anyOf, 1)).toEqual([]);
    expect(errorsOf(anyOf, true)).toEqual([" any_of"]);
    const oneOf = schemaOf({ oneOf: [{ type: "number" }, { type: "integer" }] });
    expect(errorsOf(oneOf, 1.5)).toEqual([]);
    expect(errorsOf(oneOf, 2)).toEqual([" one_of_many"]);
    expect(errorsOf(oneOf, "x")).toEqual([" one_of_none"]);
  });

  it("allows extra keys unless additionalProperties says otherwise, and types them when it is a schema", () => {
    expect(errorsOf(schemaOf({ type: "object" }), { a: 1 })).toEqual([]);
    expect(errorsOf(schemaOf({ type: "object", additionalProperties: { type: "string" } }), { a: 1, b: "x" })).toEqual(["/a type"]);
  });

  it("counts string length in code points", () => {
    expect(errorsOf(schemaOf({ type: "string", maxLength: 1 }), "😀")).toEqual([]);
  });

  it("refuses a value that is not JSON at the part that is not", () => {
    expect(errorsOf(schemaOf({}), { a: [1, Number.NaN] })).toEqual(["/a/1 not_json"]);
    expect(errorsOf(schemaOf({}), { a: undefined })).toEqual(["/a not_json"]);
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(errorsOf(schemaOf({}), cyclic)).toEqual(["/self not_json"]);
    expect(errorsOf(schemaOf({}), new Date())).toEqual([" not_json"]);
  });
});
