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
});
