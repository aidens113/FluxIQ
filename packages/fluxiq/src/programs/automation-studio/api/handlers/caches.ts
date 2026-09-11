// The two per-project cache stores: saved editor UI state and the reusable
// LLM context pool, each with its own read, write, purge and stats surface.

import { AUTOMATION_STUDIO_ENDPOINTS, type AutomationStudioClearReusableLlmContextScopeRequest, type AutomationStudioDeleteProjectUiCacheRequest, type AutomationStudioDeleteReusableLlmContextRequest, type AutomationStudioGetProjectUiCacheRequest, type AutomationStudioGetReusableLlmContextRequest, type AutomationStudioListProjectUiCacheStatsRequest, type AutomationStudioListReusableLlmContextsRequest, type AutomationStudioPackReusableLlmContextsRequest, type AutomationStudioPurgeExpiredReusableLlmContextsRequest, type AutomationStudioPutReusableLlmContextRequest, type AutomationStudioSaveProjectUiCacheRequest } from "../contracts.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerCacheEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectUiCache,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioGetProjectUiCacheRequest> : {};
      return { ok: true, payload: await service.getProjectUiCache({ projectId: String(payload.projectId ?? ""), userId: request.actor?.userId ?? "", cacheKeys: payload.cacheKeys }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectUiCache,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioSaveProjectUiCacheRequest> : {};
      return { ok: true, payload: await service.saveProjectUiCache({ projectId: String(payload.projectId ?? ""), userId: request.actor?.userId ?? "", entries: payload.entries }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectUiCache,
    permission: "programs.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioDeleteProjectUiCacheRequest> : {};
      return { ok: true, payload: await service.deleteProjectUiCache({ projectId: String(payload.projectId ?? ""), userId: request.actor?.userId ?? "", cacheKeys: payload.cacheKeys }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectUiCacheStats,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<AutomationStudioListProjectUiCacheStatsRequest> : {};
      return { ok: true, payload: await service.listProjectUiCacheStats({ projectId: payload.projectId, userId: request.actor?.userId ?? "" }) };
    }
  });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getReusableLlmContextStatus, permission: "programs.read", handler: async () => ({ ok: true, payload: service.reusableLlmContextStatus() }) });
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listReusableLlmContexts, permission: "programs.read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<AutomationStudioListReusableLlmContextsRequest>;
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const domainId = reusableContextDomainForScope(request.scope.domainId, payload.domainId);
      return { ok: true, payload: { contexts: await service.listReusableLlmContexts({ projectId, ...(typeof payload.flowId === "string" ? { flowId: payload.flowId } : {}), ...(payload.subflowId === null || typeof payload.subflowId === "string" ? { subflowId: payload.subflowId } : {}), ...(domainId ? { domainId } : {}), ...(typeof payload.evidenceKind === "string" ? { evidenceKind: payload.evidenceKind } : {}), ...(typeof payload.evidenceSchemaVersion === "string" ? { evidenceSchemaVersion: payload.evidenceSchemaVersion } : {}), ...(typeof payload.sanitizerVersion === "string" ? { sanitizerVersion: payload.sanitizerVersion } : {}), ...(Array.isArray(payload.compatibilityTags) ? { compatibilityTags: payload.compatibilityTags } : {}), ...(typeof payload.now === "number" ? { now: payload.now } : {}), ...(typeof payload.limit === "number" ? { limit: payload.limit } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getReusableLlmContext, permission: "programs.read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<AutomationStudioGetReusableLlmContextRequest>;
      const projectId = String(payload.projectId ?? ""); await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const context = await service.getReusableLlmContext({ projectId, recordId: String(payload.recordId ?? ""), ...(typeof payload.now === "number" ? { now: payload.now } : {}), ...(typeof payload.touch === "boolean" ? { touch: payload.touch } : {}) });
      if (request.scope.domainId !== undefined && context && context.domainId !== request.scope.domainId) throw new Error("Reusable LLM context domain does not match the authorized scope.");
      return { ok: true, payload: { context } };
    }
  });
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.putReusableLlmContext, permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<AutomationStudioPutReusableLlmContextRequest>;
      const projectId = String(payload.projectId ?? ""); await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      reusableContextDomainForScope(request.scope.domainId, payload.record?.domainId);
      return { ok: true, payload: { context: await service.putReusableLlmContext({ projectId, record: payload.record as AutomationStudioPutReusableLlmContextRequest["record"], actorId: request.actor!.userId }) } };
    }
  });
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteReusableLlmContext, permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<AutomationStudioDeleteReusableLlmContextRequest>;
      const projectId = String(payload.projectId ?? ""); await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const existing = await service.getReusableLlmContext({ projectId, recordId: String(payload.recordId ?? ""), now: 0 });
      if (request.scope.domainId !== undefined && existing && existing.domainId !== request.scope.domainId) throw new Error("Reusable LLM context domain does not match the authorized scope.");
      return { ok: true, payload: { deleted: await service.deleteReusableLlmContext({ projectId, recordId: String(payload.recordId ?? ""), actorId: request.actor!.userId, ...(typeof payload.changedAt === "number" ? { changedAt: payload.changedAt } : {}) }) } };
    }
  });
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.clearReusableLlmContextScope, permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<AutomationStudioClearReusableLlmContextScopeRequest>;
      const projectId = String(payload.projectId ?? ""); await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const domainId = reusableContextDomainForScope(request.scope.domainId, payload.domainId);
      return { ok: true, payload: await service.clearReusableLlmContextScope({ projectId, flowId: String(payload.flowId ?? ""), ...(payload.subflowId === null || typeof payload.subflowId === "string" ? { subflowId: payload.subflowId } : {}), ...(domainId ? { domainId } : {}), actorId: request.actor!.userId, ...(typeof payload.changedAt === "number" ? { changedAt: payload.changedAt } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.purgeExpiredReusableLlmContexts, permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<AutomationStudioPurgeExpiredReusableLlmContextsRequest>;
      const projectId = String(payload.projectId ?? ""); await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const domainId = reusableContextDomainForScope(request.scope.domainId, payload.domainId);
      return { ok: true, payload: await service.purgeExpiredReusableLlmContexts({ projectId, ...(domainId ? { domainId } : {}), actorId: request.actor!.userId, ...(typeof payload.now === "number" ? { now: payload.now } : {}), ...(typeof payload.limit === "number" ? { limit: payload.limit } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.packReusableLlmContexts, permission: "programs.read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<AutomationStudioPackReusableLlmContextsRequest>;
      const projectId = String(payload.projectId ?? ""); await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      if (request.scope.domainId !== undefined && payload.domainId !== request.scope.domainId) throw new Error("Reusable LLM context domain does not match the authorized scope.");
      return { ok: true, payload: await service.packReusableLlmContexts({ projectId, flowId: String(payload.flowId ?? ""), ...(payload.subflowId === null || typeof payload.subflowId === "string" ? { subflowId: payload.subflowId } : {}), domainId: String(payload.domainId ?? ""), evidenceKind: String(payload.evidenceKind ?? ""), evidenceSchemaVersion: String(payload.evidenceSchemaVersion ?? ""), sanitizerVersion: String(payload.sanitizerVersion ?? ""), ...(Array.isArray(payload.compatibilityTags) ? { compatibilityTags: payload.compatibilityTags } : {}), maxInputTokens: Number(payload.maxInputTokens), actorId: request.actor!.userId, ...(typeof payload.now === "number" ? { now: payload.now } : {}) }) };
    }
  });
}

function reusableContextDomainForScope(scopeDomainId: string | null | undefined, requestedDomainId: unknown): string | undefined {
  const requested = typeof requestedDomainId === "string" && requestedDomainId.trim() ? requestedDomainId.trim() : undefined;
  if (scopeDomainId !== undefined && scopeDomainId !== null) {
    if (requested !== undefined && requested !== scopeDomainId) throw new Error("Reusable LLM context domain does not match the authorized scope.");
    return scopeDomainId;
  }
  return requested;
}
