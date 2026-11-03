import path from "node:path";
import { expect, it } from "vitest";
import { CanonicalAuthorityValidation as V } from "../validation.ts";

it("rejects accessor/symbol/unknown options before executing getters", () => {
  let called = false; const input = { get projectRootDir() { called = true; return "ignored"; }, projectDatabaseRootDir: "ignored" };
  expect(() => V.options(input)).toThrow("accessor"); expect(called).toBe(false);
  expect(() => V.options({ projectRootDir: path.resolve("projects"), projectDatabaseRootDir: path.resolve("."), unknown: true } as never)).toThrow();
  expect(() => V.clone({ [Symbol("hidden")]: true })).toThrow();
});
it("freezes actual JSON and hashes contents independent of key order", () => {
  const actual = { nodes: [{ id: "one" }] }; const copy = V.clone(actual); actual.nodes[0]!.id = "foreign";
  expect(copy.nodes[0]!.id).toBe("one"); expect(Object.isFrozen(copy.nodes[0])).toBe(true);
  expect(V.digest({ a: 1, b: 2 })).toBe(V.digest({ b: 2, a: 1 }));
  expect(() => V.clone([, "one"])).toThrow();
});
