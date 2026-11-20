import { AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED } from "../../models/catalog/index.ts";
import { automationStudioRunOverrides } from "../../run-overrides/index.ts";
import type { AutomationStudioLlmProvider } from "../harness/index.ts";
import { automationStudioLlmProviderWithTokenLimits } from "../harness/served-limits.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../resolver-contract.ts";
import type { AutomationStudioLlmModelRole } from "./kind-roles.ts";
import { AUTOMATION_STUDIO_LLM_MODEL_LADDER, automationStudioLlmModelLadderRung } from "./ladder/index.ts";
import { automationStudioLlmProviderRoutedByRole, type AutomationStudioLlmProviderLadder } from "./provider.ts";

type Resolved = AutomationStudioLlmProviderResolution | AutomationStudioLlmProvider | undefined;
type Resolver<Result extends Resolved> = (input: AutomationStudioLlmProviderResolverInput) => Result | Promise<Result>;

/**
 * The attempt's provider resolution, with the run's model per role
 * (`AutomationStudioRunOverrides["models"]`) and the model ladder (`./ladder/`, t962) routed
 * through one provider (`./provider.ts`).
 *
 * `request` is what the attempt asks the resolver for today, its `modelId` the
 * caller's or the Flow's. Each role's model is the run's own for it, else that
 * one: a role left out uses `options.model`, or the engine's default.
 *
 * **The ladder.** The explore model names the attempt's base rung: the run's own explore
 * model, the caller's or the Flow's, else the default `FLUXIQ_LLM_DEFAULT_MODEL` named (the Lab's
 * `--llm-model`). Where none of them named one and the engine's default is a Claude model, the
 * base is the cheapest rung, Haiku. Every rung from the lowest a role starts on to the top is
 * resolved here, as the attempt starts, by the same resolver and request, so a climb never waits
 * on a resolver mid-attempt. A rung above every role's start that the resolver answers nothing
 * for ends the ladder below it. An explore model off the ladder (another provider's) has none, and
 * with no role models either the resolver is asked exactly as before and its answer returned as
 * it came.
 *
 * A role whose model is the explore model's reuses its provider, so no model is
 * resolved twice. Every other role's model is resolved here, as the attempt
 * starts, by the same resolver and the same request: an unknown id throws the
 * resolver's own error, and a resolver that answers nothing for it answers
 * nothing here, so a role model that cannot be resolved fails the attempt
 * exactly as an unknown `options.model` does, before any call. Nothing falls
 * back to another model. The explore resolution's limits and timeout are the
 * attempt's. A role's own token limits -- its model's window -- go with its
 * provider (`../harness/served-limits.ts`), so each request is built to the
 * window of the model that serves it; its call, cost and run-token limits are
 * not read, since the attempt has one purse.
 */
export async function automationStudioLlmRoleRoutedResolution<Result extends Resolved>(resolver: Resolver<Result>, request: AutomationStudioLlmProviderResolverInput): Promise<Result | undefined> {
  const models = automationStudioRunOverrides()?.models;
  const named = models?.explore ?? request.modelId;
  const asked = (modelId: string | undefined): AutomationStudioLlmProviderResolverInput => {
    const rest: AutomationStudioLlmProviderResolverInput = { ...request };
    delete rest.modelId;
    return modelId === undefined ? rest : { ...rest, modelId };
  };
  const explore = await baseResolution(resolver, asked, named);
  if (!explore || !("provider" in explore)) return explore;
  const base = automationStudioLlmModelLadderRung(explore.provider.metadata.model);
  const roleIds = { judge: models?.judge ?? request.modelId, repair: models?.repair ?? request.modelId };
  if (base === undefined && (!models || (models.explore === undefined && models.judge === undefined && models.repair === undefined))) return explore;
  // One provider per model id, however many roles name it.
  const byModel = new Map<string | undefined, AutomationStudioLlmProvider | undefined>([[named, explore.provider], [explore.provider.metadata.model, explore.provider]]);
  const providerOf = async (modelId: string | undefined): Promise<AutomationStudioLlmProvider | undefined> => {
    if (byModel.has(modelId)) return byModel.get(modelId);
    const resolved = await resolver(asked(modelId));
    const provider = resolved && "provider" in resolved ? withOwnLimits(resolved) : undefined;
    byModel.set(modelId, provider);
    return provider;
  };
  const judge = await providerOf(roleIds.judge);
  const repair = await providerOf(roleIds.repair);
  if (!judge || !repair) return undefined;
  if (base === undefined) return { ...explore, provider: automationStudioLlmProviderRoutedByRole({ explore: explore.provider, judge, repair }) };
  const ladder = await ladderOf({ explore: explore.provider, judge, repair }, providerOf);
  if (!ladder) return undefined;
  return { ...explore, provider: automationStudioLlmProviderRoutedByRole({ explore: explore.provider, judge, repair, ladder }) };
}

/**
 * The explore resolution: the named model's, else the engine's default; and where nothing named a
 * model and that default is a Claude model above the cheapest rung, the cheapest rung's.
 */
async function baseResolution<Result extends Resolved>(resolver: Resolver<Result>, asked: (modelId: string | undefined) => AutomationStudioLlmProviderResolverInput, named: string | undefined): Promise<Result> {
  const resolved = await resolver(asked(named));
  if (named !== undefined || AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED || !resolved || !("provider" in resolved)) return resolved;
  const rung = automationStudioLlmModelLadderRung(resolved.provider.metadata.model);
  return rung === undefined || rung === 0 ? resolved : await resolver(asked(AUTOMATION_STUDIO_LLM_MODEL_LADDER[0]));
}

/**
 * The rungs from the lowest a role starts on to the top, each resolved once, and each role's start.
 * A role off the ladder has none and is served by its own provider. A rung below a role's start
 * that cannot be resolved fails the attempt, as a role model does; one above every start ends the
 * ladder there.
 */
async function ladderOf(roles: Readonly<Record<AutomationStudioLlmModelRole, AutomationStudioLlmProvider>>, providerOf: (modelId: string) => Promise<AutomationStudioLlmProvider | undefined>): Promise<AutomationStudioLlmProviderLadder | undefined> {
  const starts = Object.fromEntries((Object.keys(roles) as AutomationStudioLlmModelRole[]).map((role) => [role, automationStudioLlmModelLadderRung(roles[role].metadata.model)])) as Record<AutomationStudioLlmModelRole, number | undefined>;
  const onLadder = Object.values(starts).filter((rung): rung is number => rung !== undefined);
  const lowest = Math.min(...onLadder);
  const highest = Math.max(...onLadder);
  const tiers: { model: string; provider: AutomationStudioLlmProvider }[] = [];
  for (let rung = lowest; rung < AUTOMATION_STUDIO_LLM_MODEL_LADDER.length; rung += 1) {
    const model = AUTOMATION_STUDIO_LLM_MODEL_LADDER[rung]!;
    const provider = (Object.values(roles).find((each) => each.metadata.model === model)) ?? await providerOf(model);
    if (!provider) {
      if (rung <= highest) return undefined;
      break;
    }
    tiers.push({ model, provider });
  }
  const from = (role: AutomationStudioLlmModelRole): number | undefined => (starts[role] === undefined ? undefined : starts[role]! - lowest);
  return { tiers, from: { explore: from("explore"), judge: from("judge"), repair: from("repair") } };
}

/** A role's provider, saying its model's token limits where its resolution gave them. */
function withOwnLimits(resolved: AutomationStudioLlmProviderResolution): AutomationStudioLlmProvider {
  return resolved.tokenLimits ? automationStudioLlmProviderWithTokenLimits(resolved.provider, resolved.tokenLimits) : resolved.provider;
}
