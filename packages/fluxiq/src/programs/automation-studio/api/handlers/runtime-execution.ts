// Starting and running a runtime session, and the state, signal and recording
// domain surfaces it reads and writes.

import { endpointResource } from "../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type AppendRecordingDomainEventRequest, type InspectStateDiffRequest, type ValidateRecordingDomainEventRequest } from "../../../../api-contracts/automation.ts";
import { automationStudioWithWholeAttemptInputs } from "../../../../framework/automation-service/index.ts";
import { runRuntimeSessionForRequest, startRuntimeSessionForRequest } from "../../../../framework/automation-service/service/run-requests/index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../../../../runtime/recording/gateway-trace/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { startRuntimeSessionInput, cancelRuntimeSessionInput, runRuntimeSessionInput } from "@fluxiq/contracts/program-api-inputs";

export function registerRuntimeExecutionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startRuntimeSession, assistant: { input: startRuntimeSessionInput, summary: "Starts a run of a Flow.", phrases: ["start the flow", "start a run"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:StartRuntimeSession",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => startRuntimeSessionForRequest(service, request)
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.cancelRuntimeSession, assistant: { input: cancelRuntimeSessionInput, summary: "Stops a run.", phrases: ["stop the run", "cancel that run"], contextArgs: { projectId: "projectId", runId: "runId" } },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:CancelRuntimeSession",
    accessLevel: "Write",
    resource: endpointResource.projectChild("run", "runId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as { projectId?: unknown; runId?: unknown; reason?: unknown } : {};
      const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
      const runId = typeof payload.runId === "string" ? payload.runId.trim() : "";
      if (!projectId || !runId) return { ok: false, error: "Stopping a run needs its project and run IDs." };
      const reason = typeof payload.reason === "string" && payload.reason.trim() ? payload.reason.trim().slice(0, 500) : undefined;
      recordCancelIntoRunTrace(projectId, runId, reason ?? null);
      return { ok: true, payload: { runtimeSession: automationStudioWithWholeAttemptInputs(await service.cancelRuntimeSession(projectId, runId, reason)) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, assistant: { input: runRuntimeSessionInput, summary: "Runs a Flow to its end, or carries on a run that stopped part way.", phrases: ["run the flow", "run it again"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:RunRuntimeSession",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => runRuntimeSessionForRequest(service, request)
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.inspectStateDiff, assistant: { hidden: "An internal comparison of two saved states for the editor; a person asks what changed in words, not for this." },
    permission: "programs.read",
    classification: "read",
    action: "studio:InspectStateDiff",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as InspectStateDiffRequest;
      return { ok: true, payload: await service.inspectStateDiff(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listSignalRegistries, assistant: { hidden: "An internal list the editor reads to fill its pickers; a person does not ask for it." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListSignalRegistries",
    accessLevel: "List",
    resource: endpointResource.workspace(),
    handler: async () => ({
      ok: true,
      payload: { signalRegistries: await service.listSignalRegistries() }
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecordingDomains, assistant: { hidden: "An internal list the recorder reads to know the kinds of events it may send; a person does not ask for it." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListRecordingDomains",
    accessLevel: "List",
    resource: endpointResource.workspace(),
    handler: async () => ({
      ok: true,
      payload: { domains: service.listRecordingDomains() }
    })
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.validateRecordingDomainEvent, assistant: { hidden: "Only the recorder calls it to check an event before sending it." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ValidateRecordingDomainEvent",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ValidateRecordingDomainEventRequest;
      return { ok: true, payload: service.validateRecordingDomainEvent(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingDomainEvent, assistant: { hidden: "Only the recorder calls it to add events as it records." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:AppendRecordingDomainEvent",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
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
 * A stop arrives over HTTP, outside the run's own async context, so it is
 * recorded as a control event into the run's open trace, found by its run id
 * (the episode id, D9), before the run is told to stop. Nothing happens with
 * tracing off, or when the run has no open trace in this project.
 */
function recordCancelIntoRunTrace(projectId: string, runId: string, reason: string | null): void {
  const episodes = AutomationStudioGatewayTraceInstallation.current();
  const episode = episodes?.registry.byRunId(runId);
  if (episodes === undefined || episode === undefined || episode.projectId !== projectId) return;
  episodes.recordControl({ type: "run_control", payload: { action: "cancel", projectId, runId, reason } }, episode);
}
