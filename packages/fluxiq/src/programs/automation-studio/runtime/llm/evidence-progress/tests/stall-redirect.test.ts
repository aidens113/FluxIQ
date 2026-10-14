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

  // Live run `run-mux6pndp-16feb842` (lane B round 3): a2 was claimed on the
  // product link (step 10) and its choices made on the page it opened. The
  // checklist now says `step_only_opens_its_choices`; "correct step 10 … do not
  // run another step for a2" would forbid the very press that does a2.
  it("sends the model to the press after the choices when the step named only opened their page", () => {
    const said = String(automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: [], proposableSteps: 8, completionAttempts: 0, lastIssueCodes: [], canComplete: true,
      actsMissing: ["a2", "a3", "a3.size"],
      acts: [
        { id: "a2", verb: "add", quote: "add two packs", todo: "step_only_opens_its_choices", step: 10, choices: [
          { id: "a2.quantity", choice: "quantity", value: "two", quote: "two packs", done: 12 },
          { id: "a2.size", choice: "variant", value: "12 Double Rolls", quote: "12 Double Rolls", done: 11 }
        ] }
      ]
    }).instruction);
    expect(said).toContain("Step 10 only opened the page where a2's choices are made and does not do a2");
    expect(said).toContain("run the step that does a2 and add it with act a2");
    expect(said).not.toContain("Do not run another step for a2");
  });

  // Week report W1: the checklist now says what a claimed step did instead and
  // where to name the act (`todoSaid`, run `run-mux74k5q-1c3c2127`: a1 on the
  // press of "Spain"). "correct step 5 ... Do not run another step for a1"
  // forbade naming a1 on the Add to cart press, the very step that does it.
  it("says the checklist's own sentence for the step named, in place of correct it and run no other step", () => {
    const todoSaid = "Step 5 chose \"Spain\", one of a1's options (a1.origin), and does not do a1. Step 7 (\"Add to cart\") names it: name a1 there with amend_draft add on step 7 with act a1.";
    const said = String(redirect([{ id: "a1", verb: "put", quote: "put the hub in my cart", todo: "step_only_chooses", step: 5, todoSaid }]).instruction);
    expect(said).toContain(todoSaid);
    expect(said).not.toContain("correct step 5");
    expect(said).not.toContain("Do not run another step for a1");
    // Only a string is read: anything else leaves the generic note.
    expect(String(redirect([{ id: "a1", todo: "step_changed_nothing", step: 5, todoSaid: 7 }]).instruction)).toContain("correct step 5 for that reason");
  });

  it("sends the act once none of its choices is owed", () => {
    const said = String(automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: [], proposableSteps: 8, completionAttempts: 0, lastIssueCodes: [], canComplete: true,
      actsMissing: ["a2", "a3", "a3.size"]
    }).instruction);
    expect(said).toContain("Your next step is the one that does a2: run it and add it with act a2.");
  });
});


describe("candidate stall guidance", () => {
  it("names the exact accepted receipt instead of legacy draft instructions", () => {
    const candidate = { revision: 7, digest: "b".repeat(64) };
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 2, maxStepsWithoutProgress: 8, repeatingToolIds: ["core.submit_candidate"],
      proposableSteps: 0, completionAttempts: 0, lastIssueCodes: [], canComplete: true,
      ...{ discoveryOnly: true, candidate }
    });
    expect(note).toMatchObject({ candidate, stepsLeftBeforeStopping: 6 });
    expect(note.instruction).toContain(`{"revision":7,"digest":"${candidate.digest}"}`);
    expect(note.instruction).toContain("core.test_candidate");
    expect(note.instruction).not.toMatch(/Your draft|amend_draft|run a step|or complete/u);
  });

  it("does not invent a receipt or draft when no candidate has been accepted", () => {
    const note = automationStudioLlmEvidenceStallRedirect({
      stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: ["inspect"],
      proposableSteps: 0, completionAttempts: 0, lastIssueCodes: [], canComplete: true,
      ...{ discoveryOnly: true }
    });
    expect(note.instruction).toContain("Submit the whole candidate only once");
    expect(note.instruction).not.toMatch(/Your draft|amend_draft|or complete/u);
    expect(note).not.toHaveProperty("candidate");
  });
});

// Live run `run-mv6bg7ac-d24d91ce`: with no candidate accepted and one act's
// object still the wrong item, the note said "Use the evidence already
// gathered ... submit the whole candidate", and the model submitted the wrong
// item. A no-candidate stall says "submit" only when Core's own record (the
// acts checklist, the completion check) shows every act covered.
describe("a no-candidate stall", () => {
  const stall = (extra: Record<string, unknown>) => String(automationStudioLlmEvidenceStallRedirect({
    stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: ["web.search"],
    proposableSteps: 0, completionAttempts: 0, lastIssueCodes: [], canComplete: true, discoveryOnly: true,
    ...extra
  }).instruction);
  const routes = /control on the current page you have not used.*page search with other or fewer words.*going back to a listing/su;

  it("points to untried routes, not to submitting, while an act is still owed", () => {
    const said = stall({ actsMissing: ["a2", "a2.variant"] });
    expect(said).not.toContain("Use the evidence already gathered");
    expect(said).not.toMatch(/correct any named submission issues and submit/u);
    expect(said).toContain("a2, a2.variant not shown done");
    expect(said).toMatch(routes);
    expect(said).toContain("Submit the whole candidate only once the evidence shows every act");
  });

  it("points to untried routes when Core holds no record of the acts", () => {
    const said = stall({});
    expect(said).not.toContain("Use the evidence already gathered");
    expect(said).toMatch(routes);
  });

  it("points to untried routes when the completion check names a gap", () => {
    const said = stall({ actsMissing: [], answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false } });
    expect(said).toContain("stillMissing: record_producer");
    expect(said).toMatch(routes);
  });

  it("says submit when the checklist owes nothing", () => {
    const said = stall({ actsMissing: [] });
    expect(said).toContain("Use the evidence already gathered, correct any named submission issues and submit the whole candidate");
    expect(said).not.toMatch(routes);
  });

  it("uses no scenario words", () => {
    for (const said of [stall({ actsMissing: ["a1"] }), stall({})]) {
      expect(said).not.toMatch(/napkin|pack|towel|shop|store|cart|product/iu);
    }
  });
});

// A discovery-only loop with its own finishing tools is told to test with its own (t537).
describe("the stall note of a loop with its own finishing tools", () => {
  const note = (finishing?: { submit: string; test: string }) => String(automationStudioLlmEvidenceStallRedirect({
    discoveryOnly: true, candidate: { revision: 2, digest: "d".repeat(64) }, stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: [],
    proposableSteps: 0, completionAttempts: 0, lastIssueCodes: [], canComplete: true, ...(finishing ? { finishing } : {})
  }).instruction);

  it("names the loop's own test tool, and the candidate's when it names none", () => {
    expect(note({ submit: "core.submit_subflow", test: "core.test_subflow" })).toContain("Use core.test_subflow with that exact revision");
    expect(note()).toContain("Use core.test_candidate with that exact revision");
  });
});

// A loop that plans rather than acts (t569): the project supervisor of
// `run-mv7t07hx-fe96a174` writes no draft and runs no step, so the draft's
// sentences sent it to do a builder's work. Its own way forward is said instead.
describe("the stall note of a loop that plans", () => {
  const base = { stepsWithoutProgress: 3, maxStepsWithoutProgress: 8, repeatingToolIds: ["web.find_on_page"], proposableSteps: 0, completionAttempts: 0, lastIssueCodes: [], canComplete: true };
  const forward = { toolId: "plan.write", instruction: "Write the plan now with plan.write." };

  it("says its way forward, with its tool under next, in place of the draft's sentences", () => {
    const note = automationStudioLlmEvidenceStallRedirect({ ...base, looksWithdrawn: true, forward });
    expect(note).toMatchObject({ code: "llm_evidence_loop.no_progress", next: "plan.write", looksWithdrawn: true, stepsLeftBeforeStopping: 5 });
    expect(note).not.toHaveProperty("draftStepsSoFar");
    expect(note.instruction).toBe("The last 3 steps told you nothing you did not already have. "
      + "The tools named in repeatingToolIds are answering with what they already answered; asking them again will return the same thing again. "
      + "Looking is withdrawn: no look is offered, and one asked for is refused. Write the plan now with plan.write. 5 more step(s) without progress and this build stops.");
  });

  it("leaves out next when the way forward names no tool, and says so on the last step", () => {
    const note = automationStudioLlmEvidenceStallRedirect({ ...base, stepsWithoutProgress: 8, forward: { instruction: "Complete now." } });
    expect(note).not.toHaveProperty("next");
    expect(String(note.instruction)).toMatch(/Complete now\. This build stops on the next step without progress\.$/u);
  });

  it("leaves every other loop's note as it was", () => {
    const note = automationStudioLlmEvidenceStallRedirect(base);
    expect(note).toMatchObject({ draftStepsSoFar: 0 });
    expect(note).not.toHaveProperty("next");
    expect(String(note.instruction)).toContain("Your draft holds no step that could be proposed yet");
  });
});
