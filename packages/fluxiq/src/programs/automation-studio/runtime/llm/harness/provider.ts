import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "./task-request.ts";

export type AutomationStudioLlmProviderMetadata = {
  provider: string;
  model: string;
  version?: string;
  endpoint?: string;
  metadata?: JsonObject;
};

export type AutomationStudioLlmUsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /**
   * How `inputTokens` divided between what the provider served from its own
   * context cache and what it had to read. Both are absent where the provider
   * did not say, or said something that did not add up, and an absent split
   * means the whole input was priced as though none of it was cached.
   *
   * They divide `inputTokens` rather than adding to it:
   * `cacheHitInputTokens + cacheMissInputTokens === inputTokens` wherever both
   * are present, and `totalTokens` still equals `inputTokens + outputTokens`.
   * This is the one figure that says whether the request's constant prefix is
   * actually being reused, which is what pays for arranging it as one.
   */
  cacheHitInputTokens?: number;
  cacheMissInputTokens?: number;
  estimatedCostUsd?: number;
};

/**
 * What a request measures as the provider will send it: the bytes of the
 * messages that go out, and the input tokens those bytes are estimated at by
 * Core's one estimator (`../token-estimation.ts`, UTF-8 bytes / 3).
 */
export type AutomationStudioLlmProviderInputMeasure = {
  estimatedInputTokens: number;
  estimatedInputBytes: number;
};

export type AutomationStudioLlmProvider = {
  metadata: AutomationStudioLlmProviderMetadata;
  runTask(request: AutomationStudioLlmTaskRequest, execution?: { signal?: AbortSignal }): Promise<unknown>;
  /**
   * The request measured the way `runTask` will measure it before sending.
   *
   * The harness refuses an oversize request itself, with its size, before a
   * provider is called (`./run.ts`). It measures the packed request with the
   * same estimator the adapter uses, but the adapter adds what only it knows --
   * its system prompt and output schema -- so without this the harness could
   * pass a request the adapter then refused. With it, the harness's
   * size-carrying refusal is always the one that fires. Optional: a provider
   * that does not say is measured on the packed request alone.
   */
  measureInput?(request: AutomationStudioLlmTaskRequest): AutomationStudioLlmProviderInputMeasure;
  /**
   * What a call of this size would cost at worst: every input token a cache
   * miss, at the provider's rates in force now (DeepSeek's are half off-peak,
   * t254). The harness reserves this against the
   * run's ledger, under the call's own cost ceiling, so a small request is not
   * held at the price of a full context window. Optional: a provider that does
   * not say is reserved at the call's ceiling.
   */
  estimateCostUsd?(tokens: { inputTokens: number; outputTokens: number }): number;
};
