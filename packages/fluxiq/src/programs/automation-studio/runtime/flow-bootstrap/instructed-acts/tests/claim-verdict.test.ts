// A claim the act judge would reject, asked as it is made (`../claim-verdict.ts`,
// W1). Run `run-mux74k5q-1c3c2127` (C1b) put a1 on the press of "Spain", one of
// a1's own options, and was answered "applied".
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioInstructedActClaimVerdict } from "../index.ts";

const HUB = "Put three of the Voltbay USB-C hub in my cart: Space Grey, the 7-in-1 version, shipped from Spain.";

function press(position: number, from: string, target: string, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", words: { target }, replay: { from: { location: from } }, ...overrides };
}

describe("a claim asked as it is made", () => {
  it("is refused on the press of one of the act's own options, with the checklist's sentence, and the draft is untouched", () => {
    const spain = press(5, "item", "Spain", { disposition: "taken" });
    const add = press(7, "item", "Add to cart", { disposition: "taken" });
    const steps = [press(4, "item", "Space Grey", { acts: ["a1.colour"] }), spain, add];
    const before = structuredClone(steps);
    const refused = automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps, step: spain, act: "a1" });
    expect(refused).toMatchObject({ act: "a1", instead: 7 });
    expect(refused?.said).toContain('Step 5 chose "Spain", one of a1\'s options (a1.origin)');
    expect(refused?.said).toContain("Step 7 (\"Add to cart\") names it");
    expect(steps).toEqual(before);
  });

  it("is refused even where the act is claimed on another step today, which keeps it", () => {
    const add = press(7, "item", "Add to cart", { acts: ["a1"] });
    const spain = press(8, "item", "Spain", { disposition: "taken" });
    const steps = [add, spain];
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps, step: spain, act: "a1" })).toMatchObject({ act: "a1", instead: 7 });
    expect(add.acts).toEqual(["a1"]);
  });

  it("stands on the press whose words name the act", () => {
    const add = press(7, "item", "Add to cart", { disposition: "taken" });
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [press(5, "item", "Spain"), add], step: add, act: "a1" })).toBeUndefined();
  });

  it("judges only an act's own id, never a choice, and nothing outside the draft", () => {
    const spain = press(5, "item", "Spain");
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [spain], step: spain, act: "a1.origin" })).toBeUndefined();
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [spain], step: press(9, "item", "Spain"), act: "a1" })).toBeUndefined();
    expect(automationStudioInstructedActClaimVerdict({ instructionText: "List the hubs.", steps: [spain], step: spain, act: "a1" })).toBeUndefined();
  });

  // Run `run-muqiho5c-e830ce01`: the add named on "Not now", a layer its own Add to cart opened.
  it("is refused on a step whose change shows nothing of the act while the press before it made the cart rise", () => {
    const add = press(4, "item", "Add to cart", { disposition: "taken", changed: [{ words: "Cart (1)", how: "rose" }] });
    const notNow = press(5, "item", "Not now", { disposition: "taken", changed: [{ words: "Protect your purchase", how: "went" }] });
    const refused = automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [add, notNow], step: notNow, act: "a1" });
    expect(refused).toMatchObject({ act: "a1", instead: 4 });
    expect(refused?.said).toBe('Step 5 ("Not now") changed nothing that shows a1, and does not do a1. Step 4 ("Add to cart") shows it: name a1 there with amend_draft add on step 4 with act a1.');
    expect(automationStudioInstructedActClaimVerdict({ instructionText: HUB, steps: [add, notNow], step: add, act: "a1" })).toBeUndefined();
  });
});
