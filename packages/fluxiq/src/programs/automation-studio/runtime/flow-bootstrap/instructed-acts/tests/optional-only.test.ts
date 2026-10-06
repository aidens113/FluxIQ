// An act whose only step is marked optional is not done (`../optional-only.ts`).
//
// Live run `run-musq0b1m-0472cfa0` (Cause 5): the only step doing a1.version
// (7-in-1) was marked optional on a false premise, the completion passed, and
// both judges dismissed the checklist's `step_is_optional` because the step
// "was replayed". In playback a failed press carries on and adds another
// version, so the completion is now answered for it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import {
  AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE,
  checkAutomationStudioInstructedActsOptionalOnly
} from "../index.ts";

const HUB = "Put the USB-C hub in my cart: Space Grey, the 7-in-1 version.";
const START = "https://shop.test/item/1";

function press(position: number, acts: string[], overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, actionId: "web.output.dom-click", toolId: "core.run_node",
    input: { node: "web.output.dom-click", parameters: { selector: `#s${position}` }, consequences: [] },
    effect: "mutate", effectApplied: true, disposition: "kept", acts, ...overrides
  };
}

function draft(version: Partial<AutomationStudioFlowDraftStep>): AutomationStudioFlowDraftStep[] {
  return [press(2, ["a1.colour"]), press(3, ["a1.version"], version), press(4, ["a1"])];
}

describe("an act whose only step may be skipped", () => {
  it("is answered, with the act, its step and why, and nothing else the check found", () => {
    // a1.colour has no step at all: that is the checklist's information, not this rule's.
    const steps = draft({ routing: { kind: "optional" } }).map((step) => step.id === "d2" ? { ...step, acts: [] } : step);
    const verdict = checkAutomationStudioInstructedActsOptionalOnly({ instructionText: HUB, result: { summary: "Adds the hub." }, draftSteps: steps });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.issue.code).toBe(AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE);
    expect(verdict.missingActs.acts).toEqual([expect.objectContaining({ id: "a1.version", reason: "step_is_optional", step: "3" })]);
    expect(verdict.missingActs.acts[0]?.said).toContain("step 3 passing in one test is not evidence");
    expect(verdict.instruction).toMatch(/^Nothing was created and this build is still open\. /u);
    expect(verdict.instruction).toContain("only_if");
  });

  it("is not answered for a step that always runs, or runs only when a check says it is needed", () => {
    const check = (version: Partial<AutomationStudioFlowDraftStep>) =>
      checkAutomationStudioInstructedActsOptionalOnly({ instructionText: HUB, result: {}, draftSteps: draft(version) }).ok;

    expect(check({})).toBe(true);
    expect(check({ routing: { kind: "only_if", check: "d2" } })).toBe(true);
  });

  it("answers ok when there is no draft or no instruction to read", () => {
    expect(checkAutomationStudioInstructedActsOptionalOnly({ instructionText: HUB, result: {} }).ok).toBe(true);
    expect(checkAutomationStudioInstructedActsOptionalOnly({ result: {}, draftSteps: draft({ routing: { kind: "optional" } }) }).ok).toBe(true);
  });

  // t262: arrival is the host's declared node and parameter. An optional step
  // that only arrives is answered `step_only_arrives` by the check, as the
  // completion's restore reads it, so it is not this rule's to answer.
  it("reads the arrival the host declared, as the check and the restore do", () => {
    const arrives = press(1, ["a1"], {
      actionId: "web.output.browser-navigate",
      input: { node: "web.output.browser-navigate", parameters: { url: START }, consequences: [] },
      routing: { kind: "optional" }
    });
    const read = (declared: boolean) => checkAutomationStudioInstructedActsOptionalOnly({
      instructionText: "Put the USB-C hub in my cart.", result: {}, draftSteps: [arrives], startLocation: START,
      ...(declared ? { arrival: { node: "web.output.browser-navigate", parameter: "url" } } : {})
    });

    expect(read(true).ok).toBe(true);
    const undeclared = read(false);
    expect(undeclared.ok).toBe(false);
    if (undeclared.ok) return;
    expect(undeclared.missingActs.acts).toEqual([expect.objectContaining({ id: "a1", reason: "step_is_optional", step: "1" })]);
  });
});
