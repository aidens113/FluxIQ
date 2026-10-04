import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD, AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV, AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_SCOPE_ENV, resolveAutomationStudioLlmRunCostCeilingUsd } from "../index.ts";

const testEnv = (value?: string) => ({ [AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_SCOPE_ENV]: "test", [AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV]: value });

describe("isolated test runtime ceiling", () => {
  it("keeps the ordinary default independent of the test knob, even malformed", () => {
    expect(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD).toBe(0.25);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd({})).toBe(0.25);
    for (const value of ["0.1", "0.05", "bad"]) expect(resolveAutomationStudioLlmRunCostCeilingUsd({ [AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV]: value })).toBe(0.25);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd({ ...testEnv("0.1"), [AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_SCOPE_ENV]: "production" })).toBe(0.25);
  });
  it("defaults an explicitly isolated test runtime to .10", () => {
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(testEnv())).toBe(0.1);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(testEnv("  "))).toBe(0.1);
  });
  it.each(["0.05", "0.5", " 1 ", "10"])("honors a configured test ceiling %s", (value) => {
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(testEnv(value))).toBe(Number(value));
  });
  it.each(["0", "-1", "abc", "$0.10", "1e-1", "11", "NaN"])("rejects malformed active test configuration %s", (value) => {
    expect(() => resolveAutomationStudioLlmRunCostCeilingUsd(testEnv(value))).toThrow(/FLUXIQ_LLM_RUN_COST_CEILING_USD/u);
  });
});
