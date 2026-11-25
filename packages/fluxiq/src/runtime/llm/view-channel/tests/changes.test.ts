// Change lines between two views of a page, by key, git-style (page-diff P-b).
import { describe, expect, it } from "vitest";
import { automationStudioLlmPageChanges, automationStudioLlmPageParts, type AutomationStudioLlmPageLine } from "../index.ts";

const view = (...pairs: Array<[string, string]>): AutomationStudioLlmPageLine[] => pairs.map(([key, text]) => ({ key, text }));

describe("page changes", () => {
  it("is empty when every key reads the same in the same order", () => {
    const same = view(["a", "A"], ["b", "B"]);
    expect(automationStudioLlmPageChanges(same, structuredClone(same))).toEqual([]);
  });

  it("opens each group with the unchanged line before it, and a group at the top with none", () => {
    const before = view(["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"], ["e", "E"]);
    const after = view(["z", "Z"], ["a", "A"], ["b", "B2"], ["c", "C"], ["e", "E"], ["f", "F"]);
    expect(automationStudioLlmPageChanges(before, after)).toEqual(["+ Z", "  A", "~ B2", "  C", "- D", "  E", "+ F"]);
  });

  it("tells a line moved out of order as leaving where it was and arriving where it is, matching by key and never by text", () => {
    const before = view(["a", "same"], ["b", "B"], ["c", "C"]);
    const after = view(["b", "B"], ["c", "C"], ["a", "same"], ["x", "same"]);
    expect(automationStudioLlmPageChanges(before, after)).toEqual(["- same", "  C", "+ same", "+ same"]);
  });
});

describe("page parts", () => {
  it("keeps lines whole and in order, each part within the budget, and a line longer than the budget alone", () => {
    expect(automationStudioLlmPageParts(["aaaa", "bbbb", "cccc"], 9)).toEqual([["aaaa", "bbbb"], ["cccc"]]);
    expect(automationStudioLlmPageParts(["a", "x".repeat(20), "b"], 9)).toEqual([["a"], ["x".repeat(20)], ["b"]]);
    expect(automationStudioLlmPageParts([], 9)).toEqual([[]]);
  });
});
