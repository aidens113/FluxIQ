// What a step says about when it runs, and the two things it has to survive:
// the draft being renumbered under it, and a replay that only ever sees one
// situation.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment.ts";
import { automationStudioFlowDraftDryRunVerdict } from "../dry-run.ts";
import { automationStudioFlowDraftEntry } from "../entry.ts";
import { automationStudioFlowDraftConditionalStepIds } from "../routing.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

function steps(count = 4): AutomationStudioFlowDraftStep[] {
  return Array.from({ length: count }, (_, index) => ({
    position: index + 1,
    id: `d${index + 1}`,
    iteration: index + 1,
    actionId: "press",
    input: { target: `target.${index + 1}` },
    effect: "mutate" as const,
    effectApplied: true,
    disposition: "kept" as const
  }));
}

describe("saying when a step runs", () => {
  it("fills in what the model left out: the check before it, and a span of one", () => {
    const draft = steps();
    const report = applyAutomationStudioFlowDraftAmendments(draft, [
      { step: 2, change: "only_if" },
      { step: 4, change: "repeat" }
    ]);

    expect(report.refused).toEqual([]);
    expect(draft[1]?.routing).toEqual({ kind: "only_if", check: "d1" });
    expect(draft[3]?.routing).toEqual({ kind: "repeat", through: "d4", over: "d3" });
  });

  it("keeps naming the same step after the draft is renumbered under it", () => {
    const draft = steps();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "only_if", check: 2 }]);
    // The guard is moved to the front, so every position the statement could
    // have been written in now names a different step.
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "reorder", to: 1 }]);

    expect(draft.map((step) => step.id)).toEqual(["d2", "d1", "d3", "d4"]);
    expect(draft.find((step) => step.id === "d3")?.routing).toEqual({ kind: "only_if", check: "d2" });
  });

  it("puts a step back the way it was found, statement and all", () => {
    const draft = steps();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "optional" }]);
    const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep" }]);

    expect(report).toEqual({ applied: 1, refused: [] });
    expect(draft[1]?.routing).toBeUndefined();
  });

  // The no-progress guard is the only thing that stops a model editing one
  // step forever, so a statement that says what the step already said counts
  // as nothing rather than as work.
  it("refuses a statement that says what is already true, or that names a step the Flow does not have", () => {
    const draft = steps();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "optional" }]);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "optional" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_so" }] });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "on_failed", to: 9 }])).toEqual({ applied: 0, refused: [{ step: 3, reason: "no_such_step" }] });
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 4, change: "drop" }]);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "on_failed", to: 4 }])).toEqual({ applied: 0, refused: [{ step: 3, reason: "not_a_kept_step" }] });
  });

  it("refuses a guard for the first step, which has nothing before it", () => {
    const draft = steps();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "only_if" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "no_step_before_it" }] });
  });

  it("shows the statement back in the numbers the model reads", () => {
    const draft = steps();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "only_if", check: 1 }]);
    const value = automationStudioFlowDraftEntry({ steps: draft, maxBytes: 4_000 })?.value as { steps: { step: number; runs?: string }[] };

    expect(value.steps[1]?.runs).toBe("only if step 1 succeeded");
    expect(value.steps[0]?.runs).toBeUndefined();
  });
});

describe("a replay of a draft that branches", () => {
  it("does not refuse the proposal for a step the Flow would not always run", () => {
    const draft = steps(3);
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "optional" }]);
    const conditional = automationStudioFlowDraftConditionalStepIds(draft);

    expect([...conditional]).toEqual(["d1"]);
    // The same verdict, with and without what the draft says about its steps.
    const outcomes = [
      { step: 1, stepId: "d1", actionId: "press", status: "failed" as const },
      { step: 2, stepId: "d2", actionId: "press", status: "replayed" as const }
    ];
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes, asked: new Set() }).ok).toBe(false);
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes, asked: new Set(), conditional }).ok).toBe(true);
  });

  it("still refuses an unconditional step that did not replay", () => {
    const draft = steps(3);
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "optional" }]);
    const verdict = automationStudioFlowDraftDryRunVerdict({
      attempt: 1,
      reset: "ok",
      outcomes: [
        { step: 1, stepId: "d1", actionId: "press", status: "failed" },
        { step: 2, stepId: "d2", actionId: "press", status: "changed" }
      ],
      asked: new Set(),
      conditional: automationStudioFlowDraftConditionalStepIds(draft)
    });

    expect(verdict.ok).toBe(false);
  });

  it("counts the guard of a conditional step, and the step a failure recovers into, as conditional too", () => {
    const draft = steps(4);
    applyAutomationStudioFlowDraftAmendments(draft, [
      { step: 2, change: "only_if", check: 1 },
      { step: 3, change: "on_failed", to: 4 }
    ]);

    expect([...automationStudioFlowDraftConditionalStepIds(draft)].sort()).toEqual(["d1", "d2", "d4"]);
  });
});
