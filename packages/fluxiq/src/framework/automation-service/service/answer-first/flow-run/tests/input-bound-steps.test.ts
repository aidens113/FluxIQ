// The static check that binds a step's fixed values to the inputs they equal (fluxnode-plan N2).
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstInputBoundSteps as bound } from "../index.ts";

const step = (parameters: JsonObject, position = 1): AutomationStudioFlowDraftStep => {
  const value = { node: "domain.library.find_loans", parameters, consequences: [] };
  return { position, id: `s.${position}`, iteration: position, callId: `c.${position}`, toolId: "core.run_node", actionId: "domain.library.find_loans", input: value, ranWith: structuredClone(value), effect: "observe", effectApplied: true, proposes: true, disposition: "kept" };
};
const input = (name: string, fallback: JsonValue): JsonObject => ({ $state: { path: name, fallback } });

describe("binding a step's fixed values to the inputs they equal", () => {
  it("binds equal text anywhere in the parameters, and an equal number only at the top, in what it was written and ran with", () => {
    const [one] = bound([step({ title: "Atlas", where: { words: ["Atlas", "other"] }, count: 3, page: { size: 3 } })], { title: "Atlas", count: 3 });
    const expected = { title: input("title", "Atlas"), where: { words: [input("title", "Atlas"), "other"] }, count: input("count", 3), page: { size: 3 } };
    expect(one!.input.parameters).toEqual(expected);
    expect(one!.ranWith?.parameters).toEqual(expected);
  });

  it("leaves a step's own settings, values already bound, values two inputs share, and names a Flow input may not have", () => {
    const own = { recordOutput: { datasetId: "Atlas" }, ensureState: { state: "Atlas" }, retry: { maxAttempts: 3 } };
    const steps = [step({ ...own, held: input("title", "Atlas"), from: "Paris", to: "Paris", label: "x" }, 1)];
    const [one] = bound(steps, { title: "Atlas", from: "Paris", to: "Paris", item: "x", bad_name: "x" });
    expect(one!.input.parameters).toEqual({ ...own, held: input("title", "Atlas"), from: "Paris", to: "Paris", label: "x" });
    expect(one).toBe(steps[0]);
  });

  it("changes nothing with no inputs, or none that is bindable", () => {
    const steps = [step({ title: "Atlas" })];
    expect(bound(steps, undefined)).toEqual(steps);
    expect(bound(steps, { title: "" , flag: true })[0]).toBe(steps[0]);
  });
});
