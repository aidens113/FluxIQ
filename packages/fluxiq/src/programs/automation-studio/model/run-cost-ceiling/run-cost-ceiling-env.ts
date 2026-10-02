// The run cost ceiling, as a developer and Lab knob.
//
// The most one run -- a build, a re-author, or a recovery -- may be estimated
// to spend on the model. It is $0.10 unless the environment says otherwise
// (the user's rule, 2026-10-01; it was a fixed $0.25). The user asked for it
// to be "an easily configurable variable ... even for test purposes in the
// lab", so it is read from `FLUXIQ_LLM_RUN_COST_CEILING_USD`, and the Lab sets
// that variable for every Core it starts (`--llm-cost-ceiling-usd`).
//
// This is the developer's and the Lab's knob, not the product's spending
// control. The product's user-facing limit is a separate setting, designed
// later; until it exists, this is what Core falls back to when nothing lower
// is configured. A Flow's own `maxEstimatedCostUsdPerRun`, a resolver's total
// and an authorization may each still only lower it
// (`runtime/llm/flow-execution-limits/run-cost-ceiling.ts`).
//
// It lives in the model because a new Flow's default settings carry it
// (`../flows.ts`) and the model does not import the runtime. It is read when
// asked for rather than at module evaluation, so an env file the host loads
// after this module is imported still counts, and it reads `process` through
// `globalThis` so a browser bundle that reaches the model never touches it.
// A value that is set and is not a usable amount throws, naming the variable
// and what it holds: Core checks it once at start (`createGlobalProgramRuntime`)
// so a typo stops the server instead of silently spending the default.

/** The environment variable that sets the run cost ceiling, in US dollars. */
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV = "FLUXIQ_LLM_RUN_COST_CEILING_USD";

/** The ceiling when the variable is unset or empty. */
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD = 0.1;

/**
 * The largest ceiling the variable may set. It is the run ledger's own server
 * ceiling, `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD`
 * (`runtime/llm/harness/token-limits.ts`), above which the ledger refuses to
 * open at all; a literal because the model does not import the runtime, and
 * `runtime/llm/flow-execution-limits/tests/run-cost-ceiling.test.ts` holds the
 * two equal.
 */
export const AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD = 10;

type Environment = Readonly<Record<string, string | undefined>>;

function processEnvironment(): Environment {
  return (globalThis as { process?: { env?: Environment } }).process?.env ?? {};
}

/**
 * The run cost ceiling in US dollars: `FLUXIQ_LLM_RUN_COST_CEILING_USD` when it
 * is set, otherwise {@link AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD}.
 * Throws when the variable is set to anything but a positive number no larger
 * than {@link AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD}; it never falls
 * back to the default on a bad value.
 */
export function resolveAutomationStudioLlmRunCostCeilingUsd(env: Environment = processEnvironment()): number {
  const raw = env[AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV];
  if (raw === undefined || raw.trim() === "") return AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD;
  const text = raw.trim();
  const value = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0 || value > AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD) {
    throw new Error(`${AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV} must be a positive number of US dollars no larger than ${AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD}, such as 0.10; it is ${JSON.stringify(raw)}. Unset it to use the default of $${AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD.toFixed(2)}.`);
  }
  return value;
}
