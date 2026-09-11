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

export type AutomationStudioLlmExecutionPurpose = "diagnosis_only" | "diagnose_and_adapt" | "build_and_adapt";

export type AutomationStudioLlmExecutionLimitRequest = {
  tokenLimits?: { maxInputTokens?: number; maxOutputTokens?: number; maxTotalTokens?: number };
  maxCalls?: number;
  maxEstimatedCostUsd?: number;
  maxTotalEstimatedCostUsd?: number;
  timeoutMs?: number;
  providerRetryCount?: number;
};

export type AutomationStudioLlmExecutionPreflightRequest = FlowIdProjectRequest & AutomationStudioLlmExecutionLimitRequest & {
  purpose?: AutomationStudioLlmExecutionPurpose;
  keyId: string;
  provider?: string;
  model?: string;
};

export type AutomationStudioLlmExecutionGrantRequest = AutomationStudioLlmExecutionPreflightRequest & {
  authSessionId: string;
  highTokenConfirmation?: boolean;
  ttlMs?: number;
  maxUses?: number;
};
