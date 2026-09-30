import type { AutomationStudioReusableLlmContextList, AutomationStudioReusableLlmContextTag, AutomationStudioReusableLlmContextWrite } from "../../storage/index.ts";

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
