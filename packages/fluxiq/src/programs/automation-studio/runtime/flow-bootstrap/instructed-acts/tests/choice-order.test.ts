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
});
