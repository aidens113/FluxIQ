import { automationStudioRunOverrides } from "../../run-overrides/index.ts";
import type { AutomationStudioLlmProvider } from "../harness/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../resolver-contract.ts";
import { automationStudioLlmProviderRoutedByRole } from "./provider.ts";

type Resolved = AutomationStudioLlmProviderResolution | AutomationStudioLlmProvider | undefined;

/**
 * The attempt's provider resolution, with the run's model per role
 * (`AutomationStudioRunOverrides["models"]`) routed through one provider
 * (`./provider.ts`).
 *
 * `request` is what the attempt asks the resolver for today, its `modelId` the
 * caller's or the Flow's. Each role's model is the run's own for it, else that
 * one: a role left out uses `options.model`, or the engine's default. With no
 * run frame or no `models`, the resolver is asked exactly as before and its
 * answer returned as it came.
 *
 * A role whose model is the explore model's reuses its provider, so no model is
 * resolved twice. Every other role's model is resolved here, as the attempt
 * starts, by the same resolver and the same request: an unknown id throws the
 * resolver's own error, and a resolver that answers nothing for it answers
 * nothing here, so a role model that cannot be resolved fails the attempt
 * exactly as an unknown `options.model` does, before any call. Nothing falls
 * back to another model. The explore resolution's limits and timeout are the
 * attempt's; a role's own are not read, since the attempt has one purse.
 */
export async function automationStudioLlmRoleRoutedResolution<Result extends Resolved>(
  resolver: (input: AutomationStudioLlmProviderResolverInput) => Result | Promise<Result>,
  request: AutomationStudioLlmProviderResolverInput
): Promise<Result | undefined> {
  const models = automationStudioRunOverrides()?.models;
  if (!models || (models.explore === undefined && models.judge === undefined && models.repair === undefined)) return await resolver(request);
  const exploreId = models.explore ?? request.modelId;
  const asked = (modelId: string | undefined): AutomationStudioLlmProviderResolverInput => {
    const rest: AutomationStudioLlmProviderResolverInput = { ...request };
    delete rest.modelId;
    return modelId === undefined ? rest : { ...rest, modelId };
  };
  const explore = await resolver(asked(exploreId));
  if (!explore || !("provider" in explore)) return explore;
  // One provider per model id, however many roles name it.
  const byModel = new Map<string | undefined, AutomationStudioLlmProvider | undefined>([[exploreId, explore.provider]]);
  const roleProvider = async (modelId: string | undefined): Promise<AutomationStudioLlmProvider | undefined> => {
    if (byModel.has(modelId)) return byModel.get(modelId);
    const resolved = await resolver(asked(modelId));
    const provider = resolved && "provider" in resolved ? resolved.provider : undefined;
    byModel.set(modelId, provider);
    return provider;
  };
  const judge = await roleProvider(models.judge ?? request.modelId);
  const repair = await roleProvider(models.repair ?? request.modelId);
  if (!judge || !repair) return undefined;
  return { ...explore, provider: automationStudioLlmProviderRoutedByRole({ explore: explore.provider, judge, repair }) };
}
