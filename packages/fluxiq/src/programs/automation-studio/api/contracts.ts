import type { AutomationRecording, AutomationTask, DynamicPolicyArtifact } from "../types";
import type { LearnedTaskModel } from "../learning";
import type { NormalizedTimeline } from "../normalization";
import type {
  AppendRecordingEntryInput,
  CreateRecordingSessionInput,
  PolicyGraph,
  RecordingDomainDefinition,
  RecordingDomainEventInput,
  RecordingSession,
  SignalRegistry,
  StateSnapshot
} from "../model";
import type { NormalizationOptions } from "../normalization";
import type { JsonObject } from "../../../core";
import type { ClientGatewayActionCommand } from "../../../client-gateway";

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
  getRecording: "get-recording",
  createRecording: "create-recording",
  appendRecordingEntry: "append-recording-entry",
  finalizeRecording: "finalize-recording",
  normalizeRecording: "normalize-recording",
  listNormalizedTimelines: "list-normalized-timelines",
  listRuntimeSessions: "list-runtime-sessions",
  startRuntimeSession: "start-runtime-session",
  runRuntimeSession: "run-runtime-session",
  inspectStateDiff: "inspect-state-diff",
  listSignalRegistries: "list-signal-registries",
  listRecordingDomains: "list-recording-domains",
  validateRecordingDomainEvent: "validate-recording-domain-event",
  appendRecordingDomainEvent: "append-recording-domain-event",
  clientGatewaySnapshot: "client-gateway-snapshot",
  createClientPairing: "create-client-pairing",
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
  kind: "folder" | "task" | "routine" | "config";
  category: "task" | "routine" | "config";
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

export type ListRecordingDomainsResponse = {
  domains: RecordingDomainDefinition[];
};

export type ValidateRecordingDomainEventRequest = RecordingDomainEventInput;

export type AppendRecordingDomainEventRequest = RecordingDomainEventInput;

export type FinalizeRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  endedAt?: number;
};

export type NormalizeRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  options?: NormalizationOptions;
};

export type InspectStateDiffRequest = {
  previous: StateSnapshot;
  current: StateSnapshot;
  includeStable?: boolean;
};

export type CreateClientPairingRequest = {
  projectId?: string | null;
  ttlMs?: number;
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
