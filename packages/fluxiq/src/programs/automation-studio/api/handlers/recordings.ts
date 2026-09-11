// The recording pipeline end to end: capture and entry append, finalization,
// proposals, normalization, and the evidence and policy work mined from it.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type AppendRecordingEntryRequest, type AppendRecordingMarkerRequest, type AppendRecordingNoteRequest, type ApprovePolicyProposalRequest, type CreateRecordingRequest, type DeleteRecordingRequest, type DeleteRecordingsRequest, type FinalizeRecordingRequest, type GetProposalRequest, type GetRecordingEntryStateRequest, type GetStateSnapshotRequest, type LearnTaskModelRequest, type MineRecordingEvidenceRequest, type NormalizeRecordingRequest, type NormalizedTimelineProjectRequest, type ProcessFinalizedRecordingRequest, type ProposePolicyFromModelRequest, type RecordingIdProjectRequest, type RecordingProjectRequest, type RepairRecordingStateIndexRequest, type ReplayPolicyAgainstRecordingRequest, type UpdateRecordingRequest } from "../contracts.ts";
import type { AutomationStudioService } from "../../runtime/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerRecordingEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecording,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest & { recordingId?: unknown } : {};
      return { ok: true, payload: { recording: await service.getRecordingSession(String(payload.recordingId ?? ""), payload.projectId) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecordingEntryState,
    permission: "programs.read",
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
    permission: "programs.read",
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
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Partial<RepairRecordingStateIndexRequest> & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
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
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as CreateRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.createRecording({ ...payload, domainId: request.scope.domainId ?? null }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.updateRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as UpdateRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.updateRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as DeleteRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteRecording(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteRecordings,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as DeleteRecordingsRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: await service.deleteRecordings(payload) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProposal,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as { projectId?: unknown; proposalId?: unknown; kind?: unknown; authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
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
    permission: "programs.read",
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
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingEntryRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.appendRecordingEvent(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingNote,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingNoteRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.appendRecordingNoteEntry(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendRecordingMarker,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as AppendRecordingMarkerRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await service.appendRecordingMarkerEntry(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.finalizeRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as FinalizeRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: service.summarizeRecordingSession(await service.finalizeRecording(payload)) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.processFinalizedRecording,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ProcessFinalizedRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { result: await service.processFinalizedRecording({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? ""), force: payload.force === true }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateRecordingProposal,
    permission: "flows.write",
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
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as NormalizeRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { normalizedTimeline: await service.normalizeRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.createNormalizationReview,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as RecordingIdProjectRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { review: await service.createNormalizationReview({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listNormalizedTimelines,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: { normalizedTimelines: payload.projectId ? await service.listProjectNormalizedTimelines(payload.projectId) : [] } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listNormalizedTimelineSummaries,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: { normalizedTimelines: payload.projectId ? await service.listProjectNormalizedTimelineSummaries(payload.projectId) : [] } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getNormalizedTimeline,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Partial<NormalizedTimelineProjectRequest> : {};
      return { ok: true, payload: { normalizedTimeline: await service.getProjectNormalizedTimeline(String(payload.projectId ?? ""), String(payload.normalizedTimelineId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listPipelineArtifacts,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as RecordingProjectRequest : {};
      return { ok: true, payload: await service.listPipelineArtifacts(String(payload.projectId ?? "")) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.mineRecordingEvidence,
    permission: "flows.write",
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
    permission: "flows.write",
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
    permission: "flows.write",
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
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ApprovePolicyProposalRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
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
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Record<string, unknown>;
      return { ok: true, payload: await service.createRecordingFlowProposals({ projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? ""), ...(typeof payload.mapperId === "string" ? { mapperId: payload.mapperId } : {}), ...(payload.force === true ? { force: true } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.reviewRecordingFlowProposal,
    permission: "flows.write",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as Record<string, unknown>;
      await authorizeProgramPin(identityAccess, payload);
      const decision = payload.decision === "rejected" ? "rejected" as const : "approved" as const;
      const destination = payload.destination && typeof payload.destination === "object" && !Array.isArray(payload.destination) ? payload.destination as any : undefined;
      const policyOverride = payload.policyOverride && typeof payload.policyOverride === "object" && !Array.isArray(payload.policyOverride) ? payload.policyOverride as any : undefined;
      return { ok: true, payload: await service.reviewRecordingFlowProposal({ projectId: String(payload.projectId ?? ""), proposalId: String(payload.proposalId ?? ""), decision, ...(typeof payload.notes === "string" ? { notes: payload.notes } : {}), ...(typeof payload.reviewerId === "string" ? { reviewerId: payload.reviewerId } : {}), ...(destination ? { destination } : {}), ...(policyOverride ? { policyOverride } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.replayPolicyAgainstRecording,
    permission: "runtime.control",
    handler: async (request) => {
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ReplayPolicyAgainstRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      const input: Parameters<AutomationStudioService["replayPolicyAgainstRecording"]>[0] = { projectId: String(payload.projectId ?? ""), recordingId: String(payload.recordingId ?? "") };
      if (payload.policyId !== undefined) input.policyId = payload.policyId;
      return { ok: true, payload: { replayResult: await service.replayPolicyAgainstRecording(input) } };
    }
  });
}
