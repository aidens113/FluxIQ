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
