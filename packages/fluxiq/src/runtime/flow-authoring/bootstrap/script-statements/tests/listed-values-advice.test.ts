// A condition listing literal values the request never says is given advice,
// never a refusal; a request that says its values gets none (t785, F3).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { automationStudioFlowPlanListedValuesAdvice } from "../index.ts";

function planWith(where: unknown[]): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Read", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "read", definitionId: "web.output.dom-extract_list", definitionVersion: "1.0.0", parameters: { extractList: { handle: "extraction.1", where } } }], edges: [] }]
  } as unknown as AutomationStudioFlowBootstrapPlan;
}

const LISTED = [{ field: "club", equals: ["A Club", "B Club"] }];

describe("advice on a condition's literal values", () => {
  it("is given when the request does not say them", () => {
    const advice = automationStudioFlowPlanListedValuesAdvice(planWith(LISTED), "posts in clubs I belong to");
    expect(advice).toHaveLength(1);
    expect(advice[0]).toContain("what the page shows today");
    expect(advice[0]).toContain("\"A Club\"");
  });

  it("is given for a single equals value too", () => {
    expect(automationStudioFlowPlanListedValuesAdvice(planWith([{ field: "club", equals: "A Club" }]), "posts in clubs I belong to")).toHaveLength(1);
  });

  it("is not given when the request names the values", () => {
    expect(automationStudioFlowPlanListedValuesAdvice(planWith(LISTED), "posts in A Club or B Club")).toEqual([]);
  });

  it("is not given for a condition with no literal values", () => {
    expect(automationStudioFlowPlanListedValuesAdvice(planWith([{ field: "club", is: "present" }]), "posts in clubs I belong to")).toEqual([]);
  });
});
