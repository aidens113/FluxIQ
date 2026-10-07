// A choice of an act named on a step after the step that does the act
// (`../choice-order.ts`, t193-1002m-w6 task F').
//
// Live run `run-murwdp4f-35f976d2`: the draft pressed the towels' "+" (a2.quantity,
// step 16) after their Add to cart (a2, step 12), so the Flow adds one pack.
// The verdict does not refuse it (t195): it says so, as information, to the
// model beside its draft (the checklist) and to the judge of the build's test.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioInstructedActsChecklist, automationStudioInstructedActsNotDone, checkAutomationStudioInstructedActs, checkAutomationStudioInstructedActsOptionalOnly } from "../index.ts";

const TOWELS = "Add two packs of the Softly Paper Towels to my cart.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

describe("a choice named on a step after its act's step", () => {
  it("is said, as information, and the completion is not refused for it", () => {
    const draft = [step(12, { acts: ["a1"] }), step(16, { acts: ["a1.quantity"] })];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "Adds the towels." }, draftSteps: draft });
    expect(verdict.ok).toBe(true);
    expect(verdict.choicesAfterAct).toEqual([{ id: "a1.quantity", step: 16, actStep: 12, said: expect.stringContaining("step 16") }]);
    expect(verdict.choicesAfterAct?.[0]?.said).toContain("step 12");
    expect(verdict.choicesAfterAct?.[0]?.said).toContain("before");
    // The checklist, which the model reads beside its draft and the judge reads in the test, says the same.
    const items = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: draft })!;
    expect(items[0]?.choices?.[0]).toMatchObject({ id: "a1.quantity", done: 16, afterAct: 12, afterActSaid: verdict.choicesAfterAct?.[0]?.said });
  });

  it("is not said for a choice made before its act", () => {
    const draft = [step(11, { acts: ["a1.quantity"] }), step(12, { acts: ["a1"] })];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "Adds the towels." }, draftSteps: draft });
    expect(verdict.ok).toBe(true);
    expect(verdict.choicesAfterAct).toBeUndefined();
    const items = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: draft })!;
    expect(items[0]?.choices?.[0]).toMatchObject({ id: "a1.quantity", done: 11 });
    expect(items[0]?.choices?.[0]).not.toHaveProperty("afterAct");
  });

  // Live run `run-murzln6g-11debe1d` (C3): told eight times to "make the choice
  // before the step that does a2", the model never moved step 16 -- the
  // sentence did not say which amendment moves a step.
  it("names the amendment that moves the choice: reorder, with to the act step's position", () => {
    const draft = [step(12, { acts: ["a1"] }), step(16, { acts: ["a1.quantity"] })];
    const said = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "Adds the towels." }, draftSteps: draft }).choicesAfterAct?.[0]?.said;
    expect(said).toContain("amend_draft reorder on step 16 with to 12");
  });

  it("does not move a choice ahead of its recorded place: a legitimate change after the act", () => {
    const draft = [
      step(12, { acts: ["a1"], control: "Add to cart", replay: { from: { location: "before" } } }),
      step(16, { acts: ["a1.quantity"], control: "Change cart quantity", replay: { from: { location: "after" } } })
    ];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "Adds the towels." }, draftSteps: draft });
    expect(verdict.ok).toBe(true);
    const said = verdict.choicesAfterAct?.[0]?.said;
    expect(said).not.toContain("amend_draft reorder");
    expect(said).not.toContain("Or do a1 again");
    expect(said).toContain("different place");
    expect(said).toContain("claim");
    const items = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: draft })!;
    expect(items[0]?.choices?.[0]).toMatchObject({ done: 16, afterAct: 12, afterActSaid: said });
    expect(draft[0]?.acts).toEqual(["a1"]);
  });

  // A wrongly claimed arrival was said here as a choice after its act; since
  // run mux6pndp the arrival does not do the act at all (`../standing.ts`).
  it("does not count a wrongly claimed arrival for the act, and moves nothing", () => {
    const draft = [
      step(12, { acts: ["a1"], control: "Open item", replay: { from: { location: "before" } } }),
      step(16, { acts: ["a1.quantity"], control: "Set quantity", replay: { from: { location: "after" } } })
    ];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "Adds the towels." }, draftSteps: draft });
    expect(verdict.choicesAfterAct).toBeUndefined();
    const items = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: draft })!;
    expect(items[0]).toMatchObject({ todo: "step_only_opens_its_choices", step: 12 });
    expect(items[0]?.choices?.[0]).toMatchObject({ done: 16 });
    expect(items[0]?.choices?.[0]).not.toHaveProperty("afterAct");
    expect(draft[0]?.acts).toEqual(["a1"]);
  });

  it("keeps the reorder hint when both steps acted in the same recorded place", () => {
    const draft = [
      step(12, { acts: ["a1"], replay: { from: { location: "item" } } }),
      step(16, { acts: ["a1.quantity"], replay: { from: { location: "item" } } })
    ];
    const said = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: {}, draftSteps: draft }).choicesAfterAct?.[0]?.said;
    expect(said).toContain("amend_draft reorder on step 16 with to 12");
  });

  it("does not infer a different place from incomplete evidence", () => {
    const draft = [step(12, { acts: ["a1"] }), step(16, { acts: ["a1.quantity"], replay: { from: { location: "item" } } })];
    const said = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: {}, draftSteps: draft }).choicesAfterAct?.[0]?.said;
    expect(said).toContain("amend_draft reorder on step 16 with to 12");
  });
});

// Live run `run-mux6pndp-16feb842` (lane B round 3, cause 1), as decision 0033
// was shown it: `keep 10 act a2` put "add the towels to my cart" on the product
// link (step 10, words naming the product, found on the search page); size (11)
// and "+" (12) were then made on the product page it opened. The checklist said
// `a2 done: 10`, so every "Still not done" list and the answer "a2 done, so
// nothing is left to do for it" hid the Add to cart, which was never pressed.
// Only what Core reads is kept: positions, claims, words and recorded places.
describe("an act claimed on the step that only opened the page where its choices are made", () => {
  const PICKUP = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup.";
  const press = (position: number, from: string, target: string, acts?: string[]): AutomationStudioFlowDraftStep =>
    step(position, { words: { target }, replay: { from: { location: from } }, ...(acts ? { acts } : {}) });
  const store = press(8, "home", "Set as my store", ["a1"]);
  const link = (acts?: string[]) => press(10, "search", "ValueRidge Essentials Select-A-Size Paper Towels, 6 Double Rolls", acts);
  const size = press(11, "item", "12 Double Rolls$16.47", ["a2.size"]);
  const plus = press(12, "item", "+", ["a2.quantity"]);
  const a2Of = (draft: AutomationStudioFlowDraftStep[]) => automationStudioInstructedActsChecklist({ instructionText: PICKUP, draftSteps: draft })!.find((each) => each.id === "a2")!;

  it("is not done: the step is named as only opening the page of its choices, and the act stays on the list still to do", () => {
    const draft = [store, link(["a2"]), size, plus];
    const items = automationStudioInstructedActsChecklist({ instructionText: PICKUP, draftSteps: draft })!;
    const a2 = items.find((each) => each.id === "a2")!;
    expect(a2).toMatchObject({ todo: "step_only_opens_its_choices", step: 10 });
    expect(a2).not.toHaveProperty("done");
    expect(automationStudioInstructedActsNotDone(items)).toContain("a2");
    // Its choices stand as made; with no step doing a2 there is no act for them to come after.
    expect(a2.choices?.find((each) => each.id === "a2.size")).toMatchObject({ done: 11 });
    expect(a2.choices?.find((each) => each.id === "a2.size")).not.toHaveProperty("afterAct");
    // The verdict, information for the model and the judge of the build's test
    // (t195: it refuses no completion), says the same and how to do the act.
    const verdict = checkAutomationStudioInstructedActs({ instructionText: PICKUP, result: { summary: "Adds the towels." }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing).toEqual(expect.arrayContaining([expect.objectContaining({ id: "a2", reason: "step_only_opens_its_choices" })]));
    expect(verdict.instruction).toContain("A reason of step_only_opens_its_choices");
    // The one completion rule that reads this verdict refuses only an optional-only act.
    expect(checkAutomationStudioInstructedActsOptionalOnly({ instructionText: PICKUP, result: { summary: "Adds the towels." }, draftSteps: draft }).ok).toBe(true);
  });

  it("is done by the press after its choices once that press names it", () => {
    const draft = [store, link(), size, plus, press(13, "item", "Add to cart", ["a2"])];
    expect(a2Of(draft)).toMatchObject({ done: 13 });
    expect(a2Of(draft).choices?.find((each) => each.id === "a2.quantity")).toMatchObject({ done: 12 });
  });

  it("still counts a press whose words name the act, with its choice after it at another place as information", () => {
    const draft = [store, press(10, "item", "Add to cart", ["a2"]), press(11, "cart", "12 Double Rolls", ["a2.size"])];
    expect(a2Of(draft)).toMatchObject({ done: 10 });
    expect(a2Of(draft).choices?.find((each) => each.id === "a2.size")).toMatchObject({ done: 11, afterAct: 10 });
  });

  it("still counts a doubted claim whose choices were made on the same page", () => {
    const draft = [store, press(10, "item", "Buy box", ["a2"]), press(11, "item", "12 Double Rolls", ["a2.size"])];
    expect(a2Of(draft)).toMatchObject({ done: 10 });
  });
});

// Live run `run-musq0b1m-0472cfa0` (Cause 2), as decision 0019 was shown it:
// the model had named a1 on the listing click (step 6), which opened the item
// in a new tab; Space Grey (7, then 8) and 7-in-1 (9) were pressed on the item
// page after it. The sentence then said "reorder on step 8 with to 6" on
// position alone, the model obeyed, and the first test ran both choices on the
// search page: unreproducible, nine repair decisions. Only what Core reads is
// kept from that draft -- the positions, the claims and each step's recorded
// place (`replay.from`, compared whole) -- with placeholder places and words.
describe("the choices after an act claimed on a step that led to another page", () => {
  const HUB = "Put the USB-C hub in my cart: Space Grey, the 7-in-1 version.";
  const press = (position: number, from: string, target: string, acts?: string[]): AutomationStudioFlowDraftStep =>
    step(position, { words: { target }, replay: { from: { location: from } }, ...(acts ? { acts } : {}) });
  const draft = [
    press(6, "search", "hub listing", ["a1"]),
    press(7, "item", "Space Grey"),
    press(8, "item", "Space Grey", ["a1.colour"]),
    press(9, "item", "7-in-1", ["a1.version"])
  ];

  it("prescribes no reorder of either choice ahead of the step that opened their page, and keeps both done", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: HUB, result: { summary: "Adds the hub." }, draftSteps: draft });
    // The listing click only opened the page of a1's choices, so it does not do
    // a1 (run mux6pndp, `../standing.ts`): no choice comes after a1's step, and
    // nothing is told to move.
    expect(verdict.choicesAfterAct).toBeUndefined();
    expect(JSON.stringify(verdict)).not.toContain("reorder");
    const items = automationStudioInstructedActsChecklist({ instructionText: HUB, draftSteps: draft })!;
    const choices = items[0]?.choices ?? [];
    expect(choices.find((each) => each.id === "a1.colour")).toMatchObject({ done: 8 });
    expect(choices.find((each) => each.id === "a1.version")).toMatchObject({ done: 9 });
    expect(choices.some((each) => "afterAct" in each)).toBe(false);
    // The claim on the listing click stays on it and does not do a1; the
    // verdict says what step 6 did in place of the doubt (`../act-evidence.ts`).
    expect(items[0]).toMatchObject({ todo: "step_only_opens_its_choices", step: 6, todoSaid: expect.stringContaining("Step 6") });
    expect(items[0]?.todoSaid).toContain("only opened the page where a1's choices are made");
    expect(items[0]).not.toHaveProperty("claimSaid");
    expect(draft[0]?.acts).toEqual(["a1"]);
  });
});
