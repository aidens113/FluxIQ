import type {
  AutomationStudioFlowAdaptation,
  AutomationStudioFlowArtifact,
  AutomationStudioFlowRunDetail,
  AutomationStudioProjectArtifactKind,
  AutomationStudioProjectArtifacts,
  RecordingSession,
  AutomationStudioFlowRouter,
  AutomationStudioFlowSubflow,
  AutomationStudioRuntimeSession
} from "../../model/index.ts";
import type { NormalizationOptions, NormalizedTimeline } from "../../normalization/index.ts";
import type { CreateFlowSubflowInput } from "./flows/index.ts";
import type { AutomationStudioSubflowSummaryPage } from "./summaries/index.ts";
import type { CreateRecordingFlowProposalsResult, ProcessFinalizedRecordingResult } from "./proposals/index.ts";
import type { AutomationPipelineArtifacts } from "./recordings/index.ts";

// The public service methods a collaborator is allowed to call back into.
//
// A collaborator must never reach these through the collaborator that owns
// them. They are public, so a caller can subclass the service or replace one on
// an instance, and code inside the object is expected to honour that: the
// subflow summary migration, for example, hydrates detail through the service's
// own getFlowSubflow so the hydration can be observed and bounded. Routed
// straight at the flow store that override is silently ignored, which is a
// behaviour change no type check and no value-diffing probe can see.
//
// Private methods carry no such contract, so a collaborator calls those
// directly on the collaborator that owns them.
export type AutomationStudioFacadePorts = {
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
  getFlowRouter(projectId: string, flowId: string): Promise<AutomationStudioFlowRouter | null>;
  getFlowSubflow(projectId: string, flowId: string, subflowId: string): Promise<AutomationStudioFlowSubflow | null>;
  createFlowSubflow(input: CreateFlowSubflowInput): Promise<AutomationStudioFlowSubflow>;
  saveFlowRouter(router: AutomationStudioFlowRouter): Promise<AutomationStudioFlowRouter>;
  saveFlowSubflow(subflow: AutomationStudioFlowSubflow): Promise<AutomationStudioFlowSubflow>;
  listProjectNormalizedTimelines(projectId: string): Promise<NormalizedTimeline[]>;
  getRecordingSession(recordingId: string, projectId?: string | null): Promise<RecordingSession>;
  deleteRecording(input: { projectId?: string | null; recordingId: string }): Promise<{ deletedRecordingId: string; deletedProposalIds: string[] }>;
  listPipelineArtifacts(projectId: string, options?: { revalidateRecordingFlowProposals?: boolean }): Promise<AutomationPipelineArtifacts>;
  normalizeRecording(input: { projectId?: string | null; recordingId: string; options?: NormalizationOptions }): Promise<NormalizedTimeline>;
  createRecordingFlowProposals(input: { projectId: string; recordingId: string; mapperId?: string; force?: boolean }): Promise<CreateRecordingFlowProposalsResult>;
  deleteProposal(input: { projectId: string; proposalId: string; kind?: "policy" | "recording_flow" | "auto" }): Promise<{ deletedProposalId: string; kind: "policy" | "recording_flow"; recordingId?: string }>;
  processFinalizedRecording(input: { projectId: string; recordingId: string; force?: boolean }): Promise<ProcessFinalizedRecordingResult>;
  saveFlow(input: { projectId: string; flow: AutomationStudioFlowArtifact; expectedUpdatedAt?: number }): Promise<AutomationStudioFlowArtifact>;
  setFlowMapFallback(input: { projectId: string; flowId: string; kind: "subflow" | "fail"; targetSubflowId?: string; message?: string }): Promise<AutomationStudioFlowRouter>;
  getProjectArtifact(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): Promise<unknown>;
  listProjectArtifacts(projectId: string): Promise<AutomationStudioProjectArtifacts>;
  getFlowRunDetail(projectId: string, runId: string, options?: { includeCollections?: boolean }): Promise<AutomationStudioFlowRunDetail | null>;
  getFlowAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioFlowAdaptation | null>;
  listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]>;
  listFlowSubflowSummaries(input: { projectId: string; flowId?: string; status?: string; role?: string; search?: string; sort?: "updated" | "name" | "status" | "role"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioSubflowSummaryPage>;
};

// A fresh port object over the service. Narrowing to the port type alone would
// leave the whole facade reachable at runtime; this hands a collaborator these
// closures and nothing else.
export function automationStudioFacadePorts(service: AutomationStudioFacadePorts): AutomationStudioFacadePorts {
  return {
    getFlow: (projectId, flowId) => service.getFlow(projectId, flowId),
    getFlowRouter: (projectId, flowId) => service.getFlowRouter(projectId, flowId),
    getFlowSubflow: (projectId, flowId, subflowId) => service.getFlowSubflow(projectId, flowId, subflowId),
    createFlowSubflow: (input) => service.createFlowSubflow(input),
    saveFlowRouter: (router) => service.saveFlowRouter(router),
    saveFlowSubflow: (subflow) => service.saveFlowSubflow(subflow),
    listProjectNormalizedTimelines: (projectId) => service.listProjectNormalizedTimelines(projectId),
    getRecordingSession: (recordingId, projectId) => service.getRecordingSession(recordingId, projectId),
    deleteRecording: (input) => service.deleteRecording(input),
    listPipelineArtifacts: (projectId, options) => service.listPipelineArtifacts(projectId, options),
    normalizeRecording: (input) => service.normalizeRecording(input),
    createRecordingFlowProposals: (input) => service.createRecordingFlowProposals(input),
    deleteProposal: (input) => service.deleteProposal(input),
    processFinalizedRecording: (input) => service.processFinalizedRecording(input),
    saveFlow: (input) => service.saveFlow(input),
    setFlowMapFallback: (input) => service.setFlowMapFallback(input),
    getProjectArtifact: (projectId, kind, artifactId) => service.getProjectArtifact(projectId, kind, artifactId),
    listProjectArtifacts: (projectId) => service.listProjectArtifacts(projectId),
    getFlowRunDetail: (projectId, runId, options) => service.getFlowRunDetail(projectId, runId, options),
    getFlowAdaptation: (projectId, flowId, adaptationId) => service.getFlowAdaptation(projectId, flowId, adaptationId),
    listRuntimeSessions: (projectId) => service.listRuntimeSessions(projectId),
    listFlowSubflowSummaries: (input) => service.listFlowSubflowSummaries(input)
  };
}
