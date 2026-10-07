// A claim the act judge would reject is refused as it is made, and the rest of
// the amendment still applies (`../apply.ts`, `claimRefused`; week report W1).
// Live run `run-mux74k5q-1c3c2127` (C1b) put a1, "put the hub in my cart", on
// the press of "Spain", one of a1's own options, and was answered "applied".
import { describe, expect, it, vi } from "vitest";
import { applyAutomationStudioFlowDraftAmendments, type AutomationStudioFlowDraftClaimRefused } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";

type Step = AutomationStudioFlowDraftStep;

function press(n: number, target: string, disposition: Step["disposition"] = "taken"): Step {
  return {
    position: n, id: `d${n}`, iteration: n, actionId: "web.dom.click", input: { target },
    effect: "mutate", effectApplied: true, stateBefore: `s${n}`, stateAfter: `s${n + 1}`, disposition, words: { target }
  };
}

/** A judge that refuses a1 on the Spain press and names step 3, Add to cart, instead. */
const judge = vi.fn<AutomationStudioFlowDraftClaimRefused>((steps, step, act) => step.words?.target === "Spain" && act === "a1"
  ? { act, said: `Step ${step.position} chose "Spain", one of a1's options (a1.origin), and does not do a1.`, instead: steps.find((each) => each.words?.target === "Add to cart")?.position }
  : undefined);

const draft = (): Step[] => [press(1, "Space Grey", "kept"), press(2, "Spain"), press(3, "Add to cart")];

describe("an amendment whose act the judge says the step does not do", () => {
  it("run mux74k5q: add 2 act a1 adds the Spain press without a1, refused act_not_done_there with the sentence", () => {
    const steps = draft();
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "add", act: "a1" }], { claimRefused: judge });
    expect(report.applied).toBe(1);
    expect(report.refused).toEqual([{ step: 2, reason: "act_not_done_there", act: "a1", said: 'Step 2 chose "Spain", one of a1\'s options (a1.origin), and does not do a1.', instead: 3 }]);
    expect(steps[1]!.disposition).toBe("kept");
    expect(steps[1]!.acts).toBeUndefined();
  });

  it("keep act a1 on the Spain press already in the Flow changes nothing, and is refused once", () => {
    const steps = draft();
    steps[1]!.disposition = "kept";
    steps[0]!.acts = ["a1.colour"];
    const before = structuredClone(steps);
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "keep", act: "a1" }], { claimRefused: judge });
    expect(report).toEqual({ applied: 0, refused: [{ step: 2, reason: "act_not_done_there", act: "a1", said: expect.stringContaining("Step 2 chose") as unknown as string, instead: 3 }] });
    expect(steps).toEqual(before);
  });

  it("does not take the act off the step that holds it when the claim is refused", () => {
    const steps = draft();
    steps[2]!.disposition = "kept";
    steps[2]!.acts = ["a1"];
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "add", act: "a1" }], { claimRefused: judge });
    expect(steps[2]!.acts).toEqual(["a1"]);
    expect(steps[1]!.acts).toBeUndefined();
  });

  it("names instead by the number the decision was shown, after a move in the same decision", () => {
    const steps = draft();
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "reorder", to: 1 }, { step: 2, change: "add", act: "a1" }], { claimRefused: judge });
    expect(report.refused).toEqual([expect.objectContaining({ step: 2, reason: "act_not_done_there", instead: 3 })]);
  });

  it("puts a1 on the Add to cart press, and on any step when no judge is given", () => {
    const steps = draft();
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 3, change: "add", act: "a1" }], { claimRefused: judge })).toEqual({ applied: 1, refused: [] });
    expect(steps[2]!.acts).toEqual(["a1"]);
    const unjudged = draft();
    expect(applyAutomationStudioFlowDraftAmendments(unjudged, [{ step: 2, change: "add", act: "a1" }])).toEqual({ applied: 1, refused: [] });
    expect(unjudged[1]!.acts).toEqual(["a1"]);
  });

  it("never asks the judge about a read or an act the step already names", () => {
    judge.mockClear();
    const steps = draft();
    steps[1]!.disposition = "kept";
    steps[1]!.acts = ["a1"];
    const read: Step = { ...press(4, "Spain"), effect: "observe", actionId: "web.dom.extract_list", proposes: true };
    steps.push(read);
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "keep", act: "a1" }, { step: 4, change: "add", act: "a1" }], { claimRefused: judge });
    expect(judge).not.toHaveBeenCalled();
    expect(report.refused.map((refusal) => refusal.reason)).toEqual(["act_already_named", "act_on_a_read"]);
  });
});
