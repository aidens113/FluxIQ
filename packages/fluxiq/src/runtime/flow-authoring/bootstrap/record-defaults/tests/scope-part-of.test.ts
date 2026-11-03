import { describe, expect, it } from "vitest";
import { authoringScopePartOf } from "../scope-part-of.ts";

describe("authoringScopePartOf", () => {
  it("names the one part that owes records, with its words as the label", () => {
    const resolver = authoringScopePartOf([{ id: "a", words: "  Find   the\nlistings " , columns: ["title", "price"] }, { id: "b", words: "Press accept" }]);
    expect(resolver?.("any-step")).toEqual({ id: "a", label: "Find the listings", columns: ["title", "price"] });
  });

  it("carries the row identity only when one is given", () => {
    expect(authoringScopePartOf([{ id: "a", columns: ["x"], rowIdentity: ["x"] }])?.("s")).toEqual({ id: "a", columns: ["x"], rowIdentity: ["x"] });
  });

  it("names none when no part or more than one part owes records", () => {
    expect(authoringScopePartOf([])).toBeUndefined();
    expect(authoringScopePartOf([{ id: "a", columns: [] }])).toBeUndefined();
    expect(authoringScopePartOf([{ id: "a", columns: ["x"] }, { id: "b", columns: ["y"] }])).toBeUndefined();
  });
});
