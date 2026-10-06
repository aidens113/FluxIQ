// A press that undoes another on the same control leaves the Flow with it
// (`../reversal.ts`). Live run `run-murwd8le-79e735a8` kept Space Grey off
// (draft step 7) and brought Space Grey on (step 14) in as the opener of Add to
// cart; live run `run-musp8nz1-dbd3905a` added both halves itself, and the act
// claim moved `a1.colour` from the first to the second. Both Flows un-chose a
// colour the page arrived with and chose it again.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftClaimAct } from "../act-claim.ts";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment/index.ts";
import { automationStudioFlowDraftKeepOpeners } from "../opener.ts";
import { automationStudioFlowDraftDropReversals } from "../reversal.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

type Spec = {
  from: string; to: string; disposition?: AutomationStudioFlowDraftStep["disposition"]; failed?: true;
  toggle?: AutomationStudioFlowDraftStep["toggle"]; acts?: string[]; routing?: AutomationStudioFlowDraftStep["routing"];
};
const draft = (specs: Spec[]): AutomationStudioFlowDraftStep[] => specs.map((spec, index) => ({
  position: index + 1, id: `d${index + 1}`, iteration: index + 1, actionId: "press", input: { step: index + 1 },
  effect: "mutate" as const, effectApplied: !spec.failed, stateBefore: spec.from, stateAfter: spec.to,
  disposition: spec.disposition ?? "taken",
  ...(spec.toggle ? { toggle: spec.toggle } : {}), ...(spec.acts ? { acts: spec.acts } : {}), ...(spec.routing ? { routing: spec.routing } : {})
}));
const inFlow = (steps: AutomationStudioFlowDraftStep[]) => steps.filter((step) => step.disposition === "kept").map((step) => step.position);
const off = (key = "t941") => ({ key, to: "off" as const });
const on = (key = "t941") => ({ key, to: "on" as const });

describe("a press that undoes another on the same control", () => {
  it("keeps both toggles when an intervening kept action may depend on the temporary state", () => {
    const steps = draft([
      { from: "s0", to: "s1", disposition: "kept", toggle: on() },
      { from: "s1", to: "s2", disposition: "kept", acts: ["a1"] },
      { from: "s2", to: "s3", disposition: "kept", toggle: off() }
    ]);
    expect(automationStudioFlowDraftDropReversals(steps)).toEqual([]);
    expect(inFlow(steps)).toEqual([1, 2, 3]);
    expect(steps[1]!.acts).toEqual(["a1"]);
  });

  it("keeps toggles around a kept read that may return the temporary state", () => {
    const steps = draft([
      { from: "s0", to: "s1", disposition: "kept", toggle: on() },
      { from: "s1", to: "s1", disposition: "kept" },
      { from: "s1", to: "s2", disposition: "kept", toggle: off() }
    ]);
    steps[1]!.effect = "observe";
    steps[1]!.proposes = true;
    expect(automationStudioFlowDraftDropReversals(steps)).toEqual([]);
    expect(inFlow(steps)).toEqual([1, 2, 3]);
  });

  it("run murwd8le: intervening kept actions prevent speculative removal of the Space Grey pair", () => {
    // Arrival, ×, search, listing, consent, 7-in-1, Space Grey off (kept, a1.colour), Spain, coupon, a look-alike
    // press, quantity (kept by 0025), a press, Add to cart refused, Space Grey on (taken), Add to cart (kept).
    const steps = draft([
      { from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2", disposition: "kept" }, { from: "s2", to: "s3", disposition: "kept" },
      { from: "s3", to: "s4", disposition: "kept" }, { from: "s4", to: "s5", disposition: "kept" }, { from: "s5", to: "s6", disposition: "kept" },
      { from: "s6", to: "s7", disposition: "kept", toggle: off(), acts: ["a1.colour"] },
      { from: "s7", to: "s8", disposition: "kept" }, { from: "s8", to: "s9", disposition: "kept" }, { from: "s9", to: "s10", disposition: "kept" },
      { from: "s10", to: "s11", disposition: "kept" }, { from: "s11", to: "s11" },
      { from: "s11", to: "s11", failed: true }, { from: "s11", to: "s12", toggle: on() }, { from: "s12", to: "s13", disposition: "kept" }
    ]);
    automationStudioFlowDraftKeepOpeners(steps, steps[14]!);
    expect(steps[13]!.disposition).toBe("kept");
    const out = automationStudioFlowDraftDropReversals(steps);
    expect(inFlow(steps)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15]);
    expect(out).toEqual([]);
    expect(steps[6]!.cancels).toBeUndefined();
    expect(steps[13]!.cancels).toBeUndefined();
    expect(steps[6]!.acts).toEqual(["a1.colour"]);
  });

  it("run musp8nz1: the model adds Space Grey off then on, both for a1.colour, and both leave the Flow with no act", () => {
    // Draft steps 7 (7-in-1, kept), 8 (Space Grey off, add, act a1.colour), 9 (Space Grey on, add, act a1.colour).
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept" }, { from: "s1", to: "s2", disposition: "kept" }, { from: "s2", to: "s3", disposition: "kept", toggle: off(), acts: ["a1.colour"] }]);
    automationStudioFlowDraftDropReversals(steps);
    expect(inFlow(steps)).toEqual([1, 2, 3]);
    const second: AutomationStudioFlowDraftStep = { ...draft([{ from: "s3", to: "s4", disposition: "kept", toggle: on() }])[0]!, position: 4, id: "d4", iteration: 4 };
    automationStudioFlowDraftClaimAct(steps, second, "a1.colour");
    steps.push(second);
    expect(steps[2]!.acts).toBeUndefined();
    automationStudioFlowDraftKeepOpeners(steps, second);
    automationStudioFlowDraftDropReversals(steps);
    expect(inFlow(steps)).toEqual([1, 2]);
    expect([steps[2]!.disposition, steps[3]!.disposition]).toEqual(["dropped", "dropped"]);
    expect([steps[2]!.cancels, steps[3]!.cancels]).toEqual(["d4", "d3"]);
    expect(steps.some((step) => step.acts?.length)).toBe(false);
  });

  it("a half the model adds back is never taken out again", () => {
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept", toggle: off() }, { from: "s1", to: "s2" }, { from: "s2", to: "s3", disposition: "kept", toggle: on() }]);
    automationStudioFlowDraftDropReversals(steps);
    expect(inFlow(steps)).toEqual([]);
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "add" }, { step: 3, change: "add" }]);
    automationStudioFlowDraftDropReversals(steps);
    expect(inFlow(steps)).toEqual([1, 2, 3]);
  });

  it("off, on, off: the first two cancel and the third stays", () => {
    const steps = draft([
      { from: "s0", to: "s1", disposition: "kept", toggle: off() }, { from: "s1", to: "s2", disposition: "kept", toggle: on() },
      { from: "s2", to: "s3", disposition: "kept" }, { from: "s3", to: "s4", disposition: "kept", toggle: off() }
    ]);
    automationStudioFlowDraftDropReversals(steps);
    expect(inFlow(steps)).toEqual([3, 4]);
    expect(steps[3]!.cancels).toBeUndefined();
  });

  it("two presses in the same direction (an unseen change between) take nothing out", () => {
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept", toggle: off() }, { from: "s1", to: "s2", disposition: "kept", toggle: off() }]);
    expect(automationStudioFlowDraftDropReversals(steps)).toEqual([]);
    expect(inFlow(steps)).toEqual([1, 2]);
  });

  it("different keys take nothing out", () => {
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept", toggle: off("t941") }, { from: "s1", to: "s2", disposition: "kept", toggle: on("t942") }]);
    expect(automationStudioFlowDraftDropReversals(steps)).toEqual([]);
    expect(inFlow(steps)).toEqual([1, 2]);
  });

  it("a half that has routing is not paired", () => {
    const steps = draft([{ from: "s0", to: "s1", disposition: "kept", toggle: off(), routing: { kind: "optional" } }, { from: "s1", to: "s2", disposition: "kept", toggle: on() }]);
    expect(automationStudioFlowDraftDropReversals(steps)).toEqual([]);
    expect(inFlow(steps)).toEqual([1, 2]);
  });

  it("rule b: a re-press that undoes a step the model dropped leaves the Flow alone", () => {
    const steps = draft([{ from: "s0", to: "s1", disposition: "dropped", toggle: off() }, { from: "s1", to: "s2", disposition: "kept", toggle: on() }]);
    expect(automationStudioFlowDraftDropReversals(steps).map((step) => step.position)).toEqual([2]);
    expect(steps[1]!.disposition).toBe("dropped");
    expect(steps[1]!.cancels).toBe("d1");
    expect(steps[0]!.cancels).toBeUndefined();
    expect(steps[0]!.disposition).toBe("dropped");
  });

  it("run mux6n7m4: a re-press that undoes a step the model dropped leaves even with kept steps between", () => {
    // Draft steps 9 (Space Grey off, dropped by the model), 11 (7-in-1), 12 (Spain), 16 (quantity 3), 17 (Space Grey on, a1.colour).
    const steps = draft([
      { from: "s0", to: "s1", disposition: "dropped", toggle: off(), acts: [] },
      { from: "s1", to: "s2", disposition: "kept" }, // 7-in-1
      { from: "s2", to: "s3", disposition: "kept" }, // Spain
      { from: "s3", to: "s4", disposition: "kept" }, // quantity 3
      { from: "s4", to: "s5", disposition: "kept", toggle: on(), acts: ["a1.colour"] }
    ]);
    expect(automationStudioFlowDraftDropReversals(steps).map((step) => step.position)).toEqual([5]);
    expect(steps[4]!.cancels).toBe("d1");
    expect(inFlow(steps)).toEqual([2, 3, 4]);
    // Its act claim goes with it, so the checklist shows the act still to do.
    expect(steps[4]!.acts).toBeUndefined();
  });
});
