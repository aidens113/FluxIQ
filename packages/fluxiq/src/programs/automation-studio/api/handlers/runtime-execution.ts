// Starting and running a runtime session, and the state, signal and recording
// domain surfaces it reads and writes.

import { AUTOMATION_STUDIO_ENDPOINTS, type AppendRecordingDomainEventRequest, type InspectStateDiffRequest, type ValidateRecordingDomainEventRequest } from "../contracts.ts";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerRuntimeExecutionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, llmExecutionGrants } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startRuntimeSession,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; flow?: AutomationStudioFlowDocument; flowId?: string; targetKind?: any; targetId?: string; inputs?: any; authorizedDomainIds?: string[] } : {};
      return { ok: true, payload: { runtimeSession: await service.startRuntimeSession(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; runId?: string; flow?: AutomationStudioFlowDocument; flowId?: string; inputs?: any; maxSteps?: number; authorizedDomainIds?: string[]; adaptiveMode?: "fully_adaptive" | "manual_approval" | "no_llm_intervention" | "default" | "deterministic"; dryRunLlm?: boolean; authorizedExternalSideEffects?: boolean; subflowId?: string; idempotencyKey?: string; llmExecutionGrantId?: string; runIntent?: string; useReusableContext?: true } : {};
      if ((payload as Record<string, unknown>).useReusableContext !== undefined && payload.useReusableContext !== true) return { ok: false, error: "Runtime reusable-context flag is invalid." };
      const runIntent: "diagnosis_only" | "diagnose_and_adapt" | undefined = payload.runIntent === "diagnosis_only"
        ? "diagnosis_only"
        : payload.runIntent === "diagnose_and_adapt" ? "diagnose_and_adapt" : undefined;
      const llmExecution = runIntent && payload.llmExecutionGrantId && request.actor ? { grantId: payload.llmExecutionGrantId, actorUserId: request.actor.userId, actorSessionId: request.actor.sessionId, purpose: runIntent } : undefined;
      if ((payload.runIntent || payload.llmExecutionGrantId) && !llmExecution) return { ok: false, error: "A supported explicit LLM intent and grant are required together." };
      if (llmExecution && payload.runId !== undefined) {
        llmExecutionGrants?.revoke(llmExecution.grantId);
        return { ok: false, error: "An explicit LLM run must create a fresh runtime session." };
      }
      const runtimeSession = await service.runRuntimeSession({ ...payload, ...(llmExecution ? { llmExecution } : {}) });
      const projectId = typeof payload.projectId === "string" ? payload.projectId : null;
      const runDetail = projectId ? await service.getFlowRunDetail(projectId, runtimeSession.runId).catch(() => null) : null;
      const durableBehaviorChanged = Boolean(runDetail?.adaptationIds?.length && runDetail.adaptationIds.some((adaptationId) => {
        const attempt = runDetail.metadata?.runtimePatchAttempts;
        return Array.isArray(attempt) && attempt.some((item) => typeof item === "object" && item && (item as any).adaptationId === adaptationId && (item as any).approvalDecision?.autoApply === true);
      }));
      return {
        ok: true,
        payload: {
          runtimeSession,
          runSummary: runDetail?.summary,
          runDetailLink: { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, runId: runtimeSession.runId },
          createdAdaptationIds: runDetail?.adaptationIds ?? [],
          interventionCount: runDetail?.summary.interventionCount ?? 0,
          terminalReason: runtimeSession.trace?.message ?? runtimeSession.status,
          durableBehaviorChanged
        }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.inspectStateDiff,
    permission: "programs.read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as InspectStateDiffRequest;
      return { ok: true, payload: await service.inspectStateDiff(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listSignalRegistries,
    permission: "programs.read",
    handler: async () => ({
      ok: true,
      payload: { signalRegistries: await service.listSignalRegistries() }
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecordingDomains,
    permission: "programs.read",
    handler: async () => ({
      ok: true,
      payload: { domains: service.listRecordingDomains() }
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.validateRecordingDomainEvent,
    permission: "programs.read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ValidateRecordingDomainEventRequest;
      return { ok: true, payload: service.validateRecordingDomainEvent(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingDomainEvent,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingDomainEventRequest;
      const result = await service.appendRecordingDomainEvent(payload);
      return result.accepted
        ? { ok: true, payload: result }
        : { ok: false, error: result.issues.map((issue) => issue.message).join(" ") || "Recording event was rejected.", payload: result };
    }
  });
}
