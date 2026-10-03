// What a Flow version is, for a test and a judge of it.
//
// User rule (2026-10-02): a Flow is finished only once a run of the whole Flow
// from its start was judged to do what was asked, on the Flow as it finally
// stands; any edit after that run needs another. The replay signature leaves
// routing out, so a step marked optional after a refused replay read as the
// same Flow and passed on the old replay's outcomes without running again.
// The Flow signature is what that rule compares.
import { describe, expect, it } from "vitest";
import {
  automationStudioFlowDraftFlowSignature,
  automationStudioFlowDraftReplaySignature,
  type AutomationStudioFlowDraftStep
} from "../index.ts";

const step = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  callId: `call.${position}`,
  actionId: "node.click",
  input: { node: "node.click", parameters: {} },
  ranWith: { node: "node.click", parameters: { target: `#s${position}` } },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  ...over
});

describe("the Flow signature", () => {
  it("changes when a step's routing, settings, interruption or acts change", () => {
    const before = automationStudioFlowDraftFlowSignature([step(1), step(2)]);
    expect(automationStudioFlowDraftFlowSignature([step(1), step(2, { routing: { kind: "optional" } })])).not.toBe(before);
    expect(automationStudioFlowDraftFlowSignature([step(1), step(2, { settings: { waitMs: 500 } })])).not.toBe(before);
    expect(automationStudioFlowDraftFlowSignature([step(1, { interruption: true }), step(2)])).not.toBe(before);
    expect(automationStudioFlowDraftFlowSignature([step(1), step(2, { acts: ["a1"] })])).not.toBe(before);
    // The replay signature does not see routing; that is the difference.
    expect(automationStudioFlowDraftReplaySignature([step(1), step(2, { routing: { kind: "optional" } })]))
      .toBe(automationStudioFlowDraftReplaySignature([step(1), step(2)]));
  });

  it("changes with the steps proposed, their order and what they run with", () => {
    const before = automationStudioFlowDraftFlowSignature([step(1), step(2)]);
    expect(automationStudioFlowDraftFlowSignature([step(2), step(1)])).not.toBe(before);
    expect(automationStudioFlowDraftFlowSignature([step(1), step(2, { disposition: "dropped" })])).not.toBe(before);
    expect(automationStudioFlowDraftFlowSignature([step(1), step(2, { ranWith: { node: "node.click", parameters: { target: "#other" } } })])).not.toBe(before);
  });

  it("ignores what changes without the Flow changing: the call, the iteration, the last replay's answer, the order acts are listed in", () => {
    const before = automationStudioFlowDraftFlowSignature([step(1, { acts: ["a1", "a2"] }), step(2)]);
    expect(automationStudioFlowDraftFlowSignature([
      step(1, { acts: ["a2", "a1"], callId: "other", iteration: 9, replayed: { step: 1, actionId: "node.click", status: "replayed" } }),
      step(2, { replay: { from: { location: "elsewhere" } } })
    ])).toBe(before);
    // A step not proposed is not part of the Flow, whatever it says.
    expect(automationStudioFlowDraftFlowSignature([step(1, { acts: ["a1", "a2"] }), step(2), step(3, { disposition: "exploratory", routing: { kind: "optional" } })])).toBe(before);
  });

  it("reads a step without ranWith by its input", () => {
    const { ranWith: _ranWith, ...carried } = step(1, { id: "f1" });
    expect(automationStudioFlowDraftFlowSignature([carried])).toBe(JSON.stringify([["node.click", { node: "node.click", parameters: {} }, null, null, false, []]]));
  });
});
