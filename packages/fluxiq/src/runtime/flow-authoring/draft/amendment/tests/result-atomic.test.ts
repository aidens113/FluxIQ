// One decision's edits apply all or none (t1068). Live run `run-mwy3btww-31d32e0d` (0144) sent
// `36 keep` and `36 result`: the keep was refused as a second copy of step 13, the result was
// applied anyway, and the result went from 2 rows to 0.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

type Step = AutomationStudioFlowDraftStep;

function read(position: number, disposition: Step["disposition"], extra: Partial<Step> = {}): Step {
  return {
    position, id: `d${position}`, iteration: position, actionId: "web.output.dom-extract_list", toolId: "core.run_node",
    input: { node: "web.output.dom-extract_list", parameters: { list: "cart" } },
    effect: "observe", effectApplied: true, proposes: true, reads: "list.cart", stateBefore: "s-cart", stateAfter: "s-cart", disposition, ...extra
  };
}

/** 0144 in small: step 13 is the result read; step 36 reads the same cart again and is out of the Flow. */
function draft(): Step[] {
  return [read(13, "kept", { result: true }), read(36, "taken")];
}

describe("an amendment that is refused in part", () => {
  it("run mwy3btww 0144: keep 36 and result 36 change nothing, and the result stays at step 13", () => {
    const steps = draft();
    const before = structuredClone(steps);
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 36, change: "keep" }, { step: 36, change: "result" }]);
    expect(report.applied).toBe(0);
    expect(report.refused).toEqual([{ step: 36, reason: "second_copy", copyOf: 13 }, { step: 36, reason: "second_copy", copyOf: 13 }]);
    expect(steps).toEqual(before);
    expect(steps[0]!.result).toBe(true);
    expect(steps[1]!.result).toBeUndefined();
  });

  it("applies a good edit that stands beside a refused one nowhere", () => {
    const steps = draft();
    steps.push(read(40, "kept"));
    const before = structuredClone(steps);
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 40, change: "drop" }, { step: 36, change: "keep" }]);
    expect(report.applied).toBe(0);
    expect(report.refused.map((entry) => entry.reason)).toEqual(["second_copy"]);
    expect(steps).toEqual(before);
  });

  it("refuses a result edit alone on a copy", () => {
    const copy = draft();
    expect(applyAutomationStudioFlowDraftAmendments(copy, [{ step: 36, change: "result" }]).refused).toEqual([{ step: 36, reason: "second_copy", copyOf: 13 }]);
    expect(copy[1]!.result).toBeUndefined();
  });
});
