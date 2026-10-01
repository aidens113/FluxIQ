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

import {
  AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL,
  isAutomationStudioDeepSeekModel,
  releaseAutomationStudioSessionDeepSeekKey,
  type AutomationStudioSessionKeyPorts
} from "./deepseek/index.ts";
// Read at module evaluation, so from the leaf that imports no value rather than
// through the barrel, where an import cycle could leave them undefined.
import { AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS, AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS } from "./model-limits/index.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS, type AutomationStudioLlmTokenLimits } from "./harness/index.ts";
import { createAutomationStudioDeepSeekProvider } from "./provider-factories.ts";
import { AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS } from "./provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD } from "./flow-execution-limits/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "./resolver-contract.ts";

/** What one call reserves for the model's reply: the harness's own reply reserve, so the two cannot drift. */
const AUTOMATION_STUDIO_SESSION_KEY_REPLY_TOKENS = AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS;

/**
 * One call's token limits in a context window of `window` tokens. The reply is
 * reserved out of it, and everything else is the input's: a whole page is
 * sent as it is, and a request over the window is refused with its measured
 * size rather than trimmed (`./context-window.ts`). A run is bounded by its
 * cost, its token budget and its deadline, not by a per-request ceiling.
 */
function automationStudioSessionKeyProviderTokenLimits(window: number): AutomationStudioLlmTokenLimits {
  return Object.freeze({
    maxInputTokens: window - AUTOMATION_STUDIO_SESSION_KEY_REPLY_TOKENS,
    maxOutputTokens: AUTOMATION_STUDIO_SESSION_KEY_REPLY_TOKENS,
    maxTotalTokens: window
  });
}

/**
 * One call's defaults. The token limits are the largest window of any model;
 * a resolved call gets its own model's window (below).
 */
export const AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS = Object.freeze({
  tokenLimits: automationStudioSessionKeyProviderTokenLimits(AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS),
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
      tokenLimits: { ...automationStudioSessionKeyProviderTokenLimits(AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS[model].contextTokens) },
      timeoutMs: defaults.timeoutMs,
      maxEstimatedCostUsd: defaults.maxEstimatedCostUsd,
      maxTotalEstimatedCostUsd: defaults.maxTotalEstimatedCostUsd
    };
  };
}
