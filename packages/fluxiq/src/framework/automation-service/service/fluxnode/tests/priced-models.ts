// A host's resolver over several models, each at its own price, all answered by one scripted model: what a FluxNode
// run's model per role is tested on (`./model-routing.test.ts`). It resolves the model a request names, its default
// where none is named, and throws for an id it does not know, as the host's own resolver does for an unknown model.
import type { AutomationStudioLlmProvider, AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput, AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";

/** The model a lane resolves where neither the caller nor the Flow names one. */
export const LANE_DEFAULT_MODEL = "lane-default";
/** What each scripted call reports using, priced at the model that served it. */
const TOKENS = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

export type FluxNodeServedCall = { model: string; taskKind: string; costUsd: number };

export function fluxNodePricedModels(perTokenUsd: Readonly<Record<string, number>>, answer: (request: AutomationStudioLlmTaskRequest) => Promise<unknown>) {
  /** Every call any model served, in order, with what it reported costing. */
  const served: FluxNodeServedCall[] = [];
  /** Each model whose price was asked, in order: what holds and reserves were priced at. */
  const priced: string[] = [];
  const modelProvider = (model: string, perToken: number): AutomationStudioLlmProvider => ({
    metadata: { provider: "mock-production", model },
    estimateCostUsd: ({ inputTokens, outputTokens }) => {
      priced.push(model);
      return (inputTokens + outputTokens) * perToken;
    },
    runTask: async (request) => {
      const reply = await answer(request);
      const costUsd = TOKENS.totalTokens * perToken;
      served.push({ model, taskKind: request.taskKind, costUsd });
      return { ...(reply as object), usage: { ...TOKENS, estimatedCostUsd: costUsd } };
    }
  });
  const resolver = (input: AutomationStudioLlmProviderResolverInput): AutomationStudioLlmProviderResolution => {
    const model = input.modelId ?? LANE_DEFAULT_MODEL;
    const perToken = perTokenUsd[model];
    if (perToken === undefined) throw new Error(`Unknown LLM model: ${model}`);
    return { provider: modelProvider(model, perToken) };
  };
  return { resolver, served, priced };
}
