// An automation task resolves one starting model. Legacy judge/repair overrides stay readable
// but cannot switch any role away from that model. Generic engine defaults remain configurable.
import { AUTOMATION_STUDIO_LLM_DEFAULT_MODEL, AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED } from "../../models/catalog/index.ts";
import { automationStudioRunOverrides } from "../../run-overrides/index.ts";
import type { AutomationStudioLlmProvider } from "../harness/index.ts";
import type { AutomationStudioLlmProviderResolution, AutomationStudioLlmProviderResolverInput } from "../resolver-contract.ts";

type Resolved = AutomationStudioLlmProviderResolution | AutomationStudioLlmProvider | undefined;
type Resolver<Result extends Resolved> = (input: AutomationStudioLlmProviderResolverInput) => Result | Promise<Result>;

/** Resolve once, retaining the starting provider and all of its limits for every role and retry. */
export async function automationStudioLlmRoleRoutedResolution<Result extends Resolved>(resolver: Resolver<Result>, request: AutomationStudioLlmProviderResolverInput): Promise<Result | undefined> {
  const modelId = automationStudioRunOverrides()?.models?.explore ?? request.modelId
    ?? (AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_NAMED ? AUTOMATION_STUDIO_LLM_DEFAULT_MODEL
      : request.providerId === "deepseek" ? "deepseek-flash" : "claude-haiku-5-5");
  return await resolver({ ...request, modelId });
}
