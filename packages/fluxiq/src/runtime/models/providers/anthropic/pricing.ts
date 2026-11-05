import { AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL, isAutomationStudioAnthropicModel, type AutomationStudioAnthropicModel } from "../../catalog/index.ts";
import type { AutomationStudioLlmUsageSummary } from "../../contracts/index.ts";
import { isRecord } from "../../transport/index.ts";

// USD/MTok, read from the official pricing page 2026-11-05: Sonnet 5.5 and Opus
// 5.5 cache hits are 0.05x input ($0.10 and $0.20), Haiku's are 0.1x. Cache
// writes are additional input categories, not cache hits: 1.25x input for five
// minutes, 2x for an hour. Haiku's tier applies to the whole prompt: "a request's
// prompt length counts all of its input tokens, including cache reads and cache
// writes", so `inputTokens` here is the total (`automationStudioAnthropicUsage`).
const RATES = {
  "claude-sonnet-5-5": { input: 2, output: 10, hit: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, hit: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, hit: 0.01 }
} as const;

export function estimateAutomationStudioAnthropicCostUsd(inputTokens: number, outputTokens: number, cacheHitInputTokens = 0, model: AutomationStudioAnthropicModel = AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL, cacheWriteInputTokens = 0, cacheWrite1hInputTokens = 0): number {
  if (!isAutomationStudioAnthropicModel(model)
    || ![inputTokens, outputTokens, cacheHitInputTokens, cacheWriteInputTokens, cacheWrite1hInputTokens].every(count)
    || cacheHitInputTokens + cacheWriteInputTokens > inputTokens || cacheWrite1hInputTokens > cacheWriteInputTokens) throw new RangeError("Invalid Anthropic billing counts or model.");
  const rates = model === "claude-haiku-5-5" && inputTokens > 100_000 ? { input: 0.5, output: 2.5, hit: 0.05 } : RATES[model];
  const uncached = inputTokens - cacheHitInputTokens - cacheWriteInputTokens;
  return (uncached * rates.input + cacheHitInputTokens * rates.hit
    + (cacheWriteInputTokens - cacheWrite1hInputTokens) * rates.input * 1.25
    + cacheWrite1hInputTokens * rates.input * 2 + outputTokens * rates.output) / 1_000_000;
}

/** Anthropic input_tokens excludes BOTH cache categories; normalize to Core's total input convention. */
export function automationStudioAnthropicUsage(value: unknown, model: AutomationStudioAnthropicModel): AutomationStudioLlmUsageSummary | undefined {
  if (!isRecord(value) || !count(value.input_tokens) || !count(value.output_tokens)) return undefined;
  const hit = value.cache_read_input_tokens ?? 0;
  const write = value.cache_creation_input_tokens ?? 0;
  if (!count(hit) || !count(write)) return undefined;
  let hour = 0;
  if (value.cache_creation !== undefined) {
    if (!isRecord(value.cache_creation)) return undefined;
    const five = value.cache_creation.ephemeral_5m_input_tokens ?? 0;
    const one = value.cache_creation.ephemeral_1h_input_tokens ?? 0;
    if (!count(five) || !count(one) || five + one !== write) return undefined;
    hour = one;
  }
  const inputTokens = value.input_tokens + hit + write;
  const outputTokens = value.output_tokens;
  if (!count(inputTokens) || !count(inputTokens + outputTokens)) return undefined;
  return {
    inputTokens, outputTokens, totalTokens: inputTokens + outputTokens,
    cacheHitInputTokens: hit, cacheMissInputTokens: inputTokens - hit,
    estimatedCostUsd: estimateAutomationStudioAnthropicCostUsd(inputTokens, outputTokens, hit, model, write, hour)
  };
}

/** What a reply says it wrote to the cache, for the step log: the usage summary every other reader holds has no such field. */
export function automationStudioAnthropicCacheWriteTokens(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  const write = value.cache_creation_input_tokens ?? 0;
  return count(write) ? write : undefined;
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
