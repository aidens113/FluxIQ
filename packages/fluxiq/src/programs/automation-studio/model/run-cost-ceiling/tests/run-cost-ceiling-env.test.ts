import { expect, it } from "vitest";
import * as legacy from "../index.ts";
import * as canonical from "../../../../../runtime/agents/budget/run-cost-ceiling/index.ts";

it("keeps every legacy runtime ceiling export as the same original framework object", () => {
  expect(Object.keys(legacy).sort()).toEqual(Object.keys(canonical).sort());
  for (const name of Object.keys(legacy) as (keyof typeof legacy)[]) expect(legacy[name]).toBe(canonical[name]);
});
