// The environment ceiling is applied only to an explicitly isolated test runtime.
// Ordinary Flow settings and user-driven runtime defaults do not inherit it.
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV = "FLUXIQ_LLM_RUN_COST_CEILING_USD";
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_SCOPE_ENV = "FLUXIQ_LLM_RUN_COST_CEILING_SCOPE";
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD = 0.25;
export const AUTOMATION_STUDIO_LLM_TEST_RUN_COST_CEILING_DEFAULT_USD = 0.1;
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD = 10;

type Environment = Readonly<Record<string, string | undefined>>;

function processEnvironment(): Environment {
  return (globalThis as { process?: { env?: Environment } }).process?.env ?? {};
}

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

/** Default runtime purse; an ordinary runtime ignores test-only environment settings. */
export function resolveAutomationStudioLlmRunCostCeilingUsd(env: Environment = processEnvironment()): number {
  return resolveAutomationStudioLlmTestRunCostCeilingUsd(env) ?? AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD;
}
