// What a caller is shown of an execution grant: its limits, its scope and its
// lifetimes, never the reveal authorizations or the actor behind it. Moved out
// of `execution-grants.ts`, which keeps the grant's lifecycle, so the public
// face and the projection that produces it sit together.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioDeepSeekModel } from "../deepseek/index.ts";
import type { AutomationStudioLlmExecutionGrantPurpose } from "../grant-capabilities.ts";
import type { AutomationStudioLlmTokenLimits } from "../harness.ts";

export type AutomationStudioLlmExecutionGrantMetadata = {
  grantId: string;
  keyId: string;
  provider: "deepseek";
  /** The DeepSeek model the grant authorizes calls to: what the caller asked
   * for, the key's own recorded model, or Core's configured default. */
  model: AutomationStudioDeepSeekModel;
  projectId: string;
  flowId: string;
  executionDigest: string;
  purpose: AutomationStudioLlmExecutionGrantPurpose;
  keyUpdatedAtMs: number;
  settingsRevision?: number;
  tokenLimits: AutomationStudioLlmTokenLimits;
  maxCalls: number;
  /** The whole run's token budget: what issuing the grant confirmed. Every
   * call is charged what it reported using, and a call whose worst case would
   * cross this is refused. */
  maxTotalTokensPerRun: number;
  maxEstimatedCostUsd: number;
  maxTotalEstimatedCostUsd: number;
  timeoutMs: number;
  providerRetryCount: 0;
  /** The end of the window in which the grant may be claimed: its issue TTL,
   * or, once the run it was issued for has started and holds it, that run's
   * own deadline. A claimed grant runs on its own lease,
   * `AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS`. */
  expiresAtMs: number;
  remainingUses: number;
  /** The lasting consequences a person allowed the run's actions to have. Empty permits none. */
  permittedConsequences: AutomationStudioActionConsequence[];
};

/** The grant as a caller may see it: every public field by name, and copies of anything mutable. */
export function automationStudioLlmExecutionGrantMetadata(grant: AutomationStudioLlmExecutionGrantMetadata): AutomationStudioLlmExecutionGrantMetadata {
  return {
    grantId: grant.grantId,
    keyId: grant.keyId,
    provider: grant.provider,
    model: grant.model,
    projectId: grant.projectId,
    flowId: grant.flowId,
    executionDigest: grant.executionDigest,
    purpose: grant.purpose,
    keyUpdatedAtMs: grant.keyUpdatedAtMs,
    ...(grant.settingsRevision !== undefined ? { settingsRevision: grant.settingsRevision } : {}),
    tokenLimits: grant.tokenLimits,
    maxCalls: grant.maxCalls,
    maxTotalTokensPerRun: grant.maxTotalTokensPerRun,
    maxEstimatedCostUsd: grant.maxEstimatedCostUsd,
    maxTotalEstimatedCostUsd: grant.maxTotalEstimatedCostUsd,
    timeoutMs: grant.timeoutMs,
    providerRetryCount: 0,
    expiresAtMs: grant.expiresAtMs,
    remainingUses: grant.remainingUses,
    permittedConsequences: [...grant.permittedConsequences]
  };
}
