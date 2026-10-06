// One act, one step (`../act-claim.ts`). Live run `run-muq3ubys-4b4dbf5b` could
// not move a claim: every claim was added, never moved, so swapping `a3` and
// `a3.size` between two steps left both steps claiming both, and the check
// refused `choice_is_the_act_step` six times until the build's money ran out.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftClaimAct } from "../act-claim.ts";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

const draft = (): AutomationStudioFlowDraftStep[] => [32, 33, 34].map((position) => ({
  position, iteration: position, actionId: "press", input: { target: `t${position}` }, effect: "mutate" as const, effectApplied: true, disposition: "kept" as const
}));
const claims = (steps: AutomationStudioFlowDraftStep[]) => steps.map((step) => [step.position, step.acts ?? []]);

describe("claiming an act on a step", () => {
  it("run 36: a claim swapped between two steps moves, so each act ends on one step", () => {
    const steps = draft();
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 32, change: "add", act: "a3" }, { step: 34, change: "add", act: "a3.size" }]);
    expect(claims(steps)).toEqual([[32, ["a3"]], [33, []], [34, ["a3.size"]]]);
    // Told the choice sat on the act's step, the model swapped them, one claim per decision.
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 32, change: "keep", act: "a3.size" }]);
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 34, change: "keep", act: "a3" }]);
    expect(claims(steps)).toEqual([[32, ["a3.size"]], [33, []], [34, ["a3"]]]);
  });

  it("keeps the step's other claims, and is nothing new on the step that already holds it", () => {
    const steps = draft();
    steps[0]!.acts = ["a1", "a2"];
    // Answers the steps the act was taken off.
    expect(automationStudioFlowDraftClaimAct(steps, steps[2]!, "a2")).toEqual([steps[0]]);
    expect(claims(steps)).toEqual([[32, ["a1"]], [33, []], [34, ["a2"]]]);
    expect(automationStudioFlowDraftClaimAct(steps, steps[2]!, "a2")).toEqual([]);
    expect(steps[2]!.acts).toEqual(["a2"]);
  });
});

// Live run `run-musp4h2f-72e8ed99` (cause 8): a3 moved from the 3-Pack's Add to
// cart to the single pack's, and the 3-Pack press stayed in the Flow with no
// act -- and was pressed again in the next test. The move is applied, never
// refused, and the amendment's answer says which step the act left, in the
// numbers the whole decision leaves (`../../llm/draft-amendment-feedback.ts`
// tells it).
describe("an act that moves off a step in the Flow", () => {
  it("is applied, and names the step it left, which now does no act", () => {
    const steps = draft();
    steps[0]!.acts = ["a3"];
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 34, change: "keep", act: "a3" }]);
    expect(report).toEqual({ applied: 1, refused: [], moved: [{ act: "a3", from: 32, to: 34 }] });
    expect(claims(steps)).toEqual([[32, []], [33, []], [34, ["a3"]]]);
    // Never a silent drop: the step left stays where it was.
    expect(steps[0]!.disposition).toBe("kept");
  });

  it("says nothing of a step that keeps another act, that the same decision dropped, or a swap that leaves each with one", () => {
    const other = draft();
    other[0]!.acts = ["a1", "a3"];
    expect(applyAutomationStudioFlowDraftAmendments(other, [{ step: 34, change: "add", act: "a3" }]).moved).toBeUndefined();
    const dropped = draft();
    dropped[0]!.acts = ["a3"];
    expect(applyAutomationStudioFlowDraftAmendments(dropped, [{ step: 34, change: "add", act: "a3" }, { step: 32, change: "drop" }]).moved).toBeUndefined();
    const swapped = draft();
    swapped[0]!.acts = ["a3"];
    swapped[2]!.acts = ["a3.size"];
    expect(applyAutomationStudioFlowDraftAmendments(swapped, [{ step: 32, change: "keep", act: "a3.size" }, { step: 34, change: "keep", act: "a3" }]).moved).toBeUndefined();
  });

  it("names the steps by the numbers the decision leaves them at", () => {
    const steps = draft().map((step, index) => ({ ...step, position: index + 1 }));
    steps[0]!.acts = ["a3"];
    // The claim moves to 3, then 3 moves to the front: the step it left is then 2.
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "keep", act: "a3" }, { step: 3, change: "reorder", to: 1 }]);
    expect(report.moved).toEqual([{ act: "a3", from: 2, to: 1 }]);
  });
});
