// What the stall note says about an act still owed. Live run 36
// (`run-muq3uozx-3153564b`, E36): step 11 already named a1, the note said "run
// it and add it with act a1", and the model's next action confirmed a request
// its listing had left out.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceStallRedirect } from "../stall-redirect.ts";

const redirect = (acts?: unknown) => automationStudioLlmEvidenceStallRedirect({
  stepsWithoutProgress: 3,
  maxStepsWithoutProgress: 8,
  repeatingToolIds: [],
  proposableSteps: 2,
  completionAttempts: 1,
  lastIssueCodes: ["bootstrap.instructed_act_missing"],
  canComplete: true,
  actsMissing: ["a1"],
  ...(acts === undefined ? {} : { acts: acts as never })
});

describe("the stall note about an act still owed", () => {
  it("says run it only when no step names the act", () => {
    for (const acts of [undefined, [{ id: "a1", verb: "confirm", quote: "confirm", todo: "no_step_added" }]]) {
      const said = String(redirect(acts).instruction);
      expect(said).toContain("run it and add it with act a1");
    }
  });

  it("names the step that names the act and the checklist's reason, and never says run it", () => {
    const said = String(redirect([{ id: "a1", verb: "confirm", quote: "confirm", plural: true, todo: "step_changed_nothing", step: 11 }]).instruction);
    expect(said).not.toContain("run it");
    expect(said).toContain("Step 11 already names a1");
    expect(said).toContain("step_changed_nothing");
    expect(said).toContain("correct step 11");
    expect(said).toContain("never act yourself on an item your listing left out");
  });

  it("finds a choice under its act, and ignores a checklist entry that is not codes and positions", () => {
    const choice = String(automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: [], proposableSteps: 1, completionAttempts: 0, lastIssueCodes: [], canComplete: true,
      actsMissing: ["a2.quantity"],
      acts: [{ id: "a2", verb: "add", quote: "add two", done: 3, choices: [{ id: "a2.quantity", choice: "quantity", value: "two", quote: "two", todo: "choice_is_the_act_step", step: 3 }] }]
    }).instruction);
    expect(choice).toContain("Step 3 already names a2.quantity");
    const garbled = String(redirect([{ id: "a1", todo: "a sentence, not a code", step: 11 }]).instruction);
    expect(garbled).toContain("run it and add it with act a1");
  });

  // Live run `run-muwaq9w3-baaa4e19` (lane B): a2.size was done, a2 and its
  // a2.quantity were owed, and the note said "the one that does a2". The model
  // pressed Add to cart at quantity 1, then tried a repeat for the second pack.
  // The press that does an act commits the choices made before it, so an act's
  // owed choice is the next step, not the act.
  it("sends an act's owed choice before the act itself", () => {
    const said = String(automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: [], proposableSteps: 8, completionAttempts: 0, lastIssueCodes: [], canComplete: true,
      actsMissing: ["a2", "a2.quantity", "a3", "a3.size"],
      acts: [
        { id: "a2", verb: "add", quote: "add two packs", todo: "no_step_added", choices: [
          { id: "a2.quantity", choice: "quantity", value: "two", quote: "two packs", todo: "no_step_added" },
          { id: "a2.size", choice: "variant", value: "12 Double Rolls", quote: "12 Double Rolls", done: 11 }
        ] },
        { id: "a3", verb: "add", quote: "add one pack", todo: "no_step_added", choices: [{ id: "a3.size", choice: "variant", value: "250 Count", quote: "250 Count", todo: "no_step_added" }] }
      ]
    }).instruction);
    expect(said).toContain("Your next step is the one that does a2.quantity: run it and add it with act a2.quantity.");
    expect(said).not.toContain("the one that does a2:");
  });

  it("sends the act once none of its choices is owed", () => {
    const said = String(automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: [], proposableSteps: 8, completionAttempts: 0, lastIssueCodes: [], canComplete: true,
      actsMissing: ["a2", "a3", "a3.size"]
    }).instruction);
    expect(said).toContain("Your next step is the one that does a2: run it and add it with act a2.");
  });
});
