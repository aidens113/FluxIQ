import type { AutomationStudioLlmProviderMetadata } from "./metadata.ts";
import type { AutomationStudioLlmProviderInputMeasure } from "./input-measure.ts";
import type { ModelRequest } from "./request.ts";

export type ModelProvider<Request extends ModelRequest = ModelRequest> = {
  metadata: AutomationStudioLlmProviderMetadata;
  runTask(request: Request, execution?: { signal?: AbortSignal }): Promise<unknown>;
  /**
   * Waits until this provider can make the call, before an attempt starts its
   * deadline (`../retry/call.ts`): a person's locked key waits for them here, with
   * no clock running and nothing spent. Ends when `signal` aborts. Optional: a
   * provider that does not say is always ready.
   */
  whenReady?(request: Request, execution?: { signal?: AbortSignal }): Promise<void>;
  /**
   * Tells `listener` as this provider's own calls begin and end waiting for a person in
   * `whenReady`, with how long each waited. Answers how to stop listening. Optional: a
   * provider that never waits has nothing to say.
   */
  observeHolds?(listener: (state: "started" | "ended", heldMs: number) => void): () => void;
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
  /**
   * The provider that serves `request`, where this one hands requests to others
   * by what they ask: a run's model per role (`../../llm/role-routing/`). A
   * provider is bound to one model, so `metadata`, `measureInput` and
   * `estimateCostUsd` speak for the model that serves; whoever measures, prices
   * or names a call asks this first (`../../llm/harness/run.ts`), and the call is
   * then held, charged and recorded at the model that served it. A decorator
   * forwards it, applying itself to what it answers. Optional: a provider that
   * does not say serves every request itself.
   */
  servedBy?(request: Request): ModelProvider<Request>;
};
