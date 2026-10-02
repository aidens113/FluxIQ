// A step in the Flow keeps the press that opened its page (`../opener.ts`).
// Lane A's run 40 (t174) pressed the store chip without adding it, added "Set
// as my store" from inside the chooser it opened, and the Flow failed on that
// button with the chooser closed.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment.ts";
import { automationStudioFlowDraftKeepOpeners } from "../opener.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

type Spec = { from: string; to: string; disposition?: AutomationStudioFlowDraftStep["disposition"]; look?: true };
const draft = (specs: Spec[]): AutomationStudioFlowDraftStep[] => specs.map((spec, index) => ({
  position: index + 1, iteration: index + 1, actionId: spec.look ? "look" : "press", input: { step: index + 1 },
  effect: spec.look ? "observe" as const : "mutate" as const, effectApplied: !spec.look, stateBefore: spec.from, stateAfter: spec.to,
  disposition: spec.disposition ?? "taken"
}));
const inFlow = (steps: AutomationStudioFlowDraftStep[]) => steps.filter((step) => step.disposition === "kept").map((step) => step.position);

describe("a step added to the Flow", () => {
  it("run 40: brings the chip press that opened the chooser it is inside", () => {
    // Start, Reject all, the store chip (taken), a look inside the chooser, "Set as my store".
    const steps = draft([
      { from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2", disposition: "kept" },
      { from: "s2", to: "s3" }, { from: "s3", to: "s3", look: true }, { from: "s3", to: "s4" }
    ]);
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 5, change: "add" }]);
    expect(inFlow(steps)).toEqual([1, 2, 3, 5]);
  });

  it("brings each press of a chain: the drawer, then the menu inside it", () => {
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2" }, { from: "s2", to: "s3" }, { from: "s3", to: "s4" }]);
    expect(automationStudioFlowDraftKeepOpeners(steps, steps[3]!).map((step) => step.position)).toEqual([3, 2]);
    expect(steps.map((step) => step.disposition)).toEqual(["kept", "kept", "kept", "taken"]);
  });

  it("run 40: brings the product link though the product page went on loading before the size was chosen", () => {
    // The search results, the product link (taken), the size on a product page whose digest grew after the press answered.
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2" }, { from: "s2", to: "s3" }, { from: "s3b", to: "s4" }]);
    expect(automationStudioFlowDraftKeepOpeners(steps, steps[3]!).map((step) => step.position)).toEqual([3, 2]);
  });

  it("brings no more than two presses back, however long the taken chain", () => {
    const steps = draft([{ from: "s0", to: "s1" }, { from: "s1", to: "s2" }, { from: "s2", to: "s3" }, { from: "s3", to: "s4" }, { from: "s4", to: "s5" }]);
    expect(automationStudioFlowDraftKeepOpeners(steps, steps[4]!).map((step) => step.position)).toEqual([4, 3]);
  });

  it("brings nothing when the page is back where the press started, when the press was dropped, or when the states were not seen", () => {
    const moved = draft([{ from: "s1", to: "s2" }, { from: "s1", to: "s3" }]);
    expect(automationStudioFlowDraftKeepOpeners(moved, moved[1]!)).toEqual([]);
    const dropped = draft([{ from: "s1", to: "s2", disposition: "dropped" }, { from: "s2", to: "s3" }]);
    expect(automationStudioFlowDraftKeepOpeners(dropped, dropped[1]!)).toEqual([]);
    const unseen = draft([{ from: "s1", to: "s2" }, { from: "s2", to: "s3" }]);
    delete unseen[1]!.stateBefore;
    expect(automationStudioFlowDraftKeepOpeners(unseen, unseen[1]!)).toEqual([]);
  });
});
