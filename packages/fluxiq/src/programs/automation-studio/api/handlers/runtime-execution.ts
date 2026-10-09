// Starting and running a runtime session, and the state, signal and recording
// domain surfaces it reads and writes.

import { AUTOMATION_STUDIO_ENDPOINTS, type AppendRecordingDomainEventRequest, type InspectStateDiffRequest, type ValidateRecordingDomainEventRequest } from "../contracts.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../model/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY, AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS, automationStudioRunChangedDurableBehavior, automationStudioWithWholeAttemptInputs, parseAutomationStudioPermittedConsequences, type AutomationStudioActionConsequence, type AutomationStudioRuntimeSessionLlm } from "../../runtime/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerRuntimeExecutionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startRuntimeSession,
    permission: "runtime.control",
    classification: "authoring",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; flow?: AutomationStudioFlowDocument; flowId?: string; targetKind?: any; targetId?: string; inputs?: any; authorizedDomainIds?: string[] } : {};
      return { ok: true, payload: { runtimeSession: automationStudioWithWholeAttemptInputs(await service.startRuntimeSession(payload)) } };
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
      return { ok: true, payload: { runtimeSession: automationStudioWithWholeAttemptInputs(await service.cancelRuntimeSession(projectId, runId, reason)) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
    permission: "runtime.control",
    classification: "authoring",
    handler: async (request) => {
      const raw = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: string | null; runId?: string; newRunId?: string; flow?: AutomationStudioFlowDocument; flowId?: string; inputs?: any; maxSteps?: number; authorizedDomainIds?: string[]; adaptiveMode?: "fully_adaptive" | "manual_approval" | "no_llm_intervention" | "default" | "deterministic"; dryRunLlm?: boolean; authorizedExternalSideEffects?: boolean; subflowId?: string; idempotencyKey?: string; runIntent?: unknown; permittedConsequences?: unknown; useReusableContext?: true; resultCheckCallerPays?: unknown } : {};
      if ((raw as Record<string, unknown>).useReusableContext !== undefined && raw.useReusableContext !== true) return { ok: false, error: "Runtime reusable-context flag is invalid." };
      const { runIntent: requestedIntent, permittedConsequences: requestedConsequences, resultCheckCallerPays: requestedCallerPays, ...payload } = raw;
      // A caller may ask to pay for fewer of its run's result checks, never more: the chat's "Run it" for a
      // paired client calls as the person's unlocked session, so it says itself what the paired rule below says.
      if (requestedCallerPays !== undefined && requestedCallerPays !== "repair_checks") return { ok: false, error: "A run can only ask to pay for the result checks that judge a repair." };
      // Every intent a runtime session runs under, named in one place, so
      // `explore_and_adapt` is reachable from a failed run rather than being a
      // capability nothing could ask for. The intent says what the run is for;
      // the signed-in actor is whose unlocked key pays for its model calls.
      let llmExecution: AutomationStudioRuntimeSessionLlm | undefined;
      let pairedCaller = false;
      if (requestedIntent !== undefined) {
        const intent = AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS.find((candidate) => candidate === requestedIntent);
        if (!intent) return { ok: false, error: "The run intent is not one Core supports." };
        if (!request.actor) return { ok: false, error: "A run the model takes part in needs a signed-in person." };
        // A paired client -- the extension's Automations Run -- calls as
        // `client-gateway:<id>`, a session Secret Keys never releases a key to,
        // so its model always ran keyless. It is mapped to the approving
        // person's unlocked session the way a chat turn is
        // (`runtime/conversations/commands/caller.ts`): whose key pays changes,
        // never what may be done. With no unlocked session the Flow runs
        // deterministically, exactly as it did before, rather than being
        // refused. A person's own session passes through unchanged.
        const caller = service.conversations.callerFor(request.actor);
        if (!caller.keyLocked) llmExecution = { actorUserId: caller.userId, actorSessionId: caller.sessionId, intent };
        pairedCaller = caller.paired;
      }
      // What the person allowed the run's actions to do. Absent is nothing; a
      // class Core does not know refuses the run rather than being dropped.
      let permittedConsequences: AutomationStudioActionConsequence[] | undefined;
      try { permittedConsequences = requestedConsequences === undefined ? undefined : parseAutomationStudioPermittedConsequences(requestedConsequences); }
      catch { return { ok: false, error: "The run's permitted consequences name a class Core does not recognise." }; }
      // A run may name the run it is continuing (t166): a repair that must
      // resume the run that failed has to be able to say which run that was.
      // `newRunId` is a different field: it names the session the run is about
      // to create, so the caller can read the run back if its own request is cut
      // short (`runtime/service/runtime-session/requested-run-id.ts`).
      // The paired person's key pays only for the result checks that judge a
      // repair; an Automations Run's routine checks are sampled under the
      // Flow's standing authorization, or not at all (MVP item 23). A person's
      // own session pays for every check its run makes, as it always has, unless
      // it asked for the paired rule itself (the chat's "Run it").
      const resultCheckCallerPays = llmExecution && (pairedCaller || requestedCallerPays === "repair_checks") ? { resultCheckCallerPays: "repair_checks" as const } : {};
      // A saved trace keeps each value once; a client reads every attempt's whole inputs (t377).
      const runtimeSession = automationStudioWithWholeAttemptInputs(await service.runRuntimeSession({ ...payload, ...(llmExecution ? { llmExecution } : {}), ...(permittedConsequences ? { permittedConsequences } : {}), ...resultCheckCallerPays }));
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
          durableBehaviorChanged,
          ...reauthoredOf(runDetail)
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

/**
 * How the run's re-author settled, in a closed word: `applied` once a whole
 * re-run with the re-authored Flow was judged to answer and the edit was kept,
 * `not_applied` once it was settled otherwise (t267 S4,
 * `runtime/service/runtime-adaptation/judged-reauthor.ts`). A re-author is a
 * Flow Bootstrap adaptation, so it is not among `createdAdaptationIds`; the
 * chat's "run it" says it apart (`runtime/conversations/commands/run-flow.ts`).
 * Read from the marker's own settled fields, never its codes or attempts;
 * nothing when the run re-authored nothing or its re-author is not settled.
 */
function reauthoredOf(detail: AutomationStudioFlowRunDetail | null): { reauthored?: "applied" | "not_applied" } {
  const marker = detail?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY];
  if (!marker || typeof marker !== "object" || Array.isArray(marker) || typeof marker.adaptationId !== "string") return {};
  if (marker.applied === true) return { reauthored: "applied" };
  return typeof marker.notAppliedReason === "string" ? { reauthored: "not_applied" } : {};
}
