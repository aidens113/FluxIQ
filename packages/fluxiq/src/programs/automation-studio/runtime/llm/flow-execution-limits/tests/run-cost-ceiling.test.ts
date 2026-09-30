import { describe, expect, it } from "vitest";
import { defaultAutomationStudioFlowSettingsMetadata } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS } from "../../session-key-provider.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, automationStudioLlmRunCostCeilingUsd } from "../run-cost-ceiling.ts";

// The user's rule: a run costs at most $0.25, and a Flow's own setting may
// lower that and never raise it. A plain configured limit, not a grant.
describe("the run cost ceiling", () => {
  it("is $0.25, and is the host resolver's default total", () => {
    expect(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD).toBe(0.25);
    expect(AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.maxTotalEstimatedCostUsd).toBe(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD);
  });

  it("is lowered by a smaller limit and never raised by a larger one", () => {
    expect(automationStudioLlmRunCostCeilingUsd()).toBe(0.25);
    expect(automationStudioLlmRunCostCeilingUsd(1)).toBe(0.25);
    expect(automationStudioLlmRunCostCeilingUsd(2, 1)).toBe(0.25);
    expect(automationStudioLlmRunCostCeilingUsd(0.1)).toBe(0.1);
    expect(automationStudioLlmRunCostCeilingUsd(2, 0.1)).toBe(0.1);
    expect(automationStudioLlmRunCostCeilingUsd(0.2, 0.1)).toBe(0.1);
  });

  it("ignores a limit that is not a positive number rather than trusting it", () => {
    for (const unset of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, "0.1"]) {
      expect(automationStudioLlmRunCostCeilingUsd(unset), String(unset)).toBe(0.25);
    }
  });

  // The model writes its default as a literal because it does not import the
  // runtime. This is what keeps the two from drifting apart.
  it("is a new Flow's default adaptation cost per run", () => {
    const policy = defaultAutomationStudioFlowSettingsMetadata().adaptationPolicySettings as { maxEstimatedCostUsdPerRun?: number };
    expect(policy.maxEstimatedCostUsdPerRun).toBe(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD);
  });
});
