// The host's provider for model calls made on a person's behalf.
//
// A build, an exploration, a run's diagnosis and repair, and the check of its
// result all reach the model the same way: on the key of the person they are
// made for, released per call to that person's own unlocked session
// (`deepseek/session-key.ts`). Nothing is issued first and nothing is held
// between calls, so nothing can lapse, be revoked, or be refused because the
// Flow changed underneath it -- a Flow that writes itself is the normal case,
// not an integrity failure.
//
// The limits returned are defaults for one call and one run, not checks: the
// run's own budget enforces them. The run's total is the $0.25 run cost ceiling
// (`flow-execution-limits/run-cost-ceiling.ts`), which the Flow's configured
// `maxEstimatedCostUsdPerRun` may lower and never raise.

import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, isAutomationStudioDeepSeekModel, releaseAutomationStudioSessionDeepSeekKey, type AutomationStudioSessionKeyPorts } from "./deepseek/index.ts";
import { createAutomationStudioDeepSeekProvider } from "./provider-factories.ts";
import { AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS } from "./provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } from "./flow-execution-limits/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "./resolver-contract.ts";

/**
 * One call's defaults. Sized to Core's own per-request ceiling less room for
 * the reply: describing a real page -- an infinite feed, an admin console with
 * a virtualised list -- needs the room, and a run is bounded by its cost, its
 * token budget and its deadline rather than by a per-request ceiling.
 */
export const AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS = Object.freeze({
  tokenLimits: Object.freeze({ maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }),
  timeoutMs: AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS,
  /** One call's worst case: never more than the whole run may spend. */
  maxEstimatedCostUsd: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD,
  /** The run's total: the run cost ceiling, which a Flow's own setting may only lower. */
  maxTotalEstimatedCostUsd: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD
});

/**
 * A provider resolver for the host: `undefined` when the call is made for
 * nobody (an unattended run takes its key from its standing result-check
 * authorization instead), otherwise a DeepSeek provider on the caller's own
 * key with the defaults above.
 */
export function createAutomationStudioSessionKeyProviderResolver(options: {
  ports: AutomationStudioSessionKeyPorts;
  fetchImpl?: typeof fetch;
}): (input: AutomationStudioLlmProviderResolverInput) => AutomationStudioLlmProviderResolution | undefined {
  return (input) => {
    const caller = input.caller;
    if (!caller) return undefined;
    const model = typeof input.modelId === "string" && isAutomationStudioDeepSeekModel(input.modelId) ? input.modelId : AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL;
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:session-deepseek-key" },
      model,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      resolveSecret: async (request) => {
        if (request.projectId !== input.projectId || request.flowId !== input.flowId) throw new Error("LLM request scope mismatch.");
        const secret = await releaseAutomationStudioSessionDeepSeekKey(options.ports, { userId: caller.actorUserId, sessionId: caller.actorSessionId });
        if (request.outboundBody.includes(secret)) throw new Error("LLM request contains the configured credential.");
        return secret;
      }
    });
    const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
    return {
      provider,
      tokenLimits: { ...defaults.tokenLimits },
      timeoutMs: defaults.timeoutMs,
      maxEstimatedCostUsd: defaults.maxEstimatedCostUsd,
      maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd
    };
  };
}
