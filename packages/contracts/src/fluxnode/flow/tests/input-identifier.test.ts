import { expect, it } from "vitest";
import { FLOW_INPUT_IDENTIFIER, flowInputNames, flowInterfaceSchema } from "../index.ts";

it.each(["latest_date", "LatestDate", "_leading", "a".repeat(65), "constructor", "prototype", "__proto__", "item"])("accepts lexical identifier %s without changing its case", (name) => {
  expect(FLOW_INPUT_IDENTIFIER.test(name)).toBe(true);
});

it.each(["", "1name", "a.b", "a b", "a/b", "$state", "$step", "café"])("does not interpret nonidentifier schema key %s as an input path", (name) => {
  expect(FLOW_INPUT_IDENTIFIER.test(name)).toBe(false);
});

it("leaves arbitrary public schema properties and own prototype-looking names valid without mutation", () => {
  const names = ["", "a.b", "a b", "a/b", "constructor", "prototype", "__proto__"];
  const properties = Object.fromEntries(names.map((name) => [name, { type: "string" }]));
  const before = Object.getPrototypeOf(properties);
  const parsed = flowInterfaceSchema.safeParse({ inputs: { type: "object", properties } });
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw parsed.error;
  expect(flowInputNames(parsed.data.inputs)).toEqual(names);
  expect(Object.keys(properties)).toEqual(names);
  expect(Object.getPrototypeOf(properties)).toBe(before);
  expect(Object.hasOwn(parsed.data.inputs!.properties!, "__proto__")).toBe(true);
  expect(Object.getPrototypeOf(parsed.data.inputs!.properties!)).toBe(Object.prototype);
});
