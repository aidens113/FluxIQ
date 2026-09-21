import type { AutomationStudioActionConsequence } from "../../runtime/index.ts";
import type { AutomationStudioReusableLlmContextList, AutomationStudioReusableLlmContextTag, AutomationStudioReusableLlmContextWrite } from "../../storage/index.ts";
import type { FlowIdProjectRequest } from "./flow.ts";

export type AutomationStudioListReusableLlmContextsRequest = { projectId: string } & AutomationStudioReusableLlmContextList;

export type AutomationStudioGetReusableLlmContextRequest = { projectId: string; recordId: string; now?: number; touch?: boolean };

export type AutomationStudioPutReusableLlmContextRequest = { projectId: string; record: AutomationStudioReusableLlmContextWrite };

export type AutomationStudioDeleteReusableLlmContextRequest = { projectId: string; recordId: string; changedAt?: number };

export type AutomationStudioClearReusableLlmContextScopeRequest = { projectId: string; flowId: string; subflowId?: string | null; domainId?: string; changedAt?: number };

export type AutomationStudioPurgeExpiredReusableLlmContextsRequest = { projectId: string; domainId?: string; now?: number; limit?: number };

export type AutomationStudioPackReusableLlmContextsRequest = {
  projectId: string; flowId: string; subflowId?: string | null; domainId: string; evidenceKind: string;
  evidenceSchemaVersion: string; sanitizerVersion: string; compatibilityTags?: AutomationStudioReusableLlmContextTag[];
  maxInputTokens: number; now?: number;
};

/**
 * What an LLM execution grant authorizes. A purpose says what may be asked
 * for, and only the two that do not iterate say how many times:
 * `diagnosis_only` is one call, and `verify_result` at most two, because a
 * first answer other than that the result answers the request is asked once
 * more with the same evidence. Every other purpose iterates under a call limit that
 * is configuration on the grant. `verify_result` asks only whether a finished
 * run's result answers the request, and leaves the run itself deterministic.
 * Absent means `diagnosis_only`.
 */
export type AutomationStudioLlmExecutionPurpose = "diagnosis_only" | "diagnose_and_adapt" | "explore_and_adapt" | "build_and_adapt" | "verify_result";

/** The purposes `run-runtime-session` accepts as its `runIntent`, together
 * with an `llmExecutionGrantId` of that purpose. Creating a Flow from nothing,
 * `build_and_adapt`, is a different entry point. */
export type AutomationStudioRuntimeSessionLlmIntent = Exclude<AutomationStudioLlmExecutionPurpose, "build_and_adapt">;

export type AutomationStudioLlmExecutionLimitRequest = {
  /** Per call. An absent field takes Core's default: 8,000 input, 2,000
   * output and 10,000 total tokens. */
  tokenLimits?: { maxInputTokens?: number; maxOutputTokens?: number; maxTotalTokens?: number };
  /** Provider calls the grant authorizes, from 1 to 64. Absent means 26 for
   * an iterating purpose; `diagnosis_only` accepts only 1, and
   * `verify_result` 1 or 2, taking 2 when absent. */
  maxCalls?: number;
  /** The whole run's token budget. Absent means the per-call total limit
   * times `maxCalls`, held to 100,000. A value must lie between one call's
   * total limit and every call's together. */
  maxTotalTokensPerRun?: number;
  maxEstimatedCostUsd?: number;
  maxTotalEstimatedCostUsd?: number;
  timeoutMs?: number;
  providerRetryCount?: number;
  /**
   * The lasting consequences the run's actions may have: `move_money`,
   * `delete`, `send_or_publish`, `modify_existing`, `create_new`. Absent is
   * none. A class Core does not recognise refuses the request rather than
   * being dropped. This is how a person's answer to a permission request
   * reaches the next run: grant what the request listed as `missing`.
   */
  permittedConsequences?: AutomationStudioActionConsequence[];
};

export type AutomationStudioLlmExecutionPreflightRequest = FlowIdProjectRequest & AutomationStudioLlmExecutionLimitRequest & {
  purpose?: AutomationStudioLlmExecutionPurpose;
  keyId: string;
  provider?: string;
  model?: string;
};

export type AutomationStudioLlmExecutionGrantRequest = AutomationStudioLlmExecutionPreflightRequest & {
  authSessionId: string;
  /** Required when the run's token budget, or one call's total limit, is
   * above 100,000 tokens. The call count alone never requires it. */
  highTokenConfirmation?: boolean;
  /** The claim window in milliseconds, from 1,000 to 300,000 (default
   * 60,000): how long the grant may wait to be claimed by a run. A claimed
   * grant runs under its own 600-second lease instead. */
  ttlMs?: number;
  /** When given, must equal the grant's call limit. */
  maxUses?: number;
};

/** The limits Core resolved for a grant request. `preflight-llm-execution`
 * returns it as `preflight`; it carries no secret. */
export type AutomationStudioLlmExecutionPreflight = {
  keyId: string;
  provider: "deepseek";
  model: "deepseek-chat";
  projectId: string;
  flowId: string;
  executionDigest: string;
  purpose: AutomationStudioLlmExecutionPurpose;
  keyUpdatedAtMs: number;
  settingsRevision?: number;
  tokenLimits: { maxInputTokens: number; maxOutputTokens: number; maxTotalTokens: number };
  maxCalls: number;
  /** The whole run's token budget. The high-token confirmation is judged on
   * this, not on the call count. */
  maxTotalTokensPerRun: number;
  maxEstimatedCostUsd: number;
  maxTotalEstimatedCostUsd: number;
  timeoutMs: number;
  providerRetryCount: 0;
  /** What the run's actions are permitted to do, in Core's order. Empty permits nothing lasting. */
  permittedConsequences: AutomationStudioActionConsequence[];
};

export type AutomationStudioLlmExecutionPreflightResponse = { preflight: AutomationStudioLlmExecutionPreflight };

/** An issued grant. `issue-llm-execution-grant` returns it as `grant`; the
 * grant ID is an opaque handle and the record carries no secret. */
export type AutomationStudioLlmExecutionGrant = AutomationStudioLlmExecutionPreflight & {
  grantId: string;
  /** The end of the claim window, not the grant's lifetime: once a run
   * claims it, the grant lives until its 600-second lease ends or it is
   * revoked, whichever comes first. */
  expiresAtMs: number;
  remainingUses: number;
};

export type AutomationStudioLlmExecutionGrantResponse = { grant: AutomationStudioLlmExecutionGrant };
