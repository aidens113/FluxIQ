import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import type { AutomationStudioLlmModelRole } from "./kind-roles.ts";
import { automationStudioLlmModelLadderFrame } from "./ladder/index.ts";
import { automationStudioLlmModelRoleOf } from "./request-role.ts";

/**
 * The models an attempt may climb (`./ladder/`), cheapest first, and the rung each role starts on.
 * A role with no rung is served by its own provider, off the ladder. The explore role always has one.
 */
export type AutomationStudioLlmProviderLadder = {
  tiers: readonly { model: string; provider: AutomationStudioLlmProvider }[];
  from: Readonly<Record<AutomationStudioLlmModelRole, number | undefined>>;
};

/**
 * One provider over a model per role: each request goes to its role's model
 * (`./request-role.ts`), and `servedBy` names that model to whoever measures, prices
 * or records the call (`../harness/run.ts`), so a call is held and charged at
 * the price of the model that served it, under the attempt's one purse.
 *
 * **On a ladder** (`ladder`, t962), a role on it is served on its start rung plus the rungs the
 * attempt has climbed (`./ladder/frame.ts`), never past the top: every role steps up one rung per
 * climb, so a judge configured stronger stays stronger. The provider tells the attempt's ladder
 * which models the explore role climbs as it serves, which is how a climb names its models.
 *
 * A role with no provider of its own, or the explore model's own, is served by
 * the explore model; where every role is and there is no ladder, this is the explore
 * provider itself, unchanged, so a run that names no other model sends exactly what it sent.
 *
 * `metadata` is the explore model's: the attempt's own model, which its
 * accounting names. `estimateCostUsd` takes no request, so it can only price at
 * the explore model; every caller that has the request asks `servedBy` first.
 * `measureInput` and `whenReady` take the request and go to the model that
 * serves it; a person's locked key is waited for by whichever model is called.
 */
export function automationStudioLlmProviderRoutedByRole(providers: { explore: AutomationStudioLlmProvider; judge?: AutomationStudioLlmProvider | undefined; repair?: AutomationStudioLlmProvider | undefined; ladder?: AutomationStudioLlmProviderLadder | undefined }): AutomationStudioLlmProvider {
  const { explore, ladder } = providers;
  const byRole: Readonly<Record<AutomationStudioLlmModelRole, AutomationStudioLlmProvider>> = { explore, judge: providers.judge ?? explore, repair: providers.repair ?? explore };
  if (!ladder && byRole.judge === explore && byRole.repair === explore) return explore;
  const distinct = [...new Set([...Object.values(byRole), ...(ladder?.tiers.map((tier) => tier.provider) ?? [])])];
  const pick = ladder ? laddered(ladder, byRole) : (role: AutomationStudioLlmModelRole) => byRole[role];
  // A role's own provider may route again; what serves is where routing stops.
  const servedBy = (request: AutomationStudioLlmTaskRequest): AutomationStudioLlmProvider => {
    const provider = pick(automationStudioLlmModelRoleOf(request));
    return provider.servedBy?.(request) ?? provider;
  };
  const estimateCostUsd = explore.estimateCostUsd;
  return {
    metadata: explore.metadata,
    runTask: async (request, execution) => await servedBy(request).runTask(request, execution),
    servedBy,
    ...(distinct.some((provider) => provider.whenReady) ? { whenReady: async (request: AutomationStudioLlmTaskRequest, execution?: { signal?: AbortSignal }) => await servedBy(request).whenReady?.(request, execution) } : {}),
    // Whichever model waits for a person, the attempt hears it.
    ...(distinct.some((provider) => provider.observeHolds) ? {
      observeHolds: (listener: (state: "started" | "ended", heldMs: number) => void) => {
        const stops = distinct.map((provider) => provider.observeHolds?.(listener));
        return () => {
          for (const stop of stops) stop?.();
        };
      }
    } : {}),
    // A model that does not measure is measured on the packed request: the harness reads a throw as no measure.
    ...(distinct.some((provider) => provider.measureInput) ? {
      measureInput: (request: AutomationStudioLlmTaskRequest) => {
        const served = servedBy(request);
        if (!served.measureInput) throw new Error(`The ${served.metadata.model} model does not measure its requests.`);
        return served.measureInput(request);
      }
    } : {}),
    ...(estimateCostUsd ? { estimateCostUsd: (tokens: { inputTokens: number; outputTokens: number }) => estimateCostUsd.call(explore, tokens) } : {})
  };
}

/** The provider a role is served by on the ladder: its start rung plus the rungs climbed, at most the top. Outside every ladder frame, its start rung. */
function laddered(ladder: AutomationStudioLlmProviderLadder, byRole: Readonly<Record<AutomationStudioLlmModelRole, AutomationStudioLlmProvider>>): (role: AutomationStudioLlmModelRole) => AutomationStudioLlmProvider {
  const top = ladder.tiers.length - 1;
  const climbed = ladder.tiers.slice(ladder.from.explore ?? 0).map((tier) => tier.model);
  return (role) => {
    const start = ladder.from[role];
    if (start === undefined) return byRole[role];
    const frame = automationStudioLlmModelLadderFrame();
    frame?.serve(climbed);
    return ladder.tiers[Math.min(start + (frame?.level ?? 0), top)]!.provider;
  };
}
