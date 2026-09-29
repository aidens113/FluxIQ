import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE, checkAutomationStudioInstructedActs } from "../check.ts";

const TABLES = "Save the three cheapest dining tables for sale within 5 miles of Kelford to my saved items, then give me a table of everything in my saved items, cheapest first, with columns title, price and status.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

// `run-mulxk0ro-36bf090d`'s draft: navigate, decline cookies, type, Enter, and
// a read of the first results page. Nothing saved, saved items never opened.
const HALF_A_JOB: AutomationStudioFlowDraftStep[] = [
  step(1, { actionId: "web.navigate" }),
  step(2),
  step(3, { actionId: "web.dom.type" }),
  step(4, { actionId: "web.dom.press_key" }),
  step(5, { actionId: "web.dom.extract_list", effect: "observe", proposes: true })
];

describe("whether the draft does what the instruction asks to be done", () => {
  it("refuses the half-done local-classifieds build, naming both missing acts in the person's words", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "Reads dining tables." }, draftSteps: HALF_A_JOB });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.issue.code).toBe(AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE);
    expect(verdict.missing.map((act) => [act.id, act.kind, act.reason])).toEqual([["a1", "save", "no_step_named"], ["a2", "open", "no_step_named"]]);
    expect(JSON.stringify(verdict.missingActs)).toContain("Save the three cheapest dining tables");
  });

  it("accepts each act claimed by its own kept step that changed something", () => {
    const draft = [...HALF_A_JOB, step(6), step(7, { actionId: "web.navigate" })];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "Saves and lists.", acts: [{ action: "save the tables", step: "d6" }, { action: "a2", step: "d7" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(true);
  });

  it.each([
    ["a step that is not there", "d42", "no_such_step"],
    ["a step the model dropped", "d6", "step_not_kept"],
    ["a read that changed nothing", "d5", "step_changed_nothing"]
  ])("refuses a claim naming %s", (_label, named, reason) => {
    const draft = [...HALF_A_JOB, step(6, { disposition: "dropped" }), step(7)];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: [{ action: "save", step: named }, { action: "open", step: "d7" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((act) => act.reason)).toEqual([reason]);
  });

  it("refuses one press claimed for two acts", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: [{ action: "save", step: "d2" }, { action: "open", step: "d2" }] }, draftSteps: HALF_A_JOB });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((act) => [act.id, act.reason])).toEqual([["a2", "step_claimed_twice"]]);
  });

  it("reads claims written as a map from act to step, and steps by position", () => {
    const draft = [...HALF_A_JOB, step(6), step(7)];
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: { a1: "6", a2: "step 7" } }, draftSteps: draft }).ok).toBe(true);
  });

  it("checks nothing where the instruction asks for nothing to be done, or the Flow is not the draft", () => {
    expect(checkAutomationStudioInstructedActs({ instructionText: "List each bike once, cheapest first.", result: { summary: "x" }, draftSteps: HALF_A_JOB }).ok).toBe(true);
    expect(checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" } }).ok).toBe(true);
  });
});
