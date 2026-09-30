// The instructed acts as the model's checklist beside its draft (audit A1,
// cause 1): the same reading and the same rule the completion check applies,
// so an act shown done is an act a completion accepts.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import {
  automationStudioInstructedActDraftClaims,
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
    expect(automationStudioInstructedActDraftClaims(draft)).toEqual([{ action: "a1", step: "2" }, { action: "a2", step: "3" }]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "Saves and lists." }, draftSteps: draft }).ok).toBe(true);
  });

  it("names why a step said to do an act does not, by the check's own rule", () => {
    const draft = [step(1, { acts: ["a1"], disposition: "taken" }), step(2, { acts: ["a2"], effect: "observe" })];
    const items = automationStudioInstructedActsChecklist({ instructionText: TABLES, draftSteps: draft })!;
    expect(items.map((item) => [item.id, item.todo, item.step])).toEqual([["a1", "step_not_kept", 1], ["a2", "step_changed_nothing", 2]]);
  });

  it("does not read an act off a step the model has not put in the Flow", () => {
    expect(automationStudioInstructedActDraftClaims([step(1, { acts: ["a1"], disposition: "taken" })])).toEqual([]);
  });

  it("is nothing for an instruction that asks only for something to be read", () => {
    expect(automationStudioInstructedActsChecklist({ instructionText: "List the dining tables for sale in Kelford.", draftSteps: [] })).toBeUndefined();
  });
});
