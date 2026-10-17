// The one copy every draft hand-over goes through (`../step-copy.ts`, t690).
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftScheduledCandidateCall, automationStudioFlowDraftStepCopy } from "../index.ts";
import { automationStudioFlowDraftSeedFromFlow } from "../../../llm/node-tools/index.ts";

function saved() {
  return automationStudioFlowDraftSeedFromFlow({
    nodes: [{ id: "saved", definitionId: "fixture.open", parameterValues: { text: "authored" }, metadata: { declaredConsequences: [] } }],
    edges: [], startPages: { saved: { location: "fixture://first" } }
  }).steps[0]!;
}

describe("a draft step's copy", () => {
  it("is a deep copy that keeps the scheduled candidate its original stands on", () => {
    const step = saved();
    const copy = automationStudioFlowDraftStepCopy(step);
    expect(copy).not.toBe(step);
    expect(copy.input).not.toBe(step.input);
    expect(automationStudioFlowDraftScheduledCandidateCall(copy)).toEqual({ input: step.input, from: { location: "fixture://first" } });
    // A copy of a copy keeps it too: a stall's copy is copied again by the round's ending and the repair seed.
    expect(automationStudioFlowDraftScheduledCandidateCall(automationStudioFlowDraftStepCopy(copy))).toEqual({ input: step.input, from: { location: "fixture://first" } });
  });

  it("keeps it across a reshape that only renumbers the step", () => {
    const copy = automationStudioFlowDraftStepCopy(saved(), (each) => {
      each.position = 4;
      each.iteration = 0;
    });
    expect(copy.position).toBe(4);
    expect(automationStudioFlowDraftScheduledCandidateCall(copy)?.input).toEqual(copy.input);
  });

  it("drops it where the reshaped copy is no longer the step as saved, and for a step that never had one", () => {
    const edited = automationStudioFlowDraftStepCopy(saved(), (each) => { each.input = { ...each.input, edited: true }; });
    expect(automationStudioFlowDraftScheduledCandidateCall(edited)).toBeUndefined();
    const plain = automationStudioFlowDraftStepCopy({ position: 1, id: "d1", iteration: 1, actionId: "fixture.open", input: {}, effect: "mutate", proposes: true, disposition: "kept" });
    expect(plain.scheduledCandidate).toBeUndefined();
    expect(automationStudioFlowDraftScheduledCandidateCall(plain)).toBeUndefined();
  });
});
