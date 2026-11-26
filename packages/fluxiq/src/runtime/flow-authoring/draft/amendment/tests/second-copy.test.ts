// An `add` or `keep` that would bring a second copy of a kept step into the
// Flow is refused before anything changes (`../apply.ts`, `../../second-copy.ts`).
// Live run `run-murwdp4f-35f976d2` (C9, 0046) sent `add 21 act a3` about a
// second press of step 18's 3-Pack link from the same results page, and it applied.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

type Step = AutomationStudioFlowDraftStep;

function press(n: number, target: string, before: string, after: string, disposition: Step["disposition"] = "kept"): Step {
  return {
    position: n, id: `d${n}`, iteration: n, actionId: "web.dom.click", toolId: "core.run_node",
    input: { node: "web.dom.click", parameters: { target: { handle: target } } },
    effect: "mutate", effectApplied: true, stateBefore: before, stateAfter: after, disposition
  };
}

/** C9 in small: the 3-Pack press (1), a search back to results (2, taken), the same press again (3, taken). */
function draft(): Step[] {
  return [press(1, "t1212", "s-results", "s-product"), { ...press(2, "t1378", "s-product", "s-results", "taken"), actionId: "web.dom.type" }, press(3, "t1212", "s-results", "s-product", "taken")];
}

describe("an amendment that would put a second copy of a kept step in the Flow", () => {
  it("run murwdp4f 0046: keep 3 act a3 is refused second_copy, naming step 1, and changes nothing", () => {
    {
      const steps = draft();
      const before = structuredClone(steps);
      const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "keep", act: "a3", settings: { timeoutMs: 5000 } }]);
      expect(report).toEqual({ applied: 0, refused: [{ step: 3, reason: "second_copy", copyOf: 1 }] });
      expect(steps).toEqual(before);
    }
  });

  it("leaves a step already in the Flow, and a press from another page, alone", () => {
    const kept = draft();
    kept[2]!.disposition = "kept";
    expect(applyAutomationStudioFlowDraftAmendments(kept, [{ step: 3, change: "keep", act: "a3" }])).toEqual({ applied: 1, refused: [] });
    const elsewhere = draft();
    elsewhere[2]!.stateBefore = "s-results-page-2";
    expect(applyAutomationStudioFlowDraftAmendments(elsewhere, [{ step: 3, change: "keep" }])).toEqual({ applied: 1, refused: [] });
    expect(elsewhere[2]!.disposition).toBe("kept");
  });
});
