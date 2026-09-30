// The contract between Automation Studio and the host's LLM provider
// resolver: what a run asks the resolver for, and the provider and default
// limits it gets back. Nothing here authorizes spending: the resolver hands
// back a provider on the caller's own key, and the run's budget bounds it.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTokenLimits } from "./harness.ts";
import type { AutomationStudioLlmModelCaller } from "./model-caller.ts";

export type AutomationStudioLlmProviderResolution = {
  provider: AutomationStudioLlmProvider;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  maxCallsPerRun?: number;
  /** The whole run's token budget, when the resolver sets one. It caps the run however many calls it may make. */
  maxTotalTokensPerRun?: number;
  maxEstimatedCostUsd?: number;
  maxTotalEstimatedCostUsd?: number;
  timeoutMs?: number;
};

export type AutomationStudioLlmProviderResolverInput = {
  projectId: string;
  flowId: string;
  providerId?: string;
  modelId?: string;
  metadata?: JsonObject;
  /** The person the call is made for, whose unlocked key pays. Absent for a run nobody is watching. */
  caller?: AutomationStudioLlmModelCaller;
};
