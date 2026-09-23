// What a DeepSeek call costs, and how much of it the provider did not have to
// read.
//
// Kept apart from the adapter that builds, sends and parses a request, because
// they answer different questions and change for different reasons. The rates
// here are dated, provider-owned facts that a person reviews when DeepSeek
// changes its price list; everything in `provider.ts` is Core's own contract
// with the endpoint. They were one file until the cache split arrived and
// pushed it past its line budget, which was the file saying what it had become.

import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST } from "../harness.ts";
import {
  AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL,
  resolveAutomationStudioDeepSeekModel,
  type AutomationStudioDeepSeekModel
} from "./models.ts";

/**
 * DeepSeek's published peak rates in USD per million tokens, read from
 * https://api-docs.deepseek.com/quick_start/pricing/ on 2026-09-23. Re-read
 * that page before trusting these: DeepSeek says on it that prices may vary.
 *
 * **Peak, deliberately.** DeepSeek charges half of every figure below outside
 * 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday, excluding Chinese public
 * holidays -- so roughly four fifths of the week, both weekend days included,
 * bills at half price. Core prices at the peak rate anyway, because a grant
 * reserves before a call is made and a reservation that assumed the discount
 * would let a run overspend the moment it started inside peak hours. An
 * off-peak run is therefore billed less than Core estimated, never more.
 *
 * **A cache hit is a fiftieth of a miss, not a tenth.** The rates that stood
 * here until 2026-09-23 were 0.44 per million cache-miss input, 0.044 cache hit
 * and 1.32 output. The hit rate was written as "a tenth of a miss" and flagged
 * unsourced when it went in; DeepSeek publishes no such ratio, and the three
 * numbers together match no model on the current price list. Anything that
 * reorders a payload to lengthen the cached prefix is worth five times what
 * those constants credited it with.
 */
const PEAK_RATES_USD_PER_MILLION_TOKENS: Readonly<Record<AutomationStudioDeepSeekModel, {
  cacheHitInput: number;
  cacheMissInput: number;
  output: number;
}>> = Object.freeze({
  "deepseek-flash": Object.freeze({ cacheHitInput: 0.006, cacheMissInput: 0.3, output: 1.2 }),
  "deepseek-v4-pro": Object.freeze({ cacheHitInput: 0.044, cacheMissInput: 1.32, output: 3.96 })
});

/** How much less an off-peak call costs: exactly half, on every rate and every model. */
export const AUTOMATION_STUDIO_DEEPSEEK_OFF_PEAK_RATE_MULTIPLIER = 0.5;

export const AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS =
  PEAK_RATES_USD_PER_MILLION_TOKENS[AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL].cacheMissInput;
/**
 * What an input token costs when the provider served it from its own context
 * cache, as against {@link AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS}
 * for one it had to read.
 *
 * **It never makes a reservation cheaper.** Core reserves against
 * `estimateAutomationStudioDeepSeekInputTokens`, which measures the bytes it is
 * about to send and knows nothing about caching, so a grant still holds back
 * the cache-miss price for every call it authorizes. This rate is applied only
 * to hits the provider has already reported on a call that has already been
 * made, which is a measurement rather than a promise -- so a hit rate that
 * turns out to be wrong cannot let a grant overspend.
 */
export const AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_HIT_INPUT_USD_PER_MILLION_TOKENS =
  PEAK_RATES_USD_PER_MILLION_TOKENS[AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL].cacheHitInput;
export const AUTOMATION_STUDIO_DEEPSEEK_PEAK_OUTPUT_USD_PER_MILLION_TOKENS =
  PEAK_RATES_USD_PER_MILLION_TOKENS[AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL].output;

/**
 * What one call cost, with the part of its input the provider served from cache
 * priced at the cache-hit rate.
 *
 * `cacheHitInputTokens` is a subset of `inputTokens`, defaulting to none, so
 * every caller that does not know about caching gets exactly the conservative
 * all-miss figure it always got. `model` defaults to the configured default, so
 * a caller that names none is priced for the model it will actually get. The
 * rates are scaled by a thousand rather than a hundred because a cache-hit rate
 * has three decimal places; every rate on the list is a whole number of
 * thousandths, so the arithmetic stays integral.
 */
export function estimateAutomationStudioDeepSeekCostUsd(
  inputTokens: number,
  outputTokens: number,
  cacheHitInputTokens = 0,
  model: AutomationStudioDeepSeekModel = AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL
): number {
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
    throw new RangeError("DeepSeek token counts must be non-negative safe integers.");
  }
  if (!Number.isSafeInteger(cacheHitInputTokens) || cacheHitInputTokens < 0 || cacheHitInputTokens > inputTokens) {
    throw new RangeError("DeepSeek cache-hit tokens must be a non-negative safe integer no larger than the input tokens.");
  }
  if (inputTokens + outputTokens > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST) {
    throw new RangeError("DeepSeek token counts exceed the Core request limit.");
  }
  const rates = PEAK_RATES_USD_PER_MILLION_TOKENS[resolveAutomationStudioDeepSeekModel(model)];
  const missRateThousandths = Math.round(rates.cacheMissInput * 1_000);
  const hitRateThousandths = Math.round(rates.cacheHitInput * 1_000);
  const outputRateThousandths = Math.round(rates.output * 1_000);
  const estimatedCostUsd = ((inputTokens - cacheHitInputTokens) * missRateThousandths
    + cacheHitInputTokens * hitRateThousandths
    + outputTokens * outputRateThousandths) / 1_000_000_000;
  if (!Number.isFinite(estimatedCostUsd)) throw new RangeError("DeepSeek estimated cost must be finite.");
  return estimatedCostUsd;
}

/**
 * How much of a call's input the provider served from its own context cache, or
 * nothing when it did not say in terms Core can hold to the rest of the report.
 *
 * DeepSeek names the split two ways -- `prompt_cache_hit_tokens` beside
 * `prompt_cache_miss_tokens`, and `prompt_tokens_details.cached_tokens` -- so
 * both are read and the first that answers wins. A split larger than the input
 * it claims to divide, or whose two halves do not add up to it, is dropped
 * rather than refused: the reply itself is sound and the call is worth having,
 * and a cache figure Core cannot trust is better absent than recorded. An
 * absent figure prices the whole call at the cache-miss rate, which is what
 * every call was priced at before any of this was read.
 */
export function automationStudioDeepSeekCacheHitInputTokens(usage: Record<string, unknown>, inputTokens: number): number | undefined {
  const details = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : undefined;
  const hit = wholeTokens(usage.prompt_cache_hit_tokens) ?? wholeTokens(details?.cached_tokens);
  if (hit === undefined || hit > inputTokens) return undefined;
  const miss = wholeTokens(usage.prompt_cache_miss_tokens);
  if (miss !== undefined && hit + miss !== inputTokens) return undefined;
  return hit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function wholeTokens(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined;
}
