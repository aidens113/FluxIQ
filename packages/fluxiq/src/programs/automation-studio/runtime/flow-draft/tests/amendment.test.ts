import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step.ts";

function steps(): AutomationStudioFlowDraftStep[] {
  return [1, 2, 3].map((position) => ({
    position, iteration: position, actionId: "press", input: { target: `target.${position}` },
    effect: "mutate" as const, effectApplied: true, disposition: "kept" as const
  }));
}

describe("amending the draft", () => {
  it("drops, marks exploratory and puts back, and carries settings alongside", () => {
    const draft = steps();
    const report = applyAutomationStudioFlowDraftAmendments(draft, [
      { step: 1, change: "drop" },
      { step: 2, change: "exploratory" },
      { step: 3, change: "keep", settings: { waitFor: "results" } }
    ]);
    expect(report).toEqual({ applied: 3, refused: [] });
    expect(draft.map((step) => step.disposition)).toEqual(["dropped", "exploratory", "kept"]);
    expect(draft.map(automationStudioFlowDraftStepIsProposed)).toEqual([false, false, true]);
    expect(draft[2]?.settings).toEqual({ waitFor: "results" });
  });

  it("merges settings over what a step already carried", () => {
    const draft = steps();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep", settings: { waitFor: "results", attempts: 2 } }]);
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep", settings: { attempts: 5 } }]);
    expect(draft[0]?.settings).toEqual({ waitFor: "results", attempts: 5 });
  });

  // The no-progress guard is the only thing that stops a model editing one
  // step forever, and it can only do that if an edit that changed nothing is
  // reported rather than counted as work.
  it("refuses an edit that names no step, or that says what is already true", () => {
    const draft = steps();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 9, change: "drop" }])).toEqual({ applied: 0, refused: [{ step: 9, reason: "no_such_step" }] });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "already_so" }] });
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "drop" }]);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "drop" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "already_so" }] });
  });
});
