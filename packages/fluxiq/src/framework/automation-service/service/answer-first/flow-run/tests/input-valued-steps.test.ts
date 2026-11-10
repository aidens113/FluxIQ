// A saved Flow's steps given this attempt's input values as their bindings' defaults, so a round that
// runs them again uses this run's values (fluxnode-plan N2).
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstInputValuedSteps as valued } from "../index.ts";

const step = (parameters: JsonObject, position = 1): AutomationStudioFlowDraftStep => {
  const value = { node: "domain.library.find_loans", parameters, consequences: [] };
  return { position, id: `s.${position}`, iteration: position, callId: `c.${position}`, toolId: "core.run_node", actionId: "domain.library.find_loans", input: value, ranWith: structuredClone(value), effect: "observe", effectApplied: true, proposes: true, disposition: "kept" };
};
const bound = (path: string, fallback?: JsonValue): JsonObject => ({ $state: { path, ...(fallback === undefined ? {} : { fallback }) } });

describe("a saved step's bindings take this attempt's input values", () => {
  it("as the default of every binding to an input it has a value for, nested ones too, in what the step was written and ran with", () => {
    const [one] = valued([step({ title: bound("title", "Atlas"), where: { words: [bound("title", "Atlas"), "other"] }, count: bound("count") })], { title: "Clockmaking", count: 2 });
    const expected = { title: bound("title", "Clockmaking"), where: { words: [bound("title", "Clockmaking"), "other"] }, count: bound("count", 2) };
    expect(one!.input.parameters).toEqual(expected);
    expect(one!.ranWith?.parameters).toEqual(expected);
  });

  it("leaves a row's binding, an earlier step's, an input it has no value for, and fixed values as they were, and the same step where nothing changed", () => {
    const parameters = { row: bound("item.title"), earlier: bound("$node.s1.records"), other: bound("shelf", "A"), title: "Atlas" };
    const steps = [step(parameters)];
    const [one] = valued(steps, { title: "Clockmaking" });
    expect(one).toBe(steps[0]);
    expect(valued(steps, undefined)).toEqual(steps);
    expect(valued(steps, {})).toEqual(steps);
  });

  it("copies the value, so the step does not share it with the caller's inputs", () => {
    const inputs = { where: { city: "Leeds" } };
    const [one] = valued([step({ where: bound("where", { city: "York" }) })], inputs);
    inputs.where.city = "Hull";
    expect(one!.input.parameters).toEqual({ where: bound("where", { city: "Leeds" }) });
  });
});
