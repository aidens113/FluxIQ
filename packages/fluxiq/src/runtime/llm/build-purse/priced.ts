import type { ModelProvider } from "../../models/contracts/index.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_MODEL, AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, isAutomationStudioAnthropicModel, isAutomationStudioDeepSeekModel } from "../../models/catalog/index.ts";
import { estimateAutomationStudioAnthropicCostUsd } from "../../models/providers/anthropic/index.ts";
import { estimateAutomationStudioDeepSeekCostUsd } from "../../models/providers/deepseek/index.ts";

// A provider that prices no call is held and charged as priced, never as free (t1056; the lead's decision, 2026-11-26).
//
// A build's purse holds each call at its projected cost before it is sent and keeps back what judging the Flow will
// cost (`keepBackForJudging`). Both read the provider's `estimateCostUsd`. A provider without one -- a host's own
// resolver, a test double -- was held at nothing and kept nothing back, so its calls cost the purse nothing until a reply
// reported a cost: a build on it was never ended by its purse, and when no count of calls ends a build either (t1056)
// it could run until its clock. Such a provider is now priced at Core's default model's rates, so its calls are held,
// kept back for and, where a reply reports no cost, charged at that hold, as any priced provider's are.
//
// **Never below what calls on the purse were seen to cost (t1056).** Core's default model is among the cheapest, so a
// provider with no price of its own may well cost more per call than the default's rates say. The purse's own rule for
// an unpriced call is to hold it at the most any call on the purse has reported costing (`agents/budget/purse.ts`).
// Pricing every call at the default's rates replaced that measured figure with a guess: a provider whose replies
// reported more than their holds overshot the purse on every call, the judging kept back was spent by the overshoot
// rather than on judging, and the build ended at its budget without its final judged run. So an unpriced call is held
// at the larger of the default's price for it and the most a call on the purse has reported costing (`observedUsd`,
// kept by `./observed-cost.ts`); a judge's call, at no less than the most a judge's call reported, which is what the
// judging pair is then kept back at (`./harness-hold.ts`).

/**
 * `provider`'s prices, and for any call it does not price, the larger of Core's default model's price and `observedUsd`
 * (the most a call on the purse has reported costing; header). Each call is priced once, as it always was: the
 * provider's own price is never probed ahead of a call, since a price may read a clock.
 */
export function automationStudioLlmBuildPursePriced(provider: Pick<ModelProvider, "estimateCostUsd">, observedUsd: () => number = () => 0): Pick<ModelProvider, "estimateCostUsd"> {
  return {
    estimateCostUsd: (usage) => {
      let own: number | undefined;
      try {
        own = provider.estimateCostUsd?.(usage);
      } catch {
        own = undefined;
      }
      if (typeof own === "number" && Number.isFinite(own) && own > 0) return own;
      const observed = observedUsd();
      return Math.max(defaultModelCostUsd(usage.inputTokens, usage.outputTokens), Number.isFinite(observed) && observed > 0 ? observed : 0);
    }
  };
}

function defaultModelCostUsd(inputTokens: number, outputTokens: number): number {
  const input = Math.max(0, Math.trunc(inputTokens));
  const output = Math.max(0, Math.trunc(outputTokens));
  const model = AUTOMATION_STUDIO_LLM_DEFAULT_MODEL;
  if (isAutomationStudioAnthropicModel(model)) return estimateAutomationStudioAnthropicCostUsd(input, output, 0, model);
  return estimateAutomationStudioDeepSeekCostUsd(input, output, 0, isAutomationStudioDeepSeekModel(model) ? model : AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL);
}
