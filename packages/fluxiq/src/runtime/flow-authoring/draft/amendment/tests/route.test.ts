// A repeat's `over` or `through` that names a step not in the draft is refused by that step's number (t1049, W3's
// leftover). It used to fall back quietly: a missing `over` became the step before this one, a missing `through` this
// step itself, so the Flow repeated over a step the model never named.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";
import { applyAutomationStudioFlowDraftAmendments } from "../index.ts";

function step(position: number, actionId = "press"): AutomationStudioFlowDraftStep {
  return {
    id: `d${position}`, position, iteration: position, actionId, input: { target: `#control-${position}` },
    effect: actionId === "read" ? "observe" : "mutate", effectApplied: true, proposes: true, disposition: "kept"
  };
}

const draft = (): AutomationStudioFlowDraftStep[] => [step(1), step(2, "read"), step(3)];

describe("a repeat that names a step not in the draft", () => {
  it("is refused by the over it named, and never repeats over the step before it", () => {
    const steps = draft();
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "repeat", over: 9 }])).toEqual({
      applied: 0, refused: [{ step: 3, reason: "no_such_step", over: 9 }]
    });
    expect(steps[2]!.routing).toBeUndefined();
  });

  it("is refused by the through it named, and never becomes a repeat of this step alone", () => {
    const steps = draft();
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "repeat", over: 2, through: 9 }])).toEqual({
      applied: 0, refused: [{ step: 3, reason: "no_such_step", through: 9 }]
    });
    expect(steps[2]!.routing).toBeUndefined();
  });

  it("still fills in what was left out: no over is the step before it, no through is this step", () => {
    const steps = draft();
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "repeat" }])).toEqual({ applied: 1, refused: [] });
    expect(steps[2]!.routing).toEqual({ kind: "repeat", over: "d2", through: "d3" });
  });
});
