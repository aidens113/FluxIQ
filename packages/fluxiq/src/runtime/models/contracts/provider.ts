import type { AutomationStudioLlmProviderMetadata } from "./metadata.ts";
import type { AutomationStudioLlmProviderInputMeasure } from "./input-measure.ts";
import type { ModelRequest } from "./request.ts";

export type ModelProvider<Request extends ModelRequest = ModelRequest> = {
  metadata: AutomationStudioLlmProviderMetadata;
  runTask(request: Request, execution?: { signal?: AbortSignal }): Promise<unknown>;
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
  measureInput?(request: Request): AutomationStudioLlmProviderInputMeasure;
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
