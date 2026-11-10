// Live LLM work: bootstrap-generation readiness, generation instructions, and
// the generated adaptation itself. A build's model calls need no grant: the
// build runs for the signed-in actor, whose unlocked Secret Keys key pays, and
// only a lasting consequence of one of its actions is asked about
// (`permittedConsequences`).

import { cancelFlowBootstrapInput, getFlowBootstrapFailureInput, getFlowBootstrapGenerationReadinessInput } from "@fluxiq/contracts/program-api-inputs";
import { endpointResource } from "../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { automationStudioFlowBootstrapFailedBuilds, parseAutomationStudioFlowBootstrapGenerationError } from "../../../../runtime/flow-authoring/bootstrap/generation-failure/index.ts";
import { boundedIdentifier, flowBootstrapGenerationReadiness, generateFlowBootstrapAdaptationForRequest } from "../../../../framework/automation-service/service/flow-bootstrap-requests/index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../../../../runtime/recording/gateway-trace/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { automationStudioApiTaskAttemptStore, registerCarryOnTaskAttemptEndpoint } from "./task/index.ts";

export function registerLlmGenerationEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  const failedBuilds = automationStudioFlowBootstrapFailedBuilds<NonNullable<ReturnType<typeof parseAutomationStudioFlowBootstrapGenerationError>>>();
  registry.register({
    programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.cancelFlowBootstrap, assistant: { input: cancelFlowBootstrapInput, summary: "Stops a Flow's build that is running.", phrases: ["stop the build","cancel building this flow"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "runtime.control", classification: "authoring",
    action: "studio:CancelFlowBootstrap",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: (request) => {
      const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Record<string, unknown> : {};
      const projectId = boundedIdentifier(payload.projectId, "Project"), flowId = boundedIdentifier(payload.flowId, "Flow");
      recordCancelIntoBuildTrace(projectId, flowId);
      return { ok: true, payload: { projectId, flowId, cancellationRequested: service.buildCancellation.cancel(projectId, flowId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowBootstrapGenerationReadiness, assistant: { input: getFlowBootstrapGenerationReadinessInput, summary: "Checks whether a model is set up to build Flows.", phrases: ["can I build flows yet","is a model set up"] },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowBootstrapGenerationReadiness",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
    handler: (request) => {
      const payload = request.payload;
      // The web route adds `authSessionId` to a signed-in person's POST to this program, so a POST
      // carrying only that is a request with no fields (t348: the Lab's control client reads it by POST).
      const fields = payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload).filter((key) => key !== "authSessionId") : undefined;
      if (payload !== undefined && (fields === undefined || fields.length !== 0)) {
        return { ok: false, error: "Flow bootstrap readiness does not accept request fields." };
      }
      return { ok: true, payload: { readiness: flowBootstrapGenerationReadiness(service) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowGenerationInstruction, assistant: { hidden: "Sent by the build screen with the caller's sign-in session id to store the words a build starts from; a person gives them in chat." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:SaveFlowGenerationInstruction",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      if (!request.actor) return { ok: false, error: "Flow generation instruction is unavailable." };
      const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload)
        ? request.payload as Record<string, unknown> : {};
      if (Object.keys(payload).some((key) => !["projectId", "flowId", "authSessionId", "instruction", "linkedRecordingIds", "instructionSource", "instructionId"].includes(key))) return { ok: false, error: "Flow generation instruction request contains unsupported fields." };
      if (payload.authSessionId !== request.actor.sessionId) return { ok: false, error: "Authorization session mismatch." };
      const instruction = typeof payload.instruction === "string" ? payload.instruction.trim() : "";
      if (!instruction || instruction.length > 4_000) return { ok: false, error: "Flow generation instruction must contain 1 to 4,000 characters." };
      const saved = await service.saveFlowGenerationInstruction({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), instruction, ...(typeof payload.instructionId === "string" ? { instructionId: payload.instructionId } : {}), ...(payload.linkedRecordingIds !== undefined ? { linkedRecordingIds: payload.linkedRecordingIds as string[] } : {}), ...(payload.instructionSource === "conversation_argument" ? { instructionSource: "conversation_argument" as const } : {}) });
      return { ok: true, payload: { instruction: { instructionId: saved.instructionId, status: saved.status, updatedAt: saved.updatedAt } } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation, assistant: { hidden: "The build itself: it needs the caller's sign-in session and build options, and builds start from the chat, which supplies them." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:GenerateFlowBootstrapAdaptation",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => generateFlowBootstrapAdaptationForRequest({
      service,
      failedBuilds,
      noteConversation: async (projectId, conversationId, flowId) => await automationStudioApiTaskAttemptStore(service).locator.noteConversation(projectId, conversationId, flowId)
    }, request)
  });
  // Carrying an attempt on goes through the generation above, so it shares what the generation keeps of a failed build.
  registerCarryOnTaskAttemptEndpoint(dependencies, { failedBuilds });
  // The diagnostic of a Flow's latest build that failed, as the request above
  // answered it. A build the chat started answers the person in words, and
  // what it spent used to be lost with the rest of its diagnostic: live run
  // `run-muq3ubys-4b4dbf5b` spent $0.227 and the spend ledger recorded $0.
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowBootstrapFailure, assistant: { input: getFlowBootstrapFailureInput, summary: "Explains why a Flow's latest build failed.", phrases: ["why did the build fail","what went wrong building this flow"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowBootstrapFailure",
    accessLevel: "Read",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Record<string, unknown> : {};
      return { ok: true, payload: { failure: failedBuilds.latest(boundedIdentifier(payload.projectId, "Project"), boundedIdentifier(payload.flowId, "Flow")) ?? null } };
    }
  });
}

/**
 * Cancelling a build arrives over HTTP, outside the build's own async context,
 * keyed as build cancellation is: by project and Flow. It is recorded as a
 * control event into the outermost open episode of that Flow (the build, not a
 * trial it is running), before the build is told to stop. Nothing happens with
 * tracing off, or when the Flow has no open episode.
 */
function recordCancelIntoBuildTrace(projectId: string, flowId: string): void {
  const episodes = AutomationStudioGatewayTraceInstallation.current();
  const outermost = episodes?.registry.byFlow(projectId, flowId)[0];
  if (episodes === undefined || outermost === undefined) return;
  episodes.recordControl({ type: "run_control", payload: { action: "cancel_build", projectId, flowId } }, outermost);
}
