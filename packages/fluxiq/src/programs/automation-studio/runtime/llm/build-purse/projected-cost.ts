// What one call can cost at worst, priced before it is sent.
//
// The provider prices it (`../harness/provider.ts`, `estimateCostUsd`): every
// input token a cache miss, at the rates in force now (peak or off-peak, t254),
// plus the reply's reserve at the output rate. A call the provider partly
// serves from its cache costs less; one whose reply runs past its reserve --
// no reply is capped -- costs more, and the purse records that overshoot
// (`./purse.ts`). Used
// by the run ledger's reservation and the build's purse alike, so the two never
// price one request two ways.

import type { AutomationStudioLlmProvider } from "../harness/index.ts";

/**
 * The worst case for a request of `inputTokens` measured input and
 * `outputTokens` reply reserve, or `undefined` where the provider does not
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
