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

  it("a drop of the off half that strands a kept step is refused, and the on half stays kept", () => {
    // 1 stays on page A, 2 (off) moves A to B, 3 acts on B, 4 (on) on B: 2 is the only way to 3's page.
    const fourth: AutomationStudioFlowDraftStep = { position: 4, id: "d4", iteration: 4, actionId: "web.dom.click", input: { step: 4 }, effect: "mutate", effectApplied: true, disposition: "kept" };
    const steps = [...draft(), fourth];
    const pages = ["A", "A", "B", "B"];
    steps.forEach((step, index) => { step.replay = { from: { page: pages[index]! } }; });
    steps[1]!.toggle = { key: "t940", to: "off" };
    steps[3]!.toggle = { key: "t940", to: "on" };
    steps[3]!.acts = ["a1"];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "strands_a_step", strands: 3 }] });
    expect(steps.map((step) => step.disposition)).toEqual(["kept", "kept", "kept", "kept"]);
    expect(steps.map((step) => step.cancels)).toEqual([undefined, undefined, undefined, undefined]);
    expect(steps[3]!.acts).toEqual(["a1"]);
  });

  // t281's open edge: an add or keep in the same decision ran the reversal before the strand check, so the
  // on half was taken out against a drop the check then put back.
  it("a drop of the off half that strands a kept step, beside an add of another step, leaves the on half kept", () => {
    const later = (position: number, disposition: AutomationStudioFlowDraftStep["disposition"]): AutomationStudioFlowDraftStep => ({ position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: { step: position }, effect: "mutate", effectApplied: true, disposition });
    const steps = [...draft(), later(4, "kept"), later(5, "taken")];
    const pages = ["A", "A", "B", "B", "B"];
    steps.forEach((step, index) => { step.replay = { from: { page: pages[index]! } }; });
    steps[1]!.toggle = { key: "t940", to: "off" };
    steps[3]!.toggle = { key: "t940", to: "on" };
    steps[3]!.acts = ["a1"];
    for (const amendments of [[{ step: 2, change: "drop" as const }, { step: 5, change: "add" as const }], [{ step: 5, change: "add" as const }, { step: 2, change: "drop" as const }]]) {
      const each = structuredClone(steps);
      expect(applyAutomationStudioFlowDraftAmendments(each, amendments)).toEqual({ applied: 1, refused: [{ step: 2, reason: "strands_a_step", strands: 3 }] });
      expect(each.map((step) => step.disposition)).toEqual(["kept", "kept", "kept", "kept", "kept"]);
      expect(each.map((step) => step.cancels)).toEqual([undefined, undefined, undefined, undefined, undefined]);
      expect(each[3]!.acts).toEqual(["a1"]);
    }
  });

  it("a drop of the off half that stands, beside an add of another step, still takes the on half out", () => {
    const later = (position: number, disposition: AutomationStudioFlowDraftStep["disposition"]): AutomationStudioFlowDraftStep => ({ position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: { step: position }, effect: "mutate", effectApplied: true, disposition });
    const steps = [...draft(), later(4, "kept"), later(5, "taken")];
    steps[1]!.toggle = { key: "t940", to: "off" };
    steps[3]!.toggle = { key: "t940", to: "on" };
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }, { step: 5, change: "add" }])).toEqual({ applied: 2, refused: [] });
    expect(steps.map((step) => step.disposition)).toEqual(["kept", "dropped", "kept", "dropped", "kept"]);
    expect(steps[3]!.cancels).toBe("d2");
  });

  it("a drop of the off half that strands nothing still takes the on half out once the drop stands", () => {
    const fourth: AutomationStudioFlowDraftStep = { position: 4, id: "d4", iteration: 4, actionId: "web.dom.click", input: { step: 4 }, effect: "mutate", effectApplied: true, disposition: "kept" };
    const steps = [...draft(), fourth];
    steps[1]!.toggle = { key: "t940", to: "off" };
    steps[3]!.toggle = { key: "t940", to: "on" };
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }])).toEqual({ applied: 1, refused: [] });
    expect(steps.map((step) => step.disposition)).toEqual(["kept", "dropped", "kept", "dropped"]);
    expect(steps[3]!.cancels).toBe("d2");
  });
});
