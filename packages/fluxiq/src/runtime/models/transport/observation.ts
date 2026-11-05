export type ModelTransportUsage = {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheHitInputTokens?: number | undefined;
  cacheMissInputTokens?: number | undefined;
  /** Input tokens this call wrote to the provider's cache, where the provider says. Part of `cacheMissInputTokens`. */
  cacheWriteInputTokens?: number | undefined;
  estimatedCostUsd?: number | undefined;
};

export type ModelTransportCall = {
  provider: string;
  model: string;
  url: string;
  /** The exact body string handed to `fetch`. */
  body: string;
  taskKind: string;
  /** The folder kind, where the task kind does not name it (`chat` for the panel). */
  kind?: string;
  requestId?: string | undefined;
  stage?: string | undefined;
  iteration?: number | undefined;
  /** What a reply's usage cost, for an adapter whose own parse does not price it. */
  price?: (usage: { inputTokens: number; outputTokens: number; cacheHitInputTokens: number }) => number;
};

export type ModelTransportObservation = {
  /** The reply body exactly as it arrived, 2xx or not, with its HTTP status. */
  reply(raw: Uint8Array | string, status: number): void;
  /** What Core parsed the reply into. */
  succeeded(response: unknown, usage?: ModelTransportUsage): void;
  /** The failure the adapter threw. */
  failed(error: unknown): void;
};

/** A host may observe one exchange without the transport acquiring its logging or storage dependencies. */
export type ModelTransportObserver = (call: ModelTransportCall) => ModelTransportObservation | undefined;
