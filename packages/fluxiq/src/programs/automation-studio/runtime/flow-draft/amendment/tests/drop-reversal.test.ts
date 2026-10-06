// A drop runs the reversal rule too (`../apply.ts`, `../../reversal.ts`): live
// run `run-mux6n7m4-8273e7a0` dropped Space Grey off (draft step 9) and kept
// Space Grey on (step 17) with kept steps between, so the Flow pressed it the
// wrong way on a page that arrives with it chosen.
import { describe, expect, it } from "vitest";
import { automationStudioInstructedActsChecklist } from "../../../flow-bootstrap/instructed-acts/index.ts";
import { applyAutomationStudioFlowDraftAmendments } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

const CART = "Add the hub to my cart.";

function draft(): AutomationStudioFlowDraftStep[] {
  return [1, 2, 3].map((position) => ({
    position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: { step: position },
    effect: "mutate" as const, effectApplied: true, disposition: "kept" as const, stateBefore: `s${position - 1}`, stateAfter: `s${position}`
  }));
}

describe("a drop of one toggle half", () => {
  it("a lone drop of the kept off half takes the kept on half out, and its act is to do again", () => {
    const steps = draft();
    steps[0]!.toggle = { key: "t940", to: "off" };
    steps[2]!.toggle = { key: "t940", to: "on" };
    steps[2]!.acts = ["a1"];
    expect(automationStudioInstructedActsChecklist({ instructionText: CART, draftSteps: steps })![0]).toMatchObject({ done: 3 });
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "drop" }])).toEqual({ applied: 1, refused: [] });
    expect(steps.map((step) => step.disposition)).toEqual(["dropped", "kept", "dropped"]);
    expect(steps[2]!.cancels).toBe("d1");
    expect(steps[0]!.cancels).toBeUndefined();
    expect(steps[2]!.acts).toBeUndefined();
    expect(automationStudioInstructedActsChecklist({ instructionText: CART, draftSteps: steps })![0]).toMatchObject({ todo: "no_step_added" });
  });
});
