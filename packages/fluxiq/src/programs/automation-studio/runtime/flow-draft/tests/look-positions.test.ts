// A look holds a step number like any other step (`../step.ts`), so the draft
// the model reads has to show it, and an amendment naming it has to be told it
// is a look. Live run `run-mup2i28c-6c7fc209`, decision 5: the draft listed
// steps 2, 3 and 4 only -- step 1 and step 5 were looks, hidden -- and the
// model's `5 add a2` landed on the `snap.store` look, which was then recorded as
// doing "add two packs of towels".
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../amendment.ts";
import { automationStudioFlowDraftEntry } from "../entry.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

const action = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep =>
  ({ position, id: `d${position}`, iteration: position, actionId: "web.output.dom-click", input: { target: `t${position}` }, effect: "mutate", effectApplied: true, disposition: "kept", ...over });
const look = (position: number): AutomationStudioFlowDraftStep =>
  ({ position, id: `d${position}`, iteration: position, actionId: "web.output.dom-capture_snapshot", input: {}, effect: "observe", effectApplied: false, proposes: false, disposition: "taken" });

// Run 34's draft at decision 5: the opening look, navigate, dismiss, the refused press, and the look after it.
const run34 = (): AutomationStudioFlowDraftStep[] => [
  look(1),
  action(2, { actionId: "web.output.browser-navigate" }),
  action(3),
  action(4, { effectApplied: false, disposition: "taken", resultCode: "web.action.rejected.target_unobserved" }),
  look(5)
];

describe("the step numbers the model is shown", () => {
  it("are every number an amendment resolves against, looks included and marked as looks", () => {
    const steps = run34();
    const shown = automationStudioFlowDraftEntry({ steps, authored: true, acts: [] })!.value as { steps: { step: number; disposition: string; inResult: boolean }[]; instruction: string };
    expect(shown.steps.map((line) => line.step)).toEqual(steps.map((step) => step.position));
    expect(shown.steps.filter((line) => line.disposition === "look").map((line) => line.step)).toEqual([1, 5]);
    expect(shown.steps.find((line) => line.step === 5)?.inResult).toBe(false);
    expect(shown.instruction).toContain("disposition is look");
  });

  it("change when a look is appended, so the draft a decision reads is never one from before the last call", () => {
    const steps = run34().slice(0, 4);
    const before = JSON.stringify(automationStudioFlowDraftEntry({ steps, authored: true, acts: [] })!.value);
    steps.push(look(5));
    const after = JSON.stringify(automationStudioFlowDraftEntry({ steps, authored: true, acts: [] })!.value);
    expect(after).not.toBe(before);
  });
});

describe("an act claimed on a step the Flow can never contain", () => {
  it("is refused, and the look is left as it was", () => {
    const steps = run34();
    const result = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 5, change: "add", act: "a2" }]);
    expect(result.applied).toBe(0);
    expect(result.refused).toEqual([{ step: 5, reason: "not_a_kept_step" }]);
    expect(steps[4]).toMatchObject({ disposition: "taken" });
    expect(steps[4]?.acts).toBeUndefined();
  });

  it("is refused did_not_work on a failed press the caller marked as no step, as the draft shows it", () => {
    const steps = [action(1), action(2, { effectApplied: false, proposes: false, disposition: "taken" })];
    const shown = automationStudioFlowDraftEntry({ steps, authored: true })!.value as { steps: { step: number; disposition: string }[] };
    expect(shown.steps[1]).toMatchObject({ step: 2, disposition: "did_not_work" });
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "add", act: "a1" }]).refused).toEqual([{ step: 2, reason: "did_not_work" }]);
  });

  it("is refused for keep as well, while an act on a step that worked still lands", () => {
    const steps = run34();
    steps[2]!.disposition = "taken";
    const result = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "keep", act: "a1" }, { step: 3, change: "add", act: "a1" }]);
    expect(result.refused).toEqual([{ step: 1, reason: "not_a_kept_step" }]);
    expect(result.applied).toBe(1);
    expect(steps[2]).toMatchObject({ disposition: "kept", acts: ["a1"] });
    expect(steps[0]?.acts).toBeUndefined();
  });
});
