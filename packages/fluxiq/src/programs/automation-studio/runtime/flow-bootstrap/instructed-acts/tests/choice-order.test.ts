// A choice of an act named on a step after the step that does the act
// (`../choice-order.ts`, t193-1002m-w6 task F').
//
// Live run `run-murwdp4f-35f976d2`: the draft pressed the towels' "+" (a2.quantity,
// step 16) after their Add to cart (a2, step 12), so the Flow adds one pack.
// The verdict does not refuse it (t195): it says so, as information, to the
// model beside its draft (the checklist) and to the judge of the build's test.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioInstructedActsChecklist, checkAutomationStudioInstructedActs } from "../index.ts";

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

  it.each([
    ["a wrongly claimed arrival", "Open item", "Set quantity"],
    ["a legitimate change after the act", "Add to cart", "Change cart quantity"]
  ])("does not move a choice ahead of its recorded place: %s", (_case, actControl, choiceControl) => {
    const draft = [
      step(12, { acts: ["a1"], control: actControl, replay: { from: { location: "before" } } }),
      step(16, { acts: ["a1.quantity"], control: choiceControl, replay: { from: { location: "after" } } })
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
    const colour = verdict.choicesAfterAct?.find((each) => each.id === "a1.colour");
    expect(colour).toMatchObject({ step: 8, actStep: 6 });
    expect(colour?.said).not.toContain("reorder");
    expect(colour?.said).toContain("Do not move step 8 before step 6");
    expect(colour?.said).toContain("claim");
    // The checklist the model reads every decision says the same, and the choices stay done.
    const items = automationStudioInstructedActsChecklist({ instructionText: HUB, draftSteps: draft })!;
    const choices = items[0]?.choices ?? [];
    expect(choices.find((each) => each.id === "a1.colour")).toMatchObject({ done: 8, afterAct: 6, afterActSaid: colour?.said });
    expect(choices.find((each) => each.id === "a1.version")).toMatchObject({ done: 9, afterAct: 6 });
    expect(choices.find((each) => each.id === "a1.version")?.afterActSaid).not.toContain("reorder");
    // The claim on the listing click is doubted, and stands (`../claim-doubt.ts`).
    expect(items[0]).toMatchObject({ done: 6, claimSaid: expect.stringContaining("step 6") });
  });
});
