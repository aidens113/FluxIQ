import { parseDataExpression, type DataExpression } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { evaluateExpression } from "../evaluate-expression.ts";

function parse(source: unknown): DataExpression {
  const parsed = parseDataExpression(source);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.value;
}

function run(source: unknown, record: JsonValue = {}, inputs: Record<string, JsonValue> = {}): JsonValue {
  return evaluateExpression(parse(source), { record, inputs });
}

describe("evaluateExpression", () => {
  it("reads fields, inputs and literals, and gives null for a missing field", () => {
    expect(run({ field: "seller.name" }, { seller: { name: "Ann" } })).toBe("Ann");
    expect(run({ field: "items.1.price" }, { items: [{ price: 1 }, { price: 2 }] })).toBe(2);
    expect(run({ field: "items.1" }, { items: [1, 2] })).toBe(2);
    expect(run({ field: "missing.deep" }, {})).toBe(null);
    expect(run({ input: "limit" }, {}, { limit: 5 })).toBe(5);
    expect(run({ value: [1, "a"] })).toEqual([1, "a"]);
    expect(run({ field: ["Price (USD)"] }, { "Price (USD)": 9 })).toBe(9);
  });

  it("compares numbers and text, and a mismatch of kinds is false", () => {
    expect(run({ op: "gt", args: [{ field: "n" }, { value: 3 }] }, { n: 4 })).toBe(true);
    expect(run({ op: "lte", args: [{ value: "a" }, { value: "b" }] })).toBe(true);
    expect(run({ op: "gt", args: [{ value: "10" }, { value: 3 }] })).toBe(false);
    expect(run({ op: "eq", args: [{ value: { a: 1, b: 2 } }, { value: { b: 2, a: 1 } }] })).toBe(true);
    expect(run({ op: "in", args: [{ value: 2 }, { list: [{ value: 1 }, { value: 2 }] }] })).toBe(true);
  });

  it("evaluates if and coalesce lazily", () => {
    const poison = { op: "div", args: [{ value: 1 }, { value: 0 }] };
    expect(run({ op: "if", args: [{ value: true }, { value: "yes" }, poison] })).toBe("yes");
    expect(run({ op: "coalesce", args: [{ field: "a" }, { value: "fallback" }, poison] }, {})).toBe("fallback");
    expect(run({ op: "and", args: [{ value: 1 }, { value: "x" }] })).toBe(true);
    expect(run({ op: "or", args: [{ value: 0 }, { value: null }] })).toBe(false);
  });

  it("works on text and numbers, giving null where the values cannot be used", () => {
    expect(run({ op: "concat", args: [{ value: "a" }, { value: 1 }, { value: null }] })).toBe("a1");
    expect(run({ op: "upper", args: [{ value: "ab" }] })).toBe("AB");
    expect(run({ op: "upper", args: [{ value: 3 }] })).toBe(null);
    expect(run({ op: "add", args: [{ value: 1 }, { value: 2 }, { value: 3 }] })).toBe(6);
    expect(run({ op: "div", args: [{ value: 1 }, { value: 0 }] })).toBe(null);
    expect(run({ op: "round", args: [{ value: 2.456 }, { value: 2 }] })).toBe(2.46);
    expect(run({ op: "to_number", args: [{ value: " 12.5 " }] })).toBe(12.5);
    expect(run({ op: "to_number", args: [{ value: "12 USD" }] })).toBe(null);
    expect(run({ op: "length", args: [{ value: "héllo" }] })).toBe(5);
    expect(run({ op: "contains", args: [{ value: "hello" }, { value: "ell" }] })).toBe(true);
    expect(run({ op: "exists", args: [{ field: "x" }] }, { x: 0 })).toBe(true);
  });

  it("builds objects and lists", () => {
    expect(run({ object: { total: { op: "mul", args: [{ field: "q" }, { field: "p" }] }, tags: { list: [{ value: "a" }] } } }, { q: 2, p: 3 })).toEqual({ total: 6, tags: ["a"] });
  });
});
