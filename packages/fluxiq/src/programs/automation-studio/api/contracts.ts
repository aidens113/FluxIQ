import type { AutomationRecording, AutomationTask, DynamicPolicyArtifact } from "../types.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import type { NormalizedTimeline } from "../normalization/index.ts";
import type {
  AppendRecordingEntryInput,
  CreateRecordingSessionInput,
  PolicyGraph,
  RecordingDomainDefinition,
  RecordingDomainEventInput,
  RecordingSession,
  SignalRegistry,
  StateSnapshot
} from "../model/index.ts";
import type { NormalizationOptions } from "../normalization/index.ts";
import type { JsonObject } from "../../../core/index.ts";
import type { ClientGatewayActionCommand } from "../../../client-gateway/index.ts";

export const AUTOMATION_STUDIO_ENDPOINTS = {
  snapshot: "snapshot",
  projects: "projects",
  createProject: "create-project",
  updateProject: "update-project",
  deleteProject: "delete-project",
  createProjectCategory: "create-project-category",
  updateProjectCategory: "update-project-category",
  deleteProjectCategory: "delete-project-category",
  reorderProjectCategories: "reorder-project-categories",
  getProjectHierarchy: "get-project-hierarchy",
  saveProjectHierarchy: "save-project-hierarchy",
  listRecordings: "list-recordings",
  listProjectArtifacts: "list-project-artifacts",
  getProjectArtifact: "get-project-artifact",
  saveProjectArtifact: "save-project-artifact",
  deleteProjectArtifact: "delete-project-artifact",
  getRecording: "get-recording",
  createRecording: "create-recording",
  updateRecording: "update-recording",
  deleteRecording: "delete-recording",
  appendRecordingEntry: "append-recording-entry",
  appendRecordingNote: "append-recording-note",
  appendRecordingMarker: "append-recording-marker",
  finalizeRecording: "finalize-recording",
  processFinalizedRecording: "process-finalized-recording",
  normalizeRecording: "normalize-recording",
  createNormalizationReview: "create-normalization-review",
  listNormalizedTimelines: "list-normalized-timelines",
  listPipelineArtifacts: "list-pipeline-artifacts",
  mineRecordingEvidence: "mine-recording-evidence",
  learnTaskModel: "learn-task-model",
  proposePolicyFromModel: "propose-policy-from-model",
  approvePolicyProposal: "approve-policy-proposal",
  replayPolicyAgainstRecording: "replay-policy-against-recording",
  listRuntimeSessions: "list-runtime-sessions",
  startRuntimeSession: "start-runtime-session",
  runRuntimeSession: "run-runtime-session",
  inspectStateDiff: "inspect-state-diff",
  listSignalRegistries: "list-signal-registries",
  listRecordingDomains: "list-recording-domains",
  validateRecordingDomainEvent: "validate-recording-domain-event",
  appendRecordingDomainEvent: "append-recording-domain-event",
  clientGatewaySnapshot: "client-gateway-snapshot",
  revokeClientTrust: "revoke-client-trust",
  startClientRecording: "start-client-recording",
  stopClientRecording: "stop-client-recording",
  captureClientSnapshot: "capture-client-snapshot",
  executeClientAction: "execute-client-action"
} as const;

export type AutomationStudioProject = {
  id: string;
  name: string;
  description: string;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioProjectCategory = {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioHierarchyNode = {
  id: string;
  label: string;
  kind: "folder" | "task" | "routine" | "config" | "recording";
  category: "task" | "routine" | "config" | "recording";
  parentId: string | null;
  viewId?: string;
  sourceId?: string;
};

export type AutomationStudioProjectHierarchy = {
  customHierarchyNodes: AutomationStudioHierarchyNode[];
  deletedHierarchyIds: string[];
  workspacePrefs: JsonObject;
};

export type AutomationStudioSnapshot = {
  tasks: AutomationTask[];
  recordings: AutomationRecording[];
  policies: DynamicPolicyArtifact[];
  canonical?: {
    recordingSessions: RecordingSession[];
    normalizedTimelines: NormalizedTimeline[];
    signalRegistries: SignalRegistry[];
    learnedTaskModels: LearnedTaskModel[];
    policyGraphs: PolicyGraph[];
  };
  problems?: AutomationStudioProblem[];
};

export type AutomationStudioProblem = {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  artifactKind?: string;
  artifactId?: string;
};

export type GeneratePolicyRequest = {
  taskId: string;
  domainId?: string | null;
  recordingIds?: string[];
};

export type GeneratePolicyResponse = {
  policy: DynamicPolicyArtifact;
  warnings: string[];
};

export type RecordingProjectRequest = {
  projectId?: string | null;
};

export type CreateRecordingRequest = RecordingProjectRequest & CreateRecordingSessionInput;

export type AppendRecordingEntryRequest = RecordingProjectRequest & {
  recordingId: string;
  entry: AppendRecordingEntryInput;
};

export type UpdateRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  name?: unknown;
  archived?: unknown;
};

export type DeleteRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
};

export type AppendRecordingNoteRequest = RecordingProjectRequest & {
  recordingId: string;
  text?: unknown;
  linkedEntryIds?: unknown;
  startOffsetMs?: unknown;
  endOffsetMs?: unknown;
};

export type AppendRecordingMarkerRequest = RecordingProjectRequest & {
  recordingId: string;
  label?: unknown;
  monotonicOffsetMs?: unknown;
  linkedEntryId?: unknown;
};

export type ListRecordingDomainsResponse = {
  domains: RecordingDomainDefinition[];
};

export type ValidateRecordingDomainEventRequest = RecordingDomainEventInput;

export type AppendRecordingDomainEventRequest = RecordingDomainEventInput;

export type FinalizeRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  endedAt?: number;
};

export type ProcessFinalizedRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  force?: boolean;
};

export type NormalizeRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  options?: NormalizationOptions;
};

export type RecordingIdProjectRequest = RecordingProjectRequest & {
  recordingId: string;
};

export type MineRecordingEvidenceRequest = RecordingProjectRequest & {
  recordingId?: string;
  normalizedTimelineId?: string;
};

export type LearnTaskModelRequest = RecordingProjectRequest & {
  taskId?: string;
  miningRunId?: string;
};

export type ProposePolicyFromModelRequest = RecordingProjectRequest & {
  learnedTaskModelId?: string;
  miningRunId?: string;
  recordingId?: string;
};

export type ApprovePolicyProposalRequest = RecordingProjectRequest & {
  proposalId: string;
  targetTaskId?: string;
  policyOverride?: unknown;
  requireExistingTask?: boolean;
};

export type ReplayPolicyAgainstRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  policyId?: string;
};

export type InspectStateDiffRequest = {
  previous: StateSnapshot;
  current: StateSnapshot;
  includeStable?: boolean;
};

export type RevokeClientTrustRequest = {
  trustedClientId: string;
  reason?: string;
};

export type StartClientRecordingRequest = {
  sessionId: string;
  projectId?: string | null;
  taskId?: string;
  recordingId?: string;
  metadata?: JsonObject;
};

export type StopClientRecordingRequest = {
  sessionId: string;
};

export type CaptureClientSnapshotRequest = {
  sessionId: string;
  kind?: string;
  metadata?: JsonObject;
};

export type ExecuteClientActionRequest = {
  sessionId: string;
  command: ClientGatewayActionCommand;
};
