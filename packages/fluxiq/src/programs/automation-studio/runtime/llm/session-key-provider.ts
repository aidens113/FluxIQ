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
// **The unlock is resolved on each call, not fixed for the build (H0-S5).** The
// caller's `actorSessionId` is only the session to try first -- the one the
// work started from. When that session has logged out, expired or been revoked
// by an administrator, the call uses the person's live unlock in this workspace
// (`unlockedSessionFor`), so a build or run keeps going while any unlock of
// theirs lives, and fails with the typed `secrets.locked` error
// (`AutomationStudioSecretsLockedError`) on the first call after none does.
// The key is the Flow's own `llmSecretKeyId` when it names one, read from the
// call's metadata or the host's `flowSecretKeyId` lookup; otherwise the
// caller's own newest DeepSeek key.
//
// The limits returned are defaults for one call and one run, not checks: the
// run's own budget enforces them. Ordinary runs default to $0.25; the Flow's
// explicit adaptation policy supplies its total when configured. An isolated
// test runtime alone applies the environment ceiling to every such total.

import { resolveAutomationStudioLlmBuildCallLimit } from "../../model/index.ts";
import {
  AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL,
  AutomationStudioSecretsLockedError,
  isAutomationStudioDeepSeekModel,
  releaseAutomationStudioSessionDeepSeekKey,
  type AutomationStudioSessionKeyPorts
} from "./deepseek/index.ts";
import type { JsonObject } from "../../../../core/index.ts";
// Read at module evaluation, so from the leaf that imports no value rather than
// through the barrel, where an import cycle could leave them undefined.
import { AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS, AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS } from "./model-limits/index.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS, type AutomationStudioLlmProvider, type AutomationStudioLlmTokenLimits } from "./harness/index.ts";
import { createAutomationStudioDeepSeekProvider } from "./provider-factories.ts";
import { AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS } from "./provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, automationStudioLlmRunCostCeilingUsd } from "./flow-execution-limits/index.ts";
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
 * key with the defaults above. `instanceHost` names where the person signs in
 * in the locked sentence (default "the FluxIQ panel"); `flowSecretKeyId` is
 * the host's lookup of a Flow's `llmSecretKeyId`, for calls whose metadata
 * does not carry it.
 */
export function createAutomationStudioSessionKeyProviderResolver(options: {
  /** Secret Keys' own service in the host; its `unlockedSessionFor` is what every call falls back to. */
  ports: AutomationStudioSessionKeyPorts;
  fetchImpl?: typeof fetch;
  instanceHost?: string;
  flowSecretKeyId?: (scope: { projectId: string; flowId: string }) => Promise<string | undefined> | string | undefined;
}): (input: AutomationStudioLlmProviderResolverInput) => AutomationStudioLlmProviderResolution | undefined {
  return (input) => {
    const caller = input.caller;
    if (!caller) return undefined;
    const model = typeof input.modelId === "string" && isAutomationStudioDeepSeekModel(input.modelId) ? input.modelId : AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL;
    // The adapter reports any failed secret resolution as `llm.provider_secret_unavailable`;
    // a locked key is remembered per request so the call fails with the typed error instead.
    const locked = new Map<string, AutomationStudioSecretsLockedError>();
    const adapter = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:session-deepseek-key" },
      model,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      resolveSecret: async (request) => {
        if (request.projectId !== input.projectId || request.flowId !== input.flowId) throw new Error("LLM request scope mismatch.");
        // Resolved now, for this call: the started-from session if it still holds the key, else the person's live unlock, else `secrets.locked`.
        const flowKeyId = (await options.flowSecretKeyId?.({ projectId: input.projectId, flowId: input.flowId })) ?? metadataKeyId(input.metadata);
        let secret: string;
        try {
          secret = await releaseAutomationStudioSessionDeepSeekKey(options.ports, { userId: caller.actorUserId, sessionId: caller.actorSessionId }, {
            ...(flowKeyId ? { flowKeyId } : {}),
            ...(options.instanceHost ? { instanceHost: options.instanceHost } : {})
          });
        } catch (error) {
          if (error instanceof AutomationStudioSecretsLockedError) locked.set(request.requestId, error);
          throw error;
        }
        locked.delete(request.requestId);
        if (request.outboundBody.includes(secret)) throw new Error("LLM request contains the configured credential.");
        return secret;
      }
    });
    const provider: AutomationStudioLlmProvider = {
      ...adapter,
      runTask: async (request, execution) => {
        try {
          return await adapter.runTask(request, execution);
        } catch (error) {
          throw locked.get(request.requestId) ?? error;
        } finally {
          locked.delete(request.requestId);
        }
      }
    };
    const defaults = AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS;
    const policy = input.metadata?.adaptationPolicySettings;
    const policyCost = policy && typeof policy === "object" && !Array.isArray(policy) ? policy.maxEstimatedCostUsdPerRun : undefined;
    const totalCostUsd = automationStudioLlmRunCostCeilingUsd(policyCost);
    const buildCalls = resolveAutomationStudioLlmBuildCallLimit();
    return {
      provider,
      ...(buildCalls === undefined ? {} : { maxCallsPerRun: buildCalls }),
      tokenLimits: { ...automationStudioSessionKeyProviderTokenLimits(AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS[model].contextTokens) },
      timeoutMs: defaults.timeoutMs,
      maxEstimatedCostUsd: totalCostUsd,
      maxTotalEstimatedCostUsd: totalCostUsd
    };
  };
}

/** A Flow's `llmSecretKeyId`, when the call's metadata carries one. */
function metadataKeyId(metadata: JsonObject | undefined): string | undefined {
  const keyId = metadata?.llmSecretKeyId;
  return typeof keyId === "string" && keyId.trim() ? keyId.trim() : undefined;
}
