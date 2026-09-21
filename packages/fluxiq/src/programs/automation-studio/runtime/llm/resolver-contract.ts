// The contract between Automation Studio and the host's LLM provider
// resolver: what a run asks the resolver for, the provider and limits it gets
// back, and the build grant a Flow Bootstrap request carries.
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../action-permissions/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTokenLimits } from "./harness.ts";
import type { AutomationStudioRuntimeSessionGrant } from "./runtime-session-grant.ts";

export type AutomationStudioLlmProviderResolution = {
  provider: AutomationStudioLlmProvider;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  maxCallsPerRun?: number;
  /** The whole run's token budget, when the resolver was issued for one. It caps the run however many calls it may make. */
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
  executionGrant?: AutomationStudioRuntimeSessionGrant | AutomationStudioBuildAndAdaptExecutionGrant;
};

export type AutomationStudioBuildAndAdaptExecutionGrant = {
  grantId: string;
  actorUserId: string;
  actorSessionId: string;
  purpose: "build_and_adapt";
  executionDigest: string;
  settingsRevision: number;
  /** The lasting consequences the person allowed this build's actions. Absent permits none. */
  permittedConsequences?: AutomationStudioActionConsequence[];
};
