// The model a redeemed standing authorization actually buys.
//
// It exists because an unattended replay has nobody signed in. A model call
// ordinarily runs on the key of the person it is made for, released per call
// to that person's own unlocked session (`llm/session-key-provider.ts`), so a
// Flow replaying at three in the morning has no session to release one to,
// however narrow its purpose.
//
// This path is deliberately narrow: a way to call the model without a session
// that served any purpose would let unattended work reach `diagnose_and_adapt`
// and `explore_and_adapt` too, and the repair a refutation triggers is a
// separate authorization question with a separate answer. Nothing here can
// name a purpose at all. It resolves one provider, for
// one key, bounded by the ceiling the redemption already worked out, and
// `run-outcome.ts` only ever asks it for `loop_verification`.
//
// What it does not relax is in `reveal.ts`, which is where every refusal lives.

import { createAutomationStudioDeepSeekProvider } from "../llm/index.ts";
import type { AutomationStudioResultCheckProviderPorts, AutomationStudioResultCheckProviderScope } from "./provider-contract.ts";
import { revealAutomationStudioResultCheckSecret } from "./reveal.ts";
import type { AutomationStudioResultCheckProviderResolution } from "./provider-contract.ts";

export function createAutomationStudioResultCheckProvider(input: {
  ports: AutomationStudioResultCheckProviderPorts;
  scope: AutomationStudioResultCheckProviderScope;
  fetchImpl?: typeof fetch | undefined;
}): AutomationStudioResultCheckProviderResolution {
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: input.scope.keyId },
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    resolveSecret: async (request) => await revealAutomationStudioResultCheckSecret({ ports: input.ports, scope: input.scope, request })
  });
  return { provider, maxEstimatedCostUsd: input.scope.maxEstimatedCostUsd };
}
