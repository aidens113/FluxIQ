// What a step says about when it runs, and the two things it has to survive:
// the draft being renumbered under it, and a replay that only ever sees one
// situation.
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment/index.ts";
import { automationStudioFlowDraftDryRunVerdict } from "../dry-run.ts";
import { automationStudioFlowDraftEntry } from "../entry.ts";
import {
  automationStudioFlowDraftConditionalStepIds,
  automationStudioFlowDraftConditionalStepReasons,
  automationStudioFlowDraftRepeatOrderProblem,
  automationStudioFlowDraftRoutingReferences
} from "../routing.ts";
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
  it("removes exactly the named repeat span and retains a separate deliberate loop", () => {
    const draft = steps(6);
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", over: 1, through: 3 }, { step: 5, change: "repeat", over: 4, through: 6 }]);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "unrepeat" }])).toEqual({ applied: 1, refused: [] });
    expect(draft[1]!.routing).toBeUndefined();
    expect(draft[4]!.routing).toEqual({ kind: "repeat", over: "d4", through: "d6" });
    expect(automationStudioFlowDraftConditionalStepIds(draft)).toEqual(new Set(["d5", "d6"]));
    expect(draft.every((step) => step.disposition === "kept")).toBe(true);
  });

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

  // Live run run-munuj2os-c205ee3a put repeat on the listing, over itself.
  it("refuses a repeat whose over is not before the step it goes on, and says so as its own reason", () => {
    const draft = steps(3);
    // The step named as over rides on the refusal, so the telling can name the listing (live run 37).
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", over: 2 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "over_not_before", over: 2 }] });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", over: 3 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "over_not_before", over: 3 }] });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", over: 1 }])).toEqual({ applied: 1, refused: [] });
  });

  it("refuses a guard for the first step, which has nothing before it", () => {
    const draft = steps();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "only_if" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "no_step_before_it" }] });
  });

  it("shows the statement back in the numbers the model reads", () => {
    const draft = steps();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "only_if", check: 1 }]);
    const value = automationStudioFlowDraftEntry({ steps: draft })?.value as { steps: { step: number; runs?: string }[] };

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
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes }).ok).toBe(false);
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes, conditional }).ok).toBe(true);
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
      conditional: automationStudioFlowDraftConditionalStepIds(draft)
    });

    expect(verdict.ok).toBe(false);
  });

  // Lane t195, run-munq51ik-a7ebd077: a Confirm repeated over request rows
  // replays on the row the build already confirmed, which a fresh start does
  // not undo, and nine of ten completions were refused for it.
  it("counts every step of a repeating span as conditional, and not the listing it repeats over", () => {
    const draft = steps(4);
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", through: 3, over: 1 }]);

    expect([...automationStudioFlowDraftConditionalStepIds(draft)].sort()).toEqual(["d2", "d3"]);
    const verdict = automationStudioFlowDraftDryRunVerdict({
      attempt: 1,
      reset: "ok",
      outcomes: [
        { step: 1, stepId: "d1", actionId: "press", status: "replayed" },
        { step: 2, stepId: "d2", actionId: "press", status: "unreproducible" },
        { step: 3, stepId: "d3", actionId: "press", status: "failed" },
        { step: 4, stepId: "d4", actionId: "press", status: "replayed" }
      ],
      conditional: automationStudioFlowDraftConditionalStepIds(draft)
    });
    expect(verdict.ok).toBe(true);
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

// Live run `run-murwdp4f-35f976d2`: draft step 11 pressed a chat card's "x"
// that the host marked `interruption: true`. The Flow is written with such a
// step optional (`../../flow-bootstrap/authoring/draft-routing.ts`), but the
// test from the start judged it mandatory, its replay failed because the site
// remembered the dismissal, and the test refused the Flow twice on that step
// alone, while every later step replayed. Every judgement of the draft reads
// this set, so the step is in it.
describe("a step the host says answered an interruption", () => {
  it("is one the Flow would not always run, exactly as the Flow is written", () => {
    const draft = steps(4);
    draft[1]!.interruption = true;
    expect([...automationStudioFlowDraftConditionalStepIds(draft)]).toEqual(["d2"]);
    const verdict = automationStudioFlowDraftDryRunVerdict({
      attempt: 1,
      reset: "ok",
      outcomes: [
        { step: 1, stepId: "d1", actionId: "press", status: "replayed" },
        { step: 2, stepId: "d2", actionId: "press", status: "failed" },
        { step: 3, stepId: "d3", actionId: "press", status: "replayed" },
        { step: 4, stepId: "d4", actionId: "press", status: "replayed" }
      ],
      conditional: automationStudioFlowDraftConditionalStepIds(draft)
    });
    expect(verdict.ok).toBe(true);
  });

  it("is not, when it claims one of the person's acts or is not proposed", () => {
    const draft = steps(4);
    draft[1]!.interruption = true;
    draft[1]!.acts = ["a1"];
    draft[2]!.interruption = true;
    draft[2]!.disposition = "dropped";
    expect([...automationStudioFlowDraftConditionalStepIds(draft)]).toEqual([]);
  });
});

// Live run `run-musr9pv3-f4bf6256`: a reorder left a repeat's listing after the
// step repeating over it, and nothing looked. Whether a repeat can run where its
// steps stand is read off the order alone, by id.
describe("whether a repeat can run where its steps stand", () => {
  it("says over_after when the listing is not before it, span_broken when its through is, and nothing when it holds", () => {
    const draft = steps(4);
    const at = (index: number) => draft[index]!;
    expect(automationStudioFlowDraftRepeatOrderProblem(draft, at(2), { kind: "repeat", through: "d4", over: "d1" })).toBeUndefined();
    expect(automationStudioFlowDraftRepeatOrderProblem(draft, at(2), { kind: "repeat", through: "d3", over: "d4" })).toBe("over_after");
    expect(automationStudioFlowDraftRepeatOrderProblem(draft, at(2), { kind: "repeat", through: "d3", over: "d3" })).toBe("over_after");
    expect(automationStudioFlowDraftRepeatOrderProblem(draft, at(2), { kind: "repeat", through: "d2", over: "d1" })).toBe("span_broken");
    // A name that names no step is the assembler's to report.
    expect(automationStudioFlowDraftRepeatOrderProblem(draft, at(2), { kind: "repeat", through: "d3", over: "gone" })).toBeUndefined();
  });
});

// Read-list design (S2): "read the list, press Next, repeat while Next is
// there" is a span that runs at least once and again while its last step
// succeeds -- the do-while. Its check is the span's own last step, so it can
// never stand before the span, and every member always runs once.
describe("a repeat that runs again while its last step succeeds", () => {
  it("is written with its through as its while, the most passes when given, and refused only as other repeats are", () => {
    const draft = steps(4);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", while: 3, most: 20 }])).toEqual({ applied: 1, refused: [] });
    expect(draft[1]!.routing).toEqual({ kind: "repeat", through: "d3", while: "d3", most: 20 });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", while: 3, most: 20 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_so" }] });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", through: 3, while: 3 }])).toEqual({ applied: 1, refused: [] });
    expect(draft[1]!.routing).toEqual({ kind: "repeat", through: "d3", while: "d3" });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", while: 9 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "no_such_step" }] });
    draft[3]!.disposition = "dropped";
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", while: 4 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "not_a_kept_step" }] });
    // The first step has nothing before it, and a do-while needs nothing there.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "repeat", while: 1 }])).toEqual({ applied: 1, refused: [] });
    expect(draft[0]!.routing).toEqual({ kind: "repeat", through: "d1", while: "d1" });
  });

  it("names its through and its while, and leaves its members unconditional: the span always runs once", () => {
    const draft = steps(4);
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", while: 3 }]);
    expect(automationStudioFlowDraftRoutingReferences(draft[1]!.routing!)).toEqual(["d3", "d3"]);
    expect([...automationStudioFlowDraftConditionalStepReasons(draft).keys()]).toEqual([]);
  });

  it("is never over_after, and span_broken when its while runs before its step", () => {
    const draft = steps(4);
    const at = (index: number) => draft[index]!;
    expect(automationStudioFlowDraftRepeatOrderProblem(draft, at(1), { kind: "repeat", through: "d3", while: "d3" })).toBeUndefined();
    expect(automationStudioFlowDraftRepeatOrderProblem(draft, at(1), { kind: "repeat", through: "d2", while: "d2" })).toBeUndefined();
    expect(automationStudioFlowDraftRepeatOrderProblem(draft, at(2), { kind: "repeat", through: "d1", while: "d1", most: 5 })).toBe("span_broken");
  });

  it("is refused as a position there is not when its while is before it, and taken off, through and no over, when a move breaks it", () => {
    const draft = steps(4);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "repeat", while: 1 }])).toEqual({ applied: 0, refused: [{ step: 3, reason: "no_such_position" }] });
    expect(draft[2]!.routing).toBeUndefined();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", while: 3 }]);
    const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "reorder", to: 1 }]);
    expect(report.refused).toEqual([{ step: 2, reason: "repeat_taken_off", takenOff: "span_broken", through: 3, now: 3, throughNow: 1 }]);
    expect(draft.find((step) => step.id === "d2")!.routing).toBeUndefined();
  });
});
