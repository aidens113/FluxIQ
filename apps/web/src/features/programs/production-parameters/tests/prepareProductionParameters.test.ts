import { describe, expect, it } from "vitest";
import { prepareProductionParameters as prepare } from "../prepareProductionParameters";
const schema = (field: unknown, extra = {}) => ({ properties: { value: field }, ...extra });
describe("Production parameter UI policy", () => {
  it("distinguishes absent declaration from malformed declarations", () => {
    expect(prepare(undefined)).toMatchObject({ valid: true, metadata: {}, fields: [] });
    for (const value of [null, true, [], {}, { type: "array", properties: {} }, { properties: [] }]) expect(prepare(value).valid).toBe(false);
  });
  it("preserves primitive legacy inference and valid false/zero defaults", () => {
    expect(prepare({ properties: { text: {}, enabled: { type: "boolean", default: false }, count: { type: "integer", default: 0 } } }).metadata).toEqual({ text: "", enabled: false, count: 0 });
  });
  it.each(["invalid", "Infinity", "NaN", "1e999"])("rejects numeric text %s", (value) => {
    expect(prepare(schema({ type: "number" }), { value }).issues).toEqual([{ field: "value", message: "Enter a finite number." }]);
  });
  it.each(["", " ", "\t"])("omits explicit optional numeric blank %j without using a default", (value) => {
    expect(prepare(schema({ type: "number", default: 3 }), { value })).toMatchObject({ valid: true, metadata: {} });
  });
  it.each(["0", "-2", "1.5", "1e2"])("preserves finite numeric %s", (value) => {
    expect(prepare(schema({ type: "number" }), { value }).metadata).toEqual({ value: Number(value) });
  });
  it.each(["1.5", "9007199254740992", "-9007199254740992"])("rejects fractional/unsafe integer %s", (value) => {
    expect(prepare(schema({ type: "integer" }), { value }).valid).toBe(false);
  });
  it("requires nonblank strings/numbers and does not invent optional numeric zero", () => {
    expect(prepare(schema({ type: "number" })).metadata).toEqual({});
    for (const type of ["string", "number", "integer"]) expect(prepare(schema({ type }, { required: ["value"] }), { value: " " }).valid).toBe(false);
    expect(prepare(schema({ type: "boolean" }, { required: ["value"] })).metadata).toEqual({ value: false });
    expect(prepare(schema({ type: "string" }, { required: ["value"] }), { value: " x " }).metadata).toEqual({ value: " x " });
  });
  it("handles enum absence, explicit empty string, defaults and typed primitives", () => {
    expect(prepare(schema({ enum: ["", "a"] })).metadata).toEqual({});
    expect(prepare(schema({ enum: ["", "a"] }), { value: "" }).metadata).toEqual({ value: "" });
    expect(prepare(schema({ enum: ["a", "b"], default: "b" })).metadata).toEqual({ value: "b" });
    expect(prepare(schema({ type: "number", enum: [1, 2] }), { value: "2" }).metadata).toEqual({ value: 2 });
    expect(prepare(schema({ type: "boolean", enum: [false, true] }), { value: "false" }).metadata).toEqual({ value: false });
    expect(prepare(schema({ enum: ["a"] }), { value: "b" }).valid).toBe(false);
    expect(prepare(schema({ enum: ["a"] }, { required: ["value"] })).valid).toBe(false);
  });
  it("enforces inclusive bounds without clamping", () => {
    const declaration = schema({ type: "number", minimum: 1, maximum: 2 });
    for (const value of ["1", "2"]) expect(prepare(declaration, { value }).valid).toBe(true);
    for (const value of ["0", "3"]) expect(prepare(declaration, { value }).valid).toBe(false);
  });
  it.each([
    { type: "object" }, { type: "array" }, { type: ["number", "null"] }, null, [],
    { type: "boolean", default: "false" }, { type: "number", default: Infinity },
    { type: "integer", default: 1.2 }, { type: "string", default: {} },
    { type: "number", minimum: "1" }, { type: "number", minimum: 2, maximum: 1 },
    { type: "integer", minimum: 0.2, maximum: 0.8 }, { type: "integer", minimum: 1e30 },
    { type: "string", minimum: 1 }, { type: "number", default: 3, maximum: 2 },
    { type: "number", enum: ["1"] }, { type: "integer", enum: [1.5] },
    { enum: [] }, { enum: ["a"], default: "b" }, { enum: ["a"], pattern: "." },
    { type: "number", enum: [1], minimum: 2 }, { type: "string", anyOf: [] }
  ])("blocks malformed/unsupported field %j", (field) => { expect(prepare(schema(field)).valid).toBe(false); });
  it("blocks unknown assertions and malformed required names at schema scope", () => {
    for (const extra of [{ additionalProperties: false }, { $schema: "unknown" }, { allOf: [] }, { required: "value" }, { required: ["missing"] }]) expect(prepare(schema({}, extra)).valid).toBe(false);
  });
  it("allows only harmless annotations while using string titles", () => {
    const annotations = { title: "Friendly", description: "Description", examples: ["a"], $comment: "Comment", readOnly: true, writeOnly: true, deprecated: true };
    expect(prepare(schema({ ...annotations }, annotations))).toMatchObject({ valid: true, fields: [{ label: "Friendly" }] });
    expect(prepare(schema({ title: 2 })).fields[0]?.label).toBe("value");
    for (const keyword of ["format", "maxLength", "minimumLength", "exclusiveMinimum", "multipleOf", "items", "properties", "$ref", "oneOf", "not"]) expect(prepare(schema({ [keyword]: 1 })).valid).toBe(false);
  });
  it("accepts30 but blocks31 fields with an explicit limit", () => {
    const properties = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [String(index), {}]));
    expect(prepare({ properties }).fields).toHaveLength(30);
    expect(prepare({ properties: { ...properties, extra: {} } })).toMatchObject({ valid: false, issues: [{ message: expect.stringContaining("30 fields") }] });
  });
  it("reads own draft properties and builds prototype-like keys safely without mutation", () => {
    const properties = JSON.parse('{"__proto__":{"default":"safe"},"constructor":{},"toString":{}}');
    const values = Object.create({ constructor: "inherited", toString: "inherited" });
    const result = prepare({ properties }, values);
    expect(Object.keys(result.metadata)).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.getOwnPropertyDescriptor(result.metadata, "__proto__")?.value).toBe("safe");
    expect(result.metadata.constructor).toBe(""); expect(Object.getPrototypeOf(result.metadata)).toBe(Object.prototype);
    expect(Object.keys(values)).toEqual([]);
  });
  it("revalidates retained edits and excludes removed fields", () => {
    const values = { value: "3", removed: "private" };
    expect(prepare(schema({ type: "number", maximum: 2 }), values).valid).toBe(false);
    expect(prepare(schema({ type: "number", maximum: 4 }), values).metadata).toEqual({ value: 3 });
    expect(values).toEqual({ value: "3", removed: "private" });
  });
});
