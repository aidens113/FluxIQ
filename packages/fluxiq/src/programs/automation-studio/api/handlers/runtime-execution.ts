// Starting and running a runtime session, and the state, signal and recording
// domain surfaces it reads and writes.

import { AUTOMATION_STUDIO_ENDPOINTS, type AppendRecordingDomainEventRequest, type InspectStateDiffRequest, type ValidateRecordingDomainEventRequest } from "../contracts.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../model/index.ts";
import { AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES, automationStudioRunChangedDurableBehavior } from "../../runtime/index.ts";
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
  // Stopping a run. Declared and implemented for as long as runs have been
  // cancellable, but never registered, so every Stop -- the web panel's run
  // controls, its conversation's "stop that run", and the extension's -- was
  // answered 404. `authoring` under `runtime.control`, the same as starting one:
  // stopping removes nothing and acts nowhere outside, so it must never wait
  // behind a PIN. A run that is already over comes back as it ended, and one
  // that does not exist comes back as null, the way `get-runtime-session`
  // answers, so pressing Stop twice is never an error.
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.cancelRuntimeSession,
    permission: "runtime.control",
    classification: "authoring",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; runId?: unknown; reason?: unknown } : {};
      const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
      const runId = typeof payload.runId === "string" ? payload.runId.trim() : "";
      if (!projectId || !runId) return { ok: false, error: "Stopping a run needs its project and run IDs." };
      const reason = typeof payload.reason === "string" && payload.reason.trim() ? payload.reason.trim().slice(0, 500) : undefined;
      return { ok: true, payload: { runtimeSession: await service.cancelRuntimeSession(projectId, runId, reason) } };
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
      // A granted run may name the run it is continuing (t166). It used to be
      // refused, with the grant revoked, so the caller could not even retry: a
      // repair that must resume the run that failed had no way to say which run
      // that was, and re-running is not an act anybody needs permission for.
      // `newRunId` is a different field: it names the session the run is about
      // to create, so the caller can read the run back if its own request is cut
      // short (`runtime/service/runtime-session/requested-run-id.ts`).
      // The run starts now, so the grant is held for it: its claim window runs
      // to the run's own lease rather than the issue TTL, because its recovery
      // claims the grant only once a step fails, which may be minutes from now.
      // A grant that cannot be held -- lapsed, spent, another run's, or out of
      // scope -- refuses the run here rather than letting it fail without one.
      if (llmExecution && llmExecutionGrants && typeof payload.projectId === "string" && typeof payload.flowId === "string") {
        try {
          await llmExecutionGrants.holdForRun({ ...llmExecution, projectId: payload.projectId, flowId: payload.flowId });
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "LLM execution grant is unavailable." };
        }
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
      // The same reading every stored run summary carries, so this answer and `list-flow-runs` agree.
      const durableBehaviorChanged = runDetail ? automationStudioRunChangedDurableBehavior(runDetail) : false;
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
