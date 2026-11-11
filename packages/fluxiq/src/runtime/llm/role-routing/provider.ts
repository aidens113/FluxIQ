import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import type { AutomationStudioLlmModelRole } from "./kind-roles.ts";
import { automationStudioLlmModelRoleOf } from "./request-role.ts";

/**
 * One provider over a model per role: each request goes to its role's model
 * (`./request-role.ts`), and `servedBy` names that model to whoever measures, prices
 * or records the call (`../harness/run.ts`), so a call is held and charged at
 * the price of the model that served it, under the attempt's one purse.
 *
 * A role with no provider of its own, or the explore model's own, is served by
 * the explore model; where every role is, this is the explore provider itself,
 * unchanged, so a run that names no other model sends exactly what it sent.
 *
 * `metadata` is the explore model's: the attempt's own model, which its
 * accounting names. `estimateCostUsd` takes no request, so it can only price at
 * the explore model; every caller that has the request asks `servedBy` first.
 * `measureInput` and `whenReady` take the request and go to the model that
 * serves it; a person's locked key is waited for by whichever model is called.
 */
export function automationStudioLlmProviderRoutedByRole(providers: { explore: AutomationStudioLlmProvider; judge?: AutomationStudioLlmProvider | undefined; repair?: AutomationStudioLlmProvider | undefined }): AutomationStudioLlmProvider {
  const { explore } = providers;
  const byRole: Readonly<Record<AutomationStudioLlmModelRole, AutomationStudioLlmProvider>> = { explore, judge: providers.judge ?? explore, repair: providers.repair ?? explore };
  if (byRole.judge === explore && byRole.repair === explore) return explore;
  const distinct = [...new Set(Object.values(byRole))];
  // A role's own provider may route again; what serves is where routing stops.
  const servedBy = (request: AutomationStudioLlmTaskRequest): AutomationStudioLlmProvider => {
    const provider = byRole[automationStudioLlmModelRoleOf(request)];
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
