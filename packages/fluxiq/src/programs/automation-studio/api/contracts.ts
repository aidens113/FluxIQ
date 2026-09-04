import type { AutomationRecording, AutomationTask, DynamicPolicyArtifact } from "../types.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import type { NormalizedTimeline } from "../normalization/index.ts";
import type {
  AutomationStudioFlowArtifact,
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
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { ClientGatewayActionCommand } from "../../../client-gateway/index.ts";

export const AUTOMATION_STUDIO_ENDPOINTS = {
  performanceMetrics: "get-performance-metrics",
  snapshot: "snapshot",
  listProjectProblems: "list-project-problems",
  projects: "projects",
  createProject: "create-project",
  updateProject: "update-project",
  deleteProject: "delete-project",
  createProjectCategory: "create-project-category",
  updateProjectCategory: "update-project-category",
  deleteProjectCategory: "delete-project-category",
  reorderProjectCategories: "reorder-project-categories",
  getProjectHierarchy: "get-project-hierarchy",
  listProjectHierarchyChildren: "list-project-hierarchy-children",
  listProjectChangeFeed: "list-project-change-feed",
  saveProjectHierarchy: "save-project-hierarchy",
  putProjectHierarchyNode: "put-project-hierarchy-node",
  deleteProjectHierarchyNode: "delete-project-hierarchy-node",
  getProjectUiCache: "get-project-ui-cache",
  saveProjectUiCache: "save-project-ui-cache",
  deleteProjectUiCache: "delete-project-ui-cache",
  listProjectUiCacheStats: "list-project-ui-cache-stats",
  getProjectWorkspaceSummary: "get-project-workspace-summary",
  listRecordings: "list-recordings",
  listProjectArtifacts: "list-project-artifacts",
  listFlows: "list-flows",
  listFlowSummaries: "list-flow-summaries",
  listFlowMetadataPage: "list-flow-metadata-page",
  getFlowMetadataDetail: "get-flow-metadata-detail",
  createFlow: "create-flow",
  getFlow: "get-flow",
  saveFlow: "save-flow",
  updateFlowSettings: "update-flow-settings",
  getGraphViewport: "get-graph-viewport",
  applyGraphPatch: "apply-graph-patch",
  listGraphRevisions: "list-graph-revisions",
  createGraphSnapshot: "create-graph-snapshot",
  restoreGraphSnapshot: "restore-graph-snapshot",
  compileFlowSource: "compile-flow-source",
  convertFlowToVisual: "convert-flow-to-visual",
  deleteFlow: "delete-flow",
  publishFlow: "publish-flow",
  listFlowPublications: "list-flow-publications",
  deprecateFlowPublication: "deprecate-flow-publication",
  inspectFlowDependencies: "inspect-flow-dependencies",
  listPublishedFlowNodes: "list-published-flow-nodes",
  listNativeNodeDefinitions: "list-native-node-definitions",
  inspectFlowMigration: "inspect-flow-migration",
  migrateFlows: "migrate-flows",
  inspectLegacyRetirement: "inspect-legacy-retirement",
  recordLegacyRetirementEvidence: "record-legacy-retirement-evidence",
  exportLegacyProject: "export-legacy-project",
  verifyLegacyBackup: "verify-legacy-backup",
  sealLegacyWrites: "seal-legacy-writes",
  listLegacyRetirementAudit: "list-legacy-retirement-audit",
  planFlowMigrationRollback: "plan-flow-migration-rollback",
  rollbackFlowMigration: "rollback-flow-migration",
  getProjectArtifact: "get-project-artifact",
  saveProjectArtifact: "save-project-artifact",
  deleteProjectArtifact: "delete-project-artifact",
  getRecording: "get-recording",
  getRecordingEntryState: "get-recording-entry-state",
  getStateSnapshot: "get-state-snapshot",
  repairRecordingStateIndex: "repair-recording-state-index",
  createRecording: "create-recording",
  updateRecording: "update-recording",
  deleteRecording: "delete-recording",
  deleteRecordings: "delete-recordings",
  deleteProposal: "delete-proposal",
  getProposal: "get-proposal",
  appendRecordingEntry: "append-recording-entry",
  appendRecordingNote: "append-recording-note",
  appendRecordingMarker: "append-recording-marker",
  finalizeRecording: "finalize-recording",
  processFinalizedRecording: "process-finalized-recording",
  generateRecordingProposal: "generate-recording-proposal",
  normalizeRecording: "normalize-recording",
  createNormalizationReview: "create-normalization-review",
  listNormalizedTimelines: "list-normalized-timelines",
  listNormalizedTimelineSummaries: "list-normalized-timeline-summaries",
  getNormalizedTimeline: "get-normalized-timeline",
  listPipelineArtifacts: "list-pipeline-artifacts",
  mineRecordingEvidence: "mine-recording-evidence",
  learnTaskModel: "learn-task-model",
  proposePolicyFromModel: "propose-policy-from-model",
  approvePolicyProposal: "approve-policy-proposal",
  createRecordingFlowProposals: "create-recording-flow-proposals",
  reviewRecordingFlowProposal: "review-recording-flow-proposal",
  replayPolicyAgainstRecording: "replay-policy-against-recording",
  listRuntimeSessions: "list-runtime-sessions",
  getRuntimeSession: "get-runtime-session",
  listFlowSubflows: "list-flow-subflows",
  listFlowSubflowTargets: "list-flow-subflow-targets",
  getFlowSubflow: "get-flow-subflow",
  createFlowSubflow: "create-flow-subflow",
  updateFlowSubflow: "update-flow-subflow",
  renameFlowSubflow: "rename-flow-subflow",
  duplicateFlowSubflow: "duplicate-flow-subflow",
  disableFlowSubflow: "disable-flow-subflow",
  enableFlowSubflow: "enable-flow-subflow",
  archiveFlowSubflow: "archive-flow-subflow",
  deleteFlowSubflow: "delete-flow-subflow",
  listFlowInstructions: "list-flow-instructions",
  getFlowInstruction: "get-flow-instruction",
  getFlowInstructionSet: "get-flow-instruction-set",
  saveFlowInstruction: "save-flow-instruction",
  listFlowChangeProposals: "list-flow-change-proposals",
  getFlowChangeProposal: "get-flow-change-proposal",
  listFlowRuns: "list-flow-runs",
  getFlowRunDetail: "get-flow-run-detail",
  listFlowRunActions: "list-flow-run-actions",
  getFlowRunActionDetail: "get-flow-run-action-detail",
  listFlowRunEvents: "list-flow-run-events",
  getFlowRunEventDetail: "get-flow-run-event-detail",
  listFlowAdaptations: "list-flow-adaptations",
  getFlowAdaptation: "get-flow-adaptation",
  reviewFlowAdaptation: "review-flow-adaptation",
  getFlowRouter: "get-flow-router",
  getFlowRouterSummary: "get-flow-router-summary",
  listFlowRouterRoutes: "list-flow-router-routes",
  listFlowRouterTargetReferences: "list-flow-router-target-references",
  getFlowRouterGraphSummary: "get-flow-router-graph-summary",
  saveFlowMapRouteGroup: "save-flow-map-route-group",
  deleteFlowMapRouteGroup: "delete-flow-map-route-group",
  saveFlowMapRoute: "save-flow-map-route",
  saveFlowMapFallback: "save-flow-map-fallback",
  mutateFlowMapRoute: "mutate-flow-map-route",
  testFlowMapRouteCondition: "test-flow-map-route-condition",
  deleteFlowMapRoute: "delete-flow-map-route",
  startRuntimeSession: "start-runtime-session",
  runRuntimeSession: "run-runtime-session",
  cancelRuntimeSession: "cancel-runtime-session",
  exportFlowRunAudit: "export-flow-run-audit",
  inspectStateDiff: "inspect-state-diff",
  listSignalRegistries: "list-signal-registries",
  listRecordingDomains: "list-recording-domains",
  validateRecordingDomainEvent: "validate-recording-domain-event",
  appendRecordingDomainEvent: "append-recording-domain-event",
  clientGatewaySnapshot: "client-gateway-snapshot",
  listClientGatewayItems: "list-client-gateway-items",
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
  /** Null is a global project; a string scopes the project to one host domain. */
  domainId?: string | null;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioProjectCategory = {
  id: string;
  name: string;
  domainId?: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioHierarchyNode = {
  id: string;
  label: string;
  kind: "folder" | "client" | "proposal" | "flow" | "config" | "recording" | "run" | "task" | "routine";
  category: "client" | "proposal" | "flow" | "config" | "recording" | "run" | "task" | "routine";
  parentId: string | null;
  viewId?: string;
  sourceId?: string;
  recordingId?: string;
};

export type AutomationStudioProjectHierarchy = {
  customHierarchyNodes: AutomationStudioHierarchyNode[];
  deletedHierarchyIds: string[];
  workspacePrefs: JsonObject;
};

export type AutomationStudioHierarchyPageEntry = {
  entryId: string;
  parentEntryId: string | null;
  kind: string;
  ownerId: string;
  displayName: string;
  sortKey: string;
  depth: number;
  pathKey: string;
  isSystem: boolean;
  isDeleted: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioListHierarchyChildrenRequest = {
  projectId: string;
  parentId: string | null;
  cursor?: string | null;
  limit?: number;
};

export type AutomationStudioHierarchyChildrenPage = {
  items: AutomationStudioHierarchyPageEntry[];
  nextCursor: string | null;
  hasMore: boolean;
};
export type AutomationStudioProjectUiCacheEntry = {
  cacheKey: string;
  value: JsonValue;
  sizeBytes: number;
  updatedAt: number;
  contentRevision?: number;
  expiresAt?: number | null;
};

export type AutomationStudioProjectUiCachePutEntry = {
  cacheKey: string;
  value: JsonValue;
  contentRevision?: unknown;
  expiresAt?: unknown;
};

export type AutomationStudioGetProjectUiCacheRequest = {
  projectId: string;
  cacheKeys: string[];
};

export type AutomationStudioGetProjectUiCacheResponse = {
  entries: AutomationStudioProjectUiCacheEntry[];
  missingKeys: string[];
};

export type AutomationStudioSaveProjectUiCacheRequest = {
  projectId: string;
  entries: AutomationStudioProjectUiCachePutEntry[];
};

export type AutomationStudioSaveProjectUiCacheResponse = {
  entries: AutomationStudioProjectUiCacheEntry[];
};

export type AutomationStudioDeleteProjectUiCacheRequest = {
  projectId: string;
  cacheKeys?: string[];
};

export type AutomationStudioDeleteProjectUiCacheResponse = {
  deleted: number;
};

export type AutomationStudioListProjectUiCacheStatsRequest = {
  projectId?: string;
};

export type AutomationStudioProjectUiCacheStats = {
  projectId: string;
  entries: number;
  byteCount: number;
  expiredEntries: number;
  oldestUpdatedAt: number | null;
  newestUpdatedAt: number | null;
};

export type AutomationStudioListProjectUiCacheStatsResponse = {
  stats: AutomationStudioProjectUiCacheStats[];
};

export type AutomationStudioChangeFeedOperation = "create" | "update" | "delete" | "touch";

export type AutomationStudioChangeFeedEntityKind =
  | "project"
  | "flow"
  | "subflow"
  | "folder"
  | "recording"
  | "instruction"
  | "adaptation"
  | "runtime_run"
  | "hierarchy"
  | string;

export type AutomationStudioChangeFeedHierarchyScope = {
  kind: "project" | "flow" | "subflow" | "folder" | string;
  id?: string;
};

export type AutomationStudioProjectChangeFeedEvent = {
  projectId: string;
  sequence: number;
  transactionId: string;
  entityKind: AutomationStudioChangeFeedEntityKind;
  entityId: string;
  parentId?: string | null;
  operation: AutomationStudioChangeFeedOperation;
  revision: number;
  changedAt: number;
  hierarchyScope?: AutomationStudioChangeFeedHierarchyScope | null;
};

export type AutomationStudioProjectChangeFeedRequest = {
  projectId: string;
  afterSequence?: unknown;
  limit?: unknown;
};

export type AutomationStudioProjectChangeFeedPage = {
  events: AutomationStudioProjectChangeFeedEvent[];
  cursor: number;
  hasMore: boolean;
  fallback: boolean;
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
  summaries?: boolean;
  limit?: number;
  offset?: number;
};

export type FlowProjectRequest = {
  projectId: string;
};

export type FlowMetadataPageRequest = FlowProjectRequest & {
  status?: string;
  limit?: unknown;
  cursor?: unknown;
};

export type CreateFlowRequest = FlowProjectRequest & {
  name?: unknown;
  description?: unknown;
  flowId?: unknown;
};

export type SaveFlowRequest = FlowProjectRequest & {
  /** @deprecated Normal visual editor writes must use ApplyGraphPatchRequest. */
  flow: AutomationStudioFlowArtifact;
  expectedUpdatedAt?: number;
};

export type GraphViewportRequest = FlowIdProjectRequest & {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  cursor?: string | null;
  limit?: number;
  pinnedNodeIds?: string[];
};

export type GraphPatchOperation =
  | { op: "add_node"; node: Record<string, unknown> }
  | { op: "move_node"; nodeId: string; x: number; y: number }
  | { op: "set_node_parameters"; nodeId: string; values: JsonObject }
  | { op: "delete_node"; nodeId: string }
  | { op: "add_edge"; edge: Record<string, unknown> }
  | { op: "delete_edge"; edgeId: string };

export type ApplyGraphPatchRequest = FlowIdProjectRequest & {
  baseRevision: number;
  mutationId: string;
  operations: GraphPatchOperation[];
  message?: string;
};

export type ListGraphRevisionsRequest = FlowIdProjectRequest & { cursor?: string | null; limit?: number };
export type CreateGraphSnapshotRequest = FlowIdProjectRequest & { revisionNumber?: number; mutationId?: string };
export type RestoreGraphSnapshotRequest = FlowIdProjectRequest & { snapshotSha256: string; mutationId: string };

export const AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT = AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch;

export function assertAutomationStudioNormalEditorGraphEndpoint(endpoint: string): void {
  if (endpoint === AUTOMATION_STUDIO_ENDPOINTS.saveFlow || endpoint === AUTOMATION_STUDIO_ENDPOINTS.getFlow) {
    throw new Error("Normal visual editor graph requests must use graph viewport and patch endpoints, not full Flow document endpoints.");
  }
}

export type FlowIdProjectRequest = FlowProjectRequest & {
  flowId: string;
};

export type PublishFlowRequest = FlowIdProjectRequest & {
  version: string;
  /** @deprecated The service computes the authoritative digest from canonical IR. */
  flowDigest?: string;
  publishedBy?: string;
  changelog?: string;
};

export type DeprecateFlowPublicationRequest = FlowIdProjectRequest & { version: string; reason?: string };

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

export type DeleteRecordingsRequest = RecordingProjectRequest & {
  recordingIds: string[];
};

export type GetRecordingEntryStateRequest = {
  projectId: string;
  recordingId: string;
  entryId?: string;
  actionId?: string;
  stateSnapshotId?: string;
  includeState?: boolean;
};

export type GetStateSnapshotRequest = {
  projectId: string;
  recordingId: string;
  stateSnapshotId: string;
  includeState?: boolean;
};

export type RepairRecordingStateIndexRequest = {
  projectId: string;
  recordingId: string;
  mode: "dry_run" | "write";
};

export type GetProposalRequest = RecordingProjectRequest & {
  proposalId: string;
  kind?: "policy" | "recording_flow" | "auto";
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

export type NormalizedTimelineProjectRequest = RecordingProjectRequest & {
  normalizedTimelineId: string;
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
  targetFlowId?: string;
  requireExistingFlow?: boolean;
  /** @deprecated Compatibility alias; new callers target canonical Flows. */
  targetTaskId?: string;
  policyOverride?: unknown;
  requireExistingTask?: boolean;
};

export type ReplayPolicyAgainstRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  policyId?: string;
};

export type FlowExpansionSummaryRequest = FlowIdProjectRequest & {
  subflowId?: string;
  status?: string;
  risk?: string;
  role?: string;
  scopeKind?: string;
  requirement?: string;
  search?: string;
  sort?: "updated" | "started" | "duration" | "actions" | "name" | "title" | "status" | "role" | "scope" | "priority" | "risk" | "trigger";
  direction?: "asc" | "desc";
  limit?: unknown;
  offset?: unknown;
};

export type FlowSubflowRequest = FlowIdProjectRequest & {
  subflowId: string;
};

export type FlowInstructionRequest = FlowProjectRequest & {
  instructionId: string;
};

export type CreateFlowSubflowRequest = FlowIdProjectRequest & {
  name: string;
  description?: string;
  role?: string;
  parentCategoryId?: string | null;
  graphFlowId?: string;
  routeTags?: string[];
};

export type UpdateFlowSubflowRequest = FlowSubflowRequest & {
  expectedUpdatedAt?: number;
  name?: string;
  description?: string;
  role?: string;
  parentCategoryId?: string | null;
  routeTags?: string[];
  inputMapping?: Array<{ flowInputId: string; subflowInputId: string; required?: boolean }>;
  outputMapping?: Array<{ subflowOutputId: string; flowOutputId: string; required?: boolean }>;
  localInstructionIds?: string[];
  proposalModeOverride?: string | null;
  interventionModeOverride?: "fully_adaptive" | "manual_approval" | "no_llm_intervention" | null;
  graphFlowId?: string;
};

export type RenameFlowSubflowRequest = FlowSubflowRequest & {
  name: string;
};

export type DuplicateFlowSubflowRequest = FlowSubflowRequest & {
  name?: string;
};

export type SaveFlowMapRouteGroupRequest = FlowIdProjectRequest & {
  groupId?: string;
  name: string;
  description?: string;
  order?: unknown;
  status?: string;
  collapsed?: unknown;
};

export type DeleteFlowMapRouteGroupRequest = FlowIdProjectRequest & {
  groupId: string;
};

export type SaveFlowMapRouteRequest = FlowIdProjectRequest & {
  ruleId?: string;
  name: string;
  description?: string;
  targetSubflowId: string;
  order?: unknown;
  status?: string;
  groupId?: string | null;
  setAsFallback?: unknown;
  confidence?: unknown;
  conditionSummary?: string;
  conditionSignalPath?: string;
  conditionOperator?: string;
  conditionExpected?: unknown;
  clearCondition?: boolean;
};

export type SaveFlowMapFallbackRequest = FlowIdProjectRequest & {
  kind: "subflow" | "fail";
  targetSubflowId?: string;
  message?: string;
};
export type TestFlowMapRouteConditionRequest = FlowIdProjectRequest & {
  condition?: { signalPath: string; operator: string; expected?: unknown };
  inputs?: Record<string, unknown>;
  currentStateSummary?: Record<string, unknown>;
};

export type MutateFlowMapRouteRequest = FlowIdProjectRequest & {
  ruleId: string;
  action: "move_up" | "move_down" | "duplicate" | "toggle" | "delete";
};
export type DeleteFlowMapRouteRequest = FlowIdProjectRequest & {
  ruleId: string;
};

export type FlowInstructionSetRequest = FlowProjectRequest & {
  flowId?: string;
  subflowId?: string;
};

export type SaveFlowInstructionRequest = FlowIdProjectRequest & {
  instructionId?: string;
  title: string;
  body: string;
  scopeKind?: "global" | "project" | "flow" | "router" | "subflow" | "node" | "on_error" | "adaptation_review";
  routerId?: string;
  subflowId?: string;
  nodeId?: string;
  priority?: unknown;
  status?: string;
  requirement?: string;
  tags?: string[];
};

export type FlowChangeProposalRequest = FlowIdProjectRequest & {
  proposalId: string;
};

export type FlowRunDetailRequest = FlowProjectRequest & {
  runId: string;
  compact?: boolean;
};

export type FlowRunActionPageRequest = FlowProjectRequest & {
  runId: string;
  limit?: unknown;
  offset?: unknown;
  cursor?: string | null;
};

export type FlowRunEventPageRequest = FlowProjectRequest & {
  runId: string;
  afterSequence?: unknown;
  cursor?: string | null;
  limit?: unknown;
};

export type RuntimeSessionControlRequest = FlowProjectRequest & {
  runId: string;
  reason?: string;
};

export type FlowAdaptationRequest = FlowIdProjectRequest & {
  adaptationId: string;
};

export type ReviewFlowAdaptationRequest = FlowAdaptationRequest & {
  action: "approve" | "reject" | "apply" | "disable" | "revert" | "supersede" | "request_validation" | "switch_manual";
  reason?: string;
  supersededByAdaptationId?: string;
  authSessionId?: string;
  authorizationPin?: string;
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
