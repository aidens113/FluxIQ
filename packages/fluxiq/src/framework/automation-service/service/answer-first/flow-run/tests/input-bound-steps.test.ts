// The static check that binds a step's fixed values to the inputs they equal (fluxnode-plan N2).
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { runWithAutomationStudioRunSecrets } from "../../../../../../runtime/run-secrets/index.ts";
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

  it("binds a secret the model typed out to its input with no default, and drops a default a secret binding holds", () => {
    // The secret travels beside the run, never among its inputs (`runtime/run-secrets/`).
    const steps = [step({ title: "Atlas", password: "hunter2", note: { said: ["hunter2"] } }, 1), step({ password: input("password", "[withheld]"), echoed: input("pin", "hunter2"), title: input("title", "Atlas") }, 2)];
    const [typed, written] = runWithAutomationStudioRunSecrets({ password: "hunter2" }, () => bound(steps, { title: "Atlas" }));
    const secret = { $state: { path: "password" } };
    expect(typed!.input.parameters).toEqual({ title: input("title", "Atlas"), password: secret, note: { said: [secret] } });
    expect(typed!.ranWith?.parameters).toEqual(typed!.input.parameters);
    expect(written!.input.parameters).toEqual({ password: secret, echoed: { $state: { path: "pin" } }, title: input("title", "Atlas") });
    expect(JSON.stringify([typed, written])).not.toContain("hunter2");
  });

  it("without a run's secrets, a secret's name is an ordinary input", () => {
    const [one] = bound([step({ password: input("password", "x") })], { title: "Atlas" });
    expect(one!.input.parameters).toEqual({ password: input("password", "x") });
  });
});
