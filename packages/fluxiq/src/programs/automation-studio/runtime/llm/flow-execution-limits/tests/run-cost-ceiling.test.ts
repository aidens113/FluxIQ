import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAutomationStudioFlowSettingsMetadata } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS } from "../../session-key-provider.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, automationStudioLlmRunCostCeilingUsd } from "../run-cost-ceiling.ts";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("ordinary runtime policies and isolated test ceiling", () => {
  it("defaults to .25 and honors explicit user or resolver limits up to the server maximum", () => {
    expect(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD).toBe(0.25);
    expect(AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.maxTotalEstimatedCostUsd).toBe(0.25);
    expect(automationStudioLlmRunCostCeilingUsd()).toBe(0.25);
    expect(automationStudioLlmRunCostCeilingUsd(1)).toBe(1);
    expect(automationStudioLlmRunCostCeilingUsd(2, 1)).toBe(1);
    expect(automationStudioLlmRunCostCeilingUsd(1, 0.05)).toBe(0.05);
    expect(automationStudioLlmRunCostCeilingUsd(11)).toBe(10);
    for (const unset of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, "0.1"]) expect(automationStudioLlmRunCostCeilingUsd(unset)).toBe(0.25);
  });
  it("clamps explicit runtime policies in test scope without changing stored Flow defaults", async () => {
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_SCOPE", "test");
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_USD", "0.1");
    vi.resetModules();
    const scoped = await import("../run-cost-ceiling.ts");
    expect(scoped.AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD).toBe(0.1);
    expect(scoped.automationStudioLlmRunCostCeilingUsd(1, 2)).toBe(0.1);
    expect(scoped.automationStudioLlmRunCostCeilingUsd(0.05, 1)).toBe(0.05);
    const policy = defaultAutomationStudioFlowSettingsMetadata().adaptationPolicySettings as { maxEstimatedCostUsdPerRun?: number };
    expect(policy.maxEstimatedCostUsdPerRun).toBe(0.25);
  });
  it("ignores a malformed knob in an ordinary runtime", async () => {
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_SCOPE", "");
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_USD", "bad");
    vi.resetModules();
    const ordinary = await import("../run-cost-ceiling.ts");
    expect(ordinary.automationStudioLlmRunCostCeilingUsd(1)).toBe(1);
  });
});
