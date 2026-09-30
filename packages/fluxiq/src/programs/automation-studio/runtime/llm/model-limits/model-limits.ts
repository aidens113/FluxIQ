// What each model can actually carry, as DeepSeek publishes it.
//
// A leaf of its own, importing no value, because the harness reads the largest
// window at module evaluation (`../harness/token-limits.ts`). Reached through
// the deepseek barrel, the harness would re-enter itself part-built by way of
// the provider's pre-flight, and a constant read at evaluation time would
// arrive undefined. `../deepseek/models.ts` re-exports this, so the published
// model registry is unchanged.

import type { AutomationStudioDeepSeekModel } from "../deepseek/index.ts";

/**
 * These are the only per-request size limits Core holds a request to. Core's
 * own ceiling, `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`, is
 * derived from them (`AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS`), and a
 * request over its model's window is refused before it is sent, with its
 * measured size (`../deepseek/provider.ts`). Spend is bounded separately, by the run's
 * cost ceiling.
 */
export const AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS: Readonly<Record<AutomationStudioDeepSeekModel, {
  /** The model's own context window, input and output together. */
  contextTokens: number;
  /** The most the model will generate in one reply. */
  maxOutputTokens: number;
}>> = Object.freeze({
  "deepseek-flash": Object.freeze({ contextTokens: 1_000_000, maxOutputTokens: 384_000 }),
  "deepseek-v4-pro": Object.freeze({ contextTokens: 1_000_000, maxOutputTokens: 384_000 })
});
