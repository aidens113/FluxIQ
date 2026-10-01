// What one call can cost at worst, priced before it is sent.
//
// The provider prices it (`../harness/provider.ts`, `estimateCostUsd`): every
// input token a cache miss, at its peak rates, plus the whole reply allowance at
// the output rate. That is the most the request about to be sent can cost; a
// call the provider partly serves from its cache costs less, never more. Used
// by the run ledger's reservation and the build's purse alike, so the two never
// price one request two ways.

import type { AutomationStudioLlmProvider } from "../harness/index.ts";

/**
 * The worst case for a request of `inputTokens` measured input and
 * `outputTokens` reply allowance, or `undefined` where the provider does not
 * price, or prices nonsense.
 */
export function automationStudioLlmProjectedCallCostUsd(provider: Pick<AutomationStudioLlmProvider, "estimateCostUsd">, inputTokens: number, outputTokens: number): number | undefined {
  let priced: number | undefined;
  try {
    priced = provider.estimateCostUsd?.({ inputTokens, outputTokens });
  } catch {
    priced = undefined;
  }
  return typeof priced === "number" && Number.isFinite(priced) && priced > 0 ? priced : undefined;
}
