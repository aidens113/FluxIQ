import {
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD,
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD,
  resolveAutomationStudioLlmTestRunCostCeilingUsd
} from "../../../model/run-cost-ceiling/index.ts";

// Read once at startup; malformed test configuration fails before provider calls.
const testCeilingUsd = resolveAutomationStudioLlmTestRunCostCeilingUsd();

/** Default purse; user-specified policies may replace the ordinary default. */
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD: number = testCeilingUsd ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD;

/** Explicit policies narrow one another; only a test ceiling and server maximum are absolute. */
export function automationStudioLlmRunCostCeilingUsd(...limits: readonly unknown[]): number {
  const specified = limits.filter((limit): limit is number => typeof limit === "number" && Number.isFinite(limit) && limit > 0);
  const requested = specified.length ? Math.min(...specified) : AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;
  return Math.min(requested, testCeilingUsd ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD, AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD);
}
