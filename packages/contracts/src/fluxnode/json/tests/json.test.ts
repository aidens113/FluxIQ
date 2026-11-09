// The JSON helpers: what is JSON, equality, canonical text and pointers.
import { describe, expect, it } from "vitest";
import { canonicalJson, findNonJsonPart, formatJsonPointer, isJsonObject, isJsonValue, jsonEqual, jsonObjectSchema, jsonValueSchema } from "../index.ts";

describe("JSON values", () => {
  it("finds the first part that is not JSON", () => {
    expect(findNonJsonPart({ a: [1, "x", null, { b: true }] })).toBeNull();
    expect(findNonJsonPart({ a: [1, Number.POSITIVE_INFINITY] })).toEqual(["a", 1]);
    expect(findNonJsonPart([1, , 3])).toEqual([1]);
    expect(findNonJsonPart({ f: () => 1 })).toEqual(["f"]);
    expect(findNonJsonPart(new Map())).toEqual([]);
    expect(findNonJsonPart(10n)).toEqual([]);
    expect(isJsonValue(Object.create(null))).toBe(true);
  });

  it("accepts a value shared by two branches, which is not a cycle", () => {
    const shared = { x: 1 };
    expect(isJsonValue({ a: shared, b: shared })).toBe(true);
  });

  it("tells objects from other JSON", () => {
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject([1])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
  });

  it("works as zod schemas, at the failing step", () => {
    expect(jsonValueSchema.safeParse([1, "a"]).success).toBe(true);
    const parsed = jsonObjectSchema.safeParse({ a: { b: undefined } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(["a", "b"]);
    expect(jsonObjectSchema.safeParse([]).success).toBe(false);
  });
});

describe("jsonEqual and canonicalJson", () => {
  it("ignores key order and keeps array order", () => {
    expect(jsonEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
    expect(canonicalJson({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[3,{"e":2,"f":1}]},"b":1}');
  });

  it("formats JSON Pointers with escapes", () => {
    expect(formatJsonPointer([])).toBe("");
    expect(formatJsonPointer(["a/b", "c~d", 0])).toBe("/a~1b/c~0d/0");
  });
});
