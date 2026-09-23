// The model a redeemed standing authorization actually buys.
//
// It exists because the execution grant service cannot make this call. `issue`
// requires a live actor session ("LLM execution actor session is unavailable")
// and `inspectAvailable` re-validates it on every call, so a Flow replaying at
// three in the morning could never obtain a model however narrow its purpose.
//
// Going around the grant service is deliberate and is what the design asked
// for: a grant purpose issuable without a session would let unattended work
// reach `diagnose_and_adapt` and `explore_and_adapt` too, and the repair a
// refutation triggers is a separate authorization question with a separate
// answer. Nothing here can name a purpose at all. It resolves one provider, for
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
