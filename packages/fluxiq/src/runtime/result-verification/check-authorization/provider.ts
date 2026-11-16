// The model a redeemed standing authorization actually buys.
//
// It exists because an unattended replay has no caller. A model call
// ordinarily runs on the key of the person it is made for, authorized per call
// as whoever is calling (`llm/session-key-provider.ts`), so a Flow replaying at
// three in the morning has nobody to authorize it as, however narrow its
// purpose. A standing authorization is the person's own grant for exactly that.
//
// This path is deliberately narrow: nothing here can name a purpose of its
// own. It resolves one provider, for one key, bounded by the ceiling the
// redemption already worked out; `run-outcome.ts` only ever asks it for
// `loop_verification`, and a repair's model is held to the repair kinds by
// `repair-authority.ts`.
//
// What it does not relax is in `reveal.ts`, which is where every refusal lives.

import { createAutomationStudioDeepSeekProvider, createAutomationStudioAnthropicProvider, AUTOMATION_STUDIO_LLM_DEFAULT_MODEL, automationStudioLlmModelProvider, automationStudioLlmProviderDefaultModel, assertAutomationStudioLlmModelBinding } from "../../llm/index.ts";
import type { AutomationStudioResultCheckProviderPorts, AutomationStudioResultCheckProviderScope } from "./provider-contract.ts";
import { revealAutomationStudioResultCheckSecret } from "./reveal.ts";
import type { AutomationStudioResultCheckProviderResolution } from "./provider-contract.ts";

export function createAutomationStudioResultCheckProvider(input: {
  ports: AutomationStudioResultCheckProviderPorts;
  scope: AutomationStudioResultCheckProviderScope;
  fetchImpl?: typeof fetch | undefined;
}): AutomationStudioResultCheckProviderResolution {
  assertAutomationStudioLlmModelBinding(input.scope.providerId, input.scope.modelId);
  const providerId = input.scope.providerId as "anthropic" | "deepseek" | undefined ?? automationStudioLlmModelProvider(input.scope.modelId ?? AUTOMATION_STUDIO_LLM_DEFAULT_MODEL)!;
  const model = input.scope.modelId ?? automationStudioLlmProviderDefaultModel(providerId);
  const factory = providerId === "anthropic" ? createAutomationStudioAnthropicProvider : createAutomationStudioDeepSeekProvider;
  const provider = factory({
    model,
    secretReference: { kind: "secret_reference", id: input.scope.keyId },
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    resolveSecret: async (request) => await revealAutomationStudioResultCheckSecret({ ports: input.ports, scope: input.scope, request, providerId, model })
  });
  return { provider, maxEstimatedCostUsd: input.scope.maxEstimatedCostUsd };
}
