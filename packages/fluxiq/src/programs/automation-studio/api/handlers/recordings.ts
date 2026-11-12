// The recording pipeline end to end: capture and entry append, finalization,
// proposals, normalization, and the evidence and policy work mined from it.

import { deleteRecordingInput, deleteRecordingsInput, generateRecordingProposalInput, getProposalInput, getRecordingCapturePolicyInput, getRecordingInput, reviewRecordingFlowProposalInput, updateRecordingInput } from "@fluxiq/contracts/program-api-inputs";
import { AUTOMATION_STUDIO_ENDPOINTS, type AppendRecordingEntryRequest, type AppendRecordingMarkerRequest, type AppendRecordingNoteRequest, type ApprovePolicyProposalRequest, type CreateRecordingRequest, type DeleteRecordingRequest, type DeleteRecordingsRequest, type FinalizeRecordingRequest, type GetProposalRequest, type GetRecordingCapturePolicyRequest, type GetRecordingCapturePolicyResponse, type GetRecordingEntryStateRequest, type GetStateSnapshotRequest, type LearnTaskModelRequest, type MineRecordingEvidenceRequest, type NormalizeRecordingRequest, type NormalizedTimelineProjectRequest, type ProcessFinalizedRecordingRequest, type ProposePolicyFromModelRequest, type RecordingIdProjectRequest, type RecordingProjectRequest, type RemoveRecordingEntryRequest, type RemoveRecordingEntryResponse, type RepairRecordingStateIndexRequest, type ReplayPolicyAgainstRecordingRequest, type UpdateRecordingRequest } from "../../../../api-contracts/automation.ts";
import { AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY } from "@fluxiq/contracts/automation";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";
import type { ProgramApiRequest } from "../../../_shared/api.ts";

function payloadObject(request: ProgramApiRequest): Record<string, unknown> {
  return request.payload !== null && typeof request.payload === "object" && !Array.isArray(request.payload) ? request.payload as Record<string, unknown> : {};
}

/**
 * A call that names a project acts inside it; one that names none (the policy
 * where nothing narrower is set, every recording the workspace holds) acts on
 * the workspace. "Names" is the handlers' own test, a truthy `projectId`.
 */
export const projectOrWorkspaceResource = endpointResource.custom(["project"], (request) => {
  const projectId = payloadObject(request).projectId;
  return projectId ? { kind: "project", projectId } : { kind: "workspace" };
});

export function registerRecordingEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecordingCapturePolicy,
    assistant: { input: getRecordingCapturePolicyInput, summary: "Shows what a recording is allowed to capture.", phrases: ["what can a recording capture", "show the recording rules"], contextArgs: { projectId: "projectId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetRecordingCapturePolicy",
    accessLevel: "Read",
    resource: projectOrWorkspaceResource,
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as GetRecordingCapturePolicyRequest : {};
      const projectId = typeof payload.projectId === "string" && payload.projectId.trim() ? payload.projectId.trim() : null;
      const policy = dependencies.recordingCapturePolicy ? await dependencies.recordingCapturePolicy(projectId) : AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY;
      const answer: GetRecordingCapturePolicyResponse = { policy };
      return { ok: true, payload: answer };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecording,
    assistant: { input: getRecordingInput, summary: "Reads a recording and the steps it captured.", phrases: ["show the steps of this recording", "what did this recording capture"], contextArgs: { projectId: "projectId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetRecording",
    accessLevel: "Read",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest & { recordingId?: unknown } : {};
      return { ok: true, payload: { recording: await service.getRecordingSession(String(payload.recordingId ?? ""), payload.projectId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecordingEntryState,
    assistant: { hidden: "This reads the stored page state behind one recorded step for debugging, not something a person asks for." },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetRecordingEntryState",
    accessLevel: "Read",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<GetRecordingEntryStateRequest> : {};
      return {
        ok: true,
        payload: await service.getRecordingEntryState({
          projectId: String(payload.projectId ?? ""),
          recordingId: String(payload.recordingId ?? ""),
          ...(typeof payload.entryId === "string" ? { entryId: payload.entryId } : {}),
          ...(typeof payload.actionId === "string" ? { actionId: payload.actionId } : {}),
          ...(typeof payload.stateSnapshotId === "string" ? { stateSnapshotId: payload.stateSnapshotId } : {}),
          includeState: payload.includeState === true
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getStateSnapshot,
    assistant: { hidden: "This reads one stored page snapshot for debugging, not something a person asks for." },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetStateSnapshot",
    accessLevel: "Read",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<GetStateSnapshotRequest> : {};
      return {
        ok: true,
        payload: await service.getStateSnapshot({
          projectId: String(payload.projectId ?? ""),
          recordingId: String(payload.recordingId ?? ""),
          stateSnapshotId: String(payload.stateSnapshotId ?? ""),
          includeState: payload.includeState === true
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.repairRecordingStateIndex,
    assistant: { hidden: "This is an internal repair of a recording's lookup index that engineers run." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:RepairRecordingStateIndex",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<RepairRecordingStateIndexRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      return {
        ok: true,
        payload: await service.repairRecordingStateIndex({
          projectId: String(payload.projectId ?? ""),
          recordingId: String(payload.recordingId ?? ""),
          mode: payload.mode === "write" ? "write" : "dry_run"
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createRecording,
    assistant: { hidden: "A recording is started by the browser recorder, which opens its own session." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:CreateRecording",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as CreateRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { recording: await service.createRecording({ ...payload, domainId: request.scope.domainId ?? null }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateRecording,
    assistant: { input: updateRecordingInput, summary: "Renames, annotates or archives a recording.", phrases: ["rename this recording", "archive this recording"], contextArgs: { projectId: "projectId" } },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:UpdateRecording",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as UpdateRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { recording: await service.updateRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRecording,
    assistant: { input: deleteRecordingInput, summary: "Deletes a recording and the proposals made from it.", phrases: ["delete this recording", "remove the recording"], contextArgs: { projectId: "projectId" } },
    permission: "runtime.control",
    classification: "destructive",
    action: "studio:DeleteRecording",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as DeleteRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: await service.deleteRecording(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRecordings,
    assistant: { input: deleteRecordingsInput, summary: "Deletes several recordings at once.", phrases: ["delete these recordings", "clear out my old recordings"], contextArgs: { projectId: "projectId" }, target: { recordingIds: "recording" } },
    permission: "runtime.control",
    classification: "destructive",
    action: "studio:DeleteRecordings",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as DeleteRecordingsRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: await service.deleteRecordings(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProposal,
    assistant: { hidden: "Proposals are cleared from the proposals screen; a person does not ask for it by name." },
    permission: "runtime.control",
    classification: "destructive",
    action: "studio:DeleteProposal",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as { projectId?: unknown; proposalId?: unknown; kind?: unknown; authSessionId?: unknown; authorizationPin?: unknown };
      return {
        ok: true,
        payload: await service.deleteProposal({
          projectId: String(payload.projectId ?? ""),
          proposalId: String(payload.proposalId ?? ""),
          kind: payload.kind === "policy" || payload.kind === "recording_flow" ? payload.kind : "auto"
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProposal,
    assistant: { input: getProposalInput, summary: "Reads one proposal made from a recording.", phrases: ["show this proposal", "what does the proposal say"], contextArgs: { projectId: "projectId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetProposal",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<GetProposalRequest> : {};
      return {
        ok: true,
        payload: await service.getProposal({
          projectId: String(payload.projectId ?? ""),
          proposalId: String(payload.proposalId ?? ""),
          kind: payload.kind === "policy" || payload.kind === "recording_flow" ? payload.kind : "auto"
        })
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingEntry,
    assistant: { hidden: "The browser recorder sends each captured step as it happens; a person never adds one by words." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:AppendRecordingEntry",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingEntryRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { recording: await service.appendRecordingEvent(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingNote,
    assistant: { hidden: "The browser recorder sends notes as they are typed into it." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:AppendRecordingNote",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingNoteRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { recording: await service.appendRecordingNoteEntry(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingMarker,
    assistant: { hidden: "The browser recorder sends markers as the person presses its marker button." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:AppendRecordingMarker",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingMarkerRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { recording: await service.appendRecordingMarkerEntry(payload) } };
    }
  });
  // Undoing one captured step while the recording is still open: every entry
  // recorded from the gateway event `eventId` goes. `authoring` under
  // `runtime.control`, like appending: it edits a recording nobody has
  // finalized, and a finalized one refuses it. The answer is the recording as a
  // summary, never its entries.
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.removeRecordingEntry,
    assistant: { hidden: "The browser recorder undoes a captured step with its own undo button while recording." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:RemoveRecordingEntry",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<Record<keyof RemoveRecordingEntryRequest, unknown>>;
      const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
      const recordingId = typeof payload.recordingId === "string" ? payload.recordingId.trim() : "";
      const eventId = typeof payload.eventId === "string" ? payload.eventId.trim() : "";
      if (!projectId || !recordingId || !eventId) return { ok: false, error: "Removing a recording entry needs its project, recording and event IDs." };
      const removed = await service.recordingEntryRemoval.remove({ projectId, recordingId, eventId });
      const answer: RemoveRecordingEntryResponse = { removedCount: removed.removedCount, recording: service.summarizeRecordingSession(removed.recording) };
      return { ok: true, payload: answer };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.finalizeRecording,
    assistant: { hidden: "The browser recorder finishes a recording when the person presses its stop button." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:FinalizeRecording",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as FinalizeRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { recording: service.summarizeRecordingSession(await service.finalizeRecording(payload)) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.processFinalizedRecording,
    assistant: { hidden: "This runs automatically when a recording is finished; it is a stage of the pipeline." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:ProcessFinalizedRecording",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ProcessFinalizedRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { result: await service.processFinalizedRecording({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? ""), force: payload.force === true }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateRecordingProposal,
    assistant: { input: generateRecordingProposalInput, summary: "Proposes a Flow made from a recording.", phrases: ["turn this recording into a flow", "make a flow from my recording"], contextArgs: { projectId: "projectId" } },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:GenerateRecordingProposal",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as { projectId?: unknown; recordingId?: unknown; mode?: unknown; title?: unknown; instructions?: unknown; constraints?: unknown; replaceProposalId?: unknown };
      return {
        ok: true,
        payload: {
          result: await service.generateRecordingProposal({
            projectId: String(payload.projectId ?? ""),
            recordingId: String(payload.recordingId ?? ""),
            mode: payload.mode === "llm_assisted" ? "llm_assisted" : "direct",
            ...(typeof payload.title === "string" ? { title: payload.title } : {}),
            ...(typeof payload.instructions === "string" ? { instructions: payload.instructions } : {}),
            ...(typeof payload.constraints === "string" ? { constraints: payload.constraints } : {}),
            ...(typeof payload.replaceProposalId === "string" ? { replaceProposalId: payload.replaceProposalId } : {})
          })
        }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.normalizeRecording,
    assistant: { hidden: "Cleaning up a recording's steps is an automatic stage of the recording pipeline." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:NormalizeRecording",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as NormalizeRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { normalizedTimeline: await service.normalizeRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createNormalizationReview,
    assistant: { hidden: "Reviewing the clean-up of a recording is an automatic stage of the recording pipeline." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:CreateNormalizationReview",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as RecordingIdProjectRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { review: await service.createNormalizationReview({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listNormalizedTimelines,
    assistant: { hidden: "Cleaned-up timelines are an internal stage of the recording pipeline that screens read." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListNormalizedTimelines",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: { normalizedTimelines: payload.projectId ? await service.listProjectNormalizedTimelines(payload.projectId) : [] } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listNormalizedTimelineSummaries,
    assistant: { hidden: "Cleaned-up timelines are an internal stage of the recording pipeline that screens read." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListNormalizedTimelineSummaries",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: { normalizedTimelines: payload.projectId ? await service.listProjectNormalizedTimelineSummaries(payload.projectId) : [] } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getNormalizedTimeline,
    assistant: { hidden: "A cleaned-up timeline is an internal stage of the recording pipeline that screens read." },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetNormalizedTimeline",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<NormalizedTimelineProjectRequest> : {};
      return { ok: true, payload: { normalizedTimeline: await service.getProjectNormalizedTimeline(String(payload.projectId ?? ""), String(payload.normalizedTimelineId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listPipelineArtifacts,
    assistant: { hidden: "The pipeline's working files are listed for the screens, not for a person to ask about." },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListPipelineArtifacts",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: await service.listPipelineArtifacts(String(payload.projectId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.mineRecordingEvidence,
    assistant: { hidden: "Mining a recording for evidence is an automatic stage of the recording pipeline." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:MineRecordingEvidence",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as MineRecordingEvidenceRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const input: Parameters<AutomationStudioService["mineRecordingEvidence"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (payload.recordingId !== undefined) input.recordingId = payload.recordingId;
      if (payload.normalizedTimelineId !== undefined) input.normalizedTimelineId = payload.normalizedTimelineId;
      return { ok: true, payload: { miningRun: await service.mineRecordingEvidence(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.learnTaskModel,
    assistant: { hidden: "Learning a task model from evidence is an automatic stage of the recording pipeline." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:LearnTaskModel",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as LearnTaskModelRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const input: Parameters<AutomationStudioService["learnTaskModel"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (payload.taskId !== undefined) input.taskId = payload.taskId;
      if (payload.miningRunId !== undefined) input.miningRunId = payload.miningRunId;
      return { ok: true, payload: { learnedTaskModel: await service.learnTaskModel(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.proposePolicyFromModel,
    assistant: { hidden: "Proposing a policy from a learned model is an automatic stage of the recording pipeline." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:ProposePolicyFromModel",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ProposePolicyFromModelRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const input: Parameters<AutomationStudioService["proposePolicyFromModel"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (payload.learnedTaskModelId !== undefined) input.learnedTaskModelId = payload.learnedTaskModelId;
      if (payload.miningRunId !== undefined) input.miningRunId = payload.miningRunId;
      if (payload.recordingId !== undefined) input.recordingId = payload.recordingId;
      return { ok: true, payload: { proposal: await service.proposePolicyFromModel(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.approvePolicyProposal,
    assistant: { hidden: "Policy proposals belong to the older recording pipeline and are approved on its screen, not by words." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:ApprovePolicyProposal",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ApprovePolicyProposalRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const input: Parameters<AutomationStudioService["approvePolicyProposal"]>[0] = { projectId: String(payload.projectId ?? ""), proposalId: String(payload.proposalId ?? "") };
      if (typeof (payload as any).targetTaskId === "string") input.targetTaskId = (payload as any).targetTaskId;
      if (typeof (payload as any).targetFlowId === "string") input.targetFlowId = (payload as any).targetFlowId;
      if ((payload as any).policyOverride && typeof (payload as any).policyOverride === "object" && !Array.isArray((payload as any).policyOverride)) input.policyOverride = (payload as any).policyOverride;
      if (typeof (payload as any).requireExistingTask === "boolean") input.requireExistingTask = (payload as any).requireExistingTask;
      if (typeof (payload as any).requireExistingFlow === "boolean") input.requireExistingFlow = (payload as any).requireExistingFlow;
      return { ok: true, payload: { proposal: await service.approvePolicyProposal(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createRecordingFlowProposals,
    assistant: { hidden: "Flow proposals are made automatically when a recording is processed; a person asks for one with the recording's own proposal request." },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:CreateRecordingFlowProposals",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Record<string, unknown>;
      return { ok: true, payload: await service.createRecordingFlowProposals({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? ""), ...(typeof payload.mapperId === "string" ? { mapperId: payload.mapperId } : {}), ...(payload.force === true ? { force: true } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.reviewRecordingFlowProposal,
    assistant: { input: reviewRecordingFlowProposalInput, summary: "Approves or rejects a proposed Flow made from a recording.", phrases: ["approve this proposal", "reject the proposed flow"], contextArgs: { projectId: "projectId" } },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:ReviewRecordingFlowProposal",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Record<string, unknown>;
      const decision = payload.decision === "rejected" ? "rejected" as const : "approved" as const;
      const destination = payload.destination && typeof payload.destination === "object" && !Array.isArray(payload.destination) ? payload.destination as any : undefined;
      const policyOverride = payload.policyOverride && typeof payload.policyOverride === "object" && !Array.isArray(payload.policyOverride) ? payload.policyOverride as any : undefined;
      // Who reviewed is the signed-in caller, never a name the body carries.
      return { ok: true, payload: await service.reviewRecordingFlowProposal({ projectId: String(payload.projectId ?? ""), proposalId: String(payload.proposalId ?? ""), decision, ...(typeof payload.notes === "string" ? { notes: payload.notes } : {}), ...(request.actor?.userId ? { reviewerId: request.actor.userId } : {}), ...(destination ? { destination } : {}), ...(policyOverride ? { policyOverride } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.replayPolicyAgainstRecording,
    assistant: { hidden: "Replaying a policy against a recording is an internal check of the older recording pipeline." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:ReplayPolicyAgainstRecording",
    accessLevel: "Write",
    resource: endpointResource.projectChild("recording", "recordingId"),
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ReplayPolicyAgainstRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const input: Parameters<AutomationStudioService["replayPolicyAgainstRecording"]>[0] = { projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? "") };
      if (payload.policyId !== undefined) input.policyId = payload.policyId;
      return { ok: true, payload: { replayResult: await service.replayPolicyAgainstRecording(input) } };
    }
  });
}
