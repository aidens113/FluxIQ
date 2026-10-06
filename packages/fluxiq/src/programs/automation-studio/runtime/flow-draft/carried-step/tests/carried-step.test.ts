// What a step carried from an earlier Flow is, asked one way by the gate, the
// replay and the round's judgement (t274-c4, run `run-muw60j7c-bb7c9a62`).
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftSeedFromFlow } from "../../../llm/node-tools/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftStepCarried, automationStudioFlowDraftStepCarriedJoin, automationStudioFlowDraftStepNotRunInThisBuild } from "../index.ts";

/** An optional press joined at a Merge, then a type, as a stored Flow seeds them. */
function seeded(options: { start?: false; declared?: false } = {}): AutomationStudioFlowDraftStep[] {
  const declared = options.declared === false ? {} : { metadata: { declaredConsequences: [] } };
  return automationStudioFlowDraftSeedFromFlow({
    nodes: [
      { id: "press", definitionId: "web.output.dom-click", parameterValues: { element: { tagName: "button", accessibleName: "Decline" } }, ...declared },
      { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "type", definitionId: "web.output.dom-type", parameterValues: { text: "wireless earbuds", element: { tagName: "input", accessibleName: "Search" } }, ...declared }
    ],
    edges: [
      { id: "e1", sourceNodeId: "press", sourcePortId: "success", targetNodeId: "join" },
      { id: "e2", sourceNodeId: "press", sourcePortId: "failed", targetNodeId: "join" },
      { id: "e3", sourceNodeId: "join", targetNodeId: "type" }
    ],
    ...(options.start === false ? {} : { startPages: { press: { location: "https://store.test/" }, type: { location: "https://store.test/" } } })
  }).steps;
}

describe("a carried step", () => {
  it("is one the seed named f<n>, never a step the loop minted", () => {
    expect(["f1", "f12", "f0", "d3", "f", "xf1", "f1a", undefined].map((id) => automationStudioFlowDraftStepCarried({ id }))).toEqual([true, true, false, false, false, false, false, false]);
    expect(seeded().every(automationStudioFlowDraftStepCarried)).toBe(true);
  });

  it("is a routing join only when it is the Merge the seed carried", () => {
    expect(seeded().map(automationStudioFlowDraftStepCarriedJoin)).toEqual([false, true, false]);
    expect(automationStudioFlowDraftStepCarriedJoin({ id: "d4", actionId: "builtin.control.merge" })).toBe(false);
  });

  it("unchanged, with its declaration and its captured start, runs as saved: it is not one not run in this build, nor is the join", () => {
    expect(seeded().map(automationStudioFlowDraftStepNotRunInThisBuild)).toEqual([false, false, false]);
  });

  it("changed since it was seeded, declaring nothing, or with no captured start, is not runnable as saved", () => {
    const changed = seeded();
    changed[2]!.input.parameters = { text: "earbuds", element: { tagName: "input", accessibleName: "Search" } };
    expect(changed.map(automationStudioFlowDraftStepNotRunInThisBuild)).toEqual([false, false, true]);
    expect(seeded({ declared: false }).map(automationStudioFlowDraftStepNotRunInThisBuild)).toEqual([true, false, true]);
    expect(seeded({ start: false }).map(automationStudioFlowDraftStepNotRunInThisBuild)).toEqual([true, false, true]);
  });

  it("rerun live in its place, with what it ran with and where it starts, has run", () => {
    const step = { ...seeded({ start: false })[0]!, ranWith: { node: "web.output.dom-click", parameters: {} }, replay: { from: { location: "https://store.test/" } } };
    expect(automationStudioFlowDraftStepNotRunInThisBuild(step)).toBe(false);
  });
});
