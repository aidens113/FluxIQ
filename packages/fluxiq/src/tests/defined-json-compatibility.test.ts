import { expect, it } from "vitest";
import { compactDefinedJsonObject } from "../core/index.ts";
import { compactJsonObject } from "../programs/automation-studio/runtime/service/index.ts";

it("shares the original undefined-only implementation with the legacy service", () => {
  expect(compactJsonObject).toBe(compactDefinedJsonObject);
  const empty: unknown[] = [];
  const nested = { omitted: undefined };
  const original = { omitted: undefined, empty, nested, nil: null, zero: 0, no: false, text: "" };
  const prepared = compactDefinedJsonObject(original);
  expect(prepared).toEqual({ empty, nested, nil: null, zero: 0, no: false, text: "" });
  expect(prepared.empty).toBe(empty);
  expect(prepared.nested).toBe(nested);
  expect(Object.hasOwn(original, "omitted")).toBe(true);
  expect(Object.hasOwn(nested, "omitted")).toBe(true);
});
