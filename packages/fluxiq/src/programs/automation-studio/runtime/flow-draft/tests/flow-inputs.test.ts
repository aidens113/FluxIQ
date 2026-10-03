// A Flow input is declared by the first binding that names it; its test value
// is that binding's fallback. Two test values for one name are a conflict.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftInputs } from "../flow-inputs.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

function step(position: number, parameters: JsonObject, extra: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, iteration: position, actionId: "node.act", input: { node: "node.act", parameters },
    ranWith: { node: "node.act", parameters }, effect: "mutate", effectApplied: true, disposition: "kept", ...extra
  };
}

const input = (name: string, test: unknown) => ({ $state: { path: name, fallback: test } }) as JsonObject;

describe("the inputs a draft declares", () => {
  it("lists each input once, with its test value and every proposed step using it", () => {
    const steps = [
      step(1, { query: input("query", "blue towels") }),
      step(2, { other: 1 }),
      step(3, { search: { text: input("query", "blue towels") }, count: input("count", 2) }),
      step(4, { query: input("dropped", "x") }, { disposition: "dropped" })
    ];
    expect(automationStudioFlowDraftInputs(steps)).toEqual({
      inputs: [{ name: "query", test: "blue towels", steps: [1, 3] }, { name: "count", test: 2, steps: [3] }],
      conflicts: []
    });
  });

  it("reads the shown parameters when a step has no ranWith, and ignores row bindings", () => {
    const { ranWith: _ranWith, ...rest } = step(1, {});
    const shown: AutomationStudioFlowDraftStep = { ...rest, input: { parameters: { q: input("q", "a"), r: { $state: { path: "item.name" } } } } };
    expect(automationStudioFlowDraftInputs([shown]).inputs).toEqual([{ name: "q", test: "a", steps: [1] }]);
  });

  it("names a conflict when one input carries two test values", () => {
    const steps = [step(1, { q: input("q", "a") }), step(2, { q: input("q", "b") }), step(3, { q: input("q", "a") })];
    expect(automationStudioFlowDraftInputs(steps)).toEqual({
      inputs: [{ name: "q", test: "a", steps: [1, 2, 3] }],
      conflicts: [{ name: "q", tests: ["a", "b"], steps: [1, 2, 3] }]
    });
  });

  it("treats object test values with the same keys in another order as one value", () => {
    const steps = [step(1, { q: input("q", { a: 1, b: 2 }) }), step(2, { q: input("q", { b: 2, a: 1 }) })];
    expect(automationStudioFlowDraftInputs(steps).conflicts).toEqual([]);
  });
});
