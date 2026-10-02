// The run cost ceiling is one configurable variable (the user, 2026-10-01: "the
// $0.1 ceiling should be an easily configurable variable ... even for test
// purposes in the lab"): FLUXIQ_LLM_RUN_COST_CEILING_USD, $0.10 when unset, and
// a value that is not a usable amount stops Core rather than spending a default.

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD,
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV,
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD,
  resolveAutomationStudioLlmRunCostCeilingUsd
} from "../index.ts";

const withCeiling = (value: string | undefined) => ({ [AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV]: value });

describe("the run cost ceiling variable", () => {
  it("is named FLUXIQ_LLM_RUN_COST_CEILING_USD and defaults to $0.10", () => {
    expect(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV).toBe("FLUXIQ_LLM_RUN_COST_CEILING_USD");
    expect(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD).toBe(0.1);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd({})).toBe(0.1);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(withCeiling(undefined))).toBe(0.1);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(withCeiling("  "))).toBe(0.1);
  });

  it("takes the value set, higher or lower than the default", () => {
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(withCeiling("0.05"))).toBe(0.05);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(withCeiling("0.5"))).toBe(0.5);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(withCeiling(" 1 "))).toBe(1);
    expect(resolveAutomationStudioLlmRunCostCeilingUsd(withCeiling(String(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD)))).toBe(AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD);
  });

  it.each(["0", "-1", "abc", "$0.10", "1e-1", "11", "NaN"])("refuses %s, naming the variable, instead of falling back", (value) => {
    expect(() => resolveAutomationStudioLlmRunCostCeilingUsd(withCeiling(value))).toThrow(/FLUXIQ_LLM_RUN_COST_CEILING_USD/u);
  });
});
