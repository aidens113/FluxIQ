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

  it("still accepts acts named by their verb or a word of their kind", () => {
    const draft = [...HALF_A_JOB, step(6), step(7, { actionId: "web.navigate" })];
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x", acts: [{ action: "bookmark each table", step: "d6" }, { action: "view saved items", step: "d7" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(true);
  });

  it("says how many steps it withheld when the list of steps that changed something is cut", () => {
    const draft = Array.from({ length: 120 }, (_unused, index) => step(index + 1));
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missingActs.stepsThatChangedSomething).toHaveLength(100);
    expect(verdict.missingActs.stepsWithheld).toBe(20);
  });

  it("withholds nothing, and says nothing about it, when every step fits", () => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TABLES, result: { summary: "x" }, draftSteps: HALF_A_JOB });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missingActs).not.toHaveProperty("stepsWithheld");
  });
});

// `run-muncqlr0-3348202b`, completion #1: the draft kept a consent-dialog click
// (`d4`) and a store-chip click (`d11`), neither of which switched a store or
// added anything to a cart, and the claims named no act. Claims left over were
// once matched to acts in order, so the two clicks passed as the two acts.
describe("a claim answers an act only if it names it", () => {
  const RUN_6 = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";
  const RUN_6_DRAFT: AutomationStudioFlowDraftStep[] = Array.from({ length: 12 }, (_unused, index) => step(index + 1, index + 1 === 4 || index + 1 === 11 ? {} : { disposition: "dropped" }));

  it.each([
    ["a list of claims with no action", [{ action: "", step: "d4" }, { action: "", step: "d11" }]],
    ["a list of claims with no action field at all", [{ step: "d4" }, { step: "d11" }]],
    ["a map whose keys name no act", { "accept cookies": "d4", "choose chip": "d11" }]
  ])("refuses run 6's unrelated clicks given as %s", (_label, acts) => {
    const verdict = checkAutomationStudioInstructedActs({ instructionText: RUN_6, result: { summary: "x", acts: acts as never }, draftSteps: RUN_6_DRAFT });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing.length).toBeGreaterThan(0);
    expect(verdict.missing.length).toBe(verdict.acts.length);
    expect(new Set(verdict.missing.map((act) => act.reason))).toEqual(new Set(["no_step_named"]));
    expect(verdict.instruction).toContain("by its id");
  });

  it("accepts the same clicks once each claim names its act by id", () => {
    const acts = checkAutomationStudioInstructedActs({ instructionText: RUN_6, result: { summary: "x" }, draftSteps: RUN_6_DRAFT }).acts;
    const kept = ["d4", "d11"];
    const draft = acts.length > 2 ? [...RUN_6_DRAFT, step(13)] : RUN_6_DRAFT;
    const claims = acts.map((act, index) => ({ action: act.id, step: kept[index] ?? "d13" }));
    expect(checkAutomationStudioInstructedActs({ instructionText: RUN_6, result: { summary: "x", acts: claims }, draftSteps: draft }).ok).toBe(true);
  });

  const TWO_ADDS = "Add the paper towels to my cart. Add the dinner napkins to my cart.";

  it("gives a claim to the act of its kind whose own words it uses, whatever order the claims come in", () => {
    const draft = [step(1, { actionId: "web.navigate" }), step(2), step(3), step(4, { disposition: "dropped" })];
    const acts = checkAutomationStudioInstructedActs({ instructionText: TWO_ADDS, result: { summary: "x" }, draftSteps: draft }).acts;
    expect(acts.map((act) => [act.id, act.kind])).toEqual([["a1", "add_to"], ["a2", "add_to"]]);
    // The towels claim names a dropped step, so which act it answered shows.
    const verdict = checkAutomationStudioInstructedActs({ instructionText: TWO_ADDS, result: { summary: "x", acts: [{ action: "add napkins", step: "d3" }, { action: "add paper towels", step: "d4" }] }, draftSteps: draft });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.missing.map((act) => [act.id, act.reason, act.step])).toEqual([["a1", "step_not_kept", "d4"]]);
    expect(checkAutomationStudioInstructedActs({ instructionText: TWO_ADDS, result: { summary: "x", acts: [{ action: "add napkins", step: "d3" }, { action: "add paper towels", step: "d2" }] }, draftSteps: draft }).ok).toBe(true);
  });
});
