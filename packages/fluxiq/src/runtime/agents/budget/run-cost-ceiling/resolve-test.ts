import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_SCOPE_ENV } from "./scope-key.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV } from "./env-key.ts";
import { AUTOMATION_STUDIO_LLM_TEST_RUN_COST_CEILING_DEFAULT_USD } from "./test-default.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD } from "./maximum.ts";
import { processEnvironment, type Environment } from "./internal/index.ts";

/** An environment ceiling exists only when the host explicitly marks this runtime as test. */
export function resolveAutomationStudioLlmTestRunCostCeilingUsd(env: Environment = processEnvironment()): number | undefined {
  if (env[AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_SCOPE_ENV] !== "test") return undefined;
  const raw = env[AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV];
  if (raw === undefined || raw.trim() === "") return AUTOMATION_STUDIO_LLM_TEST_RUN_COST_CEILING_DEFAULT_USD;
  const text = raw.trim();
  const value = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0 || value > AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD) {
    throw new Error(`${AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV} must be a positive number of US dollars no larger than ${AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD}, such as 0.10. Unset it to use the test default of $0.10.`);
  }
  return value;
}
