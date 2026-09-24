// The model a run nobody is watching repairs itself with, and the record of why
// it had none.
//
// The gap this closes was measured rather than reasoned about. `_shared/runtime.ts`
// binds `llmProviderResolver` as `(input) => input.executionGrant ? ... :
// undefined`, and `AutomationStudioLlmExecutionGrantService.issue` refuses
// without a live actor session, so an unattended failed run resolved no model
// at all: on 2026-09-23 such a run recorded `llmGate.providerConfigured: false`
// and `llm.provider_missing`, with no diagnosis, no patch, no retry and no
// `resultCheck` -- while the gate *after* this one, which judges a repair's own
// product, was already working. Judging a repair worked; making one did not.
//
// **It is reached only where the old path resolved nothing.** The person's
// grant is asked first and is untouched; so is any host that resolves a model
// without one. This is the last authority a run has, not the first, which is
// what makes "a person's own grant behaves exactly as it does today" true by
// construction rather than by a test that has to notice a change.
//
// **What is handed over is the key and a ceiling.** Never the authorization
// record, never a purpose, and deliberately no `permittedConsequences`: paying
// for the model is not permission to act, so a repair that wants to press
// something with a lasting consequence meets the recovery's permission gate
// with nothing granted and raises a request for the person.

import { redeemAutomationStudioUnattendedRepairAuthorization, type AutomationStudioUnattendedRepairRedemption } from "../../result-check-authorization/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmProviderResolution } from "../../llm/index.ts";
import type { AutomationStudioResultCheckProviderRequest, AutomationStudioResultCheckProviderResolution } from "./result-check.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "./contracts.ts";

/**
 * What the Flow's standing authorization said about paying for this repair.
 *
 * The redemption is present either way, because a refused repair has to say
 * which refusal it was -- expired, exhausted, never switched on -- rather than
 * looking like a deployment with no model configured, which is what every one
 * of them looked like before.
 */
export type AutomationStudioUnattendedRepairAuthority = {
  redemption: AutomationStudioUnattendedRepairRedemption;
  /** Present only when the redemption succeeded *and* the host resolved a model for it. */
  resolution?: AutomationStudioLlmProviderResolution;
};

export async function resolveAutomationStudioUnattendedRepairAuthority(input: {
  /** `null` is a run with no adaptation context at all: it has no settings, so it holds no authorization and is refused as though none were stored. */
  context: AutomationStudioRuntimeAdaptationContext | null;
  nowMs: number;
  /**
   * The host's own resolver -- the same one a standing result check uses,
   * because obtaining the key is the host's business either way and nothing in
   * it knows or cares what Core will ask the model. That is exactly why the
   * scope has to bind here, before the host is reached.
   */
  resolveStandingProvider?: ((request: AutomationStudioResultCheckProviderRequest) =>
    | Promise<AutomationStudioResultCheckProviderResolution | undefined>
    | AutomationStudioResultCheckProviderResolution
    | undefined) | undefined;
}): Promise<AutomationStudioUnattendedRepairAuthority> {
  const context = input.context;
  const redemption = redeemAutomationStudioUnattendedRepairAuthorization({
    authorization: context?.settings.resultCheck?.authorization,
    nowMs: input.nowMs,
    // The one tally, shared with the checks and with the training window, for
    // the reason `result-check.ts` gives: two independent counts of the same
    // spending would disagree, and the person set one limit.
    spentUsd: context?.budgetState.costUsdThisTrainingWindow ?? 0
  });
  if (!redemption.redeemed || !context || !input.resolveStandingProvider) return { redemption };
  const resolved = await input.resolveStandingProvider({
    projectId: context.projectId,
    flowId: context.flowId,
    keyId: redemption.keyId,
    unlockSessionId: redemption.unlockSessionId,
    authorizedByUserId: redemption.authorizedByUserId,
    maxEstimatedCostUsd: redemption.maxEstimatedCostUsdPerRun
  });
  if (!resolved) return { redemption };
  return {
    redemption,
    resolution: {
      // Held to the redemption's kinds at the provider itself, so a caller that
      // later asks this model for something else fails loudly instead of
      // quietly spending the person's money on it. The list is the redemption's
      // own answer; nothing passed one in.
      provider: boundToRedeemedTaskKinds(resolved.provider, redemption.taskKinds),
      // The whole repair's purse, not a per-call figure: `run-budget.ts` divides
      // it into shares itself, and a per-call number there would be multiplied
      // back up into a purse nobody chose. It is a ceiling over the policy's own
      // $0.25, never a widening of it -- that function takes the smaller.
      maxTotalEstimatedCostUsd: Math.min(resolved.maxEstimatedCostUsd ?? redemption.maxEstimatedCostUsdPerRun, redemption.maxEstimatedCostUsdPerRun),
      ...(resolved.tokenLimits ? { tokenLimits: resolved.tokenLimits } : {}),
      ...(resolved.timeoutMs !== undefined ? { timeoutMs: resolved.timeoutMs } : {})
      // No `permittedConsequences`. See the file comment: this buys a model, not
      // a permission, and the gate reads an absent set as permitting nothing.
    }
  };
}

/** The same model, refusing any task kind the redemption did not cover. */
function boundToRedeemedTaskKinds(provider: AutomationStudioLlmProvider, taskKinds: readonly string[]): AutomationStudioLlmProvider {
  return {
    metadata: provider.metadata,
    runTask: async (request, execution) => {
      if (!taskKinds.includes(request.taskKind)) {
        throw new Error(`A standing repair authorization does not pay for ${request.taskKind}.`);
      }
      return await provider.runTask(request, execution);
    }
  };
}
