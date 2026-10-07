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
//     dismissal, and on the Spain choice. "Not now" answered a layer the run's
//     own Add to cart opened, so the host did not mark it an interruption; only
//     the press before it made the cart count rise (`changed`, below).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioInstructedAct } from "../contracts.ts";
import {
  automationStudioInstructedActChangeShows,
  automationStudioInstructedActClaimVerdict,
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
    expect(automationStudioInstructedActStepDidInstead(actOf(HUB), quantity, [quantity], automationStudioInstructedActs(HUB))).toEqual({ fault: "step_only_chooses", chooses: "a1.quantity" });
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
    expect(automationStudioInstructedActStepDidInstead(set, spain, [spain, press(3, "store", "x")], [set])).toBeUndefined();
  });

  it("does not catch an interruption whose words name the act", () => {
    const save = press(2, "item", "Save", { interruption: true, acts: ["a1"] });
    expect(automationStudioInstructedActStepDidInstead(actOf(SAVE), save, [save], automationStudioInstructedActs(SAVE))).toBeUndefined();
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

describe("what a step changed, read for the act (run muqiho5c: the cart count rose on the press before \"Not now\")", () => {
  const rose = (words: string) => ({ words, how: "rose" as const });
  const appeared = (words: string) => ({ words, how: "appeared" as const });
  const went = (words: string) => ({ words, how: "went" as const });
  const reads = (words: string) => ({ words, how: "reads" as const });
  const add = (position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}) =>
    press(position, "item", "Add to cart", { disposition: "taken", changed: [rose("Cart (1)")], ...overrides });
  const notNow = (position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}) =>
    press(position, "item", "Not now", { acts: ["a1"], changed: [went("Protect your purchase")], ...overrides });

  it("catches \"Not now\", no interruption, when the Add to cart before it made the cart rise", () => {
    const draft = [add(4), notNow(5)];
    const a1 = itemOf(SEARCH, draft);
    expect(a1).toMatchObject({ todo: "another_step_shows_it", step: 5, instead: 4 });
    expect(a1.todoSaid).toBe('Step 5 ("Not now") changed nothing that shows a1, and does not do a1. Step 4 ("Add to cart") shows it: name a1 there with amend_draft add on step 4 with act a1.');
    expect(a1).not.toHaveProperty("claimSaid");
    const verdict = checkAutomationStudioInstructedActs({ instructionText: SEARCH, result: {}, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing[0]).toMatchObject({ id: "a1", reason: "another_step_shows_it", step: "5", instead: 4 });
    expect((verdict.missingActs.acts as Array<Record<string, unknown>>)[0]?.said).toBe(a1.todoSaid);
    expect(verdict.instruction).toContain("A reason of another_step_shows_it");
  });

  it("is refused as the claim is made", () => {
    const draft = [add(4), press(5, "item", "Not now", { disposition: "taken", changed: [went("Protect your purchase")] })];
    const refused = automationStudioInstructedActClaimVerdict({ instructionText: SEARCH, steps: draft, step: draft[1]!, act: "a1" });
    expect(refused).toMatchObject({ act: "a1", instead: 4 });
    expect(refused?.said).toContain('Step 5 ("Not now") changed nothing that shows a1');
  });

  it("counts a press whose change shows the act, over its words, its interruption or its choice", () => {
    const plus = press(6, "item", "＋", { acts: ["a1"], interruption: true, changed: [appeared("Added to cart")] });
    expect(itemOf(SEARCH, [plus, press(7, "item", "Continue shopping")])).toMatchObject({ done: 6 });
    expect(itemOf(SEARCH, [plus, press(7, "item", "Continue shopping")])).not.toHaveProperty("claimSaid");
    const yes = press(6, "item", "Yes, continue", { acts: ["a1"], interruption: true, changed: [appeared("Added to cart"), went("Add a protection plan?")] });
    expect(itemOf(HUB, [yes])).toMatchObject({ done: 6 });
    const spain = press(5, "item", "Spain", { acts: ["a1"], changed: [appeared("1 item added to your basket")] });
    expect(automationStudioInstructedActStepDidInstead(actOf(HUB), spain, [spain], automationStudioInstructedActs(HUB))).toBeUndefined();
  });

  it("keeps a size press whose change only shows the Add to cart now reads as step_only_chooses", () => {
    const grey = press(5, "item", "Space Grey", { acts: ["a1"], changed: [reads("Add to cart")] });
    expect(itemOf(HUB, [grey, add(7)])).toMatchObject({ todo: "step_only_chooses", step: 5, instead: 7 });
  });

  it("reads no place in a quantity or an add's own button that rose", () => {
    const act = actOf(SEARCH);
    expect(automationStudioInstructedActChangeShows(act, press(3, "item", "＋", { changed: [rose("Qty 2")] }))).toBe(false);
    expect(automationStudioInstructedActChangeShows(act, press(3, "item", "＋", { changed: [rose("Add 2 to cart")] }))).toBe(false);
    expect(automationStudioInstructedActChangeShows(act, press(3, "item", "＋", { changed: [went("Cart (1)")] }))).toBe(false);
    expect(automationStudioInstructedActChangeShows(act, press(3, "item", "＋", { changed: [rose("Basket 3 items")] }))).toBe(true);
    // A quantity's own "+" that rose "Qty 2" shows nothing, so "Not now" is judged as before.
    expect(itemOf(SEARCH, [press(4, "item", "＋", { changed: [rose("Qty 2")] }), notNow(5)])).toMatchObject({ done: 5 });
    expect(itemOf(SEARCH, [press(4, "item", "＋", { changed: [rose("Add 2 to cart")] }), notNow(5)])).toMatchObject({ done: 5 });
  });

  it("judges a step that says nothing of what it changed as before (lenient)", () => {
    const { changed: _said, ...silent } = notNow(5);
    expect(itemOf(SEARCH, [add(4), silent])).toMatchObject({ done: 5 });
    expect(itemOf(SEARCH, [add(4), notNow(5, { changed: [] })])).toMatchObject({ done: 5 });
  });

  it("prefers a step whose change shows the act over one whose words only name it", () => {
    const acts = automationStudioInstructedActs(HUB);
    const spain = press(5, "item", "Spain", { acts: ["a1"] });
    const plus = press(3, "item", "＋", { disposition: "taken", changed: [appeared("Added to cart")] });
    const named = press(8, "item", "Add to cart", { disposition: "taken" });
    expect(automationStudioInstructedActStepThatNamesIt(acts[0]!, acts, spain, [plus, spain, named])).toBe(3);
    expect(itemOf(HUB, [plus, spain, named]).todoSaid).toContain('Step 3 ("＋") shows it: name a1 there');
  });

  describe("never offers another act's add (towels and napkins)", () => {
    const TWO = "Add one pack of the ValueRidge Paper Towels and one pack of the ValueRidge Dinner Napkins to my cart.";
    const acts = automationStudioInstructedActs(TWO);
    const towelsAdd = (overrides: Partial<AutomationStudioFlowDraftStep> = {}) =>
      add(4, { ranWith: { target: { accessibleName: "Add to cart", record: "ValueRidge Paper Towels, 6 Double Rolls" } }, ...overrides });
    const napkinsNotNow = notNow(5, { acts: ["a2"] });

    it("whose record names the towels, for the napkins act", () => {
      const draft = [towelsAdd(), napkinsNotNow];
      expect(automationStudioInstructedActStepDidInstead(acts[1]!, napkinsNotNow, draft, acts)).toBeUndefined();
      expect(automationStudioInstructedActStepThatNamesIt(acts[1]!, acts, napkinsNotNow, draft)).toBeUndefined();
      expect(itemOf(TWO, draft, "a2")).not.toHaveProperty("instead");
    });

    it("named for the towels act", () => {
      const draft = [add(4, { acts: ["a1"] }), napkinsNotNow];
      expect(automationStudioInstructedActStepDidInstead(acts[1]!, napkinsNotNow, draft, acts)).toBeUndefined();
      expect(itemOf(TWO, draft, "a2")).not.toHaveProperty("instead");
    });

    it("but offers one that names no other object", () => {
      const draft = [add(4), napkinsNotNow];
      expect(automationStudioInstructedActStepDidInstead(acts[1]!, napkinsNotNow, draft, acts)).toEqual({ fault: "another_step_shows_it" });
    });
  });
});
