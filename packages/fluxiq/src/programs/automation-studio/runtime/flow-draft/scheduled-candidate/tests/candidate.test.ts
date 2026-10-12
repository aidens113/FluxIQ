import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftSavedInput, automationStudioFlowDraftScheduledCandidateCall } from "../index.ts";
import { automationStudioFlowDraftSeedFromFlow } from "../../../llm/node-tools/index.ts";
import { automationStudioFlowDraftStepActDone, automationStudioFlowDraftStepReplayMode } from "../../index.ts";

function seed(consequences: string[] | null = [], start = true, declarationRequired?: () => boolean) {
  return automationStudioFlowDraftSeedFromFlow({
    ...(declarationRequired ? { declarationRequired } : {}),
    nodes: [{ id: "saved", definitionId: "fixture.open", parameterValues: { text: { $state: { path: "text", fallback: "authored" } } }, ...(consequences ? { metadata: { declaredConsequences: consequences } } : {}) }],
    edges: [], ...(start ? { startPages: { saved: { location: "fixture://first" } } } : {})
  });
}

describe("an unperformed saved candidate", () => {
  it("retains declarations, bindings and first captured start without performed proof", () => {
    const step = seed().steps[0]!;
    expect(automationStudioFlowDraftScheduledCandidateCall(step)).toEqual({ input: step.input, from: { location: "fixture://first" } });
    expect(step.scheduledCandidate?.sourceNodeId).toBe("saved");
    expect(step.ranWith).toBeUndefined();
    expect(step.replay).toBeUndefined();
    expect(automationStudioFlowDraftStepActDone(step)).toBe(false);
  });

  it("returns defensive copies, preserving saved fallback configuration", () => {
    const step = seed().steps[0]!;
    const call = automationStudioFlowDraftScheduledCandidateCall(step)!;
    call.input.parameters = { changed: true };
    call.from!.location = "fixture://changed";
    expect(automationStudioFlowDraftScheduledCandidateCall(step)?.from?.location).toBe("fixture://first");
    expect(automationStudioFlowDraftScheduledCandidateCall(step)?.input).toEqual(step.input);
  });

  // t439 (`run-mv4912r9-53b05a51`): a Flow written as a script declares only its
  // presses, and a failed run never starts the nodes after the one it failed
  // at. Each such step is still the saved Flow's, and runs as saved in the test
  // -- where its node need not declare.
  it("is scheduled for a saved step that declared nothing where its node need not, with no declaration put on it", () => {
    const step = seed(null, true, () => false).steps[0]!;
    expect(Object.hasOwn(step.input, "consequences")).toBe(false);
    expect(automationStudioFlowDraftScheduledCandidateCall(step)).toEqual({ input: step.input, from: { location: "fixture://first" } });
  });

  // Supervisor review of t439: run undeclared, a press would reach the page with
  // the permission gate never asked. Unsaid, a node's step must declare.
  it("is never scheduled for a saved step that must declare and did not, whose saved input is still kept", () => {
    for (const step of [seed(null, true, () => true).steps[0]!, seed(null).steps[0]!]) {
      expect(step.scheduledCandidate).toBeUndefined();
      expect(automationStudioFlowDraftScheduledCandidateCall(step)).toBeUndefined();
      expect(automationStudioFlowDraftSavedInput(step)).toEqual(step.input);
    }
  });

  it("is scheduled for a saved step whose start the run being repaired never captured, with no start said", () => {
    const step = seed([], false).steps[0]!;
    const call = automationStudioFlowDraftScheduledCandidateCall(step);
    expect(call).toEqual({ input: step.input });
    expect(Object.hasOwn(call!, "from")).toBe(false);
  });

  it("does not lend correspondence to shallow or deep copied steps", () => {
    const step = seed().steps[0]!;
    expect(automationStudioFlowDraftScheduledCandidateCall({ ...step })).toBeUndefined();
    expect(automationStudioFlowDraftScheduledCandidateCall(structuredClone(step))).toBeUndefined();
  });

  it.each(["action", "parameters", "declarations", "routing", "settings", "identity", "position"])("refuses a changed %s configuration", (change) => {
    const step = seed().steps[0]!;
    if (change === "action") step.actionId = "fixture.other";
    if (change === "parameters") step.input.parameters = { text: "changed" };
    if (change === "declarations") step.input.consequences = ["create_new"];
    if (change === "routing") step.routing = { kind: "optional" };
    if (change === "settings") step.settings = { wait: "changed" };
    if (change === "identity") step.id = "f2";
    if (change === "position") step.position = 2;
    expect(automationStudioFlowDraftScheduledCandidateCall(step)).toBeUndefined();
  });

  it("verifies lasting declarations without claiming their effect happened", () => {
    const step = seed(["create_new"]).steps[0]!;
    expect(step.input.consequences).toEqual(["create_new"]);
    expect(automationStudioFlowDraftStepReplayMode(step)).toBe("verify");
    expect(automationStudioFlowDraftStepActDone(step)).toBe(false);
  });

  it("does not turn an injected historical execution into candidate authority", () => {
    const step = seed().steps[0]!;
    step.ranWith = structuredClone(step.input);
    expect(automationStudioFlowDraftScheduledCandidateCall(step)).toBeUndefined();
  });
});
