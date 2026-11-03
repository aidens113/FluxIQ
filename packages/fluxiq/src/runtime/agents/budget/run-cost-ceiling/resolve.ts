import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD } from "./default.ts";
import { resolveAutomationStudioLlmTestRunCostCeilingUsd } from "./resolve-test.ts";
import { processEnvironment, type Environment } from "./internal/index.ts";

/** Default runtime purse; an ordinary runtime ignores test-only environment settings. */
export function resolveAutomationStudioLlmRunCostCeilingUsd(env: Environment = processEnvironment()): number {
  return resolveAutomationStudioLlmTestRunCostCeilingUsd(env) ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD;
}
