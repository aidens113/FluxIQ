import type { JsonValue } from "../../../../../../core/index.ts";
import { describe, expect, it } from "vitest";
import { automationStudioStoredListItems } from "../stored-list-items.ts";

describe("automationStudioStoredListItems", () => {
  it("returns a plain list as it is", () => {
    expect(automationStudioStoredListItems(["a", 2])).toEqual(["a", 2]);
  });
  it("returns the items of a { count, items } list that kept every item", () => {
    expect(automationStudioStoredListItems({ count: 2, items: ["a", "b"] })).toEqual(["a", "b"]);
    expect(automationStudioStoredListItems({ count: 0 })).toEqual([]);
  });
  it("returns undefined where the screen dropped an item", () => {
    expect(automationStudioStoredListItems({ count: 3, items: ["a", "b"] })).toBeUndefined();
  });
  it("returns undefined for a record with extra keys", () => {
    expect(automationStudioStoredListItems({ count: 1, items: ["a"], note: "x" })).toBeUndefined();
  });
  it("returns undefined for anything that is not a list", () => {
    for (const value of ["a", 3, true, null, undefined, { other: 1 }, { count: "1", items: ["a"] }, { count: 1, items: "a" }]) {
      expect(automationStudioStoredListItems(value as JsonValue)).toBeUndefined();
    }
  });
});
