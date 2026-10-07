// A lasting act claimed on a step whose own record shows it did something
// else (`../act-evidence.ts`, W1: 23 live runs). Only what Core reads is kept
// from each run: positions, claims, the control's words, the host's
// interruption mark, and each step's recorded place (`replay.from`, compared
// whole), with placeholder places.
//
//   - `run-mux74k5q-1c3c2127` (C1b): a1, "put the hub in my cart", on the
//     press of "Spain", one of a1's own options (a1.origin);
//   - `run-musp4h2f-72e8ed99` (row 7): an add put on a typed search that led to
//     the results page, and on a product link;
//   - `run-muqiho5c-e830ce01` (1-3): the add put on "Not now", a popup's
//     dismissal, and on the Spain choice.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioInstructedAct } from "../contracts.ts";
import {
  automationStudioInstructedActStepDidInstead,
  automationStudioInstructedActStepThatNamesIt,
  automationStudioInstructedActs,
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsNotDone,
  checkAutomationStudioInstructedActs,
  checkAutomationStudioInstructedActsOptionalOnly
} from "../index.ts";

const HUB = "Put three of the Voltbay USB-C hub in my cart: Space Grey, the 7-in-1 version, shipped from Spain.";
const SEARCH = "Search for the Voltbay hub, then add it to my cart.";
const SAVE = "Save the cheapest dining table.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

const press = (position: number, from: string, target: string, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep =>
  step(position, { words: { target }, replay: { from: { location: from } }, ...overrides });

const itemOf = (instruction: string, draft: AutomationStudioFlowDraftStep[], id = "a1") =>
  automationStudioInstructedActsChecklist({ instructionText: instruction, draftSteps: draft })!.find((each) => each.id === id)!;

const actOf = (instruction: string, id = "a1"): AutomationStudioInstructedAct => automationStudioInstructedActs(instruction).find((each) => each.id === id)!;

describe("a lasting act claimed on a press of one of its own options (run mux74k5q, C1b)", () => {
  const spain = press(5, "item", "Spain", { acts: ["a1", "a1.origin"] });

  it("is not done: the step chose a1.origin, which stays done by it", () => {
    const draft = [spain, press(6, "item", "Quantity", { actionId: "web.dom.type" })];
    const a1 = itemOf(HUB, draft);
    expect(a1).toMatchObject({ todo: "step_only_chooses", step: 5, chooses: "a1.origin" });
    expect(a1).not.toHaveProperty("done");
    expect(a1).not.toHaveProperty("instead");
    expect(a1.choices?.find((each) => each.id === "a1.origin")).toMatchObject({ done: 5 });
    expect(a1.todoSaid).toContain('Step 5 chose "Spain", one of a1\'s options (a1.origin)');
    expect(a1.todoSaid).toContain("does not do a1");
    expect(a1.todoSaid).toContain("No step in the draft names it yet: on the page where a1 is done, after its choices, run the press whose words name it with add true and act a1.");
    // The verdict replaces the doubt: no advisory claimSaid beside it.
    expect(a1).not.toHaveProperty("claimSaid");
    expect(automationStudioInstructedActsNotDone(automationStudioInstructedActsChecklist({ instructionText: HUB, draftSteps: draft }))).toContain("a1");
  });

  it("names the later press whose words name the act, even one only taken so far", () => {
    const draft = [spain, press(6, "item", "Share"), press(7, "item", "Add to cart", { disposition: "taken" })];
    const a1 = itemOf(HUB, draft);
    expect(a1).toMatchObject({ todo: "step_only_chooses", step: 5, chooses: "a1.origin", instead: 7 });
    expect(a1.todoSaid).toContain('Step 7 ("Add to cart") names it: name a1 there with amend_draft add on step 7 with act a1.');
  });

  it("is said by the verdict, with chooses, instead and the same sentence, and refuses no completion", () => {
    const draft = [spain, press(7, "item", "Add to cart", { disposition: "taken" })];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: HUB, result: { summary: "Adds the hub." }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const entry = (verdict.missingActs.acts as Array<Record<string, unknown>>).find((each) => each.id === "a1");
    expect(entry).toMatchObject({ reason: "step_only_chooses", step: "5", chooses: "a1.origin", instead: 7 });
    expect(entry?.said).toBe(itemOf(HUB, draft).todoSaid);
    expect(verdict.missing.find((each) => each.id === "a1")).toMatchObject({ chooses: "a1.origin", instead: 7 });
    expect(verdict.instruction).toContain("A reason of step_only_chooses");
    expect(checkAutomationStudioInstructedActsOptionalOnly({ instructionText: HUB, result: { summary: "Adds the hub." }, draftSteps: draft }).ok).toBe(true);
  });

  it("reads a typed quantity as choosing it (a1.quantity)", () => {
    const quantity = step(6, { actionId: "web.dom.type", words: { target: "Quantity", text: "3" }, replay: { from: { location: "item" } }, acts: ["a1"] });
    expect(automationStudioInstructedActStepDidInstead(actOf(HUB), quantity, [quantity])).toEqual({ fault: "step_only_chooses", chooses: "a1.quantity" });
    expect(itemOf(HUB, [quantity])).toMatchObject({ todo: "step_only_chooses", step: 6, chooses: "a1.quantity" });
  });
});

describe("a lasting act claimed on a step that went to another page (run musp4h2f, row 7)", () => {
  it("is not done on a typed search that led to the results page", () => {
    const draft = [
      step(3, { actionId: "web.dom.type", words: { target: "Search", text: "voltbay hub" }, replay: { from: { location: "home" } }, acts: ["a1"] }),
      press(4, "results", "Voltbay USB-C hub")
    ];
    const a1 = itemOf(SEARCH, draft);
    expect(a1).toMatchObject({ todo: "step_only_arrives", step: 3 });
    expect(a1.todoSaid).toContain('Step 3 ("Search") went to another page');
    expect(a1).not.toHaveProperty("claimSaid");
    const verdict = checkAutomationStudioInstructedActs({ instructionText: SEARCH, result: {}, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing[0]).toMatchObject({ id: "a1", reason: "step_only_arrives" });
    expect(verdict.instruction).toContain("A reason of step_only_arrives");
    expect(verdict.instruction).toContain("a press that led to another page");
  });

  it("is not done on a product link, and names the Add to cart after it", () => {
    const draft = [press(4, "results", "Voltbay USB-C hub", { acts: ["a1"] }), press(5, "item", "Add to cart")];
    expect(itemOf(SEARCH, draft)).toMatchObject({ todo: "step_only_arrives", step: 4, instead: 5 });
  });

  // "cart" is a word of the add's kind, but "View cart" names the visit, not the add.
  it("is not done on a press of \"View cart\", which is never offered as the step that adds", () => {
    const draft = [press(6, "item", "View cart", { acts: ["a1"] }), press(7, "cart", "Proceed to checkout")];
    expect(itemOf(SEARCH, draft)).toMatchObject({ todo: "step_only_arrives", step: 6 });
    const add = press(4, "item", "Add to cart");
    const view = press(6, "item", "View cart");
    const link = press(2, "results", "Voltbay USB-C hub", { acts: ["a1"] });
    const acts = automationStudioInstructedActs(SEARCH);
    expect(automationStudioInstructedActStepThatNamesIt(acts[0]!, acts, link, [link, view, press(7, "cart", "Proceed")])).toBeUndefined();
    expect(automationStudioInstructedActStepThatNamesIt(acts[0]!, acts, link, [link, add, view, press(7, "cart", "Proceed")])).toBe(4);
    // A visit that names the act's own verb still names it.
    expect(itemOf(SEARCH, [press(6, "item", "Add and view cart", { acts: ["a1"] }), press(7, "cart", "Proceed")])).toMatchObject({ done: 6 });
  });
});

describe("a lasting act claimed on a popup's dismissal (run muqiho5c, 1-3)", () => {
  it("is not done: the step only cleared the way", () => {
    const draft = [press(4, "item", "Not now", { interruption: true, acts: ["a1"] }), press(5, "item", "Spain")];
    const a1 = itemOf(HUB, draft);
    expect(a1).toMatchObject({ todo: "step_only_clears_the_way", step: 4 });
    expect(a1.todoSaid).toContain('Step 4 ("Not now") only closed something in front of the page');
    expect(a1).not.toHaveProperty("claimSaid");
    const verdict = checkAutomationStudioInstructedActs({ instructionText: HUB, result: {}, draftSteps: draft });
    expect(verdict.ok ? "" : verdict.instruction).toContain("A reason of step_only_clears_the_way");
  });
});

describe("a step whose record does not show it did something else", () => {
  it("counts an Add to cart that led to the cart", () => {
    const draft = [press(7, "item", "Add to cart", { acts: ["a1"] }), press(8, "cart", "Proceed")];
    expect(itemOf(SEARCH, draft)).toMatchObject({ done: 7 });
  });

  it("counts a heart pressed in place for a save: a toggle alone is never read", () => {
    const draft = [press(3, "results", "♡", { acts: ["a1"], toggle: { key: "k1", to: "on" } }), press(4, "results", "Next page")];
    expect(itemOf(SAVE, draft)).toMatchObject({ done: 3 });
  });

  it("counts a step with no words for its control", () => {
    const draft = [step(3, { acts: ["a1"], replay: { from: { location: "results" } } }), press(4, "item", "Add")];
    expect(itemOf(SEARCH, draft)).toMatchObject({ done: 3 });
  });

  it("judges a set act on \"Spain\" as before", () => {
    const set: AutomationStudioInstructedAct = { id: "a1", kind: "set", verb: "switch", quote: "Switch my country to Spain" };
    const spain = press(2, "home", "Spain", { acts: ["a1"] });
    expect(automationStudioInstructedActStepDidInstead(set, spain, [spain, press(3, "store", "x")])).toBeUndefined();
  });

  it("does not catch an interruption whose words name the act", () => {
    const save = press(2, "item", "Save", { interruption: true, acts: ["a1"] });
    expect(automationStudioInstructedActStepDidInstead(actOf(SAVE), save, [save])).toBeUndefined();
  });
});

describe("the step that names the act", () => {
  const act = actOf(HUB);
  const acts = automationStudioInstructedActs(HUB);
  const spain = press(5, "item", "Spain", { acts: ["a1"] });

  it("is the first after the judged step, else the first before", () => {
    const before = press(2, "item", "Add to cart", { disposition: "taken" });
    const after = press(8, "item", "Add to cart", { disposition: "taken" });
    expect(automationStudioInstructedActStepThatNamesIt(act, acts, spain, [before, spain, after])).toBe(8);
    expect(automationStudioInstructedActStepThatNamesIt(act, acts, spain, [before, spain])).toBe(2);
  });

  it("is never a dropped step, a read, or a step named for another act", () => {
    const other = (overrides: Partial<AutomationStudioFlowDraftStep>) => press(8, "item", "Add to cart", overrides);
    const twoActs = automationStudioInstructedActs("Add the towels to my cart, then save the napkins.");
    expect(automationStudioInstructedActStepThatNamesIt(act, acts, spain, [spain, other({ disposition: "dropped" })])).toBeUndefined();
    expect(automationStudioInstructedActStepThatNamesIt(act, acts, spain, [spain, other({ effect: "observe" })])).toBeUndefined();
    expect(automationStudioInstructedActStepThatNamesIt(twoActs[0]!, twoActs, spain, [spain, other({ acts: ["a2"] })])).toBeUndefined();
    expect(automationStudioInstructedActStepThatNamesIt(act, acts, spain, [spain, other({ acts: ["a1.colour"] })])).toBe(8);
  });
});
