// A host's account of what each of a read's conditions kept, read before it is
// carried onto the draft step (t693, `../condition-account.ts`). The examples
// are a library catalogue's, not a store's.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftConditionAccount } from "../index.ts";

const evidence = { rows: [{ title: "The Long Shore", status: "On loan" }, { title: "Tidewater", status: "Available" }], extraction: { conditions: { keptValues: [["On loan", "Available", "Reserved", "Lost"]] } } };

describe("a read's condition account", () => {
  it("carries the counts and the values the call's evidence shows, in order", () => {
    expect(automationStudioFlowDraftConditionAccount([{ kept: 2, rejected: 0, keptValues: ["On loan", "Available"] }, { kept: 1, rejected: 1 }], evidence))
      .toEqual([{ kept: 2, rejected: 0, keptValues: ["On loan", "Available"] }, { kept: 1, rejected: 1, keptValues: [] }]);
  });

  it("withholds a value the evidence never showed or that is not plain, and carries at most three", () => {
    expect(automationStudioFlowDraftConditionAccount([{ kept: 2, rejected: 0, keptValues: ["Withdrawn", "<b>On loan</b>", "Available"] }], evidence))
      .toEqual([{ kept: 2, rejected: 0, keptValues: ["Available"] }]);
    expect(automationStudioFlowDraftConditionAccount([{ kept: 4, rejected: 0, keptValues: ["On loan", "Available", "Reserved", "Lost"] }], evidence)?.[0]?.keptValues)
      .toEqual(["On loan", "Available", "Reserved"]);
  });

  it("is withheld whole when any entry is not one, so no condition is renumbered", () => {
    for (const value of [
      [{ kept: 2, rejected: 0 }, { kept: -1, rejected: 0 }],
      [{ kept: 2, rejected: 0 }, { kept: 2, rejected: 0, label: "status" }],
      [{ kept: 2, rejected: 0, keptValues: [7] }],
      [{ kept: 2.5, rejected: 0 }],
      [],
      "kept all",
      undefined
    ]) expect(automationStudioFlowDraftConditionAccount(value, evidence), JSON.stringify(value)).toBeUndefined();
  });
});
