// The framework's draft written back onto the loop's own step objects (`../in-place.ts`): the same answer as the pure
// function, on the same objects, so a step held elsewhere -- a rerun's, a held amendment's -- is the step the draft lists.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftCompose } from "../compose.ts";
import { automationStudioFlowDraftComposeInPlace } from "../in-place.ts";

type Step = AutomationStudioFlowDraftStep;

const step = (position: number, rest: Partial<Step> = {}): Step => ({
  position, id: `d${position}`, iteration: position, actionId: "press", input: { target: `t${position}` }, effect: "mutate", effectApplied: true, disposition: "taken", ...rest
});
const read = (position: number, rest: Partial<Step> = {}): Step => {
  const { effectApplied: _unused, ...base } = step(position);
  return { ...base, actionId: "read", effect: "observe", proposes: true, ...rest };
};

describe("composing the draft in place", () => {
  it("writes the pure function's word onto the same objects, which stay in the same order", () => {
    const steps = [step(1, { toggle: { key: "k", to: "on" }, acts: ["a1"] }), step(2, { toggle: { key: "k", to: "off" } }), read(3), read(4), step(5, { effectApplied: false })];
    const held = [...steps];
    const expected = automationStudioFlowDraftCompose({ steps });
    automationStudioFlowDraftComposeInPlace(steps);
    expect(steps).toEqual(expected);
    expect(steps.every((each, index) => each === held[index])).toBe(true);
    // The undone press is out with its pairing, and the act it no longer does is gone from it.
    expect(steps[0]).toMatchObject({ drafted: "undone", disposition: "taken", cancels: "d2" });
    expect(steps[0]!.acts).toBeUndefined();
  });

  it("takes back a stale reason and pairing when a step comes back in", () => {
    const steps = [step(1, { toggle: { key: "k", to: "on" } }), step(2, { toggle: { key: "k", to: "off" } })];
    automationStudioFlowDraftComposeInPlace(steps);
    expect(steps.map((each) => each.drafted)).toEqual(["undone", "undone"]);
    // The second press turns out to have flipped another control: the pair is no pair.
    steps[1]!.toggle = { key: "other", to: "off" };
    automationStudioFlowDraftComposeInPlace(steps);
    expect(steps.map((each) => [each.drafted, each.disposition, each.cancels])).toEqual([["in", "kept", undefined], ["in", "kept", undefined]]);
  });

  it("chooses the asked table's read as the result when the caller says which reads are of it", () => {
    const steps = [read(1, { reads: "cart" }), read(2, { reads: "list" })];
    automationStudioFlowDraftComposeInPlace(steps, { isAskedTable: (each) => each.reads === "cart" });
    expect(steps.map((each) => each.drafted)).toEqual(["in", "not_the_result"]);
  });

  // t975: a press a loop before it already does is out by the loop's rule while the loop covers it.
  it("leaves out a step a loop covers, though the framework drafted it in", () => {
    const steps = [step(1), step(2, { disposition: "dropped", drafted: "in", coveredBy: "d1" })];
    automationStudioFlowDraftComposeInPlace(steps);
    expect(steps[1]).toMatchObject({ disposition: "dropped", coveredBy: "d1" });
  });

  it("leaves the model's own steps exactly as they were", () => {
    const steps = [step(1, { disposition: "kept" }), step(2, { disposition: "dropped" }), step(3)];
    const before = structuredClone(steps.slice(0, 2));
    automationStudioFlowDraftComposeInPlace(steps);
    expect(steps.slice(0, 2)).toEqual(before);
    expect(steps[2]).toMatchObject({ drafted: "in", disposition: "kept" });
  });
});
