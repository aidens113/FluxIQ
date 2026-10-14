import { expect, it } from "vitest";
import { automationStudioProjectJsonShape as shape } from "../index.ts";

it("answers the first refusal with its path and rethrows anything else", () => {
  expect(shape.parse(() => shape.object({ a: 1, b: 2 }, "root", ["a"]))).toEqual({ status: "invalid", code: "project.unknown_field", path: "root.b" });
  expect(() => shape.parse(() => { throw new TypeError("bug"); })).toThrow("bug");
});

it("refuses symbols, accessors, non-finite numbers and cycles in JSON data", () => {
  expect(shape.parse(() => shape.object({ [Symbol("s")]: 1 }, "root", []))).toMatchObject({ code: "project.symbol_key" });
  expect(shape.parse(() => shape.json({ n: Number.NaN }, "root"))).toMatchObject({ code: "project.not_json", path: "root.n" });
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(shape.parse(() => shape.json(cycle, "root"))).toMatchObject({ code: "project.too_deep" });
});

it("keeps storage ids to names a file segment leaves unchanged", () => {
  expect(shape.parse(() => shape.storageId("b1.repair-2", "id"))).toEqual({ status: "valid", value: "b1.repair-2" });
  for (const bad of ["B1", "../b1", "", "a/b"]) expect(shape.parse(() => shape.storageId(bad, "id"))).toMatchObject({ code: "project.invalid_storage_id" });
});
