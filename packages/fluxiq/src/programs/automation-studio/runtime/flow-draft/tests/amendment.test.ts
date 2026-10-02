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

// Live run 36 (`run-muq3uozx-3153564b`): a listing named as the act, a repeat
// erased by `keep act`, and "already in the Flow" for an act already named.
describe("acts on the draft", () => {
  // d1 lists the requests (a read a Flow holds), d2 confirms each (repeat over d1).
  function listingAndConfirm(): AutomationStudioFlowDraftStep[] {
    return [
      { position: 1, id: "d1", iteration: 1, actionId: "list", input: {}, effect: "observe", proposes: true, effectApplied: true, disposition: "taken" },
      { position: 2, id: "d2", iteration: 2, actionId: "press", input: { target: "confirm" }, effect: "mutate", effectApplied: true, disposition: "kept", acts: ["a1"], routing: { kind: "repeat", through: "d2", over: "d1" } }
    ];
  }

  // Information, not a refusal (user, 2026-10-01): the step goes into the Flow
  // as asked, the act is not recorded on a read, and the model is told why.
  it("applies an add or keep that names an act on a read, records no act there, and says why", () => {
    const draft = listingAndConfirm();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "add", act: "a1" }])).toEqual({ applied: 1, refused: [{ step: 1, reason: "act_on_a_read" }] });
    expect(draft[0]).toMatchObject({ disposition: "kept" });
    expect(draft[0]?.acts).toBeUndefined();
    // Said again about the listing now in the Flow: only the act was news, and it is told once.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep", act: "a1" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "act_on_a_read" }] });
    expect(draft[0]?.acts).toBeUndefined();
    // The press still names the act.
    expect(draft[1]?.acts).toEqual(["a1"]);
  });

  it("refuses an act the step already names as act_already_named, not as already in the Flow", () => {
    const draft = listingAndConfirm();
    for (const change of ["add", "keep"] as const) {
      expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change, act: "a1" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "act_already_named" }] });
    }
    expect(draft[1]?.acts).toEqual(["a1"]);
  });

  it("never lets keep erase a repeat, and keep with act clears no routing at all", () => {
    const draft = listingAndConfirm();
    // A keep carrying an act is about the act: the repeat stays.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep", act: "a2" }])).toEqual({ applied: 1, refused: [] });
    expect(draft[1]).toMatchObject({ acts: ["a1", "a2"], routing: { kind: "repeat", through: "d2", over: "d1" } });
    // A bare keep does not clear a repeat either: there is nothing to undo.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_in_flow" }] });
    expect(draft[1]?.routing).toEqual({ kind: "repeat", through: "d2", over: "d1" });
    // A condition is still cleared by a bare keep, and not by keep with act.
    draft[1]!.routing = { kind: "optional" };
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep", act: "a3" }]).applied).toBe(1);
    expect(draft[1]?.routing).toEqual({ kind: "optional" });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep" }]).applied).toBe(1);
    expect(draft[1]?.routing).toBeUndefined();
  });
});
