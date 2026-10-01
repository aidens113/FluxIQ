// The instructed acts as the model's checklist beside its draft (audit A1,
// cause 1): the same reading and the same rule the completion check applies,
// so an act shown done is an act a completion accepts.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import {
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsNotDone,
  checkAutomationStudioInstructedActs
} from "../index.ts";

const TABLES = "Save the three cheapest dining tables for sale within 5 miles of Kelford to my saved items, then give me a table of everything in my saved items, cheapest first, with columns title, price and status.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

describe("the acts checklist", () => {
  it("shows every act as todo before anything is authored, with the ids a completion is judged by", () => {
    const items = automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: [] })!;
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: [step(1, { disposition: "taken" })] });
    expect(items.map((item) => [item.id, item.todo])).toEqual([["a1", "no_step_added"], ["a2", "no_step_added"]]);
    // The ids a refusal would name are the ids shown from the first decision.
    expect(verdict.ok ? [] : verdict.missing.map((act) => act.id)).toEqual(items.map((item) => item.id));
    expect(items[0]).toMatchObject({ verb: "save", quote: expect.stringContaining("dining tables") });
    expect(automationStudioInstructedActsNotDone(items)).toEqual(["a1", "a2"]);
  });

  it("shows an act done by the step of the Flow the model said does it, and a completion then needs no claim", () => {
    const draft = [step(1, { disposition: "taken" }), step(2, { acts: ["a1"] }), step(3, { acts: ["a2"] })];
    const items = automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: draft })!;
    expect(items.map((item) => [item.id, item.done, item.todo])).toEqual([["a1", 2, undefined], ["a2", 3, undefined]]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "Saves and lists." }, draftSteps: draft }).ok).toBe(true);
  });

  it("names why a step said to do an act does not, by the check's own rule", () => {
    const draft = [step(1, { acts: ["a1"], disposition: "taken" }), step(2, { acts: ["a2"], effect: "observe" })];
    const items = automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: draft })!;
    // A step that only reads is said to, not lumped with a press that failed.
    expect(items.map((item) => [item.id, item.todo, item.step])).toEqual([["a1", "step_not_kept", 1], ["a2", "step_only_reads", 2]]);
    // The check refuses the same two steps, by the positions the checklist shows.
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: draft });
    expect(verdict.ok ? [] : verdict.missing.map((act) => [act.id, act.reason, act.step])).toEqual([["a1", "step_not_kept", "1"], ["a2", "step_changed_nothing", "2"]]);
  });

  it("does not count an act off a step the model has not put in the Flow", () => {
    const draft = [step(1, { acts: ["a1"], disposition: "taken" }), step(2, { acts: ["a2"] })];
    expect(automationStudioInstructedActsNotDone(automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: draft }))).toEqual(["a1"]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: draft }).ok).toBe(false);
  });

  it("lists each act's choices beside it, done or todo, by the check's own rule", () => {
    const TOWELS = "Add two packs of the Softly Paper Towels in the 12 Double Rolls size to my cart.";
    const empty = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: [] })!;
    expect(empty.map((item) => [item.id, item.todo, item.choices?.map((choice) => [choice.id, choice.choice, choice.value, choice.todo])])).toEqual([
      ["a1", "no_step_added", [["a1.quantity", "quantity", "two", "no_step_added"], ["a1.size", "variant", "12 Double Rolls", "no_step_added"]]]
    ]);
    expect(automationStudioInstructedActsNotDone(empty)).toEqual(["a1", "a1.quantity", "a1.size"]);

    // The size chosen by its own step, the quantity claimed by the add itself, which was given no number.
    const draft = [step(1, { acts: ["a1.size"] }), step(2, { acts: ["a1", "a1.quantity"] })];
    const items = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: draft })!;
    expect(items[0]!.done).toBe(2);
    expect(items[0]!.choices!.map((choice) => [choice.id, choice.done, choice.todo, choice.step])).toEqual([
      ["a1.quantity", undefined, "choice_is_the_act_step", 2],
      ["a1.size", 1, undefined, undefined]
    ]);
    // The check refuses exactly what the checklist shows as todo.
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "x" }, draftSteps: draft });
    expect(verdict.ok ? [] : verdict.missing.map((missing) => [missing.id, missing.reason])).toEqual([["a1.quantity", "choice_is_the_act_step"]]);

    // An add given the number makes the quantity too, and then the check accepts the Flow.
    const given = [step(1, { acts: ["a1.size"] }), step(2, { acts: ["a1", "a1.quantity"], input: { quantity: "2" } })];
    const done = automationStudioInstructedActsChecklist({ instructionText: TOWELS, draftSteps: given })!;
    expect(automationStudioInstructedActsNotDone(done)).toEqual([]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TOWELS, result: { summary: "x" }, draftSteps: given }).ok).toBe(true);
  });

  it("is nothing for an instruction that asks only for something to be read", () => {
    expect(automationStudioInstructedActsChecklist({ instructionText: "List the dining tables for sale in Kelford.", draftSteps: [] })).toBeUndefined();
  });
});

// Live run 36 (`run-muq3uozx-3153564b`): the checklist showed a1 done by the
// repeated Confirm while the check, judging only the first step naming a1 (the
// list read), refused 24 completions. Both now share one loop, so over any
// draft the checklist shows everything done exactly when the check accepts it,
// and shows as not done exactly what the check refuses.
describe("the checklist and the check agree on every draft", () => {
  const CONFIRM = "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is.";
  const TOWELS = "Add two packs of the Softly Paper Towels in the 12 Double Rolls size to my cart.";
  const read = (position: number, acts?: string[]) => step(position, { actionId: "web.dom.extract_list", effect: "observe", proposes: true, ...(acts ? { acts } : {}) });
  const repeated = (position: number, over: number, acts?: string[]) => step(position, { routing: { kind: "repeat", over: `d${over}`, through: `d${position}` }, ...(acts ? { acts } : {}) });
  const cases: Array<readonly [string, string, AutomationStudioFlowDraftStep[]]> = [
    ["run 36: the read and the repeated Confirm both named", CONFIRM, [read(1, ["a1"]), repeated(2, 1, ["a1"])]],
    ["run 36 as its draft stood: two reads, the repeated Confirm, a Confirm once", CONFIRM, [read(1, ["a1"]), read(2, ["a1"]), repeated(3, 2, ["a1"]), step(4, { acts: ["a1"] })]],
    ["only the read named", CONFIRM, [read(1, ["a1"]), repeated(2, 1)]],
    ["the read and a Confirm that acts once", CONFIRM, [read(1, ["a1"]), step(2, { acts: ["a1"] })]],
    ["a dropped Confirm, then the repeated one", CONFIRM, [read(1), step(2, { acts: ["a1"], disposition: "dropped" }), repeated(3, 1, ["a1"])]],
    ["an optional Confirm", CONFIRM, [read(1), step(2, { acts: ["a1"], routing: { kind: "optional" } })]],
    ["nothing named", TABLES, [step(1), step(2)]],
    ["each act its own press", TABLES, [step(1, { acts: ["a1"] }), step(2, { acts: ["a2"] })]],
    ["one press named for both acts", TABLES, [step(1, { acts: ["a1", "a2"] })]],
    ["a read, then the press, named for the save", TABLES, [read(1, ["a1"]), step(2, { acts: ["a1"] }), step(3, { acts: ["a2"] })]],
    ["the add named for its own quantity", TOWELS, [step(1, { acts: ["a1.size"] }), step(2, { acts: ["a1", "a1.quantity"] })]],
    ["the add given its quantity", TOWELS, [step(1, { acts: ["a1.size"] }), step(2, { acts: ["a1", "a1.quantity"], input: { quantity: "2" } })]],
    ["one step named for both choices", TOWELS, [step(1, { acts: ["a1.size", "a1.quantity"] }), step(2, { acts: ["a1"] })]],
    ["the choices on their own steps, after a read naming the add", TOWELS, [read(1, ["a1"]), step(2, { acts: ["a1.size"] }), step(3, { acts: ["a1.quantity"] }), step(4, { acts: ["a1"] })]]
  ];

  it.each(cases)("%s", (_label, instructionText, draftSteps) => {
    const notDone = automationStudioInstructedActsNotDone(automationStudioInstructedActsChecklist({ instructionText, draftSteps }));
    const verdict = checkAutomationStudioInstructedActs({ instructionText, result: { summary: "x" }, draftSteps });
    expect(verdict.ok).toBe(notDone.length === 0);
    expect(verdict.ok ? [] : verdict.missing.map((missing) => missing.id)).toEqual(notDone);
  });

  it("covers drafts the check accepts and drafts it refuses", () => {
    const verdicts = cases.map(([, instructionText, draftSteps]) => checkAutomationStudioInstructedActs({ instructionText, result: { summary: "x" }, draftSteps }).ok);
    expect(verdicts.filter(Boolean).length).toBeGreaterThanOrEqual(4);
    expect(verdicts.filter((ok) => !ok).length).toBeGreaterThanOrEqual(4);
  });
});
