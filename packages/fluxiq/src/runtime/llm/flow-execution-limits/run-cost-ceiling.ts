import {
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD,
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD,
  resolveAutomationStudioLlmTestRunCostCeilingUsd
} from "../../../flows/authoring/model/run-cost-ceiling/index.ts";

// Read once at startup; malformed test configuration fails before provider calls.
const testCeilingUsd = resolveAutomationStudioLlmTestRunCostCeilingUsd();

/** Default purse; user-specified policies may replace the ordinary default. */
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD: number = testCeilingUsd ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD;

/**
 * Explicit policies narrow one another; only a test ceiling and server maximum are absolute.
 * `env` lets a caller name the environment the test ceiling is read from instead of the one the process started with, so a test needs no fresh module graph.
 */
export function automationStudioLlmRunCostCeilingUsd(...limits: readonly unknown[]): number {
  return automationStudioLlmRunCostCeilingUsdIn(undefined, ...limits);
}

export function automationStudioLlmRunCostCeilingUsdIn(env: Readonly<Record<string, string | undefined>> | undefined, ...limits: readonly unknown[]): number {
  const ceilingUsd = env ? resolveAutomationStudioLlmTestRunCostCeilingUsd(env) : testCeilingUsd;
  const specified = limits.filter((limit): limit is number => typeof limit === "number" && Number.isFinite(limit) && limit > 0);
  const requested = specified.length ? Math.min(...specified) : (ceilingUsd ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD);
  return Math.min(requested, ceilingUsd ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD, AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD);
}
