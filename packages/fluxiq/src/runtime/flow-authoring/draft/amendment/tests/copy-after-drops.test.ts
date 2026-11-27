// A step a decision keeps, or makes the result, is a copy only of a step that stands once the same decision's drops do
// (`../copy-after-drops.ts`, t1085). Live run `run-mwz29d50-c3a32a9c` (0058) sent "keep 18, result 18, drop 13" about
// two reads of one cart, and 0059 refused both edits on 18 as a second copy of 13, the step being dropped.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

type Step = AutomationStudioFlowDraftStep;

function read(position: number, disposition: Step["disposition"], extra: Partial<Step> = {}): Step {
  return {
    position, id: `d${position}`, iteration: position, actionId: "web.output.dom-extract_list", toolId: "core.run_node",
    input: { node: "web.output.dom-extract_list", parameters: { list: "cart" } },
    effect: "observe", effectApplied: true, proposes: true, reads: "list:cart", stateBefore: "s-cart", stateAfter: "s-cart", disposition, ...extra
  };
}

/** 0058 in small: the carried cart read 13, still the result, and the cart read 18 that worked, out of the Flow. */
function draft(): Step[] {
  return [read(13, "kept", { result: true }), read(18, "taken")];
}

describe("a keep or result beside a drop of the step it copies", () => {
  it("run mwz29d50 0058: keep 18, result 18, drop 13 all apply, and 18 is the Flow's result read", () => {
    const steps = draft();
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 18, change: "keep" }, { step: 18, change: "result" }, { step: 13, change: "drop" }]);
    expect(report).toEqual({ applied: 3, refused: [] });
    expect(steps[0]!.disposition).toBe("dropped");
    expect(steps[1]!.disposition).toBe("kept");
    expect(steps[1]!.result).toBe(true);
  });

  it("applies the same whatever order the decision names them in", () => {
    const steps = draft();
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 13, change: "drop" }, { step: 18, change: "keep" }, { step: 18, change: "result" }])).toEqual({ applied: 3, refused: [] });
    expect(steps.map((step) => step.disposition)).toEqual(["dropped", "kept"]);
  });

  it("still refuses the copy where the decision drops nothing, or drops another step", () => {
    const alone = draft();
    expect(applyAutomationStudioFlowDraftAmendments(alone, [{ step: 18, change: "keep" }]).refused).toEqual([{ step: 18, reason: "second_copy", copyOf: 13 }]);
    const other = [...draft(), read(20, "kept", { reads: "list:other" })];
    const report = applyAutomationStudioFlowDraftAmendments(other, [{ step: 18, change: "keep" }, { step: 20, change: "drop" }]);
    expect(report.refused).toEqual([{ step: 18, reason: "second_copy", copyOf: 13 }]);
    expect(other.map((step) => step.disposition)).toEqual(["kept", "taken", "dropped"]);
  });

  it("strikes the keep and result whole where a guard puts the drop back, so 18 stays out (atomic per step, t1069)", () => {
    // 13 is the step a repeat in the Flow ends its span on and runs while: its drop is put back (`../repeat-hold.ts`).
    const head: Step = { position: 12, id: "d12", iteration: 12, actionId: "web.output.dom-click", toolId: "core.run_node", input: { node: "web.output.dom-click", parameters: { target: { handle: "t1" } } }, effect: "mutate", effectApplied: true, proposes: true, stateBefore: "s-a", stateAfter: "s-cart", disposition: "kept", routing: { kind: "repeat", through: "d13", while: "d13" } };
    const steps = [head, ...draft()];
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 18, change: "keep" }, { step: 18, change: "result" }, { step: 13, change: "drop" }]);
    expect(report.applied).toBe(0);
    expect(report.refused).toContainEqual({ step: 18, reason: "second_copy", copyOf: 13 });
    expect(report.refused.map((entry) => entry.reason)).toContain("holds_a_repeat");
    expect(steps.map((step) => step.disposition)).toEqual(["kept", "kept", "taken"]);
    expect(steps[2]!.result).toBeUndefined();
  });
});
