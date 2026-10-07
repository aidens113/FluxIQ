// An act claimed on a press that changed nothing anyone could see
// (`../act-evidence.ts`, `step_changed_nothing_seen`). Live run
// `run-muxkyfxz-446c3a4e` (lane B round 4), steps 0028-0031: with bigbox's store
// chooser open, the model ran `core.run_node` on "Millbrook Crossing
// Supercenter" -- the store's name, not its "Set as my store" button -- with
// `add` and `act: a1`. The page text after the press was byte-identical to the
// one before (only the chooser's list had scrolled), the header still read
// "Carden Falls Supercenter", and Core counted a1, "Switch my pickup store to
// Millbrook Crossing Supercenter", done by that step.
//
// Only what Core reads is kept: positions, the control's words, whether the
// command succeeded, and the host's state digest before and after each step
// (placeholder digests: equal where the run's page was unchanged).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioInstructedActClaimVerdict, automationStudioInstructedActsChecklist } from "../index.ts";

const INSTRUCTION = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";
const ITEM = "http://127.0.0.1/scenarios/bigbox-retail/ip/418830127";

function press(position: number, target: string, before: string, after: string, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, actionId: "web.output.dom-click", input: {}, effect: "mutate", effectApplied: true,
    disposition: "kept", words: { target }, replay: { from: { location: ITEM } }, stateBefore: before, stateAfter: after, ...overrides
  };
}

/** Steps 9 (the chooser opened, kept) and 12 (the store's name pressed, the page unchanged) of the run's draft. */
function draft(): { opener: AutomationStudioFlowDraftStep; name: AutomationStudioFlowDraftStep; steps: AutomationStudioFlowDraftStep[] } {
  const opener = press(9, "Pickup or delivery? Carden Falls Supercenter", "s8", "s9");
  const name = press(12, "Millbrook Crossing Supercenter", "s11", "s11", { disposition: "taken" });
  return { opener, name, steps: [opener, name] };
}

describe("an act claimed on a press that changed nothing anyone could see (run muxkyfxz, step 12)", () => {
  it("is refused as it is made, saying the press changed nothing and which words the control that does it carries", () => {
    const { name, steps } = draft();
    const before = structuredClone(steps);
    const refused = automationStudioInstructedActClaimVerdict({ instructionText: INSTRUCTION, steps, step: name, act: "a1" });
    expect(refused).toMatchObject({ act: "a1" });
    expect(refused).not.toHaveProperty("instead");
    expect(refused?.said).toContain('Step 12 ("Millbrook Crossing Supercenter") changed nothing anyone could see on the page');
    expect(refused?.said).toContain("does not do a1");
    expect(refused?.said).toContain('"switch"');
    expect(refused?.said).toContain('"store"');
    expect(refused?.said).toContain('next to "Millbrook Crossing Supercenter"');
    expect(steps).toEqual(before);
  });

  it("is not done on the checklist when the claim is already on the step", () => {
    const { opener, name } = draft();
    const a1 = automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: [opener, { ...name, disposition: "kept", acts: ["a1"] }] })!.find((each) => each.id === "a1")!;
    expect(a1).toMatchObject({ todo: "step_changed_nothing_seen", step: 12 });
    expect(a1).not.toHaveProperty("done");
    expect(a1.todoSaid).toContain("changed nothing anyone could see");
  });

  it("names the step whose words name the act and whose press changed the page, where the draft has one", () => {
    const { opener, name } = draft();
    const set = press(13, "Set as my store", "s12", "s13", { disposition: "taken" });
    const refused = automationStudioInstructedActClaimVerdict({ instructionText: INSTRUCTION, steps: [opener, name, set], step: name, act: "a1" });
    expect(refused).toMatchObject({ act: "a1", instead: 13 });
    expect(refused?.said).toContain('Step 13 ("Set as my store") names it');
    expect(automationStudioInstructedActClaimVerdict({ instructionText: INSTRUCTION, steps: [opener, name, set], step: set, act: "a1" })).toBeUndefined();
  });

  it("never catches a press that changed the page, a chosen state, or one whose host gave no digests", () => {
    const { opener } = draft();
    const claim = (step: AutomationStudioFlowDraftStep) =>
      automationStudioInstructedActClaimVerdict({ instructionText: INSTRUCTION, steps: [opener, step], step, act: "a1" });
    // The store switch that reloaded the page with the new store: the digest moved.
    expect(claim(press(12, "Set as my store", "s11", "s12", { disposition: "taken" }))).toBeUndefined();
    // A chosen state flipped on the control itself, or a line the host says it changed.
    expect(claim(press(12, "Set as my store", "s11", "s11", { disposition: "taken", toggle: { key: "k1", to: "on" } }))).toBeUndefined();
    expect(claim(press(12, "Set as my store", "s11", "s11", { disposition: "taken", changed: [{ words: "Pickup at Millbrook Crossing Supercenter", how: "reads" }] }))).toBeUndefined();
    // A host that states no digests is judged as before.
    const undigested = press(12, "Set as my store", "s11", "s11", { disposition: "taken" });
    delete undigested.stateBefore;
    delete undigested.stateAfter;
    expect(claim(undigested)).toBeUndefined();
  });

  it("leaves a real add standing: the cart count rose", () => {
    const add = press(20, "Add to cart", "s19", "s20", { disposition: "taken", changed: [{ words: "🛒 3 $20.44", how: "rose" }] });
    expect(automationStudioInstructedActClaimVerdict({ instructionText: INSTRUCTION, steps: [add], step: add, act: "a2" })).toBeUndefined();
  });
});
