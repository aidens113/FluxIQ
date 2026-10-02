// One act, one step (`../act-claim.ts`). Live run `run-muq3ubys-4b4dbf5b` could
// not move a claim: every claim was added, never moved, so swapping `a3` and
// `a3.size` between two steps left both steps claiming both, and the check
// refused `choice_is_the_act_step` six times until the build's money ran out.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftClaimAct } from "../act-claim.ts";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment.ts";
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
    automationStudioFlowDraftClaimAct(steps, steps[2]!, "a2");
    expect(claims(steps)).toEqual([[32, ["a1"]], [33, []], [34, ["a2"]]]);
    automationStudioFlowDraftClaimAct(steps, steps[2]!, "a2");
    expect(steps[2]!.acts).toEqual(["a2"]);
  });
});
