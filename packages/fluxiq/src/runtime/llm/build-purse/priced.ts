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

/**
 * `provider`'s prices, and Core's default model's for any call it does not price (header). Each call is priced once, as
 * it always was: the provider's own price is never probed ahead of a call, since a price may read a clock.
 */
export function automationStudioLlmBuildPursePriced(provider: Pick<ModelProvider, "estimateCostUsd">): Pick<ModelProvider, "estimateCostUsd"> {
  return {
    estimateCostUsd: (usage) => {
      let own: number | undefined;
      try {
        own = provider.estimateCostUsd?.(usage);
      } catch {
        own = undefined;
      }
      return typeof own === "number" && Number.isFinite(own) && own > 0 ? own : defaultModelCostUsd(usage.inputTokens, usage.outputTokens);
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
