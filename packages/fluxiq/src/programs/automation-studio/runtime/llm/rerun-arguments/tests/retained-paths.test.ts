import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioLlmEvidenceRerunInput } from "../../evidence-loop/index.ts";
import { automationStudioRerunRetainedPaths } from "../index.ts";

const retained = (previous: JsonObject, patch: JsonObject) => automationStudioRerunRetainedPaths(previous, patch, automationStudioLlmEvidenceRerunInput(previous, patch));

describe("retained authored paths", () => {
  it("keeps depth authority when a node's parameters envelope is removed for display", () => {
    const old = { node: "example.read", parameters: { maxPages: 1, extractList: { paginate: { maxPages: 1 } } }, consequences: [], unrelatedOuter: true };
    for (const patch of [{ extractList: { paginate: { maxPages: 5 } } }, { parameters: { extractList: { paginate: { maxPages: 5 } } } }]) {
      expect(retained(old, patch)).toEqual({ paths: [["maxPages"]], parameters: true });
    }
  });
  it("does not list untouched outer objects or array members", () => {
    expect(retained({ untouched: { value: 1 }, listing: { bad: 2, rows: [{ hidden: true, name: "x" }] } }, { listing: { rows: [{ name: "x" }] } }).paths).toEqual([["listing", "bad"]]);
  });
  it("honors actual deletion, rename and old-kind removal instead of recreating the merge rules", () => {
    expect(retained({ field: { kind: "attribute", attribute: "title", bad: 1, name: "column", safe: 2 } }, { field: { kind: "text", bad: null, renamed: "column" } }).paths).toEqual([["field", "safe"]]);
  });
  it("does not silently truncate path count", () => {
    const keys = Object.fromEntries(Array.from({ length: 30 }, (_, n) => [`field${n}`, n]));
    expect(retained({ listing: keys }, { listing: {} }).paths).toHaveLength(30);
  });
});
