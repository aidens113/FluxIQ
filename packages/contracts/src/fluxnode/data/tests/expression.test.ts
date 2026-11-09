// Declared expressions: every form, operator arity, and clear refusals.
import { describe, expect, it } from "vitest";
import { dataFieldPathSteps, parseDataExpression } from "../index.ts";

function codesOf(value: unknown): string[] {
  const parsed = parseDataExpression(value);
  return parsed.ok ? [] : parsed.issues.map((issue) => `${issue.path} ${issue.code}`);
}

describe("parseDataExpression", () => {
  it("accepts every form, nested", () => {
    const expression = {
      object: {
        title: { op: "trim", args: [{ field: "title" }] },
        cheap: { op: "and", args: [{ op: "lt", args: [{ field: "price" }, { input: "maxPrice" }] }, { op: "exists", args: [{ field: ["Price (USD)"] }] }] },
        tags: { list: [{ value: "deal" }, { op: "lower", args: [{ field: "seller.name" }] }] },
        rounded: { op: "round", args: [{ field: "items.0.price" }, { value: 2 }] }
      }
    };
    expect(parseDataExpression(expression)).toEqual({ ok: true, value: expression });
  });

  it("refuses unknown operators and wrong arity, at their pointers", () => {
    expect(codesOf({ op: "regex", args: [] })).toEqual(["/op expression.unknown_operator"]);
    expect(codesOf({ op: "not", args: [{ value: true }, { value: false }] })).toEqual(["/args expression.arity"]);
    expect(codesOf({ op: "if", args: [{ value: true }, { value: 1 }] })).toEqual(["/args expression.arity"]);
    expect(codesOf({ object: { a: { op: "eq", args: [{ field: "x" }, { nope: 1 }] } } })).toEqual(["/object/a/args/1 expression.bad_form"]);
  });

  it("refuses two forms, extra keys, bad field paths and non-JSON literals", () => {
    expect(codesOf({ field: "a", value: 1 })).toEqual([" expression.bad_form"]);
    expect(codesOf({ field: "a", note: "x" })).toEqual(["/note expression.unknown_key"]);
    expect(codesOf({ field: "a..b" })).toEqual(["/field expression.bad_field"]);
    expect(codesOf({ field: "0.a" })).toEqual(["/field expression.bad_field"]);
    expect(codesOf({ value: { a: undefined } })).toEqual(["/value/a expression.not_json"]);
    expect(codesOf("price")).toEqual([" expression.not_object"]);
  });
});

describe("dataFieldPathSteps", () => {
  it("splits dotted text into keys and indexes, and copies a list", () => {
    expect(dataFieldPathSteps("items.0.price")).toEqual(["items", 0, "price"]);
    expect(dataFieldPathSteps(["Price (USD)", 2])).toEqual(["Price (USD)", 2]);
  });
});
