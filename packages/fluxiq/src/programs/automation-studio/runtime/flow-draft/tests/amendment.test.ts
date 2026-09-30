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
    // Said as the side of the Flow the step is already on, which is what the
    // edit was trying to settle: a keep about a step in the Flow is a
    // confirmation, and the generic "already so" got it sent again.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "already_in_flow" }] });
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "drop" }]);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "drop" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "already_out" }] });
  });

  // A step that did not work is out of the Flow whatever it is called, so the
  // only edit that can change it is running it again. Every hard live build of
  // 2026-09-28 spent decisions dropping or keeping refused presses.
  it("refuses every edit but rerun about a step that did not work, and changes nothing about it", () => {
    const draft = steps();
    draft[1] = { ...draft[1]!, effectApplied: false, resultCode: "action.refused" };
    const changes = ["drop", "exploratory", "keep", "optional"] as const;
    for (const change of changes) {
      expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "did_not_work" }] });
    }
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "reorder", to: 1 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "did_not_work" }] });
    expect(draft.map((step) => [step.position, step.disposition, step.routing])).toEqual([[1, "kept", undefined], [2, "kept", undefined], [3, "kept", undefined]]);
    // A rerun is still the loop's to carry out, and the one edit not refused for this.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "rerun", input: {} }]).refused).toEqual([{ step: 2, reason: "run_by_the_loop" }]);
  });
});
