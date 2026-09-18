// Starting and running a runtime session, and the state, signal and recording
// domain surfaces it reads and writes.

import { AUTOMATION_STUDIO_ENDPOINTS, type AppendRecordingDomainEventRequest, type InspectStateDiffRequest, type ValidateRecordingDomainEventRequest } from "../contracts.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../model/index.ts";
import { AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES } from "../../runtime/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerRuntimeExecutionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, llmExecutionGrants } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startRuntimeSession,
    permission: "runtime.control",
    classification: "authoring",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; flow?: AutomationStudioFlowDocument; flowId?: string; targetKind?: any; targetId?: string; inputs?: any; authorizedDomainIds?: string[] } : {};
      return { ok: true, payload: { runtimeSession: await service.startRuntimeSession(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
    permission: "runtime.control",
    classification: "authoring",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; runId?: string; newRunId?: string; flow?: AutomationStudioFlowDocument; flowId?: string; inputs?: any; maxSteps?: number; authorizedDomainIds?: string[]; adaptiveMode?: "fully_adaptive" | "manual_approval" | "no_llm_intervention" | "default" | "deterministic"; dryRunLlm?: boolean; authorizedExternalSideEffects?: boolean; subflowId?: string; idempotencyKey?: string; llmExecutionGrantId?: string; runIntent?: string; useReusableContext?: true } : {};
      if ((payload as Record<string, unknown>).useReusableContext !== undefined && payload.useReusableContext !== true) return { ok: false, error: "Runtime reusable-context flag is invalid." };
      // Every purpose a runtime session runs under, named in one place, so
      // `explore_and_adapt` is reachable from a failed run rather than being a
      // capability nothing could ask for.
      const runIntent = AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES.find((purpose) => purpose === payload.runIntent);
      const llmExecution = runIntent && payload.llmExecutionGrantId && request.actor ? { grantId: payload.llmExecutionGrantId, actorUserId: request.actor.userId, actorSessionId: request.actor.sessionId, purpose: runIntent } : undefined;
      if ((payload.runIntent || payload.llmExecutionGrantId) && !llmExecution) return { ok: false, error: "A supported explicit LLM intent and grant are required together." };
      // `newRunId` is not this: it names the session the run is about to create,
      // so the caller can read the run back if its own request is cut short
      // (`runtime/service/runtime-session/requested-run-id.ts`).
      if (llmExecution && payload.runId !== undefined) {
        llmExecutionGrants?.revoke(llmExecution.grantId);
        return { ok: false, error: "An explicit LLM run must create a fresh runtime session." };
      }
      const runtimeSession = await service.runRuntimeSession({ ...payload, ...(llmExecution ? { llmExecution } : {}) });
      const projectId = typeof payload.projectId === "string" ? payload.projectId : null;
      const runDetailLink = { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, runId: runtimeSession.runId };
      let runDetail: AutomationStudioFlowRunDetail | null = null;
      try {
        runDetail = projectId ? await service.getFlowRunDetail(projectId, runtimeSession.runId) : null;
      } catch (error) {
        // The run has ended, so its session and link still go back. An unread detail makes this a
        // failed answer, never one that reports no adaptations and no durable change.
        const reason = error instanceof Error ? error.message : String(error);
        return { ok: false, error: `Run ${runtimeSession.runId} ended ${runtimeSession.status}, but its run detail could not be read: ${reason}`, payload: { runtimeSession, runDetailLink } };
      }
      const durableBehaviorChanged = Boolean(runDetail?.adaptationIds?.length && runDetail.adaptationIds.some((adaptationId) => {
        const attempt = runDetail.metadata?.runtimePatchAttempts;
        return Array.isArray(attempt) && attempt.some((item) => typeof item === "object" && item && (item as any).adaptationId === adaptationId && (item as any).approvalDecision?.autoApply === true);
      }));
      return {
        ok: true,
        payload: {
          runtimeSession,
          runSummary: runDetail?.summary,
          runDetailLink,
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
    classification: "read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as InspectStateDiffRequest;
      return { ok: true, payload: await service.inspectStateDiff(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listSignalRegistries,
    permission: "programs.read",
    classification: "read",
    handler: async () => ({
      ok: true,
      payload: { signalRegistries: await service.listSignalRegistries() }
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecordingDomains,
    permission: "programs.read",
    classification: "read",
    handler: async () => ({
      ok: true,
      payload: { domains: service.listRecordingDomains() }
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.validateRecordingDomainEvent,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ValidateRecordingDomainEventRequest;
      return { ok: true, payload: service.validateRecordingDomainEvent(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingDomainEvent,
    permission: "runtime.control",
    classification: "authoring",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingDomainEventRequest;
      const result = await service.appendRecordingDomainEvent(payload);
      return result.accepted
        ? { ok: true, payload: result }
        : { ok: false, error: result.issues.map((issue) => issue.message).join(" ") || "Recording event was rejected.", payload: result };
    }
  });
}
