// The canonical form of a type: sets in one order, meaning kept.
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../json/index.ts";
import { canonicalJsonTypeSchema, type JsonTypeSchema } from "../index.ts";

describe("canonicalJsonTypeSchema", () => {
  it("gives the same text for schemas that differ only in set order", () => {
    const left: JsonTypeSchema = { type: ["string", "null"], enum: ["b", "a", null], properties: { y: { type: "integer" }, x: {} }, required: ["y", "x"] };
    const right: JsonTypeSchema = { required: ["x", "y"], properties: { x: {}, y: { type: ["integer"] } }, enum: [null, "a", "b"], type: ["null", "string"] };
    expect(canonicalJson(canonicalJsonTypeSchema(left))).toBe(canonicalJson(canonicalJsonTypeSchema(right)));
  });

  it("orders anyOf by canonical text and keeps examples in their order", () => {
    const form = canonicalJsonTypeSchema({ anyOf: [{ type: "string" }, { type: "boolean" }], examples: [2, 1] });
    expect(form["anyOf"]).toEqual([{ type: "boolean" }, { type: "string" }]);
    expect(form["examples"]).toEqual([2, 1]);
  });

  it("changes when the meaning changes", () => {
    expect(canonicalJson(canonicalJsonTypeSchema({ type: "string", maxLength: 3 }))).not.toBe(canonicalJson(canonicalJsonTypeSchema({ type: "string", maxLength: 4 })));
  });
});
