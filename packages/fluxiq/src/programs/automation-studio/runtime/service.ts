import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import type { AutomationStudioSnapshot } from "../api/index.ts";
import type { AutomationStudioHierarchyChildrenPage, AutomationStudioHierarchyNode, AutomationStudioProject, AutomationStudioProjectCategory, AutomationStudioProjectChangeFeedPage, AutomationStudioProjectHierarchy } from "../api/contracts.ts";
import {
  appendRecordingEntry,
  appendRecordingNote,
  automationStudioFlowRepresentationKind,
  automationStudioInterventionMode,
  createAutomationStudioFixture,
  createBlankAutomationStudioFlow,
  createBlankAutomationStudioFlowArtifact,
  defaultAutomationStudioFlowSettingsMetadata,
  isAutomationStudioSubflowGraphMetadata,
  withAutomationStudioFlowRepresentation,
  withAutomationStudioInterventionMode,
  createPublishedFlowSnapshot,
  getCallFlowConfiguration,
  createRecordingSession,
  diffStateSnapshots,
  finalizeRecordingSession,
  type AutomationStudioConfigArtifact,
  type AutomationStudioFlowArtifact,
  type AutomationStudioAdaptationPolicy,
  type AutomationStudioFlowCatalogEntry,
  type AutomationStudioFlowAdaptation,
  type AutomationStudioFlowChangeProposal,
  type AutomationStudioFlowDocument,
  type AutomationStudioFlowInstruction,
  type AutomationStudioFlowIntervention,
  type AutomationStudioFlowMigrationLedger,
  type AutomationStudioFlowMigrationOutcome,
  type AutomationStudioFlowPublicationRecord,
  type AutomationStudioPublishedFlowSnapshot,
  type AutomationStudioFlowRepresentationKind,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowRouteGroup,
  type AutomationStudioFlowRouteRule,
  type AutomationStudioFlowRunDetail,
  type AutomationStudioFlowRunActionAttemptRecord,
  type AutomationStudioFlowRunRecoveryRecord,
  type AutomationStudioFlowRunSummary,
  AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION,
  type AutomationStudioFlowSubflow,
  AutomationStudioLegacyWriteDisabledError,
  type AutomationStudioFlowMigrationRollbackPlan,
  type AutomationStudioLegacyBackup,
  type AutomationStudioLegacyDeferredArtifact,
  type AutomationStudioLegacyImporterEvidence,
  type AutomationStudioLegacyRetirementAuditEvent,
  type AutomationStudioLegacyRetirementDiagnostic,
  type AutomationStudioLegacyRetirementReport,
  type AutomationStudioLegacyRetirementState,
  type AutomationStudioFlowOrigin,
  type AutomationStudioFlowScope,
  type AutomationStudioProjectArtifacts,
  type AutomationStudioProjectArtifactKind,
  type AutomationStudioRoutineArtifact,
  type AutomationStudioRuntimeSession,
  type AutomationStudioTaskArtifact,
  type AppendRecordingEntryInput,
  normalizeAutomationStudioElementTarget,
  type CreateRecordingSessionInput,
  type PolicyGraph,
  type PolicyNode,
  type RecordingDomainDefinition,
  type RecordingDomainEventInput,
  type RecordingDomainEventProcessingResult,
  RecordingDomainRegistry,
  type RecordingSession,
  type SignalRegistry,
  type StateSnapshot,
  processRecordingDomainEvent,
  resolveAutomationStudioFlowCatalog,
  validateAutomationStudioFlowAdaptation,
  validateAutomationStudioFlowRouter,
  validateAutomationStudioFlowSubflow,
  projectPublishedFlowSnapshotToNodeDefinition,
  validateFlowComposition,
  validateAutomationStudioFlow
} from "../model/index.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import { compileFlowSource, convertCodeOwnedFlowToVisual, generateFlowTypeScript, verifyCodeOwnedFlowCompilation, type AutomationStudioFlowCompilation } from "../dsl/index.ts";
import type { EvidenceClaim, EvidenceFact, EvidenceObservation, SignalMiningResult, StateActionCorrelation } from "../mining/index.ts";
import { normalizeRecordingTimeline, selectActionContextStateEntryIds, type NormalizationOptions, type NormalizedTimeline } from "../normalization/index.ts";
import { runAutomationStudioGraph, type AutomationStudioRecoveryBudget } from "./executor.ts";
import { runCanonicalAutomationStudioFlow } from "./composite-executor.ts";
import { runAutomationStudioRouter } from "./router-runtime.ts";
import { classifyAutomationStudioAdaptiveFailure, compactAutomationStudioAdaptiveFailure } from "./adaptive-orchestrator.ts";
import {
  annotateRunDetailWithTrainingMode,
  behaviorForAutomationStudioTrainingMode,
  computeAutomationStudioStabilityMetrics,
  decideAutomationStudioAdaptationPromotionGate,
  decideAutomationStudioTrainingBudget,
  type AutomationStudioStabilityMetrics,
  type AutomationStudioTrainingBudgetState,
  type AutomationStudioTrainingModeBehavior,
  type AutomationStudioTrainingModeSettings
} from "./training-modes.ts";
import {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD,
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST,
  AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES,
  resolveAutomationStudioLlmInstructions,
  resolveAutomationStudioLlmTokenLimits,
  runAutomationStudioLlmHarness,
  sanitizeAutomationStudioLlmFailureEvidence,
  type AutomationStudioLlmFailureEvidenceCaptureInput,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTokenLimits
} from "./llm/index.ts";
import { AutomationStudioLlmRunBudgetLedger } from "./llm/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopResult, type AutomationStudioLlmEvidenceLoopTrace, type AutomationStudioLlmEvidenceTool, type AutomationStudioLlmEvidenceToolExecutionResult } from "./llm/index.ts";
import { AutomationStudioFlowBootstrapGenerationError, flowBootstrapEvidenceCompletionFailure, flowBootstrapEvidenceLoopFailure, flowBootstrapHarnessFailure, flowBootstrapPhaseFailure, parseAutomationStudioFlowBootstrapGenerationError, type AutomationStudioFlowBootstrapFailureStage, type AutomationStudioFlowBootstrapPhaseFailureCode } from "./flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS, automationStudioFlowBootstrapCatalogByteBudget, buildAutomationStudioFlowBootstrapContext, isAutomationStudioEvidenceFlowBootstrapResultWithinLimits, parseAutomationStudioFlowBootstrapPlan, validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "./flow-bootstrap/index.ts";
import {
  assertAutomationStudioBootstrapHasNoRecordingProvenance,
  normalizeAutomationStudioFlowBuildPlan,
  type AutomationStudioBootstrapAccounting,
  type AutomationStudioBootstrapAdaptation,
  type AutomationStudioBootstrapAuditEvent
} from "./flow-bootstrap/index.ts";
import { executeAutomationStudioRuntimePatch, proposeAutomationStudioRuntimeTargetOverride, type AutomationStudioRuntimeTargetOverrideEvidenceValidation, type AutomationStudioRuntimeTargetOverrideFailedAction } from "./live-patch.ts";
import { packAutomationStudioReusableLlmContext, type AutomationStudioReusableLlmContextPacket, type AutomationStudioReusableLlmContextPackingResult } from "./reusable-llm-context.ts";
import type { AutomationStudioHostRuntimeBoundary } from "./host-runtime.ts";
import type { AutomationStudioNativeNodeRuntime } from "./native-node-runtime.ts";
import { finalizeRecordingStateLinks } from "./state-linker.ts";
import {
  recordingProposalDefinitionId,
  type RecordingFlowActionCandidate,
  type RecordingFlowProposalArtifact,
  type RecordingFlowProposalDestination
} from "./recording-flow-proposal.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioRecordingMapperCandidate, type AutomationStudioRecordingMapperObservation } from "../nodes/index.ts";
import {
  addRecordingPipelineArtifactId,
  createRecordingPipelineDocument,
  emptyPipelineIndex,
  emptyRecordingPipelineArtifacts,
  pipelineIndexKey,
  recordingPipelineId,
  upsertPipelineIndex,
  type PipelineArtifactKind,
  type PipelineIndex,
  type RecordingPipelineDocument
} from "./pipeline-model.ts";
import {
  average,
  asStringArray,
  createTaskProposalModelFromMiningRun,
  humanTaskName,
  mergeProposalPatchIntoPolicy,
  policyGraphToAutomationStudioFlow,
  uniqueEvidenceReferences,
  withPolicyOutgoingEdges,
  type PolicyGraphPatch,
  type PolicyProposalArtifact
} from "./policy-model.ts";
export type { PolicyGraphPatch, PolicyProposalArtifact } from "./policy-model.ts";
export type { RecordingFlowActionCandidate, RecordingFlowProposalArtifact, RecordingFlowProposalDestination } from "./recording-flow-proposal.ts";
import {
  AutomationStudioFlowPaths,
  AutomationStudioProjectPaths,
  AutomationStudioLegacyRetirementStore,
  AutomationStudioBootstrapAdaptationStore,
  AutomationStudioObjectDocuments,
  AutomationStudioFlowStore,
  AutomationStudioAdaptationPatches,
  AutomationStudioDurableAdaptations,
  automationStudioFacadePorts,
  AutomationStudioCatalogue,
  AutomationStudioSummaryStore,
  SUBFLOW_SUMMARY_MIGRATION_IO_CONCURRENCY,
  adaptiveRuntimeMetricsFromRunDetail,
  flowRunSummaryWithInterventionSummaries,
  instructionSummaryFromInstruction,
  runtimeSessionToFlowRunDetail,
  runtimeSummaryFromSession,
  type AutomationStudioAdaptationSummaryPage,
  type AutomationStudioFlowRunSummaryPage,
  flowPublicationId,
  AutomationStudioFlowMutations,
  adaptationRequiresChangeProposal,
  AutomationStudioFlowWriter,
  subflowFeedRevision,
  subflowSummaryFromSubflow,
  type CreateFlowSubflowInput,
  flowScopeForProject,
  sameFlowScope,
  withFlowSourceFileMetadata,
  AutomationStudioProjectStore,
  AutomationStudioRecordingStore,
  PIPELINE_ARTIFACT_IO_CONCURRENCY,
  emptyPipelineArtifactIdSets,
  mapWithConcurrency,
  pipelineArtifactKinds,
  flowMapRouteGroups,
  flowMapSortedRules,
  flowSubflowCategoriesFromFlow,
  flowSummaryFromFlow,
  isJsonRecord,
  jsonObjectFromUnknown,
  removeUndefinedSubflowFields,
  sqlInstructionRequirement,
  sqlInstructionStatus,
  stringOrNull,
  subflowParentCategoryId,
  uniqueStrings,
  upsertBy,
  compactJsonObject,
  errorMessage,
  AutomationStudioProposalGeneration,
  AutomationStudioFlowSubflowMigration,
  AutomationStudioProposalApproval,
  clampInteger,
  subflowSummaryFromSql,
  type AutomationStudioInstructionSummaryPage,
  canonicalFlowDocument,
  type AutomationStudioSubflowSummaryPage,
  type CreateRecordingFlowProposalsResult,
  type GenerateRecordingProposalInput,
  type GenerateRecordingProposalResult,
  type NormalizationReviewArtifact,
  type ProcessFinalizedRecordingResult,
  readableTokenValue,
  AutomationStudioEvidenceMining,
  isStateSnapshotObject,
  type AutomationStudioWriteProjectObjectAssetInput,
  type AutomationStudioWriteProjectObjectAssetResult,
  AutomationStudioServiceLocks,
  AutomationStudioServiceUiCache,
  legacyArtifactsDigest,
  legacyDiagnostic,
  stableJson,
  normalizeProjectCategories,
  AutomationStudioRecordingPaths,
  AutomationStudioServiceIndexes,
  emptyFlowAdaptationIndex,
  emptyFlowRunIndex,
  emptyFlowSubflowIndex,
  projectArtifactDocumentFileName,
  type AutomationStudioAdaptationPolicySummary,
  type AutomationStudioAdaptationSummary,
  type AutomationStudioChangeProposalSummary,
  type AutomationStudioInstructionSummary,
  type AutomationStudioRouterSummary,
  type AutomationStudioProjectIndex,
  type AutomationStudioProjectRecord,
  type AutomationStudioSubflowSummary,
  type FlowAdaptationIndex,
  type FlowAdaptationPolicyIndex,
  type FlowChangeProposalIndex,
  type FlowInstructionIndex,
  type FlowRouterIndex,
  type FlowRunIndex,
  type FlowSubflowIndex,
  type RecordingIndex,
  type RuntimeIndex,
} from "./service/index.ts";
export type { AutomationStudioInstructionSummaryPage, AutomationStudioSubflowSummaryPage } from "./service/index.ts";
export type { CreateRecordingFlowProposalsResult, GenerateRecordingProposalInput, GenerateRecordingProposalResult, NormalizationReviewArtifact, ProcessFinalizedRecordingResult } from "./service/index.ts";
export type { AutomationStudioAdaptationPolicySummary, AutomationStudioAdaptationSummary, AutomationStudioAdaptationSummaryPage, AutomationStudioChangeProposalSummary, AutomationStudioFlowRunSummaryPage, AutomationStudioInstructionSummary, AutomationStudioRouterSummary, AutomationStudioSubflowSummary, AutomationStudioWriteProjectObjectAssetInput, AutomationStudioWriteProjectObjectAssetResult, CreateFlowSubflowInput } from "./service/index.ts";
import { ProgramJsonStore, programDataFile, safeSegment } from "../../_shared/storage.ts";
import { createRecord, SQLiteRepository } from "../../database-manager/storage/sqlite-repository.ts";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../nodes/index.ts";
import type { IoRegistry } from "../../../io/index.ts";
import type { RuntimeService } from "../../../runtime/index.ts";
import { createIoPolicyEffectDispatcher, createRuntimePolicyEffectDispatcher } from "./io-policy.ts";
import {
  type CanonicalAutomationStudioRepositories,
  createCanonicalAutomationStudioMemoryRepositories,
  AutomationStudioObjectStore,
  AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES,
  automationStudioObjectApiPath,
  isAutomationStudioObjectReference,
  parseAutomationStudioObjectContentRef,
  type AutomationStudioObjectAsset,
  projectSummaryFromProject,
  type AutomationStudioFlowSummary,
  type AutomationStudioFlowSummaryIndex,
  type AutomationStudioProposalSummary,
  type AutomationStudioRecordingSummary,
  type AutomationStudioRuntimeRunSummary,
  type AutomationStudioRuntimeRunSummaryPage,
  type AutomationStudioWorkspaceSummary,
  AutomationStudioLazySqliteUiCacheStore,
  AutomationStudioMemoryUiCacheStore,
  type AutomationStudioUiCacheEntry,
  type AutomationStudioUiCacheStats,
  type AutomationStudioUiCacheStore,
  RecordingStateIndexStore,
  AutomationStudioProjectAdministration,
  AutomationStudioProjectAdaptationStore,
  AutomationStudioProjectDatabasePool,
  AutomationStudioProjectGraphRepository,
  AutomationStudioProjectFlowResourceRepository,
  AutomationStudioProjectHierarchyRepository,
  AutomationStudioProjectRuntimeStreamStore,
  AutomationStudioProjectReusableLlmContextStore,
  type AutomationStudioProjectContentProtection,
  type AutomationStudioReusableLlmContextList,
  type AutomationStudioReusableLlmContextRecord,
  type AutomationStudioReusableLlmContextWrite,
  type AutomationStudioFlowResourcePage,
  type AutomationStudioSqlFlowDetail,
  type AutomationStudioSqlFlowRecord,
  type AutomationStudioSqlInstructionScope,
  type AutomationStudioSqlInstructionSummary,
  type AutomationStudioSqlRouter,
  type AutomationStudioSqlRouterRoute,
  type AutomationStudioSqlSubflow,
  type AutomationStudioRuntimeEventPage,
  type AutomationStudioGraphPatchOperation,
  type AutomationStudioGraphPatchResult,
  type AutomationStudioGraphBounds,
  type AutomationStudioGraphViewportPage,
  automationStudioFilterHash,
  automationStudioPageLimit,
  decodeAutomationStudioPageCursor,
  encodeAutomationStudioPageCursor,
  emptyFlowSummaryIndex
} from "../storage/index.ts";
import {
  emptyRecordingIndex,
  recordingIndexStateObjectRefs,
  recordingActionVisualTargetIndexItem,
  sortRecordingIndex,
  type RecordingEntryIndexItem,
  type RecordingIndex as RecordingStateIndex,
  type RecordingStateIndexItem
} from "../storage/state-index.ts";

export type AutomationStudioServiceOptions = {
  dataDir?: string;
  storageRootDir?: string;
  customNodeRootDir?: string;
  repositories?: CanonicalAutomationStudioRepositories;
  llmProviderResolver?: (input: AutomationStudioLlmProviderResolverInput) => AutomationStudioLlmProviderResolution | AutomationStudioLlmProvider | undefined | Promise<AutomationStudioLlmProviderResolution | AutomationStudioLlmProvider | undefined>;
  llmEvidenceRuntime?: {
    tools: AutomationStudioLlmEvidenceTool[];
    executeTool(input: { projectId: string; flowId: string; callId: string; toolId: string; value: JsonObject; maxEvidenceBytes: number; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
    captureSanitizedFailureEvidence?(input: AutomationStudioLlmFailureEvidenceCaptureInput): Promise<JsonObject | undefined>;
    validateTargetOverrideEvidence?(evidence: JsonObject, target: { selector: string }, failedAction: AutomationStudioRuntimeTargetOverrideFailedAction): AutomationStudioRuntimeTargetOverrideEvidenceValidation;
  };
  revokeLlmExecutionGrant?: (grantId: string) => void;
  closeLlmExecutionGrants?: () => void;
  hostRuntime?: AutomationStudioHostRuntimeBoundary;
  uiCacheStore?: AutomationStudioUiCacheStore;
  seedFixture?: boolean;
  reusableLlmContext?: {
    enabled?: boolean;
    contentProtection?: AutomationStudioProjectContentProtection;
    selectForFreshEvidence?: (input: AutomationStudioReusableLlmContextFreshEvidenceInput) => AutomationStudioReusableLlmContextSelection | undefined | Promise<AutomationStudioReusableLlmContextSelection | undefined>;
  };
};

export type AutomationStudioReusableLlmContextFreshEvidenceInput = {
  taskKind: "flow_bootstrap" | "runtime_diagnosis" | "runtime_patch";
  projectId: string;
  flowId: string;
  subflowId?: string;
  freshEvidence: JsonValue;
  freshEvidenceCount: number;
};

export type AutomationStudioReusableLlmContextSelection = Pick<AutomationStudioReusableLlmContextList,
  "domainId" | "evidenceKind" | "evidenceSchemaVersion" | "sanitizerVersion" | "compatibilityTags"
>;

export type AutomationStudioReusableLlmContextHostConfiguration = {
  enabled: true;
  contentProtection: AutomationStudioProjectContentProtection;
  selectForFreshEvidence: NonNullable<NonNullable<AutomationStudioServiceOptions["reusableLlmContext"]>["selectForFreshEvidence"]>;
};

export type AutomationStudioReusableLlmContextSummary = Omit<AutomationStudioReusableLlmContextRecord, "promptProjection">;
export type AutomationStudioReusableLlmContextFeatureStatus = {
  enabled: boolean;
  writeEnabled: boolean;
  contentProtection: string;
  blockerCode?: "reusable_context.content_protection_unavailable";
};

export type AutomationStudioLlmProviderResolution = {
  provider: AutomationStudioLlmProvider;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  maxCallsPerRun?: number;
  maxEstimatedCostUsd?: number;
  maxTotalEstimatedCostUsd?: number;
  timeoutMs?: number;
};

export type AutomationStudioLlmProviderResolverInput = {
  projectId: string;
  flowId: string;
  providerId?: string;
  modelId?: string;
  metadata?: JsonObject;
  executionGrant?:
    | { grantId: string; actorUserId: string; actorSessionId: string; purpose: "diagnosis_only" }
    | { grantId: string; actorUserId: string; actorSessionId: string; purpose: "diagnose_and_adapt" }
    | AutomationStudioBuildAndAdaptExecutionGrant;
};

export type AutomationStudioBuildAndAdaptExecutionGrant = {
  grantId: string;
  actorUserId: string;
  actorSessionId: string;
  purpose: "build_and_adapt";
  executionDigest: string;
  settingsRevision: number;
};

export type AutomationStudioGenerateFlowBootstrapAdaptationInput = {
  projectId: string;
  flowId: string;
  executionGrant: AutomationStudioBuildAndAdaptExecutionGrant;
  evidenceGuided?: true;
  useReusableContext?: true;
};

export type AutomationStudioGenerateFlowBootstrapAdaptationResult = {
  projectId: string;
  flowId: string;
  adaptationId: string;
  status: "proposed";
  riskLevel: AutomationStudioBootstrapAdaptation["riskLevel"];
  sourceInstructionIds: string[];
  baseDependencyDigest: string;
  baseSettingsRevision: number;
  accounting: {
    requestId: string;
    estimatedInputTokens: number;
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
};
export type RecordingEntryStateLookupInput = {
  projectId: string;
  recordingId: string;
  entryId?: string;
  actionId?: string;
  stateSnapshotId?: string;
  includeState?: boolean;
};

export type RecordingEntryStateLookupResult = {
  recordingId: string;
  requested: {
    entryId?: string;
    actionId?: string;
    stateSnapshotId?: string;
  };
  resolved: {
    stateSnapshotId: string;
    entryId: string;
    stateRef: string;
    screenshotRef?: string;
  } | null;
  state?: StateSnapshot;
  reason?: string;
};

export type RepairRecordingStateIndexResult = {
  recordingId: string;
  mode: "dry_run" | "write";
  index: RecordingStateIndex;
  warnings: string[];
};

export type AutomationStudioFlowMigrationInspection = {
  projectId: string;
  backupId: string;
  outcomes: AutomationStudioFlowMigrationOutcome[];
  migrationNeeded: boolean;
};

export type AutomationStudioSubflowTargetPage = {
  subflows: AutomationStudioSubflowSummary[];
  total: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type AutomationStudioRouterRoutePage = {
  routes: AutomationStudioFlowRouteRule[];
  groups: AutomationStudioFlowRouteGroup[];
  counts: { total: number; active: number; disabled: number; byGroup: Record<string, number> };
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type AutomationStudioRouterTargetReferenceBatch = {
  targets: Array<{
    subflowId: string;
    total: number;
    hasMore: boolean;
    references: Array<{
      id: string;
      kind: "route" | "fallback";
      name: string;
      status: string;
      order: number | "fallback";
      condition?: JsonValue;
      conditionLabel?: string;
    }>;
  }>;
  perTargetLimit: number;
};

export type AutomationStudioChangeProposalSummaryPage = {
  changeProposals: AutomationStudioChangeProposalSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type AutomationStudioFlowRunActionPage = {
  actions: AutomationStudioFlowRunActionAttemptRecord[];
  total: number;
  limit: number;
  offset: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type AutomationStudioRuntimeAdaptationContext = {
  projectId: string;
  flowId: string;
  settings: AutomationStudioTrainingModeSettings;
  policy: AutomationStudioAdaptationPolicy;
  behavior: AutomationStudioTrainingModeBehavior;
  metrics: AutomationStudioStabilityMetrics;
  budgetState: AutomationStudioTrainingBudgetState;
  budgetDecision: ReturnType<typeof decideAutomationStudioTrainingBudget>;
  runsCompleted: number;
  recentRunCount: number;
  recentAdaptationCount: number;
  diagnostics: string[];
};

export type AutomationStudioProblemPage = {
  problems: import("../api/contracts.ts").AutomationStudioProblem[];
  total: number;
  counts: { error: number; warning: number; info: number };
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type UpdateFlowSubflowInput = {
  projectId: string;
  flowId: string;
  subflowId: string;
  expectedUpdatedAt?: number;
  name?: string;
  description?: string;
  role?: AutomationStudioFlowSubflow["role"];
  parentCategoryId?: string | null;
  routeTags?: string[];
  inputMapping?: AutomationStudioFlowSubflow["inputMapping"];
  outputMapping?: AutomationStudioFlowSubflow["outputMapping"];
  localInstructionIds?: string[];
  proposalModeOverride?: AutomationStudioFlowSubflow["proposalModeOverride"] | null;
  interventionModeOverride?: AutomationStudioFlowSubflow["interventionModeOverride"] | null;
  graphFlowId?: string;
};

export type UpsertFlowMapRouteGroupInput = {
  projectId: string;
  flowId: string;
  groupId?: string;
  name: string;
  description?: string;
  order?: unknown;
  status?: AutomationStudioFlowRouteGroup["status"];
  collapsed?: boolean;
};

export type UpsertFlowMapRouteInput = {
  projectId: string;
  flowId: string;
  ruleId?: string;
  name: string;
  description?: string;
  targetSubflowId: string;
  order?: unknown;
  status?: AutomationStudioFlowRouteRule["status"];
  groupId?: string | null;
  setAsFallback?: boolean;
  confidence?: unknown;
  conditionSummary?: string;
  conditionSignalPath?: string;
  conditionOperator?: string;
  conditionExpected?: unknown;
  clearCondition?: boolean;
};

export type ReviewFlowAdaptationInput = {
  projectId: string;
  flowId: string;
  adaptationId: string;
  action: "approve" | "reject" | "apply" | "disable" | "revert" | "supersede" | "request_validation" | "switch_manual";
  actorId?: string;
  reason?: string;
  supersededByAdaptationId?: string;
};

export type RecordingSummaryItem = {
  id: string;
  title: string;
  status: "recording" | "completed";
  projectId: string;
  taskId: string | null;
  eventCount: number;
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
};

export type RecordingSummaryList = {
  items: RecordingSummaryItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ReplayResultArtifact = {
  schemaVersion: "0.1";
  replayId: string;
  recordingId: string;
  policyId: string;
  status: "matched" | "partial" | "failed";
  matchedActions: number;
  expectedActions: number;
  missingActions: string[];
  unexpectedActions: string[];
  timingWarnings: string[];
  generatedAt: number;
};

export type AutomationPipelineArtifacts = {
  normalizationReviews: NormalizationReviewArtifact[];
  miningRuns: SignalMiningResult[];
  evidenceFacts: EvidenceFact[];
  evidenceObservations: EvidenceObservation[];
  stateActionCorrelations: StateActionCorrelation[];
  evidenceClaims: EvidenceClaim[];
  learnedTaskModels: LearnedTaskModel[];
  policyProposals: PolicyProposalArtifact[];
  recordingFlowProposals: RecordingFlowProposalArtifact[];
  replayResults: ReplayResultArtifact[];
};

export class AutomationStudioService {
  private readonly repositories: CanonicalAutomationStudioRepositories;
  private readonly nodeRootDir?: string;
  private readonly recordingDomains = new RecordingDomainRegistry();
  private readonly objectStore?: AutomationStudioObjectStore;
  private readonly recordingStateIndexes?: RecordingStateIndexStore;
  private readonly projectDatabasePool?: AutomationStudioProjectDatabasePool;
  private readonly runtimeProjectDatabasePool?: AutomationStudioProjectDatabasePool;
  // Collaborators extracted from this class. The facade owns their wiring and
  // keeps every public method; each owns one slice of the project storage layer.
  private readonly projectPaths: AutomationStudioProjectPaths;
  private readonly flowPaths: AutomationStudioFlowPaths;
  private readonly recordingPaths: AutomationStudioRecordingPaths;
  private readonly projects: AutomationStudioProjectStore;
  private readonly indexes: AutomationStudioServiceIndexes;
  private readonly legacy: AutomationStudioLegacyRetirementStore;
  private readonly uiCache: AutomationStudioServiceUiCache;
  private readonly bootstrapAdaptations: AutomationStudioBootstrapAdaptationStore;
  private readonly objectDocuments: AutomationStudioObjectDocuments;
  private readonly flows: AutomationStudioFlowStore;
  private readonly recordings: AutomationStudioRecordingStore;
  private readonly flowWriter: AutomationStudioFlowWriter;
  private readonly flowMutations: AutomationStudioFlowMutations;
  private readonly adaptationPatches: AutomationStudioAdaptationPatches;
  private readonly durableAdaptations: AutomationStudioDurableAdaptations;
  private readonly catalogue: AutomationStudioCatalogue;
  private readonly summaries: AutomationStudioSummaryStore;
  private readonly evidenceMining: AutomationStudioEvidenceMining;
  private readonly proposalGeneration: AutomationStudioProposalGeneration;
  private readonly flowSubflowMigration: AutomationStudioFlowSubflowMigration;
  private readonly proposalApproval: AutomationStudioProposalApproval;
  private readonly locks = new AutomationStudioServiceLocks();
  private readonly repairedRecordingStateIndexReads = new Set<string>();
  private readonly ready: Promise<void>;
  private ioRuntime?: { io: IoRegistry; domainId: string | null };
  private nativeNodeRuntime?: AutomationStudioNativeNodeRuntime;
  private hostRuntime: AutomationStudioHostRuntimeBoundary | undefined;
  private runtimeService?: RuntimeService;
  private llmProviderResolver?: AutomationStudioServiceOptions["llmProviderResolver"];
  private llmEvidenceRuntime?: AutomationStudioServiceOptions["llmEvidenceRuntime"];
  private revokeLlmExecutionGrant?: AutomationStudioServiceOptions["revokeLlmExecutionGrant"];
  private closeLlmExecutionGrants?: AutomationStudioServiceOptions["closeLlmExecutionGrants"];
  private readonly runtimeAbortControllers = new Map<string, AbortController>();
  private readonly adaptiveRuntimeAdmissions = new Set<string>();
  private reusableLlmContextEnabled: boolean;
  private reusableLlmContextContentProtection: AutomationStudioProjectContentProtection | undefined;
  private reusableLlmContextFreshEvidenceSelector: NonNullable<AutomationStudioServiceOptions["reusableLlmContext"]>["selectForFreshEvidence"];

  constructor(options: AutomationStudioServiceOptions = {}) {
    this.repositories = options.repositories ?? createCanonicalAutomationStudioMemoryRepositories();
    this.llmProviderResolver = options.llmProviderResolver;
    this.llmEvidenceRuntime = options.llmEvidenceRuntime;
    this.revokeLlmExecutionGrant = options.revokeLlmExecutionGrant;
    this.closeLlmExecutionGrants = options.closeLlmExecutionGrants;
    this.hostRuntime = options.hostRuntime;
    this.reusableLlmContextEnabled = options.reusableLlmContext?.enabled === true;
    this.reusableLlmContextContentProtection = options.reusableLlmContext?.contentProtection;
    this.reusableLlmContextFreshEvidenceSelector = options.reusableLlmContext?.selectForFreshEvidence;
    let uiCacheStore = options.uiCacheStore;
    let projectRootDir: string | undefined;
    if (options.dataDir || options.storageRootDir) {
      const automationDataDir = options.storageRootDir ?? path.join(options.dataDir!, "programs", "automation-studio");
      uiCacheStore ??= new AutomationStudioLazySqliteUiCacheStore({ rootDir: automationDataDir });
      if (options.storageRootDir) {
        this.objectStore = new AutomationStudioObjectStore(automationDataDir);
        this.recordingStateIndexes = new RecordingStateIndexStore(automationDataDir);
      }
      this.runtimeProjectDatabasePool = new AutomationStudioProjectDatabasePool({ rootDir: automationDataDir });
      this.projectDatabasePool = this.runtimeProjectDatabasePool;
      projectRootDir = path.join(automationDataDir, "projects");
      const nodeRootDir = options.customNodeRootDir ?? (options.storageRootDir ? undefined : path.join(automationDataDir, "nodes"));
      if (nodeRootDir) this.nodeRootDir = nodeRootDir;
    }
    this.projectPaths = new AutomationStudioProjectPaths(projectRootDir);
    this.projects = new AutomationStudioProjectStore(this.projectPaths, options.dataDir);
    this.flowPaths = new AutomationStudioFlowPaths(this.projectPaths);
    this.recordingPaths = new AutomationStudioRecordingPaths(this.projectPaths);
    this.indexes = new AutomationStudioServiceIndexes(this.projectPaths, this.projects);
    this.legacy = new AutomationStudioLegacyRetirementStore(this.projectPaths, this.projects, this.objectStore);
    this.bootstrapAdaptations = new AutomationStudioBootstrapAdaptationStore(this.projectPaths, this.flowPaths, this.projects);
    this.objectDocuments = new AutomationStudioObjectDocuments(this.projectPaths, this.recordingPaths, this.projects, this.objectStore);
    this.flows = new AutomationStudioFlowStore(this.projectPaths, this.flowPaths, this.projects, this.indexes, this.repositories, this.projectDatabasePool);
    this.recordings = new AutomationStudioRecordingStore(this.projectPaths, this.recordingPaths, this.projects, this.indexes, this.objectDocuments, this.repositories, this.objectStore);
    this.flowWriter = new AutomationStudioFlowWriter(this.projectPaths, this.flowPaths, this.projects, this.indexes, this.flows, this.legacy, this.objectDocuments, this.repositories, automationStudioFacadePorts(this), this.runtimeProjectDatabasePool);
    this.flowMutations = new AutomationStudioFlowMutations(this.projectPaths, this.flowPaths, this.projects, this.indexes, this.flows, this.flowWriter, automationStudioFacadePorts(this));
    this.adaptationPatches = new AutomationStudioAdaptationPatches(this.flows, this.flowWriter, this.flowMutations, automationStudioFacadePorts(this));
    this.durableAdaptations = new AutomationStudioDurableAdaptations(this.flows, this.flowWriter, this.flowMutations, this.adaptationPatches, automationStudioFacadePorts(this));
    this.catalogue = new AutomationStudioCatalogue(this.projectPaths, this.projects, this.indexes, this.flows, this.repositories);
    this.summaries = new AutomationStudioSummaryStore(this.projectPaths, this.flowPaths, this.projects, this.indexes, this.flows, this.flowMutations, this.bootstrapAdaptations, automationStudioFacadePorts(this), this.runtimeProjectDatabasePool);
    this.evidenceMining = new AutomationStudioEvidenceMining(this.recordingDomains, this.recordings, this.repositories, automationStudioFacadePorts(this));
    this.flowSubflowMigration = new AutomationStudioFlowSubflowMigration(this.flowWriter, automationStudioFacadePorts(this));
    this.proposalApproval = new AutomationStudioProposalApproval(this.projectPaths, this.projects, this.recordings, this.repositories, this.flowSubflowMigration, automationStudioFacadePorts(this));
    this.proposalGeneration = new AutomationStudioProposalGeneration(this.recordings, automationStudioFacadePorts(this));
    this.uiCache = new AutomationStudioServiceUiCache(uiCacheStore ?? new AutomationStudioMemoryUiCacheStore(), this.projects);
    this.ready = options.seedFixture === true ? this.seedFixture() : Promise.resolve();
    this.recordings.bindReady(this.ready);
  }

  bindLlmExecutionProvider(
    resolver: NonNullable<AutomationStudioServiceOptions["llmProviderResolver"]>,
    revoke: NonNullable<AutomationStudioServiceOptions["revokeLlmExecutionGrant"]>,
    close?: NonNullable<AutomationStudioServiceOptions["closeLlmExecutionGrants"]>
  ): this {
    this.llmProviderResolver = resolver;
    this.revokeLlmExecutionGrant = revoke;
    this.closeLlmExecutionGrants = close;
    return this;
  }

  bindLlmEvidenceRuntime(runtime: NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>): this {
    this.llmEvidenceRuntime = runtime;
    return this;
  }

  bindReusableLlmContext(configuration: AutomationStudioReusableLlmContextHostConfiguration): this {
    if (configuration.enabled !== true
      || !configuration.contentProtection
      || typeof configuration.contentProtection.providerId !== "string"
      || !/^[A-Za-z0-9._:-]{1,200}$/u.test(configuration.contentProtection.providerId)
      || typeof configuration.contentProtection.seal !== "function"
      || typeof configuration.contentProtection.open !== "function"
      || typeof configuration.selectForFreshEvidence !== "function") {
      throw new Error("Reusable LLM context host configuration is invalid.");
    }
    this.reusableLlmContextEnabled = true;
    this.reusableLlmContextContentProtection = configuration.contentProtection;
    this.reusableLlmContextFreshEvidenceSelector = configuration.selectForFreshEvidence;
    return this;
  }

  async close(): Promise<void> {
    this.closeLlmExecutionGrants?.();
    await this.uiCache.close();
    await this.runtimeProjectDatabasePool?.closeAll();
  }

  /** Connects Automation Studio policy execution to importer-registered IO. */
  bindIoRuntime(io: IoRegistry, domainId?: string | null): this {
    this.ioRuntime = { io, domainId: domainId ?? null };
    return this;
  }

  /** Binds explicitly registered importer and trusted-local Code Node implementations. */
  bindNativeNodeRuntime(runtime: AutomationStudioNativeNodeRuntime): this { this.nativeNodeRuntime = runtime; return this; }

  bindHostRuntime(runtime: AutomationStudioHostRuntimeBoundary): this { this.hostRuntime = runtime; return this; }

  bindRuntimeService(runtime: RuntimeService): this { this.runtimeService = runtime; return this; }

  nativeRuntimeSummary(domainId?: string | null): { bound: boolean; definitionCount: number; recordingMapperCount: number } {
    const runtime = this.nativeNodeRuntime;
    return {
      bound: Boolean(runtime),
      definitionCount: runtime?.listDefinitions().length ?? 0,
      recordingMapperCount: runtime && domainId ? runtime.listRecordingMappers(domainId).length : 0
    };
  }

  async readProjectObjectAsset(projectId: string, sha256: string): Promise<AutomationStudioObjectAsset> {
    return await this.objectDocuments.readProjectObjectAsset(projectId, sha256);
  }

  async writeProjectObjectAsset(input: AutomationStudioWriteProjectObjectAssetInput): Promise<AutomationStudioWriteProjectObjectAssetResult> {
    return await this.objectDocuments.writeProjectObjectAsset(input);
  }

  async snapshot(domainId?: string | null, options: { includeCanonical?: boolean } = { includeCanonical: true }): Promise<AutomationStudioSnapshot> {
    await this.ready;
    const includeCanonical = options.includeCanonical !== false;
    return {
      tasks: [],
      recordings: [],
      policies: [],
      canonical: {
        recordingSessions: includeCanonical ? await this.repositories.recordingSessions.list(domainId) : [],
        normalizedTimelines: includeCanonical ? await this.repositories.normalizedTimelines.list(domainId) : [],
        signalRegistries: includeCanonical ? await this.repositories.signalRegistries.list(domainId) : [],
        learnedTaskModels: includeCanonical ? await this.repositories.learnedTaskModels.list(domainId) : [],
        policyGraphs: includeCanonical ? await this.repositories.policyGraphs.list(domainId) : []
      },
      problems: [
        {
          id: "automation-studio.host-artifacts",
          severity: "info",
          message: "Automation Studio is ready for host-owned artifacts. Create or load a project to begin recording and authoring."
        }
      ]
    };
  }

  async listRecordingSessions(projectId?: string | null): Promise<RecordingSession[]> {
    await this.ready;
    if (projectId) await this.loadProjectRecordings(projectId);
    return await this.repositories.recordingSessions.list();
  }

  async listRecordingSessionSummaries(projectId?: string | null): Promise<RecordingSession[]> {
    await this.ready;
    if (!projectId || !this.projectPaths.root) {
      return (await this.listRecordingSessions(projectId)).map(summaryRecordingSession);
    }
    const index = await this.indexes.readRecordingIndex(projectId);
    return (index.recordings ?? []).map((item) => summaryRecordingSession({
      schemaVersion: "0.1",
      recordingId: item.recordingId,
      ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
      startedAt: item.startedAt,
      ...(item.endedAt !== undefined ? { endedAt: item.endedAt } : {}),
      environment: { id: "environment.unspecified", label: "Unspecified environment", kind: "unspecified", domainId: null },
      sources: [],
      actionChannels: [],
      initialState: { timestamp: item.startedAt, namespaces: {} },
      timeline: [],
      notes: [],
      metadata: { projectId, summaryOnly: true, eventCount: item.eventCount ?? 0, noteCount: item.noteCount ?? 0 }
    }));
  }

  async listRecordingSessionSummaryPage(projectId: string | null | undefined, input: { limit: number | undefined; offset: number | undefined }): Promise<{ recordings: RecordingSession[]; page: { limit: number; offset: number; total: number } }> {
    await this.ready;
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 25)));
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    if (!projectId || !this.projectPaths.root) {
      const summaries = (await this.listRecordingSessions(projectId)).map(summaryRecordingSession).sort((left, right) => right.startedAt - left.startedAt || left.recordingId.localeCompare(right.recordingId));
      return { recordings: summaries.slice(offset, offset + limit), page: { limit, offset, total: summaries.length } };
    }
    const typedPage = await this.summaries.tryWithRuntimeStreamStore(projectId, async (store) => await store.listRecordingSummaries({ limit, offset }));
    if (typedPage && typedPage.total > 0) return { recordings: typedPage.recordings, page: { limit: typedPage.limit, offset: typedPage.offset, total: typedPage.total } };
    const index = await this.indexes.readRecordingIndex(projectId);
    const ordered = [...(index.recordings ?? [])].sort((left, right) => right.startedAt - left.startedAt || left.recordingId.localeCompare(right.recordingId));
    const recordings = ordered.slice(offset, offset + limit).map((item) => summaryRecordingSession({
      schemaVersion: "0.1",
      recordingId: item.recordingId,
      ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
      startedAt: item.startedAt,
      ...(item.endedAt !== undefined ? { endedAt: item.endedAt } : {}),
      environment: { id: "environment.unspecified", label: "Unspecified environment", kind: "unspecified", domainId: null },
      sources: [],
      actionChannels: [],
      initialState: { timestamp: item.startedAt, namespaces: {} },
      timeline: [],
      notes: [],
      metadata: { projectId, summaryOnly: true, eventCount: item.eventCount ?? 0, noteCount: item.noteCount ?? 0 }
    }));
    return { recordings, page: { limit, offset, total: ordered.length } };
  }

  async getRecordingSession(recordingId: string, projectId?: string | null): Promise<RecordingSession> {
    return await this.recordings.getRecordingSession(recordingId, projectId);
  }

  async getRecordingEntryState(input: RecordingEntryStateLookupInput): Promise<RecordingEntryStateLookupResult> {
    await this.ready;
    await this.ensureRecordingStateIndexCurrent(input.projectId, input.recordingId);
    const index = await this.readRecordingStateIndex(input.projectId, input.recordingId);
    if (!index) {
      return missingRecordingStateLookup(input, "Recording state index does not exist for this recording.");
    }
    const resolved = resolveRecordingStateIndexItem(index, input);
    if (!resolved.state) return missingRecordingStateLookup(input, resolved.reason);
    const result: RecordingEntryStateLookupResult = {
      recordingId: input.recordingId,
      requested: compactJsonObject({ entryId: input.entryId, actionId: input.actionId, stateSnapshotId: input.stateSnapshotId }) as RecordingEntryStateLookupResult["requested"],
      resolved: {
        stateSnapshotId: resolved.state.stateSnapshotId,
        entryId: resolved.state.entryId,
        stateRef: resolved.state.stateRef,
        ...(resolved.state.screenshotRef ? { screenshotRef: resolved.state.screenshotRef } : {})
      }
    };
    if (input.includeState) {
      result.state = await this.objectDocuments.readIndexedStateSnapshot(input.projectId, resolved.state.stateRef);
    }
    return result;
  }

  async getStateSnapshot(input: { projectId: string; recordingId: string; stateSnapshotId: string; includeState?: boolean }): Promise<RecordingEntryStateLookupResult> {
    return await this.getRecordingEntryState(input);
  }

  async repairRecordingStateIndex(input: { projectId: string; recordingId: string; mode: "dry_run" | "write" }): Promise<RepairRecordingStateIndexResult> {
    await this.ready;
    await this.recordings.loadProjectRecording(input.projectId, input.recordingId);
    const rawRecording = await this.recordings.getRawRecordingSession(input.recordingId, input.projectId);
    const recording = await this.objectDocuments.hydrateRecordingStateSnapshotRefs(rawRecording, input.projectId);
    const index = buildRecordingStateIndex(input.projectId, recording);
    if (input.mode === "write" && this.recordingStateIndexes) await this.recordingStateIndexes.write(index);
    const relinked = finalizeRecordingStateLinks(index);
    return {
      recordingId: input.recordingId,
      mode: input.mode,
      index: relinked.index,
      warnings: relinked.warnings.map((warning) => warning.message)
    };
  }

  async listRecordingSummaries(input: { page?: unknown; pageSize?: unknown } = {}): Promise<RecordingSummaryList> {
    await this.ready;
    const page = normalizePositiveInteger(input.page, 1, 1, 1_000_000);
    const pageSize = normalizePositiveInteger(input.pageSize, 10, 1, 100);
    const { projects } = await this.listProjects();
    const summaries: RecordingSummaryItem[] = [];
    const seen = new Set<string>();

    for (const project of projects) {
      if (this.projectPaths.root) await this.loadProjectRecordings(project.id);
      const recordingIds = this.projectPaths.root
        ? (await this.indexes.readRecordingIndex(project.id)).recordings.map((item) => item.recordingId)
        : (await this.repositories.recordingSessions.list()).map((recording) => recording.recordingId);

      for (const recordingId of recordingIds) {
        const key = `${project.id}:${recordingId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const recording = await this.repositories.recordingSessions.get(recordingId);
        if (!recording) continue;
        summaries.push(recordingSummaryFromSession(recording, project.id));
      }
    }

    summaries.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const total = summaries.length;
    const start = (page - 1) * pageSize;
    return { items: summaries.slice(start, start + pageSize), page, pageSize, total };
  }

  async createRecording(input: CreateRecordingSessionInput & { projectId?: string | null; domainId?: string | null }): Promise<RecordingSession> {
    await this.ready;
    const created = createRecordingSession({ ...input, environment: { ...input.environment, domainId: input.domainId ?? input.environment?.domainId ?? null } });
    const recording = input.projectId
      ? { ...created, metadata: { ...(created.metadata ?? {}), projectId: input.projectId } }
      : created;
    await this.repositories.recordingSessions.put(recording);
    if (input.projectId) {
      await this.writeProjectRecordingSession(input.projectId, recording);
      if (recording.taskId) await this.linkRecordingToCanonicalFlow(input.projectId, recording.taskId, recording.recordingId);
    }
    return recording;
  }

  private async linkRecordingToCanonicalFlow(projectId: string, flowId: string, recordingId: string): Promise<void> {
    const flow = await this.getFlow(projectId, flowId).catch(() => null);
    if (!flow || this.flowWriter.persistedFlowRepresentation(flow) === "subflow_graph") return;
    const previousRecordingIds = flow.expansion?.recordingIds ?? [];
    const recordingIds = uniqueStrings([...previousRecordingIds, recordingId]);
    if (recordingIds.length === previousRecordingIds.length) return;
    await this.saveFlow({
      projectId,
      flow: { ...flow, expansion: { ...(flow.expansion ?? {}), recordingIds }, updatedAt: Date.now() }
    });
  }

  async appendRecordingEvent(input: { projectId?: string | null; recordingId: string; entry: AppendRecordingEntryInput }): Promise<RecordingSession> {
    return await this.appendRecordingEvents({ ...input, entries: [input.entry] });
  }

  async appendRecordingEvents(input: { projectId?: string | null; recordingId: string; entries: AppendRecordingEntryInput[] }): Promise<RecordingSession> {
    return await this.locks.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      const recording = await this.recordings.getRawRecordingSession(input.recordingId, input.projectId);
      if (recording.endedAt !== undefined) throw new Error("Finalized recordings are immutable.");
      const preparedEntries = await this.objectDocuments.prepareRecordingEntriesForStorage(input.projectId, input.recordingId, input.entries);
      const next = preparedEntries.reduce((current, entry) => appendRecordingEntry(current, entry), recording);
      const stored = await this.objectDocuments.dehydrateRecordingStateSnapshotRefs(next, input.projectId);
      await this.repositories.recordingSessions.put(stored);
      if (input.projectId && next.endedAt !== undefined) {
        await this.writeProjectRecordingSession(input.projectId, stored);
      } else if (input.projectId) {
        const typedAppend = await this.tryAppendRecordingEntries(input.projectId, stored, stored.timeline.slice(recording.timeline.length));
        if (!typedAppend) await this.writeRecordingTimeline(input.projectId, stored.recordingId, stored.timeline);
        await this.writeRecordingStateIndex(input.projectId, stored);
        await this.writeProjectRecordingIndexSummary(input.projectId, stored);
      }
      return next;
    });
  }

  summarizeRecordingSession(recording: RecordingSession): RecordingSession {
    return summaryRecordingSession(recording);
  }

  async finalizeRecording(input: { projectId?: string | null; recordingId: string; endedAt?: number }): Promise<RecordingSession> {
    return await this.locks.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      const recording = await this.recordings.getRawRecordingSession(input.recordingId, input.projectId);
      if (recording.endedAt !== undefined) return recording;
      const finalized = finalizeRecordingSession(recording, input.endedAt);
      const stored = await this.objectDocuments.dehydrateRecordingStateSnapshotRefs(finalized, input.projectId);
      await this.repositories.recordingSessions.put(stored);
      if (input.projectId) await this.writeProjectRecordingSession(input.projectId, stored);
      return finalized;
    });
  }

  async processFinalizedRecording(input: { projectId: string; recordingId: string; force?: boolean }): Promise<ProcessFinalizedRecordingResult> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    if (!recording.endedAt) {
      return {
        schemaVersion: "0.1",
        recordingId: input.recordingId,
        status: "skipped",
        issues: ["Recording is still open."],
        generatedAt: Date.now()
      };
    }
    const domainId = recording.environment.domainId;
    const expectsRecordingFlowProposal = Boolean(domainId && this.ioRuntime && this.nativeNodeRuntime?.listRecordingMappers(domainId).length);
    if (expectsRecordingFlowProposal) {
      const issues: string[] = [];
      let recordingFlowProposals: RecordingFlowProposalArtifact[] | undefined;
      try {
        const existingRecordingFlowProposals = (await this.readRecordingFlowProposals(input.projectId, false)).filter((proposal) => proposal.recordingId === input.recordingId && proposal.status !== "invalidated");
        const current = latestByGeneratedAt(existingRecordingFlowProposals);
        if (!input.force && current && recordingUpdatedAt(recording) <= current.generatedAt) recordingFlowProposals = existingRecordingFlowProposals;
        else {
          const result = await this.createRecordingFlowProposals({ projectId: input.projectId, recordingId: input.recordingId, force: input.force === true });
          recordingFlowProposals = result.proposals;
          issues.push(...result.issues);
        }
      } catch (error) {
        issues.push(errorMessage(error, "Recording Flow proposals could not be created."));
      }
      return {
        schemaVersion: "0.1",
        recordingId: input.recordingId,
        status: recordingFlowProposals?.length ? "processed" : issues.length ? "partial" : "skipped",
        ...(recordingFlowProposals?.length ? { recordingFlowProposals } : {}),
        issues,
        generatedAt: Date.now()
      };
    }
    const artifacts = await this.listPipelineArtifacts(input.projectId);
    const latestProposal = latestByGeneratedAt(artifacts.policyProposals.filter((proposal) => proposal.metadata?.recordingId === input.recordingId));
    if (!input.force && latestProposal && recordingUpdatedAt(recording) <= latestProposal.generatedAt) {
      return {
        schemaVersion: "0.1",
        recordingId: input.recordingId,
        status: "skipped",
        proposal: latestProposal,
        issues: [],
        generatedAt: Date.now()
      };
    }
    const issues: string[] = [];
    let normalizedTimeline: NormalizedTimeline | undefined;
    let review: NormalizationReviewArtifact | undefined;
    let miningRun: SignalMiningResult | undefined;
    let proposal: PolicyProposalArtifact | undefined;
    let recordingFlowProposals: RecordingFlowProposalArtifact[] | undefined;
    try {
      normalizedTimeline = latestByGeneratedAt((await this.listProjectNormalizedTimelines(input.projectId)).filter((timeline) => timeline.recordingId === input.recordingId));
      if (!normalizedTimeline || input.force || normalizedTimeline.generatedAt < recordingUpdatedAt(recording)) {
        normalizedTimeline = await this.normalizeRecording({ projectId: input.projectId, recordingId: input.recordingId });
      }
    } catch (error) {
      issues.push(errorMessage(error, "Recording could not be normalized."));
    }
    try {
      review = latestByGeneratedAt(artifacts.normalizationReviews.filter((item) => item.recordingId === input.recordingId));
      if (!review || input.force || !normalizedTimeline || review.normalizedTimelineId !== normalizedTimeline.normalizedTimelineId) {
        review = await this.createNormalizationReview({ projectId: input.projectId, recordingId: input.recordingId });
      }
    } catch (error) {
      issues.push(errorMessage(error, "Normalization review could not be created."));
    }
    try {
      miningRun = latestByGeneratedAt(artifacts.miningRuns.filter((run) => run.metadata?.recordingId === input.recordingId || run.normalizedTimelineId === normalizedTimeline?.normalizedTimelineId));
      if (!miningRun || input.force || (normalizedTimeline && miningRun.normalizedTimelineId !== normalizedTimeline.normalizedTimelineId)) {
        miningRun = await this.mineRecordingEvidence({ projectId: input.projectId, recordingId: input.recordingId });
      }
    } catch (error) {
      issues.push(errorMessage(error, "Evidence could not be mined."));
    }
    try {
      if (miningRun) {
        const freshArtifacts = await this.listPipelineArtifacts(input.projectId);
        const currentProposal = latestByGeneratedAt(freshArtifacts.policyProposals.filter((item) => item.metadata?.recordingId === input.recordingId));
        if (!input.force && currentProposal && recordingUpdatedAt(recording) <= currentProposal.generatedAt) proposal = currentProposal;
        else proposal = await this.proposePolicyFromModel({ projectId: input.projectId, recordingId: input.recordingId, miningRunId: miningRun.miningRunId });
      } else {
        issues.push("Mined evidence is required before proposing a task.");
      }
    } catch (error) {
      issues.push(errorMessage(error, "Policy Flow proposal could not be created."));
    }
    if (this.nativeNodeRuntime && this.ioRuntime) {
      try {
        const result = await this.createRecordingFlowProposals({ projectId: input.projectId, recordingId: input.recordingId, force: input.force === true });
        recordingFlowProposals = result.proposals;
        issues.push(...result.issues);
      } catch (error) {
        issues.push(errorMessage(error, "Recording Flow proposals could not be created."));
      }
    }
    return {
      schemaVersion: "0.1",
      recordingId: input.recordingId,
      status: proposal || recordingFlowProposals?.length ? "processed" : issues.length ? "partial" : "skipped",
      ...(normalizedTimeline ? { normalizedTimeline } : {}),
      ...(review ? { review } : {}),
      ...(miningRun ? { miningRun } : {}),
      ...(proposal ? { proposal } : {}),
      ...(recordingFlowProposals?.length ? { recordingFlowProposals } : {}),
      issues,
      generatedAt: Date.now()
    };
  }

  async generateRecordingProposal(input: GenerateRecordingProposalInput): Promise<GenerateRecordingProposalResult> {
    return await this.proposalGeneration.generateRecordingProposal(input);
  }

  async normalizeRecording(input: { projectId?: string | null; recordingId: string; options?: NormalizationOptions }): Promise<NormalizedTimeline> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const generated = normalizeRecordingTimeline(recording, input.options);
    const normalized = input.projectId && this.objectStore
      ? { ...generated, metadata: { ...(generated.metadata ?? {}), projectId: input.projectId } }
      : generated;
    await this.repositories.normalizedTimelines.put(normalized);
    if (input.projectId) await this.writeProjectNormalizedTimeline(input.projectId, normalized);
    return normalized;
  }

  async updateRecording(input: { projectId?: string | null; recordingId: string; name?: unknown; archived?: unknown }): Promise<RecordingSession> {
    return await this.locks.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      const recording = await this.getRecordingSession(input.recordingId, input.projectId);
      const metadata = {
        ...(recording.metadata ?? {}),
        ...(typeof input.name === "string" ? { name: input.name.trim() } : {}),
        ...(typeof input.archived === "boolean" ? { archived: input.archived } : {})
      };
      const next = { ...recording, metadata };
      await this.repositories.recordingSessions.put(next);
      if (input.projectId) await this.writeProjectRecordingSession(input.projectId, next);
      return next;
    });
  }

  async deleteRecording(input: { projectId?: string | null; recordingId: string }): Promise<{ deletedRecordingId: string; deletedProposalIds: string[] }> {
    return await this.locks.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      await this.repositories.recordingSessions.delete(input.recordingId);
      let deletedProposalIds: string[] = [];
      if (input.projectId && this.projectPaths.root) {
        const pipelineIndex = await this.indexes.readPipelineIndex(input.projectId).catch(() => emptyPipelineIndex());
        deletedProposalIds = uniqueStrings([
          ...(pipelineIndex.policyProposals ?? []).filter((item) => item.recordingId === input.recordingId).map((item) => item.proposalId),
          ...(pipelineIndex.recordingFlowProposals ?? []).filter((item) => item.recordingId === input.recordingId).map((item) => item.proposalId)
        ]);
        for (const timeline of await this.repositories.normalizedTimelines.list()) {
          if (timeline.recordingId === input.recordingId || timeline.metadata?.projectId === input.projectId && timeline.recordingId === input.recordingId) {
            await this.repositories.normalizedTimelines.delete(timeline.normalizedTimelineId);
          }
        }
        await this.deleteProjectRecordingPipeline(input.projectId, input.recordingId);
        await this.indexes.writeRecordingIndex(input.projectId, (index) => ({
          recordings: (index.recordings ?? []).filter((item) => item.recordingId !== input.recordingId),
          normalizedTimelines: (index.normalizedTimelines ?? []).filter((item) => item.recordingId !== input.recordingId)
        }));
        if (this.objectStore) {
          const live = await this.collectLiveProjectObjectReferences(input.projectId);
          await this.objectStore.deleteRecordingObjects(input.projectId, input.recordingId, live);
          await ProgramJsonStore.deletePath(this.recordingPaths.recordingSessionDirectory(input.projectId, input.recordingId));
          await rm(this.recordingPaths.recordingSessionDirectory(input.projectId, input.recordingId), { recursive: true, force: true });
          await this.pruneUnreferencedProjectObjects(input.projectId);
        } else {
          await rm(this.recordingPaths.recordingSessionDirectory(input.projectId, input.recordingId), { recursive: true, force: true });
        }
        await this.recordings.deleteOrphanedPhysicalRecordingSessionDirectories(input.projectId);
      }
      return { deletedRecordingId: input.recordingId, deletedProposalIds };
    });
  }

  async deleteRecordings(input: { projectId?: string | null; recordingIds?: string[] }): Promise<{ deletedRecordingIds: string[]; deletedProposalIds: string[] }> {
    const recordingIds = uniqueStrings((input.recordingIds ?? []).map((recordingId) => String(recordingId)).filter(Boolean));
    if (!recordingIds.length) return { deletedRecordingIds: [], deletedProposalIds: [] };
    if (!input.projectId || !this.projectPaths.root) {
      const results = await Promise.all(recordingIds.map((recordingId) => this.deleteRecording({
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        recordingId
      })));
      return {
        deletedRecordingIds: results.map((result) => result.deletedRecordingId),
        deletedProposalIds: uniqueStrings(results.flatMap((result) => result.deletedProposalIds))
      };
    }

    const recordingIdSet = new Set(recordingIds);
    const pipelineIndex = await this.indexes.readPipelineIndex(input.projectId).catch(() => emptyPipelineIndex());
    const artifactIds = emptyPipelineArtifactIdSets();
    await Promise.all(recordingIds.map(async (recordingId) => {
      const pipeline = await new ProgramJsonStore<RecordingPipelineDocument>(
        this.recordingPaths.recordingPipelineFile(input.projectId!, recordingId),
        () => createRecordingPipelineDocument({ recordingId, startedAt: Date.now() })
      ).read();
      mergePipelineArtifactIdSets(artifactIds, await this.recordings.collectRecordingPipelineArtifactIds(input.projectId!, recordingId, pipeline, pipelineIndex));
    }));
    const deletedProposalIds = uniqueStrings([
      ...(pipelineIndex.policyProposals ?? []).filter((item) => item.recordingId && recordingIdSet.has(item.recordingId)).map((item) => item.proposalId),
      ...(pipelineIndex.recordingFlowProposals ?? []).filter((item) => item.recordingId && recordingIdSet.has(item.recordingId)).map((item) => item.proposalId),
      ...artifactIds.policyProposals,
      ...artifactIds.recordingFlowProposals
    ]);

    await Promise.all(recordingIds.map((recordingId) => this.repositories.recordingSessions.delete(recordingId)));
    const timelines = await this.repositories.normalizedTimelines.list();
    await Promise.all(timelines
      .filter((timeline) => recordingIdSet.has(timeline.recordingId) || timeline.metadata?.projectId === input.projectId && recordingIdSet.has(timeline.recordingId))
      .map((timeline) => this.repositories.normalizedTimelines.delete(timeline.normalizedTimelineId)));

    const artifactDeletes: Array<{ recordingId: string; kind: PipelineArtifactKind; id: string }> = [];
    for (const recordingId of recordingIds) {
      for (const kind of pipelineArtifactKinds()) {
        for (const id of artifactIds[kind]) artifactDeletes.push({ recordingId, kind, id });
      }
    }
    await mapWithConcurrency(artifactDeletes, PIPELINE_ARTIFACT_IO_CONCURRENCY, async ({ recordingId, kind, id }) => {
      await this.objectDocuments.deletePipelineArtifactDocuments(input.projectId!, recordingId, kind, id);
    });
    await this.recordings.deletePhysicalSharedPipelineArtifactsForRecordings(input.projectId, recordingIdSet);
    await Promise.all(recordingIds.map(async (recordingId) => {
      const proposalRoot = this.projectPaths.projectFile(input.projectId!, "proposals", safeSegment(recordingId));
      const derivedDir = this.recordingPaths.recordingDerivedDirectory(input.projectId!, recordingId);
      const sessionDir = this.recordingPaths.recordingSessionDirectory(input.projectId!, recordingId);
      if (this.objectStore) {
        await Promise.all([
          ProgramJsonStore.deletePath(proposalRoot),
          ProgramJsonStore.deletePath(derivedDir),
          ProgramJsonStore.deletePath(sessionDir)
        ]);
      }
      await Promise.all([
        rm(proposalRoot, { recursive: true, force: true }),
        rm(derivedDir, { recursive: true, force: true }),
        rm(sessionDir, { recursive: true, force: true })
      ]);
    }));

    await this.indexes.writeRecordingIndex(input.projectId, (index) => ({
      recordings: (index.recordings ?? []).filter((item) => !recordingIdSet.has(item.recordingId)),
      normalizedTimelines: (index.normalizedTimelines ?? []).filter((item) => !recordingIdSet.has(item.recordingId))
    }));
    await this.recordings.writePipelineIndexWithoutRecordings(input.projectId, recordingIdSet, artifactIds);
    if (this.objectStore) {
      const live = await this.collectLiveProjectObjectReferences(input.projectId);
      await this.objectStore.deleteRecordingsObjects(input.projectId, recordingIds, live);
      await this.pruneUnreferencedProjectObjects(input.projectId);
    }
    await this.recordings.deleteOrphanedPhysicalRecordingSessionDirectories(input.projectId);
    return { deletedRecordingIds: recordingIds, deletedProposalIds };
  }

  async deleteProposal(input: { projectId: string; proposalId: string; kind?: "policy" | "recording_flow" | "auto" }): Promise<{ deletedProposalId: string; kind: "policy" | "recording_flow"; recordingId?: string }> {
    const requestedKind = input.kind === "policy" ? "policyProposals" : input.kind === "recording_flow" ? "recordingFlowProposals" : null;
    const kinds: Array<"policyProposals" | "recordingFlowProposals"> = requestedKind ? [requestedKind] : ["policyProposals", "recordingFlowProposals"];
    for (const kind of kinds) {
      const artifact = await this.recordings.readPipelineArtifact<JsonObject>(input.projectId, kind, input.proposalId);
      if (!artifact) continue;
      const recordingId = await this.recordings.pipelineArtifactRecordingId(input.projectId, kind, artifact);
      if (!recordingId) throw new Error("Proposal is not associated with a recording.");
      await this.objectDocuments.deletePipelineArtifactDocuments(input.projectId, recordingId, kind, input.proposalId);
      await this.recordings.removeRecordingPipelineArtifactId(input.projectId, recordingId, kind, input.proposalId);
      await new ProgramJsonStore<PipelineIndex>(this.projectPaths.projectFile(input.projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => ({
        ...index,
        policyProposals: kind === "policyProposals" ? (index.policyProposals ?? []).filter((item) => item.proposalId !== input.proposalId) : index.policyProposals,
        recordingFlowProposals: kind === "recordingFlowProposals" ? (index.recordingFlowProposals ?? []).filter((item) => item.proposalId !== input.proposalId) : index.recordingFlowProposals
      }));
      if (this.objectStore) await this.pruneUnreferencedProjectObjects(input.projectId);
      return { deletedProposalId: input.proposalId, kind: kind === "policyProposals" ? "policy" : "recording_flow", recordingId };
    }
    throw new Error("Unknown proposal.");
  }

  async getProposal(input: { projectId: string; proposalId: string; kind?: "policy" | "recording_flow" | "auto" }): Promise<{ proposal: PolicyProposalArtifact | RecordingFlowProposalArtifact; kind: "policy" | "recording_flow" } | null> {
    const requestedKind = input.kind === "policy" ? "policyProposals" : input.kind === "recording_flow" ? "recordingFlowProposals" : null;
    const kinds: Array<"policyProposals" | "recordingFlowProposals"> = requestedKind ? [requestedKind] : ["policyProposals", "recordingFlowProposals"];
    for (const kind of kinds) {
      const proposal = await this.recordings.readPipelineArtifact<PolicyProposalArtifact | RecordingFlowProposalArtifact>(input.projectId, kind, input.proposalId);
      if (proposal) return { proposal, kind: kind === "policyProposals" ? "policy" : "recording_flow" };
    }
    return null;
  }

  async appendRecordingNoteEntry(input: { projectId?: string | null; recordingId: string; text?: unknown; linkedEntryIds?: unknown; startOffsetMs?: unknown; endOffsetMs?: unknown }): Promise<RecordingSession> {
    return await this.locks.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      const recording = await this.getRecordingSession(input.recordingId, input.projectId);
      if (recording.endedAt !== undefined) throw new Error("Finalized recordings are immutable.");
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (!text) throw new Error("Note text is required.");
      const linkedEntryIds = Array.isArray(input.linkedEntryIds) ? input.linkedEntryIds.map(String).filter(Boolean) : [];
      const next = appendRecordingNote(recording, {
        text,
        source: "typed",
        scope: input.endOffsetMs !== undefined ? "interval" : linkedEntryIds.length ? "action" : "task",
        ...(typeof input.startOffsetMs === "number" ? { startOffsetMs: input.startOffsetMs } : {}),
        ...(typeof input.endOffsetMs === "number" ? { endOffsetMs: input.endOffsetMs } : {}),
        ...(linkedEntryIds.length ? { linkedEntryIds } : {})
      });
      await this.repositories.recordingSessions.put(next);
      if (input.projectId) await this.writeProjectRecordingSession(input.projectId, next);
      return next;
    });
  }

  async appendRecordingMarkerEntry(input: { projectId?: string | null; recordingId: string; label?: unknown; monotonicOffsetMs?: unknown; linkedEntryId?: unknown }): Promise<RecordingSession> {
    const label = typeof input.label === "string" ? input.label.trim() : "";
    if (!label) throw new Error("Marker label is required.");
    const appendInput: Parameters<AutomationStudioService["appendRecordingEvent"]>[0] = {
      recordingId: input.recordingId,
      entry: {
        type: "marker",
        label,
        ...(typeof input.monotonicOffsetMs === "number" ? { monotonicOffsetMs: input.monotonicOffsetMs, timestamp: Date.now() } : {}),
        metadata: typeof input.linkedEntryId === "string" ? { linkedEntryId: input.linkedEntryId } : {}
      }
    };
    if (input.projectId !== undefined) appendInput.projectId = input.projectId;
    return await this.appendRecordingEvent(appendInput);
  }

  async createNormalizationReview(input: { projectId: string; recordingId: string }): Promise<NormalizationReviewArtifact> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    let normalized = (await this.listProjectNormalizedTimelines(input.projectId)).find((item) => item.recordingId === input.recordingId);
    normalized ??= await this.normalizeRecording({ projectId: input.projectId, recordingId: input.recordingId });
    const rawIds = new Set(recording.timeline.map((entry) => entry.id));
    const normalizedIdsByRawId = new Map<string, string[]>();
    for (const entry of normalized.timeline) {
      const rawEntryIds = uniqueStrings([
        entry.id,
        entry.correlationId ?? "",
        typeof entry.metadata?.normalizedFrom === "string" ? entry.metadata.normalizedFrom : ""
      ]);
      for (const rawEntryId of rawEntryIds) {
        if (!rawIds.has(rawEntryId)) continue;
        normalizedIdsByRawId.set(rawEntryId, [...(normalizedIdsByRawId.get(rawEntryId) ?? []), entry.id]);
      }
    }
    const reviewTimeline = recordingTimelineForProposalMapping(recording.timeline);
    const compactedReviewEntryCount = recording.timeline.length - reviewTimeline.length;
    const mappings: NormalizationReviewArtifact["mappings"] = reviewTimeline.map((entry) => ({
      rawEntryId: entry.id,
      normalizedEntryIds: normalizedIdsByRawId.get(entry.id) ?? [],
      status: "preserved" as const
    }));
    if (compactedReviewEntryCount > 0) {
      mappings.push({
        rawEntryId: `compacted.high-frequency-state.${input.recordingId}`,
        normalizedEntryIds: [],
        status: "dropped",
        reason: `${compactedReviewEntryCount} high-frequency state entries were preserved in the raw recording but omitted from proposal review mappings.`
      });
    }
    for (const entry of normalized.timeline) {
      const sourceId = typeof entry.metadata?.normalizedFrom === "string" ? entry.metadata.normalizedFrom : entry.correlationId;
      if (sourceId && rawIds.has(sourceId)) continue;
      if (!rawIds.has(entry.id)) mappings.push({ rawEntryId: sourceId ?? entry.id, normalizedEntryIds: [entry.id], status: "derived", reason: "Derived during normalization." });
    }
    const sorted = [...normalized.timeline].sort((left, right) => left.monotonicOffsetMs - right.monotonicOffsetMs);
    const waitClips = sorted.slice(1).map((entry, index) => ({
      beforeEntryId: sorted[index]!.id,
      afterEntryId: entry.id,
      waitMs: Math.max(0, entry.monotonicOffsetMs - sorted[index]!.monotonicOffsetMs)
    })).filter((item) => item.waitMs >= 250);
    const review: NormalizationReviewArtifact = {
      schemaVersion: "0.1",
      reviewId: `review.${safeSegment(input.recordingId)}.${Date.now()}`,
      recordingId: input.recordingId,
      normalizedTimelineId: normalized.normalizedTimelineId,
      mappings,
      waitClips,
      issues: normalized.issues,
      generatedAt: Date.now()
    };
    await this.recordings.writePipelineArtifact(input.projectId, "normalizationReviews", review.reviewId, review as unknown as JsonObject);
    return review;
  }

  async mineRecordingEvidence(input: { projectId: string; normalizedTimelineId?: string; recordingId?: string }): Promise<SignalMiningResult> {
    return await this.evidenceMining.mineRecordingEvidence(input);
  }

  async learnTaskModel(input: { projectId: string; taskId?: string; miningRunId?: string }): Promise<LearnedTaskModel> {
    const miningRun = input.miningRunId
      ? await this.recordings.readPipelineArtifact<SignalMiningResult>(input.projectId, "miningRuns", input.miningRunId)
      : latestByGeneratedAt((await this.listPipelineArtifacts(input.projectId)).miningRuns);
    if (!miningRun) throw new Error("A mining run is required before learning a task model.");
    const model = createTaskProposalModelFromMiningRun(miningRun, input.taskId);
    await this.repositories.learnedTaskModels.put(model);
    await this.recordings.writePipelineArtifact(input.projectId, "learnedTaskModels", model.learnedTaskModelId, model as unknown as JsonObject);
    return model;
  }

  async proposePolicyFromModel(input: { projectId: string; learnedTaskModelId?: string; miningRunId?: string; recordingId?: string }): Promise<PolicyProposalArtifact> {
    let model = input.learnedTaskModelId
      ? await this.repositories.learnedTaskModels.get(input.learnedTaskModelId) ?? await this.recordings.readPipelineArtifact<LearnedTaskModel>(input.projectId, "learnedTaskModels", input.learnedTaskModelId)
      : null;
    const artifacts = await this.listPipelineArtifacts(input.projectId);
    if (!model && input.miningRunId) {
      const miningRun = artifacts.miningRuns.find((run) => run.miningRunId === input.miningRunId) ?? await this.recordings.readPipelineArtifact<SignalMiningResult>(input.projectId, "miningRuns", input.miningRunId);
      if (miningRun) model = createTaskProposalModelFromMiningRun(miningRun);
    }
    if (!model && input.recordingId) {
      const timelines = await this.listProjectNormalizedTimelines(input.projectId);
      const timelineIds = new Set(timelines.filter((timeline) => timeline.recordingId === input.recordingId).map((timeline) => timeline.normalizedTimelineId));
      const miningRun = latestByGeneratedAt(artifacts.miningRuns.filter((run) => run.metadata?.recordingId === input.recordingId || timelineIds.has(run.normalizedTimelineId)));
      if (miningRun) model = createTaskProposalModelFromMiningRun(miningRun);
    }
    model ??= latestByGeneratedAt(artifacts.learnedTaskModels) ?? null;
    if (!model) throw new Error("Mined evidence is required before proposing a task.");
    const executableClusters = model.actionClusters.filter((cluster) => {
      const outputId = cluster.actionTemplate.outputId;
      return Boolean(outputId) && (!this.ioRuntime || this.ioRuntime.io.hasOutput(this.ioRuntime.domainId, outputId!));
    });
    if (!model.actionClusters.length) {
      throw new Error("No executable output-bound actions were found in mined evidence. For extension/domain recordings, generate recording Flow proposals from registered recording mappers instead.");
    }
    const executableClusterIds = new Set(executableClusters.map((cluster) => cluster.id));
    const nodes: PolicyNode[] = executableClusters.map((cluster) => ({
      id: `node.${cluster.id}`,
      label: cluster.label,
      description: `Generated from ${cluster.sourceOccurrences.length} recorded occurrence(s).`,
      eligibility: { type: "all", conditions: cluster.positiveRequirements },
      actions: [{ ...cluster.actionTemplate, id: cluster.actionTemplate.id }],
      successConditions: { type: "all", conditions: cluster.expectedEffects.map((effect) => effect.condition) },
      failureConditions: { type: "none", conditions: [] },
      timeout: { timeoutMs: 5000 },
      retry: { maxAttempts: 1, backoffMs: 500 },
      recovery: { strategy: "pause" },
      outgoingEdges: [],
      sourceEvidence: uniqueEvidenceReferences([...(cluster.actionTemplate.sourceEvidence ?? []), ...cluster.expectedEffects.flatMap((effect) => effect.evidence)]),
      generatedMetadata: { generatedBy: "signal_miner", generatedAt: Date.now(), confidence: cluster.confidence }
    }));
    const edges = model.transitions
      .filter((transition) => executableClusterIds.has(transition.fromClusterId) && executableClusterIds.has(transition.toClusterId))
      .map((transition) => ({
      id: `edge.${transition.id}`,
      fromNodeId: `node.${transition.fromClusterId}`,
      toNodeId: `node.${transition.toClusterId}`,
      label: "Next",
      probability: transition.probability
      }));
    const policy: PolicyGraph = {
      schemaVersion: "0.1",
      policyId: `policy.${safeSegment(model.taskId)}.${Date.now()}`,
      taskId: model.taskId,
      version: "0.1",
      nodes: nodes.map((node) => ({ ...node, outgoingEdges: edges.filter((edge) => edge.fromNodeId === node.id) })),
      edges,
      sourceEvidence: model.metadata?.source === "mined_evidence" && model.sourceMiningRuns[0]
        ? [{ layer: "signal_mining", artifactId: model.sourceMiningRuns[0] }]
        : [{ layer: "learned_task_model", artifactId: model.learnedTaskModelId }],
      generatedMetadata: { generatedBy: "signal_miner", generatedAt: Date.now(), confidence: average(nodes.map((node) => node.generatedMetadata.confidence ?? 0)) },
      metadata: { learnedTaskModelId: model.learnedTaskModelId }
    };
    const patch: PolicyGraphPatch = {
      schemaVersion: "0.1",
      patchId: `patch.${safeSegment(input.recordingId ?? model.sourceRecordings[0] ?? model.learnedTaskModelId)}`,
      targetTaskId: model.taskId,
      basePolicyId: null,
      mergeStrategy: "append_or_branch",
      nodes: policy.nodes,
      edges: policy.edges,
      sourceRecordingIds: model.sourceRecordings,
      sourceMiningRunIds: model.sourceMiningRuns,
      generatedAt: Date.now(),
      metadata: {
        learnedTaskModelId: model.learnedTaskModelId,
        proposalKind: "task_graph_patch"
      }
    };
    const proposal: PolicyProposalArtifact = {
      schemaVersion: "0.1",
      proposalId: `proposal.${safeSegment(input.recordingId ?? model.sourceRecordings[0] ?? model.learnedTaskModelId)}.${randomUUID()}`,
      learnedTaskModelId: model.learnedTaskModelId,
      policy,
      patch,
      status: "proposed",
      summary: `${policy.nodes.length} nodes and ${policy.edges.length} edges proposed from mined evidence.`,
      generatedAt: Date.now(),
      metadata: {
        source: input.learnedTaskModelId ? "learned_task_model" : "mined_evidence",
        recordingId: model.sourceRecordings[0] ?? null,
        miningRunId: model.sourceMiningRuns[0] ?? null
      }
    };
    await this.recordings.writePipelineArtifact(input.projectId, "policyProposals", proposal.proposalId, proposal as unknown as JsonObject);
    return proposal;
  }

  async approvePolicyProposal(input: { projectId: string; proposalId: string; targetFlowId?: string; targetTaskId?: string; policyOverride?: PolicyGraph; requireExistingFlow?: boolean; requireExistingTask?: boolean }): Promise<PolicyProposalArtifact> {
    return await this.proposalApproval.approvePolicyProposal(input);
  }

  async replayPolicyAgainstRecording(input: { projectId: string; recordingId: string; policyId?: string }): Promise<ReplayResultArtifact> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const proposalPolicy = (await this.listPipelineArtifacts(input.projectId)).policyProposals.find((proposal) => !input.policyId || proposal.policy.policyId === input.policyId)?.policy;
    const policy = input.policyId ? await this.repositories.policyGraphs.get(input.policyId) ?? proposalPolicy : proposalPolicy ?? (await this.repositories.policyGraphs.list())[0];
    if (!policy) throw new Error("A policy is required before replay.");
    const recordedActions = recording.timeline.filter((entry) => entry.type === "action" || entry.type === "domain_event").map((entry: any) => entry.actionType ?? entry.eventType);
    const expectedActions = policy.nodes.flatMap((node) => node.actions.map((action) => action.actionType));
    const missingActions = expectedActions.filter((action) => !recordedActions.includes(action));
    const unexpectedActions = recordedActions.filter((action) => !expectedActions.includes(action));
    const timingWarnings = recording.timeline.slice(1).flatMap((entry, index) => {
      const previous = recording.timeline[index]!;
      const gap = Math.max(0, entry.monotonicOffsetMs - previous.monotonicOffsetMs);
      return gap > 30_000 ? [`Long recorded wait before ${entry.id}: ${gap}ms`] : [];
    });
    const result: ReplayResultArtifact = {
      schemaVersion: "0.1",
      replayId: `replay.${safeSegment(recording.recordingId)}.${Date.now()}`,
      recordingId: recording.recordingId,
      policyId: policy.policyId,
      status: missingActions.length ? recordedActions.length ? "partial" : "failed" : "matched",
      matchedActions: expectedActions.length - missingActions.length,
      expectedActions: expectedActions.length,
      missingActions,
      unexpectedActions,
      timingWarnings,
      generatedAt: Date.now()
    };
    await this.recordings.writePipelineArtifact(input.projectId, "replayResults", result.replayId, result as unknown as JsonObject);
    return result;
  }

  async inspectStateDiff(input: { previous: StateSnapshot; current: StateSnapshot; includeStable?: boolean }) {
    return { deltas: diffStateSnapshots(input.previous, input.current, input.includeStable !== undefined ? { includeStable: input.includeStable } : {}) };
  }

  async listSignalRegistries(): Promise<SignalRegistry[]> {
    await this.ready;
    return await this.repositories.signalRegistries.list();
  }

  registerRecordingDomain(definition: RecordingDomainDefinition): RecordingDomainDefinition {
    return this.recordingDomains.register(definition);
  }

  unregisterRecordingDomain(domainId: string): boolean {
    return this.recordingDomains.unregister(domainId);
  }

  listRecordingDomains(): RecordingDomainDefinition[] {
    return this.recordingDomains.list();
  }

  validateRecordingDomainEvent(input: RecordingDomainEventInput) {
    return this.recordingDomains.validate(input);
  }

  async appendRecordingDomainEvent(input: RecordingDomainEventInput): Promise<RecordingDomainEventProcessingResult> {
    return await this.locks.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      const recording = await this.getRecordingSession(input.recordingId, input.projectId);
      const result = await processRecordingDomainEvent(this.recordingDomains, recording, input);
      if (result.accepted) {
        await this.repositories.recordingSessions.put(result.recording);
        if (input.projectId) await this.writeProjectRecordingSession(input.projectId, result.recording);
      }
      return result;
    });
  }

  async listProjectArtifacts(projectId: string): Promise<AutomationStudioProjectArtifacts> {
    const artifacts = await this.legacy.readLegacyProjectArtifacts(projectId);
    const tasksWithGraphs = await this.embedTaskGraphs(projectId, artifacts.tasks, artifacts.flows);
    return {
      tasks: tasksWithGraphs,
      routines: artifacts.routines,
      configs: artifacts.configs,
      flows: artifacts.flows
    };
  }

  async getProjectWorkspaceSummary(projectId: string): Promise<AutomationStudioWorkspaceSummary> {
    const project = await this.projects.findProject(projectId);
    const [recordingSummaries, proposals, flows, runtime] = await Promise.all([
      this.listAutomationRecordingSummaries(projectId),
      this.listAutomationProposalSummaries(projectId),
      this.listAutomationFlowSummaries(projectId),
      this.listAutomationRuntimeSummaries(projectId)
    ]);
    const proposalCounts = countBy(proposals.map((proposal) => proposal.recordingId));
    const recordings = recordingSummaries.map((recording) => ({
      ...recording,
      proposalCount: proposalCounts.get(recording.recordingId) ?? recording.proposalCount
    }));
    return {
      project: projectSummaryFromProject(project, {
        recordings: recordings.length,
        proposals: proposals.length,
        flows: flows.length
      }),
      recordings,
      proposals,
      flows,
      runtime
    };
  }

  private async listAutomationRecordingSummaries(projectId: string): Promise<AutomationStudioRecordingSummary[]> {
    const recordings = await this.listRecordingSessionSummaries(projectId);
    return recordings.map((recording) => ({
      recordingId: recording.recordingId,
      ...(typeof recording.metadata?.name === "string" ? { name: recording.metadata.name } : {}),
      ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
      ...(recording.environment.domainId !== undefined ? { domainId: recording.environment.domainId } : {}),
      status: recording.endedAt === undefined ? "recording" : "completed",
      startedAt: recording.startedAt,
      ...(recording.endedAt !== undefined ? { endedAt: recording.endedAt } : {}),
      updatedAt: recordingUpdatedAt(recording),
      eventCount: typeof recording.metadata?.eventCount === "number" ? recording.metadata.eventCount : recording.timeline.length,
      actionCount: typeof recording.metadata?.actionCount === "number" ? recording.metadata.actionCount : recording.timeline.filter(recordingEntryIsActionLike).length,
      stateSnapshotCount: typeof recording.metadata?.stateSnapshotCount === "number" ? recording.metadata.stateSnapshotCount : recording.timeline.filter((entry) => entry.type === "observation" && entry.observationType === "client.state_snapshot").length,
      proposalCount: 0
    }));
  }

  private async listAutomationProposalSummaries(projectId: string): Promise<AutomationStudioProposalSummary[]> {
    const index = await this.indexes.readPipelineIndex(projectId);
    const policyProposals = (index.policyProposals ?? []).map((item): AutomationStudioProposalSummary => ({
      proposalId: item.proposalId,
      recordingId: item.recordingId ?? "unknown",
      kind: "policy",
      status: item.status === "approved" ? "approved" : "generated",
      generatedAt: item.generatedAt,
      updatedAt: item.generatedAt,
      nodeCount: 0,
      issueCount: 0
    }));
    const recordingFlowProposals = (index.recordingFlowProposals ?? []).map((item): AutomationStudioProposalSummary => ({
      proposalId: item.proposalId,
      recordingId: item.recordingId ?? "unknown",
      kind: "recording_flow",
      status: item.status === "proposed" ? "generated" : item.status,
      generatedAt: item.generatedAt,
      updatedAt: item.generatedAt,
      nodeCount: 0,
      issueCount: 0
    }));
    return [...policyProposals, ...recordingFlowProposals].sort((left, right) => right.generatedAt - left.generatedAt);
  }

  async listAutomationFlowSummaries(projectId: string): Promise<AutomationStudioFlowSummary[]> {
    const index = await this.indexes.readFlowIndex(projectId).catch(() => emptyFlowSummaryIndex());
    const metadataAwareIndex = index.ownershipMetadataVersion === 1 && index.hierarchyMetadataVersion === 1
      ? index
      : await this.repairFlowSummaryMetadataIndex(projectId, index);
    return (await this.withCanonicalFlowHierarchySubflows(projectId, metadataAwareIndex.flows ?? [])).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async listFlowMetadataPage(input: { projectId: string; limit?: number; cursor?: string | null; status?: string }): Promise<AutomationStudioFlowResourcePage<AutomationStudioSqlFlowRecord>> {
    return await this.flows.listFlowMetadataPage(input);
  }

  async getFlowMetadataDetail(projectId: string, flowId: string): Promise<AutomationStudioSqlFlowDetail | null> {
    return await this.flows.getFlowMetadataDetail(projectId, flowId);
  }

  private async listAutomationRuntimeSummaries(projectId: string): Promise<AutomationStudioRuntimeRunSummary[]> {
    const index = await this.indexes.readRuntimeIndex(projectId).catch(() => ({ sessions: [] }));
    return (index.sessions ?? []).map((session) => ({
      runId: session.runId,
      targetKind: session.targetKind,
      targetId: session.targetId,
      status: session.status,
      updatedAt: session.updatedAt
    }));
  }

  /** Lists canonical Flows together with read-only legacy Task/Routine adapters. */
  async listFlows(projectId: string): Promise<AutomationStudioFlowCatalogEntry[]> {
    const project = await this.projects.findProject(projectId);
    const [canonicalFlows, legacyArtifacts] = await Promise.all([
      this.catalogue.listCanonicalFlowArtifacts(projectId),
      this.legacy.readLegacyProjectArtifacts(projectId)
    ]);
    const catalog = resolveAutomationStudioFlowCatalog({
      projectId,
      scope: flowScopeForProject(project),
      canonicalFlows,
      legacyArtifacts
    });
    const invalidated = (await this.readRecordingFlowProposals(projectId, false)).filter((proposal) => proposal.status === "invalidated");
    return catalog.map((entry) => {
      const warnings = invalidated.filter((proposal) => proposal.invalidation?.affectedFlowIds.includes(entry.flow.flowId)).map((proposal) => ({ proposalId: proposal.proposalId, reasons: proposal.invalidation?.reasons ?? [] }));
      return warnings.length ? { ...entry, flow: { ...entry.flow, metadata: { ...(entry.flow.metadata ?? {}), recordingProposalWarnings: warnings } } } : entry;
    });
  }

  async createFlow(input: { projectId: string; name?: unknown; description?: unknown; flowId?: string }): Promise<AutomationStudioFlowArtifact> {
    const project = await this.projects.findProject(input.projectId);
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Flow name is required.");
    const flowId = typeof input.flowId === "string" && input.flowId.trim() ? input.flowId.trim() : `flow.${randomUUID()}`;
    await this.flows.loadProjectFlow(project.id, flowId);
    if (await this.repositories.flows.get(flowId)) throw new Error(`Automation Studio Flow ID already exists: ${flowId}`);
    const flow = createBlankAutomationStudioFlowArtifact({
      flowId,
      projectId: project.id,
      name,
      ...(typeof input.description === "string" && input.description.trim() ? { description: input.description.trim() } : {}),
      scope: flowScopeForProject(project)
    });
    return await this.saveFlow({ projectId: project.id, flow });
  }

  async getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact> {
    return await this.flows.getFlow(projectId, flowId);
  }

  async getLlmExecutionDependencyDigest(projectId: string, flowId: string): Promise<string> {
    const flow = await this.getFlow(projectId, flowId);
    const router = await this.getFlowRouter(projectId, flowId);
    const subflows: AutomationStudioFlowSubflow[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.listFlowSubflowSummaries({ projectId, flowId, limit: 100, offset });
      const batch = await Promise.all(page.subflows.map((item) => this.getFlowSubflow(projectId, flowId, item.subflowId)));
      subflows.push(...batch.filter((item): item is AutomationStudioFlowSubflow => Boolean(item)));
      if (offset + page.subflows.length >= page.total || page.subflows.length === 0) break;
    }
    const graphFlows = (await Promise.all(subflows.map((subflow) =>
      subflow.graphFlowId ? this.getFlow(projectId, subflow.graphFlowId).catch(() => null) : Promise.resolve(null)
    ))).filter((item): item is AutomationStudioFlowArtifact => Boolean(item));
    const instructionIds = new Set<string>();
    for (const scope of [{ projectId, flowId }, ...subflows.map((subflow) => ({ projectId, flowId, subflowId: subflow.subflowId }))]) {
      for (let offset = 0; ; offset += 100) {
        const page = await this.listFlowInstructionSummaries({ ...scope, limit: 100, offset });
        for (const instruction of page.instructions) instructionIds.add(instruction.instructionId);
        if (offset + page.instructions.length >= page.total || page.instructions.length === 0) break;
      }
    }
    const instructions = (await Promise.all([...instructionIds].map((instructionId) => this.getFlowInstruction(projectId, instructionId))))
      .filter((item): item is AutomationStudioFlowInstruction => Boolean(item))
      .sort((left, right) => left.instructionId.localeCompare(right.instructionId));
    const sortedGraphFlows = graphFlows.sort((left, right) => left.flowId.localeCompare(right.flowId));
    const graphRevisionBindings = await this.flows.getLlmExecutionGraphRevisionBindings(
      projectId,
      [flow.flowId, ...sortedGraphFlows.map((graphFlow) => graphFlow.flowId)]
    );
    const publicationDependencies = executionPublicationDependencyState(
      [flow, ...sortedGraphFlows],
      await this.catalogue.listFlowPublicationRecords()
    );
    return createHash("sha256").update(stableJson({
      flow,
      router,
      subflows: subflows.sort((left, right) => left.subflowId.localeCompare(right.subflowId)),
      graphFlows: sortedGraphFlows,
      graphRevisionBindings,
      instructions,
      publicationDependencies
    })).digest("hex");
  }

  reusableLlmContextStatus(): AutomationStudioReusableLlmContextFeatureStatus {
    const enabled = this.reusableLlmContextEnabled && Boolean(this.runtimeProjectDatabasePool);
    const protection = this.reusableLlmContextContentProtection;
    return protection && enabled
      ? { enabled: true, writeEnabled: true, contentProtection: protection.providerId }
      : { enabled, writeEnabled: false, contentProtection: "unavailable", blockerCode: "reusable_context.content_protection_unavailable" };
  }

  async assertProjectDomainAccess(projectId: string, domainId?: string | null): Promise<void> {
    const project = await this.projects.findProjectSummary(projectId);
    if ((project.domainId ?? null) !== (domainId ?? null)) throw new Error("Automation Studio project is unavailable in this domain scope.");
  }

  async listReusableLlmContexts(input: { projectId: string } & AutomationStudioReusableLlmContextList): Promise<AutomationStudioReusableLlmContextSummary[]> {
    return this.withReusableLlmContextStore(input.projectId, async (store) => (await store.list(input)).map(reusableLlmContextSummary));
  }

  async getReusableLlmContext(input: { projectId: string; recordId: string; now?: number; touch?: boolean }): Promise<AutomationStudioReusableLlmContextRecord | null> {
    return this.withReusableLlmContextStore(input.projectId, async (store) => store.get(input.recordId, { ...(input.now === undefined ? {} : { now: input.now }), ...(input.touch === undefined ? {} : { touch: input.touch }) }));
  }

  async putReusableLlmContext(input: { projectId: string; record: AutomationStudioReusableLlmContextWrite; actorId?: string }): Promise<AutomationStudioReusableLlmContextRecord> {
    if (!this.reusableLlmContextEnabled) throw new Error("Reusable LLM context is disabled.");
    if (!this.reusableLlmContextContentProtection) throw new Error("Reusable LLM context API writes are disabled because project content protection is unavailable.");
    return this.withReusableLlmContextStore(input.projectId, (store) => store.put(input.record, input.actorId ? { actorId: input.actorId } : {}));
  }

  async deleteReusableLlmContext(input: { projectId: string; recordId: string; actorId?: string; changedAt?: number }): Promise<boolean> {
    return this.withReusableLlmContextStore(input.projectId, (store) => store.delete(input.recordId, { ...(input.actorId ? { actorId: input.actorId } : {}), ...(input.changedAt === undefined ? {} : { changedAt: input.changedAt }) }));
  }

  async clearReusableLlmContextScope(input: { projectId: string; flowId: string; subflowId?: string | null; domainId?: string; actorId?: string; changedAt?: number }): Promise<{ deleted: string[] }> {
    return this.withReusableLlmContextStore(input.projectId, (store) => store.clearScope({ flowId: input.flowId, ...(input.subflowId === undefined ? {} : { subflowId: input.subflowId }), ...(input.domainId ? { domainId: input.domainId } : {}), ...(input.actorId ? { actorId: input.actorId } : {}), ...(input.changedAt === undefined ? {} : { changedAt: input.changedAt }) }));
  }

  async purgeExpiredReusableLlmContexts(input: { projectId: string; now?: number; limit?: number; domainId?: string; actorId?: string }): Promise<{ deleted: string[] }> {
    return this.withReusableLlmContextStore(input.projectId, (store) => store.purgeExpired({ ...(input.now === undefined ? {} : { now: input.now }), ...(input.limit === undefined ? {} : { limit: input.limit }), ...(input.domainId ? { domainId: input.domainId } : {}), ...(input.actorId ? { actorId: input.actorId } : {}) }));
  }

  async packReusableLlmContexts(input: { projectId: string; flowId: string; subflowId?: string | null; domainId: string; evidenceKind: string; evidenceSchemaVersion: string; sanitizerVersion: string; compatibilityTags?: AutomationStudioReusableLlmContextList["compatibilityTags"]; maxInputTokens: number; actorId?: string; now?: number }): Promise<AutomationStudioReusableLlmContextPackingResult> {
    return this.withReusableLlmContextStore(input.projectId, async (store) => {
      const candidates = await store.list({ flowId: input.flowId, subflowId: input.subflowId ?? null, domainId: input.domainId, evidenceKind: input.evidenceKind, evidenceSchemaVersion: input.evidenceSchemaVersion, sanitizerVersion: input.sanitizerVersion, compatibilityTags: input.compatibilityTags ?? [], compatibilityMode: "exact", ...(input.now === undefined ? {} : { now: input.now }), limit: 100 });
      const packed = packAutomationStudioReusableLlmContext({ candidates, maxInputTokens: input.maxInputTokens });
      await store.appendAudit({ eventType: "packed", flowId: input.flowId, ...(input.subflowId ? { subflowId: input.subflowId } : {}), domainId: input.domainId, ...(input.actorId ? { actorId: input.actorId } : {}), detail: { consideredCount: packed.consideredCount, selectedCount: packed.selectedRecordIds.length, deduplicatedCount: packed.deduplicatedCount, excludedDispositionCount: packed.excludedDispositionCount, packedBytes: packed.packedBytes, estimatedTokens: packed.estimatedTokens, selectedRecordIds: packed.selectedRecordIds.join(","), sourceRunIds: packed.selectedSourceRunIds.join(","), sourceAdaptationIds: packed.selectedSourceAdaptationIds.join(",") }, ...(input.now === undefined ? {} : { createdAt: input.now }) });
      return packed;
    });
  }

  private async reusableLlmContextForFreshEvidence(input: AutomationStudioReusableLlmContextFreshEvidenceInput & { optedIn: boolean; maxInputTokens: number; actorId?: string; now?: number }): Promise<{ packet?: AutomationStudioReusableLlmContextPacket; metadata: JsonObject } | undefined> {
    if (!input.optedIn || !this.reusableLlmContextEnabled) return undefined;
    const miss = (reason: string): { metadata: JsonObject } => ({ metadata: { status: "miss", reason, freshContributionCount: input.freshEvidenceCount, reusedContributionCount: 0, sourceRecordIds: [], sourceRunIds: [], sourceAdaptationIds: [] } });
    if (!this.reusableLlmContextContentProtection || !this.reusableLlmContextFreshEvidenceSelector) return miss("unavailable");
    if (!Number.isSafeInteger(input.freshEvidenceCount) || input.freshEvidenceCount < 1) return miss("fresh_evidence_required");
    try {
      const selection = await this.reusableLlmContextFreshEvidenceSelector(input);
      if (!selection?.domainId || !selection.evidenceKind || !selection.evidenceSchemaVersion || !selection.sanitizerVersion) return miss("selection_unavailable");
      const packed = await this.packReusableLlmContexts({
        projectId: input.projectId, flowId: input.flowId, ...(input.subflowId ? { subflowId: input.subflowId } : {}), domainId: selection.domainId,
        evidenceKind: selection.evidenceKind, evidenceSchemaVersion: selection.evidenceSchemaVersion, sanitizerVersion: selection.sanitizerVersion,
        compatibilityTags: selection.compatibilityTags ?? [], maxInputTokens: input.maxInputTokens,
        ...(input.actorId ? { actorId: input.actorId } : {}), ...(input.now === undefined ? {} : { now: input.now })
      });
      const metadata: JsonObject = {
        status: packed.selectedRecordIds.length ? "hit" : "miss",
        reason: packed.selectedRecordIds.length ? "compatible_context_selected" : "no_compatible_context",
        freshContributionCount: input.freshEvidenceCount,
        reusedContributionCount: packed.selectedRecordIds.length,
        consideredCount: packed.consideredCount,
        packedBytes: packed.packedBytes,
        estimatedTokens: packed.estimatedTokens,
        sourceRecordIds: packed.selectedRecordIds,
        sourceRunIds: packed.selectedSourceRunIds,
        sourceAdaptationIds: packed.selectedSourceAdaptationIds
      };
      return { ...(packed.packet?.items.length ? { packet: packed.packet } : {}), metadata };
    } catch {
      return miss("retrieval_failed");
    }
  }

  getFlowBootstrapGenerationRuntimeReadiness(): {
    providerResolverConfigured: boolean;
    nativeNodeRegistryConfigured: boolean;
  } {
    const native = this.nativeNodeRuntime;
    const nativeDefinitions = native?.listDefinitions() ?? [];
    const hasControlFoundation = Boolean(
      native?.sdk.nodes.get("builtin.control.start")
      && native.sdk.nodes.get("builtin.control.end")
    );
    const hasExecutableDomainNode = nativeDefinitions.some((definition) => definition.id !== "builtin.control.start" && definition.id !== "builtin.control.end" && definition.capabilities.executable === true);
    return {
      providerResolverConfigured: typeof this.llmProviderResolver === "function",
      nativeNodeRegistryConfigured: hasControlFoundation && hasExecutableDomainNode
    };
  }

  async getLlmExecutionBinding(projectId: string, flowId: string): Promise<{ executionDigest: string; settingsRevision: number }> {
    const [flow, executionDigest] = await Promise.all([
      this.getFlow(projectId, flowId),
      this.getLlmExecutionDependencyDigest(projectId, flowId)
    ]);
    let settingsRevision: number;
    if (this.projectDatabasePool && this.projectPaths.root) {
      const repository = await AutomationStudioProjectFlowResourceRepository.open({
        pool: this.projectDatabasePool,
        projectId
      });
      try {
        const persisted = await repository.getFlow(flowId);
        if (!persisted) throw new Error(`Flow ${flowId} has no canonical settings revision.`);
        settingsRevision = persisted.settingsRevision;
      } finally {
        await repository.close();
      }
    } else {
      settingsRevision = automationStudioFlowSettingsFingerprint(flow);
    }
    return { executionDigest, settingsRevision };
  }

  private async runFlowBootstrapLlmHarness(
    input: Parameters<typeof runAutomationStudioLlmHarness>[0]
  ): ReturnType<typeof runAutomationStudioLlmHarness> {
    return await runAutomationStudioLlmHarness(input);
  }

  async generateFlowBootstrapAdaptation(
    input: AutomationStudioGenerateFlowBootstrapAdaptationInput
  ): Promise<AutomationStudioGenerateFlowBootstrapAdaptationResult> {
    const unsafeInput = input as unknown as Record<string, unknown>;
    const unsafeGrant = unsafeInput.executionGrant as Record<string, unknown> | undefined;
    const grantId = typeof unsafeGrant?.grantId === "string" ? unsafeGrant.grantId : "";
    let failureStage: AutomationStudioFlowBootstrapFailureStage = "pre_provider_validation";
    let failureCode: AutomationStudioFlowBootstrapPhaseFailureCode = "flow_bootstrap.invalid_input";
    let failureAccounting: AutomationStudioBootstrapAccounting | undefined;
    try {
      assertExactObjectFields(unsafeInput, ["projectId", "flowId", "executionGrant", "evidenceGuided", "useReusableContext"], "Flow Bootstrap generation input");
      if (unsafeInput.evidenceGuided !== undefined && unsafeInput.evidenceGuided !== true) throw new Error("Evidence-guided generation flag is invalid.");
      if (unsafeInput.useReusableContext !== undefined && unsafeInput.useReusableContext !== true) throw new Error("Reusable-context generation flag is invalid.");
      if (unsafeInput.useReusableContext === true && unsafeInput.evidenceGuided !== true) throw new Error("Reusable context requires evidence-guided generation with a fresh inspection.");
      if (!unsafeGrant) throw new Error("A build_and_adapt execution grant is required.");
      assertExactObjectFields(unsafeGrant, [
        "grantId",
        "actorUserId",
        "actorSessionId",
        "purpose",
        "executionDigest",
        "settingsRevision"
      ], "Flow Bootstrap execution grant");
      if (unsafeGrant.purpose !== "build_and_adapt") throw new Error("Flow Bootstrap generation requires a build_and_adapt execution grant.");
      const projectId = requiredBootstrapCommandId(unsafeInput.projectId, "project");
      const flowId = requiredBootstrapCommandId(unsafeInput.flowId, "Flow");
      const executionGrant: AutomationStudioBuildAndAdaptExecutionGrant = {
        grantId: requiredBootstrapCommandId(unsafeGrant.grantId, "execution grant"),
        actorUserId: requiredBootstrapCommandId(unsafeGrant.actorUserId, "actor user"),
        actorSessionId: requiredBootstrapCommandId(unsafeGrant.actorSessionId, "actor session"),
        purpose: "build_and_adapt",
        executionDigest: requiredBootstrapDigest(unsafeGrant.executionDigest),
        settingsRevision: requiredBootstrapSettingsRevision(unsafeGrant.settingsRevision)
      };
      failureCode = "flow_bootstrap.pre_provider_validation_failed";
      return await this.locks.withBootstrapGenerationLock(projectId, flowId, async () => {
        failureCode = "flow_bootstrap.blank_target_required";
        const parent = await this.assertBlankBootstrapTarget(projectId, flowId);
        failureCode = "flow_bootstrap.canonical_settings_binding_unavailable";
        const binding = await this.getLlmExecutionBinding(projectId, flowId);
        if (executionGrant.executionDigest !== binding.executionDigest
          || executionGrant.settingsRevision !== binding.settingsRevision) {
          throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.stale_grant_binding");
        }
        failureCode = "flow_bootstrap.pre_provider_validation_failed";
        const pending = (await this.bootstrapAdaptations.listFlowBootstrapAdaptations(projectId, flowId))
          .find((adaptation) => adaptation.status === "proposed" || adaptation.status === "validated");
        if (pending) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.pending_adaptation_exists");
        failureCode = "flow_bootstrap.pre_provider_validation_failed";
        const instructions = await this.getAllFlowInstructionsForBootstrap(projectId, flowId);
        const resolvedInstructions = resolveAutomationStudioLlmInstructions({
          instructions,
          projectId,
          flowId
        });
        if (!resolvedInstructions.instructions.length
          || resolvedInstructions.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
          throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.active_instructions_required");
        }
        const registry = this.nativeNodeRuntime?.sdk.nodes ?? new AutomationStudioNodeRegistry();
        const resolution = this.nativeNodeRuntime?.getRegistryResolution(parent.scope) ?? {
          scope: parent.scope,
          runtimeCapabilities: [],
          permissions: []
        };
const bootstrapInstructionText = resolvedInstructions.instructions
          .map((instruction) => `${instruction.title}\n${instruction.body}`)
          .join("\n");
        const bootstrapContext = buildAutomationStudioFlowBootstrapContext({
          registry,
          resolution,
          instructionText: bootstrapInstructionText,
          ...(input.evidenceGuided ? { maxCatalogEntries: 12 } : {}),
          maxCatalogBytes: automationStudioFlowBootstrapCatalogByteBudget({
            maxInputTokens: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens,
            instructionBytes: Buffer.byteLength(JSON.stringify(resolvedInstructions), "utf8")
          })
        });
        if (!bootstrapContext.nodeCatalog.length) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.node_catalog_unavailable");
        if (bootstrapContext.catalogSelection.missingRequiredTerms.length) {
          throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.required_capabilities_unavailable");
        }
        failureStage = "provider_resolution";
        failureCode = "flow_bootstrap.provider_resolver_unavailable";
        if (!this.llmProviderResolver) throw flowBootstrapPhaseFailure("provider_resolution", undefined, "flow_bootstrap.provider_resolver_unavailable");
        failureCode = "flow_bootstrap.provider_resolution_failed";
        const unresolvedProvider = await this.llmProviderResolver({
          projectId,
          flowId,
          executionGrant
        });
        if (!unresolvedProvider || !("provider" in unresolvedProvider)) {
          throw flowBootstrapPhaseFailure("provider_resolution", undefined, "flow_bootstrap.provider_resolution_invalid");
        }
        failureStage = "provider_request";
        failureCode = "flow_bootstrap.provider_request_failed";
        let generatedSummary: string;
        let generatedPlan: AutomationStudioFlowBootstrapPlan;
        let evidenceTrace: AutomationStudioLlmEvidenceLoopTrace[] | undefined;
        let evidenceLoopResult: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }> | undefined;
        let reusableContextResult: { packet?: AutomationStudioReusableLlmContextPacket; metadata: JsonObject } | undefined;
        let accounting: AutomationStudioBootstrapAccounting;
        if (input.evidenceGuided) {
          if (!this.llmEvidenceRuntime?.tools.length) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.pre_provider_validation_failed");
          let estimatedInputTokens = 0;
          const completionSchema = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA;
          const loop = await runAutomationStudioLlmEvidenceLoop({
            tools: this.llmEvidenceRuntime.tools,
            minToolCalls: 1,
            propagateDecisionErrors: true,
            maxEvidenceBytes: 64_000,
            maxEvidenceContextBytes: 8_000,
            completionSchema,
            maxIterations: Math.min(unresolvedProvider.maxCallsPerRun ?? 4, 8),
            maxToolCalls: 7,
            decide: async ({ iteration, tools, evidence, decisionSchema, canComplete, signal }) => {
              if (input.useReusableContext === true && evidence.length) {
                reusableContextResult = await this.reusableLlmContextForFreshEvidence({
                  optedIn: true, taskKind: "flow_bootstrap", projectId, flowId,
                  freshEvidence: evidence.map((item) => item.value), freshEvidenceCount: evidence.length,
                  maxInputTokens: resolveAutomationStudioLlmTokenLimits(unresolvedProvider.tokenLimits).limits.maxInputTokens,
                  actorId: executionGrant.actorUserId
                });
              }
              const decision = await this.runFlowBootstrapLlmHarness({
                taskKind: "evidence_tool_decision", projectId, flowId, instructions,
                evidenceLoop: { iteration, tools, evidence: evidence.map((item) => ({ ...item })), decisionSchema, completionSchema, canComplete },
                // Reserve evidence-decision input capacity for the dynamic tool
                // schema and accumulated evidence instead of allowing the node
                // catalog to consume the ordinary Bootstrap input allocation.
                flowBootstrap: { registry, resolution, maxInputTokens: 5_000 },
                ...(reusableContextResult?.packet ? { reusableContext: reusableContextResult.packet } : {}),
                provider: unresolvedProvider.provider, ...(unresolvedProvider.tokenLimits ? { tokenLimits: unresolvedProvider.tokenLimits } : {}),
                ...(unresolvedProvider.maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd: unresolvedProvider.maxEstimatedCostUsd } : {}),
                ...(unresolvedProvider.timeoutMs !== undefined ? { timeoutMs: unresolvedProvider.timeoutMs } : {}),
                expectedOutput: "evidence_tool_decision", ...(signal ? { signal } : {})
              });
              estimatedInputTokens += decision.request.estimatedInputTokens;
              if (!decision.ok || decision.response?.kind !== "evidence_tool_decision") throw flowBootstrapHarnessFailure(decision);
              return { ...decision.response.decision, ...(decision.usage ? { usage: decision.usage } : {}) };
            },
            executeTool: ({ callId, toolId, value, maxEvidenceBytes, signal }) => this.llmEvidenceRuntime!.executeTool({ projectId, flowId, callId, toolId, value, maxEvidenceBytes, ...(signal ? { signal } : {}) })
          });
          if (!loop.ok) throw flowBootstrapEvidenceLoopFailure(loop);
          evidenceLoopResult = loop;
          evidenceTrace = loop.trace;
          failureStage = "provider_output_validation";
          accounting = sanitizedBootstrapAccounting({ requestId: `evidence.${randomUUID()}`, estimatedInputTokens,
            provider: unresolvedProvider.provider.metadata.provider, model: unresolvedProvider.provider.metadata.model,
            inputTokens: loop.accounting.inputTokens, outputTokens: loop.accounting.outputTokens,
            totalTokens: loop.accounting.totalTokens, estimatedCostUsd: loop.accounting.estimatedCostUsd });
          failureAccounting = accounting;
          const candidate = loop.result;
          if (Object.keys(candidate).some((key) => !["summary", "plan"].includes(key)) || typeof candidate.summary !== "string" || !candidate.summary.trim()) {
            throw flowBootstrapEvidenceCompletionFailure(loop, accounting, "flow_bootstrap.evidence_completion_wrapper_invalid");
          }
          const parsedCandidate = parseAutomationStudioFlowBootstrapPlan(candidate.plan);
          if (!parsedCandidate.plan || parsedCandidate.issues.some((issue) => issue.severity === "error")) {
            throw flowBootstrapEvidenceCompletionFailure(loop, accounting, "flow_bootstrap.evidence_completion_plan_invalid");
          }
          if (!isAutomationStudioEvidenceFlowBootstrapResultWithinLimits({ summary: candidate.summary, plan: parsedCandidate.plan })) {
            throw flowBootstrapEvidenceCompletionFailure(loop, accounting, "flow_bootstrap.evidence_completion_profile_limit_exceeded");
          }
          generatedSummary = candidate.summary;
          generatedPlan = parsedCandidate.plan;
        } else {
          const result = await this.runFlowBootstrapLlmHarness({
            taskKind: "flow_bootstrap", projectId, flowId, instructions,
            flowBootstrap: { registry, resolution, maxInputTokens: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens },
            provider: unresolvedProvider.provider, ...(unresolvedProvider.tokenLimits ? { tokenLimits: unresolvedProvider.tokenLimits } : {}),
            ...(unresolvedProvider.maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd: unresolvedProvider.maxEstimatedCostUsd } : {}),
            ...(unresolvedProvider.timeoutMs !== undefined ? { timeoutMs: unresolvedProvider.timeoutMs } : {}),
            expectedOutput: "flow_bootstrap", metadata: { source: "generateFlowBootstrapAdaptation" }
          });
          if (!result.ok || result.response?.kind !== "flow_bootstrap") throw flowBootstrapHarnessFailure(result);
          generatedSummary = result.response.summary;
          generatedPlan = result.response.plan;
          accounting = sanitizedBootstrapAccounting({ requestId: result.request.requestId, estimatedInputTokens: result.request.estimatedInputTokens,
            ...(result.provider?.provider ? { provider: result.provider.provider } : {}), ...(result.provider?.model ? { model: result.provider.model } : {}),
            ...(result.usage?.inputTokens !== undefined ? { inputTokens: result.usage.inputTokens } : {}), ...(result.usage?.outputTokens !== undefined ? { outputTokens: result.usage.outputTokens } : {}),
            ...(result.usage?.totalTokens !== undefined ? { totalTokens: result.usage.totalTokens } : {}), ...(result.usage?.estimatedCostUsd !== undefined ? { estimatedCostUsd: result.usage.estimatedCostUsd } : {}) });
        }
        failureStage = "provider_output_validation";
        failureCode = input.evidenceGuided
          ? "flow_bootstrap.evidence_completion_plan_invalid"
          : "flow_bootstrap.provider_output_validation_failed";
        failureAccounting = accounting;
        const validated = validateAutomationStudioFlowBootstrapPlan({
          plan: generatedPlan,
          registry,
          resolution
        });
        if (!validated.ok || !validated.validated) {
          if (evidenceLoopResult) {
            throw flowBootstrapEvidenceCompletionFailure(evidenceLoopResult, accounting, "flow_bootstrap.evidence_completion_plan_invalid");
          }
          throw new Error("Flow Bootstrap generation returned an invalid plan.");
        }
        failureStage = "post_provider_validation";
        failureCode = "flow_bootstrap.post_provider_validation_failed";
        const currentBinding = await this.getLlmExecutionBinding(projectId, flowId);
        if (currentBinding.executionDigest !== binding.executionDigest
          || currentBinding.settingsRevision !== binding.settingsRevision) {
          throw new Error("FLOW_BOOTSTRAP_STALE: Flow or settings changed during generation.");
        }

        failureStage = "persistence";
        failureCode = "flow_bootstrap.persistence_failed";
        const adaptation = await this.createFlowBootstrapAdaptation({
          projectId,
          flowId,
          baseDependencyDigest: binding.executionDigest,
          sourceInstructionIds: resolvedInstructions.instructionIds,
          summary: generatedSummary,
          buildPlan: validated.validated,
          accounting,
          ...(evidenceTrace ? { evidenceTrace } : {}),
          ...(reusableContextResult ? { reusableContext: reusableContextResult.metadata } : {}),
          actorId: executionGrant.actorUserId
        });
        return {
          projectId,
          flowId,
          adaptationId: adaptation.adaptationId,
          status: "proposed",
          riskLevel: adaptation.riskLevel,
          sourceInstructionIds: [...adaptation.sourceInstructionIds],
          baseDependencyDigest: adaptation.baseDependencyDigest,
          baseSettingsRevision: adaptation.baseSettingsRevision,
          accounting: structuredClone(accounting)

        };
      });
    } catch (error) {
      const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
      if (diagnostic) throw new AutomationStudioFlowBootstrapGenerationError(diagnostic);
      throw flowBootstrapPhaseFailure(failureStage, failureAccounting, failureCode);
    } finally {
      if (grantId) this.revokeLlmExecutionGrant?.(grantId);
    }
  }
  async createFlowBootstrapAdaptation(input: {
    projectId: string;
    flowId: string;
    baseDependencyDigest: string;
    sourceInstructionIds: string[];
    summary: string;
    buildPlan: AutomationStudioFlowBuildPlan;
    accounting?: AutomationStudioBootstrapAccounting;
    evidenceTrace?: AutomationStudioLlmEvidenceLoopTrace[];
    reusableContext?: JsonObject;
    actorId?: string;
  }): Promise<AutomationStudioBootstrapAdaptation> {
    return await this.locks.withBootstrapAdaptationLock(input.projectId, input.flowId, async () => {
      const parent = await this.assertBlankBootstrapTarget(input.projectId, input.flowId);
      const binding = await this.getLlmExecutionBinding(input.projectId, input.flowId);
      if (!input.baseDependencyDigest.trim() || input.baseDependencyDigest !== binding.executionDigest) {
        throw new Error("FLOW_BOOTSTRAP_STALE: base dependency digest does not match the current Flow.");
      }
      assertAutomationStudioBootstrapHasNoRecordingProvenance(input);
      const validation = validateAutomationStudioFlowBootstrapPlan({
        plan: input.buildPlan.plan,
        registry: this.nativeNodeRuntime?.sdk.nodes ?? new AutomationStudioNodeRegistry(),
        resolution: this.nativeNodeRuntime?.getRegistryResolution(parent.scope) ?? {
          scope: parent.scope,
          runtimeCapabilities: [],
          permissions: []
        }
      });
      if (!validation.ok || !validation.validated) {
        throw new Error(`Invalid Automation Studio Flow Bootstrap plan: ${validation.issues.map((issue) => `${issue.path ?? "plan"} (${issue.code})`).join(", ")}`);
      }
      const sourceInstructionIds = uniqueStrings(input.sourceInstructionIds.map((value) => value.trim()).filter(Boolean)).sort();
      if (!sourceInstructionIds.length) throw new Error("Flow Bootstrap requires at least one active source instruction.");
      for (const instructionId of sourceInstructionIds) {
        const instruction = await this.getFlowInstruction(input.projectId, instructionId);
        const scope = instruction?.scope;
        const inScope = scope?.kind === "global"
          || scope?.kind === "project" && scope.projectId === input.projectId
          || scope?.kind === "flow" && scope.projectId === input.projectId && scope.flowId === input.flowId;
        if (!instruction || instruction.status !== "active" || !inScope) {
          throw new Error(`Flow Bootstrap source instruction is missing, inactive, or outside the target Flow scope: ${instructionId}`);
        }
      }
      const summary = input.summary.trim();
      if (!summary) throw new Error("Flow Bootstrap adaptation summary is required.");
      const adaptationId = `adaptation.bootstrap.${randomUUID()}`;
      const now = Date.now();
      const buildPlan = validation.validated;
      const adaptation: AutomationStudioBootstrapAdaptation = {
        schemaVersion: "0.1",
        kind: "flow_bootstrap",
        adaptationId,
        projectId: input.projectId,
        flowId: input.flowId,
        baseDependencyDigest: binding.executionDigest,
        baseSettingsRevision: binding.settingsRevision,
        sourceInstructionIds,
        summary,
        riskLevel: buildPlan.risk,
        ...(input.accounting ? { accounting: sanitizedBootstrapAccounting(input.accounting) } : {}),
        ...(input.evidenceTrace ? { evidenceTrace: sanitizeEvidenceLoopTrace(input.evidenceTrace) } : {}),
        ...(input.reusableContext ? { reusableContext: structuredClone(input.reusableContext) } : {}),
        buildPlan,
        topology: normalizeAutomationStudioFlowBuildPlan({
          adaptationId,
          parentFlow: parent,
          buildPlan,
          sourceInstructionIds,
          now
        }),
        status: "proposed",
        createdAt: now,
        updatedAt: now,
        auditEvents: [bootstrapAdaptationAuditEvent({ adaptationId, eventType: "created", actorId: input.actorId ?? null, fromStatus: null, toStatus: "proposed", createdAt: now, ...((input.evidenceTrace || input.reusableContext) ? { detail: { ...(input.evidenceTrace ? evidenceTraceAuditDetail(input.evidenceTrace) : {}), ...(input.reusableContext ? { reusableContext: structuredClone(input.reusableContext) } : {}) } } : {}) })]
      };
      await this.bootstrapAdaptations.saveFlowBootstrapAdaptation(adaptation);
      await this.appendBootstrapAdaptationChangeFeed(adaptation, "create");
      return structuredClone(adaptation);
    });
  }

  async getFlowBootstrapAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioBootstrapAdaptation | null> {
    return await this.bootstrapAdaptations.getFlowBootstrapAdaptation(projectId, flowId, adaptationId);
  }

  async reviewFlowBootstrapAdaptation(input: {
    projectId: string;
    flowId: string;
    adaptationId: string;
    action: "approve" | "reject" | "apply" | "revert";
    actorId?: string;
    reason?: string;
  }): Promise<AutomationStudioBootstrapAdaptation> {
    return await this.locks.withBootstrapAdaptationLock(input.projectId, input.flowId, async () => {
      const adaptation = await this.getFlowBootstrapAdaptation(input.projectId, input.flowId, input.adaptationId);
      if (!adaptation) throw new Error(`Unknown Flow Bootstrap adaptation: ${input.adaptationId}`);
      if (input.action === "approve") {
        if (adaptation.status !== "proposed") throw new Error("Only a proposed Flow Bootstrap adaptation can be approved.");
        return await this.transitionFlowBootstrapAdaptation(adaptation, "validated", "approved", input.actorId ?? null);
      }
      if (input.action === "reject") {
        if (adaptation.status !== "proposed" && adaptation.status !== "validated") throw new Error("Only a proposed or validated Flow Bootstrap adaptation can be rejected.");
        return await this.transitionFlowBootstrapAdaptation(adaptation, "rejected", "rejected", input.actorId ?? null);
      }
      if (input.action === "apply") return await this.applyFlowBootstrapAdaptation(adaptation, input.actorId ?? "runtime");
      return await this.revertFlowBootstrapAdaptation(adaptation, input.actorId ?? "runtime");
    });
  }
  async saveFlow(input: { projectId: string; flow: AutomationStudioFlowArtifact; expectedUpdatedAt?: number }): Promise<AutomationStudioFlowArtifact> {
    return await this.flowWriter.saveFlowInternal(input, false);
  }

  async getFlowGraphViewport(input: {
    projectId: string;
    flowId: string;
    bounds: AutomationStudioGraphBounds;
    cursor?: string | null;
    limit?: number;
    pinnedNodeIds?: string[];
  }): Promise<{ flow: AutomationStudioFlowArtifact; page: AutomationStudioGraphViewportPage }> {
    await this.projects.findProject(input.projectId);
    if (!this.projectDatabasePool) throw new Error("Project graph storage is unavailable.");
    const canonical = await this.getFlow(input.projectId, input.flowId);
    const graph = await AutomationStudioProjectGraphRepository.open({
      pool: this.projectDatabasePool,
      projectId: input.projectId
    });
    try {
      const revisions = await graph.revisions({ flowId: input.flowId, limit: 1 });
      if (!revisions.items.length) await graph.importMonolithicFlowGraph(canonical);
      const page = await graph.viewport({
        flowId: input.flowId,
        bounds: input.bounds,
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.pinnedNodeIds !== undefined ? { pinnedNodeIds: input.pinnedNodeIds } : {})
      });
      return {
        flow: {
          ...canonical,
          nodes: [],
          edges: [],
          metadata: { ...(canonical.metadata ?? {}), graphRevision: page.graphRevision }
        },
        page
      };
    } finally {
      await graph.close();
    }
  }

  async applyFlowGraphPatch(input: {
    projectId: string;
    flowId: string;
    baseRevision: number;
    mutationId: string;
    operations: AutomationStudioGraphPatchOperation[];
    authorId?: string | null;
    message?: string;
  }): Promise<{
    result: AutomationStudioGraphPatchResult;
    replayed: boolean;
    flow?: AutomationStudioFlowArtifact & { graphRevision: number };
  }> {
    await this.projects.findProject(input.projectId);
    if (!this.projectDatabasePool) throw new Error("Project graph storage is unavailable.");
    const canonical = await this.getFlow(input.projectId, input.flowId);
    await this.assertFlowGraphMutationAllowed(input.projectId, canonical);
    const graph = await AutomationStudioProjectGraphRepository.open({
      pool: this.projectDatabasePool,
      projectId: input.projectId
    });
    try {
      const revisions = await graph.revisions({ flowId: input.flowId, limit: 1 });
      if (!revisions.items.length) await graph.importMonolithicFlowGraph(canonical);
      const applied = await graph.applyPatch({
        pool: this.projectDatabasePool,
        projectId: input.projectId,
        flowId: input.flowId,
        baseRevision: input.baseRevision,
        mutationId: input.mutationId,
        operations: input.operations,
        ...(input.authorId === undefined ? {} : { authorId: input.authorId }),
        ...(input.message ? { message: input.message } : {})
      });
      if (applied.response.status === "conflict") {
        return { result: applied.response, replayed: applied.replayed };
      }
      const snapshot = await graph.exportSnapshotData(input.flowId);
      const nextFlow: AutomationStudioFlowArtifact = {
        ...canonical,
        nodes: snapshot.nodes.map((node) => ({
          id: node.nodeId,
          definitionId: node.definitionId,
          definitionVersion: node.definitionVersion,
          label: node.label,
          ...(node.description ? { description: node.description } : {}),
          parameterValues: node.parameterValues,
          position: { x: node.x, y: node.y },
          metadata: node.metadata
        })),
        edges: snapshot.edges.map((edge) => ({
          id: edge.edgeId,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          ...(edge.sourcePortId ? { sourcePortId: edge.sourcePortId } : {}),
          ...(edge.targetPortId ? { targetPortId: edge.targetPortId } : {}),
          ...(edge.label ? { label: edge.label } : {}),
          metadata: edge.metadata
        })),
        metadata: {
          ...(canonical.metadata ?? {}),
          graphRevision: applied.response.revisionNumber
        }
      };
      const saved = await this.flowWriter.saveFlowInternal({ projectId: input.projectId, flow: nextFlow }, false);
      return {
        result: applied.response,
        replayed: applied.replayed,
        flow: { ...saved, graphRevision: applied.response.revisionNumber }
      };
    } finally {
      await graph.close();
    }
  }


  private async assertFlowGraphMutationAllowed(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void> {
    const kind = this.flowWriter.persistedFlowRepresentation(flow);
    if (kind === "legacy_single_graph") return;
    if (kind === "orchestration") throw new Error("Top-level orchestration Flows cannot own Nodes or edges; apply graph patches to a Subflow graph Flow instead.");
    await this.flowWriter.assertOwnedSubflowGraph(projectId, flow);
  }

  async compileAndSaveFlowSource(input: { projectId: string; flowId: string; moduleId: string; sourceText: string }): Promise<{ compilation: AutomationStudioFlowCompilation; flow?: AutomationStudioFlowArtifact }> {
    const existing = await this.getFlow(input.projectId, input.flowId);
    const compilation = compileFlowSource(input.sourceText, { projectId: input.projectId, moduleId: input.moduleId, ...(this.nativeNodeRuntime ? { registry: this.nativeNodeRuntime.sdk.nodes } : {}) });
    if (!compilation.ok) return { compilation };
    if (compilation.plan.flow.flowId !== existing.flowId) throw new Error("Compiled Flow ID must match the Flow being converted.");
    if (!sameFlowScope(compilation.plan.flow.scope, existing.scope)) throw new Error("Compiled Flow scope must match the project scope.");
    const representationKind = this.flowWriter.persistedFlowRepresentation(existing);
    const flow: AutomationStudioFlowArtifact = withFlowSourceFileMetadata({
      ...compilation.plan.flow,
      projectId: existing.projectId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      publication: { status: "draft" as const },
      ...(existing.publicationHistory ? { publicationHistory: existing.publicationHistory } : {}),
      metadata: withAutomationStudioFlowRepresentation({ ...(existing.metadata ?? {}), ...(compilation.plan.flow.metadata ?? {}) }, representationKind)
    });
    await this.flowWriter.assertFlowRepresentationSaveAllowed(input.projectId, existing, flow, representationKind);
    const saved = await this.repositories.flows.put(flow);
    await this.flows.writeProjectFlow(input.projectId, saved);
    await this.flowWriter.writeFlowSourceFile(input.projectId, saved, input.sourceText);
    await this.flowWriter.writeGeneratedFlowConfig(input.projectId, saved);
    return { compilation, flow: saved };
  }

  async convertFlowToVisual(input: { projectId: string; flowId: string }): Promise<AutomationStudioFlowArtifact> {
    const existing = await this.getFlow(input.projectId, input.flowId);
    if (existing.source.mode !== "code") return existing;
    const representationKind = this.flowWriter.persistedFlowRepresentation(existing);
    const flow = withFlowSourceFileMetadata({
      ...convertCodeOwnedFlowToVisual(existing),
      metadata: withAutomationStudioFlowRepresentation(existing.metadata, representationKind)
    });
    await this.flowWriter.assertFlowRepresentationSaveAllowed(input.projectId, existing, flow, representationKind);
    const saved = await this.repositories.flows.put(flow);
    await this.flows.writeProjectFlow(input.projectId, saved);
    await this.flowWriter.writeFlowSourceFile(input.projectId, saved);
    await this.flowWriter.writeGeneratedFlowConfig(input.projectId, saved);
    return saved;
  }

  async deleteFlow(input: { projectId: string; flowId: string }): Promise<{ deletedFlowId: string }> {
    return await this.flowWriter.deleteFlowArtifact(input, false);
  }

  /** Publishes an immutable interface snapshot; Call Flow execution is introduced later. */
  async publishFlow(input: { projectId: string; flowId: string; version: string; flowDigest?: string; publishedBy?: string; changelog?: string }): Promise<AutomationStudioFlowArtifact> {
    const flow = await this.getFlow(input.projectId, input.flowId);
    const now = Date.now();
    const availablePublications = await this.catalogue.listFlowPublicationRecords(input.projectId);
    const dependencyDigests = new Map(availablePublications.map((record) => [`${record.flowId}@${record.version}`, record.snapshot.flowDigest]));
    const registry = this.nativeNodeRuntime?.sdk.nodes ?? new AutomationStudioNodeRegistry();
    const recordingDefinitions = new Map((await this.listRecordingDerivedNodeDefinitions(input.projectId)).map((definition) => [definition.id, definition]));
    const resolvedDefinitions = new Map<string, AutomationStudioNodeDefinition>();
    const pinnedNodes = flow.nodes.map((node, index) => {
      if (getCallFlowConfiguration(node)) return node;
      const definition = registry.get(node.definitionId) ?? recordingDefinitions.get(node.definitionId);
      if (!definition) throw new Error(`Flow cannot be published: nodes.${index}.definitionId (flow.node_definition_unavailable)`);
      if (!nodeDefinitionScopeAllows(definition, flow.scope)) throw new Error(`Flow cannot be published: nodes.${index}.definitionId (flow.node_definition_wrong_scope)`);
      if (node.definitionVersion && node.definitionVersion !== definition.version) throw new Error(`Flow cannot be published: nodes.${index}.definitionVersion (flow.node_definition_version_mismatch)`);
      resolvedDefinitions.set(node.id, definition);
      return node.definitionVersion ? node : { ...node, definitionVersion: definition.version };
    });
    const requiredRuntimeCapabilities = [...new Set([...resolvedDefinitions.values()].flatMap((definition) => definition.requiredRuntimeCapabilities ?? []))];
    const snapshot = createPublishedFlowSnapshot({ ...flow, nodes: pinnedNodes }, input.version, now, { ...(input.publishedBy ? { publishedBy: input.publishedBy } : {}), ...(input.changelog ? { changelog: input.changelog } : {}), dependencyDigests, requiredRuntimeCapabilities });
    const history = flow.publicationHistory ?? (flow.publication.status === "published" && flow.publication.snapshot ? [flow.publication.snapshot] : []);
    const publicationId = flowPublicationId(flow.flowId, input.version);
    const existingRecord = await this.repositories.flowPublications.get(publicationId);
    const existingVersion = existingRecord?.snapshot ?? history.find((item) => item.version === input.version);
    if (existingVersion) {
      if (existingVersion.flowDigest !== snapshot.flowDigest) throw new Error(`Published Flow version ${input.version} is immutable; publish a new semantic version.`);
      return flow;
    }
    const published = {
      ...flow,
      visibility: "public" as const,
      publication: {
        status: "published" as const,
        version: input.version,
        publishedAt: now,
        flowDigest: snapshot.flowDigest,
        interface: structuredClone(flow.interface),
        snapshot
      },
      publicationHistory: [...history, snapshot]
    };
    const composition = validateFlowComposition({
      flow: published,
      publishedSnapshots: availablePublications.map((record) => record.snapshot),
      deprecatedPublicationIds: availablePublications.filter((record) => record.status === "deprecated").map((record) => `${record.flowId}@${record.version}`),
      ...(flow.executionDefaults?.authorizedDomainIds ? { authorizedDomainIds: flow.executionDefaults.authorizedDomainIds } : {})
    });
    if (!composition.ok) throw new Error(`Flow cannot be published: ${composition.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    const saved = await this.flowWriter.saveFlowInternal({
      projectId: input.projectId,
      flow: published
    }, true);
    await this.repositories.flowPublications.put({ schemaVersion: "0.1", publicationId, projectId: input.projectId, flowId: flow.flowId, version: input.version, status: "published", snapshot, createdAt: now });
    return saved;
  }

  async listFlowPublications(projectId: string, flowId?: string): Promise<AutomationStudioFlowPublicationRecord[]> {
    await this.projects.findProject(projectId);
    return (await this.catalogue.listFlowPublicationRecords(projectId)).filter((record) => record.projectId === projectId && (!flowId || record.flowId === flowId)).sort((left, right) => right.createdAt - left.createdAt);
  }

  async deprecateFlowPublication(input: { projectId: string; flowId: string; version: string; reason?: string }): Promise<AutomationStudioFlowPublicationRecord> {
    const flow = await this.getFlow(input.projectId, input.flowId);
    const publicationId = flowPublicationId(input.flowId, input.version);
    const records = await this.catalogue.listFlowPublicationRecords(input.projectId);
    const current = records.find((record) => record.publicationId === publicationId);
    if (!current) throw new Error(`Unknown published Flow version: ${input.flowId}@${input.version}`);
    if (current.projectId !== input.projectId) throw new Error("Published Flow version belongs to another project.");
    if (current.status === "deprecated") return current;
    const deprecated: AutomationStudioFlowPublicationRecord = { ...current, status: "deprecated", deprecatedAt: Date.now(), ...(input.reason?.trim() ? { deprecationReason: input.reason.trim() } : {}) };
    await this.repositories.flowPublications.put(deprecated);
    if ((flow.publication.status === "published" || flow.publication.status === "deprecated") && flow.publication.version === input.version) {
      await this.repositories.flows.put({ ...flow, publication: { ...flow.publication, status: "deprecated" }, updatedAt: Date.now() });
      await this.flows.writeProjectFlow(input.projectId, { ...flow, publication: { ...flow.publication, status: "deprecated" }, updatedAt: Date.now() });
    }
    return deprecated;
  }

  async inspectFlowDependencies(projectId: string, flowId: string): Promise<{ dependencies: AutomationStudioFlowPublicationRecord[]; usedBy: Array<{ projectId: string; flowId: string; flowName: string; version: string; nodeId: string }>; availableUpgrades: Array<{ nodeId: string; flowId: string; currentVersion: string; versions: string[] }> }> {
    const flow = await this.getFlow(projectId, flowId);
    const records = await this.catalogue.listFlowPublicationRecords(projectId);
    const calls = flow.nodes.flatMap((node) => { const call = getCallFlowConfiguration(node); return call ? [{ node, call }] : []; });
    const dependencies = calls.flatMap(({ call }) => records.filter((record) => record.flowId === call.target.flowId && record.version === call.target.version));
    const scopedFlows = (await Promise.all((await this.catalogue.scopedProjectIdsForProject(projectId)).map((scopedProjectId) => this.catalogue.listCanonicalFlowArtifacts(scopedProjectId)))).flat();
    const usedBy = scopedFlows.filter((candidate) => sameFlowScope(candidate.scope, flow.scope)).flatMap((candidate) => candidate.nodes.flatMap((node) => { const call = getCallFlowConfiguration(node); return call?.target.flowId === flowId ? [{ projectId: candidate.projectId, flowId: candidate.flowId, flowName: candidate.name, version: call.target.version, nodeId: node.id }] : []; }));
    const availableUpgrades = calls.map(({ node, call }) => ({ nodeId: node.id, flowId: call.target.flowId, currentVersion: call.target.version, versions: records.filter((record) => record.flowId === call.target.flowId && record.status === "published" && record.version !== call.target.version).map((record) => record.version).sort(compareSemanticVersions).reverse() })).filter((item) => item.versions.length);
    return { dependencies, usedBy, availableUpgrades };
  }

  /** Public, immutable Flow versions visible as composite-node definitions in this project's scope. */
  async listPublishedFlowNodes(projectId: string) {
    const project = await this.projects.findProject(projectId);
    const scope = flowScopeForProject(project);
    return (await this.catalogue.listFlowPublicationRecords(projectId))
      .filter((record) => record.status === "published")
      .map((record) => record.snapshot)
      .filter((snapshot) => sameFlowScope(snapshot.scope, scope) || (scope.kind === "domain" && snapshot.scope.kind === "global" && (snapshot.requiredRuntimeCapabilities ?? []).length === 0))
      .map(projectPublishedFlowSnapshotToNodeDefinition);
  }

  async listNativeNodeDefinitions(projectId: string) {
    const project = await this.projects.findProject(projectId); const scope = flowScopeForProject(project);
    const native = (this.nativeNodeRuntime?.listDefinitions() ?? []).filter((definition) => definition.availability.kind === "both" || (definition.availability.kind === "global" && scope.kind === "global") || (definition.availability.kind === "domain" && scope.kind === "domain" && definition.availability.domainId === scope.domainId));
    return [...native, ...(await this.listRecordingDerivedNodeDefinitions(projectId))];
  }

  /** Runs importer-owned semanticizers over immutable recording entries. */
  async createRecordingFlowProposals(input: { projectId: string; recordingId: string; mapperId?: string; force?: boolean }): Promise<CreateRecordingFlowProposalsResult> {
    const project = await this.projects.findProject(input.projectId);
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const domainId = recording.environment.domainId ?? project.domainId ?? null;
    if (!domainId) return { proposals: [], issues: ["Recording Flow proposal generation requires a recording or project domainId."] };
    if (!this.nativeNodeRuntime) throw new Error("Recording proposal generation requires a bound importer runtime.");
    if (!this.ioRuntime) throw new Error("Recording proposal generation requires a bound IO registry.");
    const mappers = this.nativeNodeRuntime.listRecordingMappers(domainId).filter((item) => !input.mapperId || item.definition.id === input.mapperId);
    if (input.mapperId && !mappers.length) throw new Error(`Unknown recording mapper for ${domainId}: ${input.mapperId}`);
    if (!mappers.length) return { proposals: [], issues: [`No recording mappers are registered for domain ${domainId}.`] };
    if (!input.force) {
      const mapperIds = new Set(mappers.map((mapper) => mapper.definition.id));
      const existing = (await this.readRecordingFlowProposals(project.id, false))
        .filter((proposal) => proposal.recordingId === recording.recordingId && proposal.status !== "invalidated" && mapperIds.has(proposal.mapper.id));
      const current = latestByGeneratedAt(existing);
      if (current && recordingUpdatedAt(recording) <= current.generatedAt) return { proposals: existing, issues: [] };
    }
    const proposals: RecordingFlowProposalArtifact[] = [];
    const issues: string[] = [];
    const entryCounts = countRecordingEntryTypes(recording.timeline);
    const mapperTimeline = recordingTimelineForProposalMapping(recording.timeline);
    const recordingStateIndex = await this.readRecordingStateIndex(project.id, recording.recordingId);
    if (mapperTimeline.length !== recording.timeline.length) {
      issues.push(`Compacted ${recording.timeline.length - mapperTimeline.length} high-frequency state entries before mapper proposal generation. Raw recording data was preserved.`);
    }
    if (!mapperTimeline.length) {
      issues.push(`No mapper-visible entries remained after compacting high-frequency state. The recording contains ${entryCounts}.`);
    }
    for (const mapper of mappers) {
      const controller = new AbortController();
      const candidates: RecordingFlowActionCandidate[] = [];
      let emittedCandidateCount = 0;
      let mappedEntryCount = 0;
      for (const entry of mapperTimeline) {
        const observation: AutomationStudioRecordingMapperObservation = {
          observationId: entry.id,
          recordingId: recording.recordingId,
          domainId,
          type: entry.type,
          timestamp: entry.timestamp,
          payload: recordingEntryPayload(entry),
          metadata: { ...(entry.metadata ?? {}) }
        };
        try {
          const mapped = await mapper.implementation(observation, { signal: controller.signal, elementMatcher: this.nativeNodeRuntime.elementMatcher });
          const mappedCandidates = !mapped ? [] : "candidates" in mapped ? mapped.candidates : [mapped];
          if (mappedCandidates.length) {
            mappedEntryCount += 1;
            emittedCandidateCount += mappedCandidates.length;
          }
          const candidateInputs = mappedCandidates.length ? mappedCandidates : entry.type === "action" ? [recordingActionEntryCandidate(entry)].filter(Boolean) as AutomationStudioRecordingMapperCandidate[] : [];
          if (!mappedCandidates.length && candidateInputs.length) {
            mappedEntryCount += 1;
            emittedCandidateCount += candidateInputs.length;
          }
          for (const candidate of candidateInputs) {
            const actionEntryId = resolveCandidateActionEntryId(recordingStateIndex, entry.id, candidate);
            const stateLink = recordingStateIndex ? proposalNodeStateLinkFromIndex(recordingStateIndex, actionEntryId) : undefined;
            candidates.push(this.validateRecordingCandidate({
              candidate,
              actionEntryId,
              sourceEntryId: entry.id,
              recordingId: recording.recordingId,
              domainId,
              ...(stateLink ? { stateLink } : {}),
              ...(mapper.definition.outputIds ? { mapperOutputIds: mapper.definition.outputIds } : {})
            }));
          }
        } catch (error) {
          issues.push(`Mapper ${mapper.definition.id} could not map entry ${entry.id}: ${errorMessage(error, "Unknown mapper error.")}`);
        }
      }
      if (!candidates.length) {
        const seenEntrySummary = mapperTimeline.length === recording.timeline.length
          ? `saw ${recording.timeline.length} entries (${entryCounts})`
          : `saw ${mapperTimeline.length} proposal entries from ${recording.timeline.length} raw entries (${entryCounts})`;
        issues.push(`Mapper ${mapper.definition.id} emitted no valid action candidates for recording ${recording.recordingId}. It ${seenEntrySummary}, matched ${mappedEntryCount}, emitted ${emittedCandidateCount} raw candidates, and accepted 0 valid candidates.`);
        continue;
      }
      const now = Date.now();
      const proposal: RecordingFlowProposalArtifact = {
        schemaVersion: "0.1",
        proposalId: `recording-proposal.${safeSegment(recording.recordingId)}.${safeSegment(mapper.definition.id)}.${randomUUID()}`,
        projectId: project.id,
        recordingId: recording.recordingId,
        domainId,
        mapper: { id: mapper.definition.id, version: mapper.definition.version, packageId: mapper.packageId, packageVersion: mapper.packageVersion },
        status: "proposed",
        candidates,
        generatedAt: now,
        updatedAt: now,
        metadata: { rawEvidenceImmutable: true }
      };
      await this.recordings.writePipelineArtifact(project.id, "recordingFlowProposals", proposal.proposalId, proposal as unknown as JsonObject);
      proposals.push(proposal);
    }
    return { proposals, issues };
  }

  async reviewRecordingFlowProposal(input: {
    projectId: string;
    proposalId: string;
    decision: "approved" | "rejected";
    notes?: string;
    reviewerId?: string;
    destination?: { kind: "flow"; flowId?: string; name?: string; writeMode?: "append" | "replace_recording_derived" } | { kind: "node"; visibility: "private" | "public" };
    policyOverride?: PolicyGraph;
  }): Promise<{ proposal: RecordingFlowProposalArtifact; flow?: AutomationStudioFlowArtifact }> {
    const original = await this.recordings.readPipelineArtifact<RecordingFlowProposalArtifact>(input.projectId, "recordingFlowProposals", input.proposalId);
    if (!original) throw new Error(`Unknown recording Flow proposal: ${input.proposalId}`);
    const checked = await this.validateRecordingFlowProposal(input.projectId, original);
    if (checked.status === "invalidated") throw new Error(`Recording Flow proposal is invalidated: ${checked.invalidation?.reasons.join(", ")}`);
    const now = Date.now();
    if (input.decision === "rejected") {
      const rejected: RecordingFlowProposalArtifact = { ...checked, status: "rejected", review: { decision: "rejected", reviewedAt: now, ...(input.reviewerId ? { reviewerId: input.reviewerId } : {}), ...(input.notes ? { notes: input.notes } : {}) }, updatedAt: now };
      await this.recordings.writePipelineArtifact(input.projectId, "recordingFlowProposals", rejected.proposalId, rejected as unknown as JsonObject);
      return { proposal: rejected };
    }
    if (!input.destination) throw new Error("An approval destination is required.");
    let flow: AutomationStudioFlowArtifact | undefined;
    let destination: RecordingFlowProposalDestination;
    let approvedDefinitions: AutomationStudioNodeDefinition[] | undefined;
    if (input.destination.kind === "flow") {
      const created = !input.destination.flowId;
      flow = input.destination.flowId
        ? await this.getFlow(input.projectId, input.destination.flowId)
        : await this.createFlow({ projectId: input.projectId, name: input.destination.name?.trim() || `Recorded flow ${new Date(original.generatedAt).toLocaleString()}` });
      const proposalTarget = await this.flowSubflowMigration.ensureProposalPrimarySubflow(flow);
      flow = proposalTarget.parentFlow;
      if (input.policyOverride) {
        const projected = policyGraphToAutomationStudioFlow(withPolicyOutgoingEdges(input.policyOverride), {
          flowId: proposalTarget.graphFlow.flowId,
          existingFlow: canonicalFlowDocument(proposalTarget.graphFlow),
          proposalId: checked.proposalId,
          recordingId: checked.recordingId
        });
        await this.saveFlow({ projectId: input.projectId, flow: {
          ...proposalTarget.graphFlow,
          nodes: projected.nodes,
          edges: projected.edges,
          evidenceReferences: uniqueEvidenceReferences([...(proposalTarget.graphFlow.evidenceReferences ?? []), ...(input.policyOverride.sourceEvidence ?? [])]),
          publication: { status: "draft" },
          metadata: {
            ...(proposalTarget.graphFlow.metadata ?? {}),
            source: "recording_flow_proposal",
            lastProposalId: checked.proposalId,
            lastRecordingId: checked.recordingId,
            mapperId: checked.mapper.id,
            mapperVersion: checked.mapper.version
          }
        } });
      } else {
        const proposalBase = input.destination.writeMode === "replace_recording_derived"
          ? recordingProposalReplacementBase(proposalTarget.graphFlow)
          : proposalTarget.graphFlow;
        await this.saveFlow({ projectId: input.projectId, flow: appendRecordingProposalToFlow(proposalBase, checked) });
      }
      const savedGraphFlow = await this.getFlow(input.projectId, proposalTarget.graphFlow.flowId);
      await this.flows.replaceFlowGraphIndex(input.projectId, savedGraphFlow);
      flow = await this.saveFlow({ projectId: input.projectId, flow: {
        ...flow,
        publication: { status: "draft" },
        metadata: {
          ...(flow.metadata ?? {}),
          source: "recording_flow_proposal",
          lastProposalId: checked.proposalId,
          lastRecordingId: checked.recordingId,
          mapperId: checked.mapper.id,
          mapperVersion: checked.mapper.version
        }
      } });
      destination = { kind: "flow", flowId: flow.flowId, created, ...(input.destination.writeMode ? { writeMode: input.destination.writeMode } : {}) };
    } else {
      const nodeDestination = input.destination;
      approvedDefinitions = checked.candidates.map((candidate) => recordingCandidateDefinition(checked, candidate, nodeDestination.visibility));
      destination = { kind: "node", visibility: nodeDestination.visibility, definitionIds: approvedDefinitions.map((definition) => definition.id) };
    }
    const approved: RecordingFlowProposalArtifact = {
      ...checked,
      status: "approved",
      ...(approvedDefinitions ? { approvedDefinitions } : {}),
      review: { decision: "approved", reviewedAt: now, ...(input.reviewerId ? { reviewerId: input.reviewerId } : {}), ...(input.notes ? { notes: input.notes } : {}), destination },
      updatedAt: now
    };
    await this.recordings.writePipelineArtifact(input.projectId, "recordingFlowProposals", approved.proposalId, approved as unknown as JsonObject);
    return { proposal: approved, ...(flow ? { flow } : {}) };
  }

  async listRecordingDerivedNodeDefinitions(projectId: string): Promise<AutomationStudioNodeDefinition[]> {
    const project = await this.projects.findProject(projectId);
    const state = await this.projects.readProjectIndex();
    const scopedProjectIds = state.projects.filter((candidate) => (candidate.domainId ?? null) === (project.domainId ?? null)).map((candidate) => candidate.id);
    const proposals = (await Promise.all(scopedProjectIds.map(async (candidateProjectId) => (await this.readRecordingFlowProposals(candidateProjectId, true)).filter((proposal) => candidateProjectId === projectId || (proposal.review?.destination?.kind === "node" && proposal.review.destination.visibility === "public"))))).flat();
    return proposals.filter((proposal) => proposal.status === "approved" && proposal.review?.destination?.kind === "node").flatMap((proposal) => proposal.approvedDefinitions ?? []);
  }

  async inspectFlowMigration(projectId: string): Promise<AutomationStudioFlowMigrationInspection> {
    const project = await this.projects.findProject(projectId);
    const [canonicalFlows, legacyArtifacts] = await Promise.all([
      this.catalogue.listCanonicalFlowArtifacts(projectId),
      this.legacy.readLegacyProjectArtifacts(projectId)
    ]);
    const catalog = resolveAutomationStudioFlowCatalog({
      projectId,
      scope: flowScopeForProject(project),
      canonicalFlows,
      legacyArtifacts
    });
    const alreadyMigrated = new Set(canonicalFlows.flatMap((flow) => flow.legacyProvenance
      ? [`${flow.legacyProvenance.kind}:${flow.legacyProvenance.artifactId}`]
      : []));
    const outcomes = catalog
      .filter((entry) => entry.source !== "canonical" && entry.flow.legacyProvenance)
      .map((entry) => {
        const provenance = entry.flow.legacyProvenance!;
        const key = `${provenance.kind}:${provenance.artifactId}`;
        const status: AutomationStudioFlowMigrationOutcome["status"] = alreadyMigrated.has(key) ? "already_migrated" : "created";
        return {
          legacyKind: provenance.kind,
          legacyArtifactId: provenance.artifactId,
          flowId: entry.flow.flowId,
          status,
          message: status === "already_migrated"
            ? "A canonical Flow already retains this legacy provenance."
            : "Legacy source will be retained unchanged as the recovery source."
        };
      });
    return {
      projectId,
      backupId: `legacy-source.${safeSegment(projectId)}`,
      outcomes,
      migrationNeeded: outcomes.some((outcome) => outcome.status === "created")
    };
  }

  async inspectLegacyRetirement(projectId: string): Promise<AutomationStudioLegacyRetirementReport> {
    await this.projects.findProject(projectId);
    const [state, artifacts, canonicalFlows, migration] = await Promise.all([
      this.legacy.readLegacyRetirementState(projectId),
      this.legacy.readLegacyProjectArtifacts(projectId),
      this.catalogue.listCanonicalFlowArtifacts(projectId),
      this.inspectFlowMigration(projectId)
    ]);
    const deferredKeys = new Set(state.intentionallyDeferred.map((item) => `${item.kind}:${item.artifactId}`));
    const unmigrated = migration.outcomes.filter((outcome) => outcome.status === "created" && !deferredKeys.has(`${outcome.legacyKind}:${outcome.legacyArtifactId}`)).map((outcome) => ({ kind: outcome.legacyKind, artifactId: outcome.legacyArtifactId, flowId: outcome.flowId }));
    const criteria = [
      { id: "importers" as const, satisfied: state.importerCoverageAcknowledged && state.importerEvidence.every((item) => item.status === "validated" || item.status === "deferred"), detail: state.importerCoverageAcknowledged ? `${state.importerEvidence.length} importer declaration(s) recorded.` : "Importer coverage has not been acknowledged." },
      { id: "inventory" as const, satisfied: unmigrated.length === 0, detail: unmigrated.length ? `${unmigrated.length} legacy artifact(s) still require migration or intentional deferral.` : "Every legacy Task/Routine is migrated or intentionally deferred." },
      { id: "backup_restore" as const, satisfied: Boolean(state.backupRestoreVerifiedAt && state.verifiedBackupId), detail: state.backupRestoreVerifiedAt ? `Backup ${state.verifiedBackupId} verified.` : "A legacy backup/restore rehearsal has not been verified." },
      { id: "flow_first_docs" as const, satisfied: true, detail: "Flow-first architecture, API, importer, and migration documentation is published with this compatibility release." },
      { id: "support_runbook" as const, satisfied: true, detail: "The legacy retirement support and rollback runbook is published." }
    ];
    const canLockWrites = criteria.every((item) => item.satisfied);
    return {
      schemaVersion: "0.1",
      projectId,
      state,
      counts: { tasks: artifacts.tasks.length, routines: artifacts.routines.length, legacyFlows: artifacts.flows.length, canonicalFlows: canonicalFlows.length },
      unmigrated,
      deferred: state.intentionallyDeferred,
      criteria,
      canLockWrites,
      diagnostic: legacyDiagnostic(state),
      inspectedAt: Date.now()
    };
  }

  async recordLegacyRetirementEvidence(input: { projectId: string; importerEvidence?: AutomationStudioLegacyImporterEvidence[]; intentionallyDeferred?: AutomationStudioLegacyDeferredArtifact[]; importerCoverageAcknowledged?: boolean }): Promise<AutomationStudioLegacyRetirementReport> {
    const current = await this.legacy.readLegacyRetirementState(input.projectId);
    if (current.phase === "write_locked") throw new Error("Legacy retirement evidence is immutable after writes are locked.");
    const next: AutomationStudioLegacyRetirementState = {
      ...current,
      ...(input.importerEvidence ? { importerEvidence: structuredClone(input.importerEvidence) } : {}),
      ...(input.intentionallyDeferred ? { intentionallyDeferred: structuredClone(input.intentionallyDeferred) } : {}),
      ...(input.importerCoverageAcknowledged !== undefined ? { importerCoverageAcknowledged: input.importerCoverageAcknowledged } : {}),
      updatedAt: Date.now()
    };
    await this.legacy.writeLegacyRetirementState(next);
    await this.legacy.appendLegacyRetirementAudit(input.projectId, "evidence_updated", { importerCount: next.importerEvidence.length, deferredCount: next.intentionallyDeferred.length, importerCoverageAcknowledged: next.importerCoverageAcknowledged });
    return await this.inspectLegacyRetirement(input.projectId);
  }

  async exportLegacyProject(projectId: string): Promise<AutomationStudioLegacyBackup> {
    return await this.legacy.ensureLegacyBackup(projectId);
  }

  async verifyLegacyBackup(projectId: string, backupId: string): Promise<AutomationStudioLegacyRetirementReport> {
    const backup = await this.legacy.readLegacyBackup(projectId, backupId);
    if (!backup) throw new Error(`Unknown legacy backup: ${backupId}`);
    if (legacyArtifactsDigest(backup.artifacts) !== backup.digest) throw new Error(`Legacy backup ${backupId} failed digest verification.`);
    const current = await this.legacy.readLegacyRetirementState(projectId);
    const next = { ...current, verifiedBackupId: backup.backupId, backupRestoreVerifiedAt: Date.now(), updatedAt: Date.now() };
    await this.legacy.writeLegacyRetirementState(next);
    await this.legacy.appendLegacyRetirementAudit(projectId, "backup_verified", { backupId: backup.backupId, digest: backup.digest });
    return await this.inspectLegacyRetirement(projectId);
  }

  async sealLegacyWrites(input: { projectId: string; expectedSchemaVersion: string }): Promise<AutomationStudioLegacyRetirementReport> {
    if (input.expectedSchemaVersion !== AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION) throw new Error(`Legacy write lock requires expected schema ${AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION}.`);
    const report = await this.inspectLegacyRetirement(input.projectId);
    if (!report.canLockWrites) throw new Error(`Legacy writes cannot be locked: ${report.criteria.filter((item) => !item.satisfied).map((item) => item.id).join(", ")}.`);
    if (report.state.phase === "write_locked") return report;
    const now = Date.now();
    await this.legacy.writeLegacyRetirementState({ ...report.state, projectSchemaVersion: AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION, phase: "write_locked", sealedAt: now, updatedAt: now });
    await this.legacy.appendLegacyRetirementAudit(input.projectId, "writes_locked", { projectSchemaVersion: AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION });
    return await this.inspectLegacyRetirement(input.projectId);
  }

  async listLegacyRetirementAudit(projectId: string): Promise<AutomationStudioLegacyRetirementAuditEvent[]> {
    await this.projects.findProject(projectId);
    return await this.legacy.readLegacyRetirementAudit(projectId);
  }

  async planFlowMigrationRollback(projectId: string, migrationId: string): Promise<AutomationStudioFlowMigrationRollbackPlan> {
    const ledger = await this.repositories.flowMigrationLedgers.get(migrationId);
    if (!ledger || ledger.projectId !== projectId) throw new Error(`Unknown Flow migration: ${migrationId}`);
    if (ledger.rolledBackAt) return { schemaVersion: "0.1", projectId, migrationId, backupId: ledger.backupId, status: "applied", flowIds: [], blockers: [], generatedAt: Date.now() };
    const backup = await this.legacy.readLegacyBackup(projectId, ledger.backupId);
    const blockers: string[] = [];
    if (!backup || legacyArtifactsDigest(backup.artifacts) !== backup.digest) blockers.push(`Backup ${ledger.backupId} is missing or invalid.`);
    const flowIds: string[] = [];
    for (const outcome of ledger.outcomes.filter((item) => item.status === "created")) {
      const flow = await this.getFlow(projectId, outcome.flowId).catch(() => undefined);
      if (!flow) continue;
      flowIds.push(flow.flowId);
      if (!flow.legacyProvenance || flow.legacyProvenance.kind !== outcome.legacyKind || flow.legacyProvenance.artifactId !== outcome.legacyArtifactId) blockers.push(`Flow ${flow.flowId} no longer has matching legacy provenance.`);
      if (outcome.canonicalDigest && canonicalFlowDigest(flow) !== outcome.canonicalDigest) blockers.push(`Flow ${flow.flowId} changed after migration.`);
      if (flow.publication.status !== "draft") blockers.push(`Flow ${flow.flowId} is published or publishable.`);
    }
    return { schemaVersion: "0.1", projectId, migrationId, backupId: ledger.backupId, status: blockers.length ? "blocked" : "ready", flowIds, blockers, generatedAt: Date.now() };
  }

  async rollbackFlowMigration(projectId: string, migrationId: string): Promise<AutomationStudioFlowMigrationRollbackPlan> {
    const plan = await this.planFlowMigrationRollback(projectId, migrationId);
    if (plan.status === "applied") return plan;
    if (plan.status !== "ready") throw new Error(`Flow migration rollback is blocked: ${plan.blockers.join(" ")}`);
    for (const flowId of plan.flowIds) await this.deleteFlow({ projectId, flowId });
    const ledger = await this.repositories.flowMigrationLedgers.get(migrationId);
    if (ledger) await this.repositories.flowMigrationLedgers.put({ ...ledger, rolledBackAt: Date.now(), updatedAt: Date.now() });
    await this.legacy.appendLegacyRetirementAudit(projectId, "rollback_applied", { migrationId, backupId: plan.backupId, flowIds: plan.flowIds });
    return { ...plan, status: "applied", generatedAt: Date.now() };
  }

  async migrateFlows(projectId: string): Promise<AutomationStudioFlowMigrationLedger> {
    const backup = await this.legacy.ensureLegacyBackup(projectId);
    const inspection = await this.inspectFlowMigration(projectId);
    const entries = await this.listFlows(projectId);
    const entryByLegacyKey = new Map(entries.flatMap((entry) => entry.flow.legacyProvenance
      ? [[`${entry.flow.legacyProvenance.kind}:${entry.flow.legacyProvenance.artifactId}`, entry] as const]
      : []));
    const outcomes: AutomationStudioFlowMigrationOutcome[] = [];
    for (const outcome of inspection.outcomes) {
      if (outcome.status !== "created") {
        outcomes.push(outcome);
        continue;
      }
      const entry = entryByLegacyKey.get(`${outcome.legacyKind}:${outcome.legacyArtifactId}`);
      if (!entry) {
        outcomes.push({ ...outcome, status: "blocked", message: "Legacy source could not be resolved during migration." });
        continue;
      }
      try {
        const saved = await this.flowWriter.saveFlowInternal({ projectId, flow: entry.flow }, false, "legacy_single_graph");
        outcomes.push({ ...outcome, canonicalUpdatedAt: saved.updatedAt, canonicalDigest: canonicalFlowDigest(saved) });
      } catch (error) {
        outcomes.push({ ...outcome, status: "blocked", message: errorMessage(error, "Canonical Flow could not be written.") });
      }
    }
    const now = Date.now();
    const ledger: AutomationStudioFlowMigrationLedger = {
      schemaVersion: "0.1",
      migrationId: `flow-migration.${safeSegment(projectId)}.${randomUUID()}`,
      backupId: backup.backupId,
      projectId,
      status: outcomes.some((outcome) => outcome.status === "blocked") ? "partial" : "completed",
      outcomes,
      createdAt: now,
      updatedAt: now
    };
    const savedLedger = await this.repositories.flowMigrationLedgers.put(ledger);
    await this.legacy.appendLegacyRetirementAudit(projectId, "migration_applied", { migrationId: ledger.migrationId, backupId: ledger.backupId, status: ledger.status, createdFlowIds: outcomes.filter((item) => item.status === "created").map((item) => item.flowId) });
    return savedLedger;
  }

  async saveProjectArtifact(input: { projectId: string; kind: AutomationStudioProjectArtifactKind; artifact: unknown }): Promise<unknown> {
    return await this.flowWriter.saveProjectArtifact(input);
  }

  async getProjectArtifact(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): Promise<unknown> {
    return await this.flowWriter.getProjectArtifact(projectId, kind, artifactId);
  }

  async deleteProjectArtifact(input: { projectId: string; kind: AutomationStudioProjectArtifactKind; artifactId: string; deleteOwnedArtifacts?: boolean }): Promise<{ deleted: boolean; projectId: string; kind: AutomationStudioProjectArtifactKind; artifactId: string; deletedArtifactIds: string[] }> {
    await this.projects.findProject(input.projectId);
    if (input.kind !== "config") await this.legacy.assertLegacyWriteAllowed(input.projectId);
    const artifactId = input.artifactId.trim();
    if (!artifactId) throw new Error(`${input.kind} ID is required.`);
    const deletedArtifactIds = new Set<string>([`${input.kind}:${artifactId}`]);
    const artifact = await this.getProjectArtifact(input.projectId, input.kind, artifactId).catch(() => null);
    if (input.deleteOwnedArtifacts && artifact && typeof artifact === "object") {
      const projectArtifacts = await this.listProjectArtifacts(input.projectId);
      if (input.kind === "task") {
        const task = artifact as AutomationStudioTaskArtifact;
        const flowIds = uniqueStrings([
          ...(typeof task.graphId === "string" ? [task.graphId] : []),
          ...(typeof task.policyFlowId === "string" ? [task.policyFlowId] : []),
          ...projectArtifacts.flows.filter((flow) => flow.ownerKind === "task" && flow.ownerId === artifactId).map((flow) => flow.flowId)
        ]);
        for (const flowId of flowIds) {
          await this.objectDocuments.deleteProjectArtifactFile(input.projectId, "flow", flowId);
          deletedArtifactIds.add(`flow:${flowId}`);
        }
        const policyId = typeof task.metadata?.policyId === "string" ? task.metadata.policyId : null;
        if (policyId) {
          await this.repositories.policyGraphs.delete(policyId).catch(() => false);
          if (this.projectPaths.root) {
            const policyPath = this.projectPaths.projectFile(input.projectId, "policies", `${safeSegment(policyId)}.json`);
            if (this.objectStore) await ProgramJsonStore.deletePath(policyPath);
            else await rm(policyPath, { force: true });
          }
          deletedArtifactIds.add(`policy:${policyId}`);
        }
      }
      if (input.kind === "routine") {
        const routine = artifact as AutomationStudioRoutineArtifact;
        const flowIds = uniqueStrings([
          ...(typeof routine.flowId === "string" ? [routine.flowId] : []),
          ...projectArtifacts.flows.filter((flow) => flow.ownerKind === "routine" && flow.ownerId === artifactId).map((flow) => flow.flowId)
        ]);
        for (const flowId of flowIds) {
          await this.objectDocuments.deleteProjectArtifactFile(input.projectId, "flow", flowId);
          deletedArtifactIds.add(`flow:${flowId}`);
        }
      }
    }
    await this.objectDocuments.deleteProjectArtifactFile(input.projectId, input.kind, artifactId);
    return { deleted: true, projectId: input.projectId, kind: input.kind, artifactId, deletedArtifactIds: [...deletedArtifactIds] };
  }

  /** @deprecated Creates an owner-bound compatibility Flow. Use createFlow() for new work. */
  async createDefaultFlow(input: { projectId: string; ownerKind: "task" | "routine"; ownerId: string; name: string; description?: string }): Promise<AutomationStudioFlowDocument> {
    await this.legacy.assertLegacyWriteAllowed(input.projectId);
    const flow = createBlankAutomationStudioFlow({
      flowId: `${input.ownerKind}.${safeSegment(input.ownerId)}.flow`,
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      name: input.name,
      ...(input.description ? { description: input.description } : {})
    });
    await this.saveProjectArtifact({ projectId: input.projectId, kind: "flow", artifact: flow });
    return flow;
  }

  async listProjectNormalizedTimelines(projectId: string): Promise<NormalizedTimeline[]> {
    if (this.objectStore) {
      return (await this.repositories.normalizedTimelines.list()).filter((timeline) => timeline.metadata?.projectId === projectId);
    }
    const index = await this.indexes.readRecordingIndex(projectId);
    const timelines: NormalizedTimeline[] = [];
    for (const item of index.normalizedTimelines ?? []) {
      const timeline = await this.repositories.normalizedTimelines.get(item.normalizedTimelineId);
      if (timeline) timelines.push(timeline);
    }
    return timelines;
  }

  async listProjectNormalizedTimelineSummaries(projectId: string): Promise<RecordingIndex["normalizedTimelines"]> {
    const index = await this.indexes.readRecordingIndex(projectId);
    return [...(index.normalizedTimelines ?? [])].sort((left, right) => right.generatedAt - left.generatedAt);
  }

  async getProjectNormalizedTimeline(projectId: string, normalizedTimelineId: string): Promise<NormalizedTimeline> {
    const index = await this.indexes.readRecordingIndex(projectId);
    const item = (index.normalizedTimelines ?? []).find((candidate) => candidate.normalizedTimelineId === normalizedTimelineId);
    if (!item) throw new Error(`Unknown normalized timeline for project ${projectId}: ${normalizedTimelineId}`);
    const existing = await this.repositories.normalizedTimelines.get(normalizedTimelineId);
    if (existing && existing.recordingId === item.recordingId) return existing;
    if (!this.projectPaths.root) throw new Error(`Normalized timeline is not loaded: ${normalizedTimelineId}`);
    const stored = await new ProgramJsonStore<JsonObject>(
      this.recordingPaths.recordingDerivedFile(projectId, item.recordingId, "normalization", "timelines", `${safeSegment(normalizedTimelineId)}.json`),
      () => ({})
    ).read();
    const normalized = stored.normalizedTimeline as unknown as NormalizedTimeline | undefined;
    if (!normalized?.normalizedTimelineId) throw new Error(`Normalized timeline is missing: ${normalizedTimelineId}`);
    await this.repositories.normalizedTimelines.put(normalized);
    return normalized;
  }

  async startRuntimeSession(input: {
    projectId?: string | null;
    targetKind?: AutomationStudioRuntimeSession["targetKind"];
    targetId?: string;
    flow?: AutomationStudioFlowDocument;
    flowId?: string;
    inputs?: JsonObject;
    authorizedDomainIds?: string[];
    metadata?: JsonObject;
  }): Promise<AutomationStudioRuntimeSession> {
    const canonical = input.projectId && input.flowId
      ? await this.getFlow(input.projectId, input.flowId).catch(() => undefined)
      : undefined;
    const flow = input.flow ?? (canonical ? canonicalFlowDocument(canonical) : input.projectId && input.flowId ? await this.getProjectArtifact(input.projectId, "flow", input.flowId) as AutomationStudioFlowDocument : undefined);
    if (!flow) throw new Error("A flow document or project flow ID is required.");
    const now = Date.now();
    const session: AutomationStudioRuntimeSession = {
      schemaVersion: "0.1",
      runId: randomUUID(),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      targetKind: input.targetKind ?? (canonical ? "flow" : flow.ownerKind === "policy" ? "flow" : flow.ownerKind),
      targetId: input.targetId ?? canonical?.flowId ?? flow.ownerId,
      flowId: flow.flowId,
      status: "queued",
      queuedAt: now,
      flow,
      metadata: { ...(input.metadata ?? {}), inputs: input.inputs ?? {}, authorizedDomainIds: uniqueStrings(input.authorizedDomainIds ?? []), ...(canonical ? { canonicalFlow: true } : {}) }
    };
    if (input.projectId) await this.writeRuntimeSession(input.projectId, session);
    return session;
  }

  async resolveRuntimeAdaptationContext(input: { projectId: string; flow: AutomationStudioFlowArtifact; currentRunId?: string }): Promise<AutomationStudioRuntimeAdaptationContext> {
    const metadata = mergedFlowSettingsMetadata(input.flow.metadata);
    const settings = trainingModeSettingsFromMetadata(metadata);
    const policy = adaptationPolicyFromFlowMetadata(input.flow, metadata);
    const recentRuns = await this.listFlowRunSummaries({ projectId: input.projectId, flowId: input.flow.flowId, limit: 100, offset: 0 }).then((page) => page.runs.filter((run) => run.runId !== input.currentRunId)).catch(() => []);
    const recentAdaptations = await this.listFlowAdaptationSummaries({ projectId: input.projectId, flowId: input.flow.flowId, limit: 100, offset: 0 }).then((page) => page.adaptations).catch(() => []);
    const metrics = computeAutomationStudioStabilityMetrics({ runs: recentRuns, adaptations: recentAdaptations, now: Date.now() });
    const budgetState = runtimeTrainingBudgetStateFromSummaries(recentRuns);
    const behavior = behaviorForAutomationStudioTrainingMode(settings, recentRuns.length, metrics.stabilityScore);
    const budgetDecision = decideAutomationStudioTrainingBudget(settings, budgetState);
    const diagnostics = runtimeAdaptationContextDiagnostics(settings, policy, behavior, budgetDecision);
    return {
      projectId: input.projectId,
      flowId: input.flow.flowId,
      settings,
      policy,
      behavior,
      metrics,
      budgetState,
      budgetDecision,
      runsCompleted: recentRuns.length,
      recentRunCount: recentRuns.length,
      recentAdaptationCount: recentAdaptations.length,
      diagnostics
    };
  }

  private async maybeAnnotateRunDetailWithRuntimeLlm(input: {
    detail: AutomationStudioFlowRunDetail;
    context: AutomationStudioRuntimeAdaptationContext | null;
    runtimeFlow?: AutomationStudioFlowDocument;
    subflowId?: string;
    failedTraceAttempt?: Parameters<typeof executeAutomationStudioRuntimePatch>[0]["failedAttempt"];
    authorizedExternalSideEffects?: boolean;
    graphOptions?: Parameters<typeof runAutomationStudioGraph>[1];
    executionGrant?: AutomationStudioLlmProviderResolverInput["executionGrant"];
    useReusableContext?: true;
  }): Promise<AutomationStudioFlowRunDetail> {
    if (!input.context) return input.detail;
    if (input.detail.summary.status !== "failed") return input.detail;
    const explicitGrantBudget = input.executionGrant?.purpose === "diagnose_and_adapt" || input.executionGrant?.purpose === "diagnosis_only";
    if (!input.context.behavior.invokeLlm || (!explicitGrantBudget && !input.context.budgetDecision.ok)) {
      return {
        ...input.detail,
        metadata: {
          ...(input.detail.metadata ?? {}),
          llmGate: {
            invoked: false,
            reason: !input.context.behavior.invokeLlm ? "Current training mode or settings do not allow LLM intervention." : `Training budget exhausted: ${input.context.budgetDecision.exhausted.join(", ")}.`
          }
        }
      };
    }
    const failedAttempt = [...(input.detail.actionAttempts ?? [])].reverse().find((attempt) => attempt.status === "failed" || attempt.status === "unknown");
    const providerId = stringSetting(input.context.policy.metadata?.llmProvider, stringSetting(input.context.policy.policyId, "host"));
    let provider: AutomationStudioLlmProvider | undefined;
    let providerResolution: AutomationStudioLlmProviderResolution | undefined;
    try {
      const resolvedProvider = await this.llmProviderResolver?.({
        projectId: input.context.projectId,
        flowId: input.context.flowId,
      providerId,
      ...(input.executionGrant ? { executionGrant: input.executionGrant } : {}),
        ...(input.context.policy.metadata ? { metadata: input.context.policy.metadata } : {})
      });
      if (resolvedProvider && "provider" in resolvedProvider) {
        providerResolution = resolvedProvider;
        provider = resolvedProvider.provider;
      } else {
        provider = resolvedProvider;
      }
    } catch {
      return {
        ...input.detail,
        interventions: [...(input.detail.interventions ?? []), {
          schemaVersion: "0.1",
          interventionId: `llm.provider-resolution.${input.detail.summary.runId}`,
          runId: input.detail.summary.runId,
          flowId: input.context.flowId,
          projectId: input.context.projectId,
          kind: "diagnosis",
          reason: "LLM provider resolution failed.",
          validation: { ok: false, issues: ["llm.provider_resolution_failed: LLM provider resolution failed."] },
          createdAt: input.detail.summary.updatedAt || Date.now()
        }],
        metadata: { ...(input.detail.metadata ?? {}), llmGate: { invoked: false, reason: "LLM provider resolution failed.", code: "llm.provider_resolution_failed" } }
      };
    }
    const instructions = await this.getFlowInstructionSet({
      projectId: input.context.projectId,
      flowId: input.context.flowId
    }).catch(() => []);
    const explicitCallLimit = input.executionGrant?.purpose === "diagnose_and_adapt"
      ? 2
      : input.executionGrant?.purpose === "diagnosis_only"
        ? 1
        : undefined;
    const configuredCallLimits = [input.context.policy.maxInterventionsPerRun, input.context.settings.budgets?.maxInterventionsPerRun, providerResolution?.maxCallsPerRun]
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const maxCallsPerRun = explicitCallLimit ?? Math.max(1, Math.trunc(configuredCallLimits.length ? Math.min(...configuredCallLimits) : 2));
    const requestedTokenLimits = providerResolution?.tokenLimits;
    let failureEvidence: JsonObject | undefined;
    if (provider && failedAttempt && this.llmEvidenceRuntime?.captureSanitizedFailureEvidence) {
      const resolvedTokenLimits = resolveAutomationStudioLlmTokenLimits(requestedTokenLimits).limits;
      const maxEvidenceBytes = Math.max(1, Math.min(
        AUTOMATION_STUDIO_LLM_MAX_FAILURE_EVIDENCE_BYTES,
        Math.floor(resolvedTokenLimits.maxInputTokens * 3 * 0.2)
      ));
      try {
        const captured = await this.llmEvidenceRuntime.captureSanitizedFailureEvidence({
          projectId: input.context.projectId,
          flowId: input.context.flowId,
          runId: input.detail.summary.runId,
          failedAction: {
            attemptId: failedAttempt.attemptId,
            nodeId: failedAttempt.nodeId,
            definitionId: failedAttempt.definitionId,
            status: failedAttempt.status,
            ...(failedAttempt.route ? { route: failedAttempt.route } : {})
          },
          maxEvidenceBytes,
          ...(input.graphOptions?.signal ? { signal: input.graphOptions.signal } : {})
        });
        if (captured !== undefined) {
          const sanitized = sanitizeAutomationStudioLlmFailureEvidence("runtime_diagnosis", captured);
          if (Buffer.byteLength(JSON.stringify(sanitized), "utf8") > maxEvidenceBytes) {
            throw new Error("Sanitized failure evidence exceeds the dynamic request allowance.");
          }
          failureEvidence = sanitized;
        }
      } catch {
        return {
          ...input.detail,
          interventions: [...input.detail.interventions, {
            schemaVersion: "0.1",
            interventionId: `llm.failure-evidence.${input.detail.summary.runId}`,
            runId: input.detail.summary.runId,
            flowId: input.context.flowId,
            projectId: input.context.projectId,
            kind: "diagnosis",
            reason: "Sanitized runtime failure evidence was unavailable.",
            validation: { ok: false, issues: ["llm.failure_evidence_invalid: Sanitized runtime failure evidence was unavailable."] },
            createdAt: input.detail.summary.updatedAt || Date.now()
          }],
          metadata: { ...(input.detail.metadata ?? {}), llmGate: { invoked: false, providerConfigured: true, code: "llm.failure_evidence_invalid" } }
        };
      }
    }
    const requestedTotalTokensPerRun = (requestedTokenLimits?.maxTotalTokens ?? 10_000) * maxCallsPerRun;
    const maxTotalTokensPerRun = Math.max(1, Math.trunc(Math.min(
      AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST * maxCallsPerRun,
      explicitGrantBudget
        ? requestedTotalTokensPerRun
        : Math.min(input.context.settings.budgets?.maxTokensPerRun ?? 12_000, requestedTotalTokensPerRun)
    )));
    const maxOutputTokensPerRun = Math.max(1, Math.trunc(Math.min(maxTotalTokensPerRun, (requestedTokenLimits?.maxOutputTokens ?? maxTotalTokensPerRun) * maxCallsPerRun)));
    const requestedEstimatedCostUsdPerRun = providerResolution?.maxTotalEstimatedCostUsd ?? (providerResolution?.maxEstimatedCostUsd ?? 0.25) * maxCallsPerRun;
    const maxEstimatedCostUsdPerRun = explicitGrantBudget
      ? Math.min(AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD, requestedEstimatedCostUsdPerRun)
      : Math.min(0.25, input.context.policy.maxEstimatedCostUsdPerRun ?? 0.25, requestedEstimatedCostUsdPerRun);
    const maxEstimatedCostUsdPerCall = maxEstimatedCostUsdPerRun / maxCallsPerRun;
    const runBudget = new AutomationStudioLlmRunBudgetLedger({
      maxCallsPerRun,
      maxTotalTokensPerRun,
      maxOutputTokensPerRun,
      maxEstimatedCostUsdPerRun
    });
    const reusableContextResult = input.useReusableContext === true && failureEvidence
      ? await this.reusableLlmContextForFreshEvidence({
        optedIn: true, taskKind: "runtime_diagnosis", projectId: input.context.projectId, flowId: input.context.flowId,
        ...(input.subflowId ? { subflowId: input.subflowId } : {}), freshEvidence: failureEvidence, freshEvidenceCount: 1,
        maxInputTokens: resolveAutomationStudioLlmTokenLimits(requestedTokenLimits).limits.maxInputTokens,
        ...(input.executionGrant?.actorUserId ? { actorId: input.executionGrant.actorUserId } : {}), now: input.detail.summary.updatedAt || Date.now()
      })
      : input.useReusableContext === true && this.reusableLlmContextEnabled
        ? { metadata: { status: "miss", reason: "fresh_evidence_required", freshContributionCount: 0, reusedContributionCount: 0, sourceRecordIds: [], sourceRunIds: [], sourceAdaptationIds: [] } as JsonObject }
        : undefined;
    const result = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: input.context.projectId,
      flowId: input.context.flowId,
      runId: input.detail.summary.runId,
      ...(failedAttempt?.nodeId ? { nodeId: failedAttempt.nodeId } : {}),
      instructions,
      runDetail: input.detail,
      ...(failureEvidence ? { failureEvidence } : {}),
      ...(reusableContextResult?.packet ? { reusableContext: reusableContextResult.packet } : {}),
      policy: input.context.policy,
      ...(provider ? { provider } : {}),
      runBudget,
      ...(requestedTokenLimits ? { tokenLimits: requestedTokenLimits } : {}),
      ...(providerResolution?.timeoutMs !== undefined ? { timeoutMs: providerResolution.timeoutMs } : {}),
      maxEstimatedCostUsd: maxEstimatedCostUsdPerCall,
      ...(input.graphOptions?.signal ? { signal: input.graphOptions.signal } : {}),
      now: () => input.detail.summary.updatedAt || Date.now(),
      metadata: {
        source: "runRuntimeSession",
        expectedOutput: "diagnosis",
        ...(input.executionGrant?.purpose === "diagnose_and_adapt" ? { executionPurpose: "diagnose_and_adapt" } : {})
      }
    });
    const patchResult = provider && input.runtimeFlow && input.failedTraceAttempt && input.context.behavior.createAdaptations
      ? await runAutomationStudioLlmHarness({
        taskKind: "runtime_patch",
        projectId: input.context.projectId,
        flowId: input.context.flowId,
        runId: input.detail.summary.runId,
        ...(failedAttempt?.nodeId ? { nodeId: failedAttempt.nodeId } : {}),
        instructions,
        runDetail: input.detail,
        ...(failureEvidence ? { failureEvidence } : {}),
        ...(reusableContextResult?.packet ? { reusableContext: reusableContextResult.packet } : {}),
        policy: input.context.policy,
        provider,
        runBudget,
        ...(requestedTokenLimits ? { tokenLimits: requestedTokenLimits } : {}),
        ...(providerResolution?.timeoutMs !== undefined ? { timeoutMs: providerResolution.timeoutMs } : {}),
        maxEstimatedCostUsd: maxEstimatedCostUsdPerCall,
        ...(input.graphOptions?.signal ? { signal: input.graphOptions.signal } : {}),
        expectedOutput: "runtime_patch",
        now: () => input.detail.summary.updatedAt || Date.now(),
        metadata: {
          source: "runRuntimeSession",
          expectedOutput: "runtime_patch",
          ...(input.executionGrant?.purpose === "diagnose_and_adapt" ? { executionPurpose: "diagnose_and_adapt" } : {})
        }
      })
      : null;
    const runtimePatchAttempts = [];
    const adaptationIds: string[] = [];
    const changeProposalIds: string[] = [];
    if (patchResult?.response?.kind === "runtime_patch" && input.runtimeFlow && input.failedTraceAttempt) {
      const explicitProposalIssue = input.executionGrant?.purpose === "diagnose_and_adapt"
        ? patchResult.response.patches.length !== 1
          ? "diagnose_and_adapt requires exactly one runtime patch."
          : patchResult.response.patches[0]?.kind !== "temporary_target_override"
            ? "diagnose_and_adapt supports temporary_target_override proposals only."
            : undefined
        : undefined;
      if (explicitProposalIssue) {
        runtimePatchAttempts.push(compactJsonObject({
          kind: patchResult.response.patches.length === 1 ? patchResult.response.patches[0]?.kind : "runtime_patch_response",
          proposalOnly: true,
          executed: false,
          preflightOk: false,
          restoredExpectedState: false,
          retryOriginalAction: false,
          issues: [explicitProposalIssue],
          traceStatus: "not-run"
        }));
      }
      for (const patch of explicitProposalIssue ? [] : patchResult.response.patches) {
        const patchInput = {
          projectId: input.context.projectId,
          flowId: input.context.flowId,
          ...(input.subflowId ? { subflowId: input.subflowId } : {}),
          runId: input.detail.summary.runId,
          flow: input.runtimeFlow,
          patch,
          failedAttempt: input.failedTraceAttempt,
          ...(input.failedTraceAttempt.transitionComparison ? { expectedComparison: input.failedTraceAttempt.transitionComparison } : {}),
          policy: input.context.policy,
          proposalMode: input.context.policy.proposalMode,
          ...(failureEvidence && this.llmEvidenceRuntime?.validateTargetOverrideEvidence ? {
            validateTargetOverrideEvidence: (target: { selector: string }, failedAction: AutomationStudioRuntimeTargetOverrideFailedAction) => {
              try { return this.llmEvidenceRuntime!.validateTargetOverrideEvidence!(failureEvidence!, target, failedAction); }
              catch { return { status: "absent" as const }; }
            }
          } : {}),
          ...(input.authorizedExternalSideEffects !== undefined ? { authorizedExternalSideEffects: input.authorizedExternalSideEffects } : {}),
          ...(input.graphOptions ? { options: input.graphOptions } : {})
        };
        const proposalOnlyTargetOverride = input.executionGrant?.purpose === "diagnose_and_adapt" && patch.kind === "temporary_target_override";
        const tested = proposalOnlyTargetOverride
          ? proposeAutomationStudioRuntimeTargetOverride(patchInput)
          : await executeAutomationStudioRuntimePatch(patchInput);
        runtimePatchAttempts.push(compactJsonObject({
          kind: patch.kind,
          proposalOnly: tested.metadata?.proposalOnly,
          executed: tested.metadata?.executed,
          targetResolution: tested.metadata?.targetResolution,
          targetNodeResolution: tested.metadata?.targetNodeResolution,
          preflightOk: tested.preflight.ok,
          restoredExpectedState: tested.restoredExpectedState,
          retryOriginalAction: tested.retryOriginalAction,
          issues: tested.preflight.issues,
          traceStatus: tested.trace?.status ?? "not-run",
          adaptationId: tested.adaptation?.adaptationId,
          changeProposalId: tested.changeProposal?.proposalId
        }));
        if (tested.changeProposal) {
          await this.saveFlowChangeProposal(tested.changeProposal);
          changeProposalIds.push(tested.changeProposal.proposalId);
        }
        if (tested.adaptation) {
          const adaptationBase = tested.changeProposal ? { ...tested.adaptation, proposalId: tested.changeProposal.proposalId } : tested.adaptation;
          const adaptation = reusableContextResult ? { ...adaptationBase, metadata: { ...(adaptationBase.metadata ?? {}), reusableContext: reusableContextResult.metadata } } : adaptationBase;
          const savedAdaptation = await this.saveFlowAdaptation(adaptation);
          const promoted = await this.maybePromoteRuntimeAdaptation({
            adaptation: savedAdaptation,
            context: input.context
          });
          const approvalDecision = isJsonRecord(promoted.metadata?.approvalDecision) ? promoted.metadata.approvalDecision : undefined;
          if (approvalDecision) runtimePatchAttempts[runtimePatchAttempts.length - 1] = compactJsonObject({ ...runtimePatchAttempts[runtimePatchAttempts.length - 1], approvalDecision });
          adaptationIds.push(promoted.adaptationId);
        }
      }
    }
    const withIntervention: AutomationStudioFlowRunDetail = {
      ...input.detail,
      interventions: [...input.detail.interventions, result.intervention, ...(patchResult ? [patchResult.intervention] : [])],
      adaptationIds: [...new Set([...input.detail.adaptationIds, ...adaptationIds])],
      changeProposalIds: [...new Set([...input.detail.changeProposalIds, ...changeProposalIds])],
      metadata: {
        ...(input.detail.metadata ?? {}),
        llmGate: {
          invoked: Boolean(provider),
          providerConfigured: Boolean(provider),
          ok: result.ok && (patchResult?.ok ?? true),
          costAccounting: runBudget.snapshot(input.detail.summary.runId),
          ...(failureEvidence && result.intervention.contextSummary?.failureEvidence ? { failureEvidence: result.intervention.contextSummary.failureEvidence } : {}),
          diagnostics: [...result.diagnostics, ...(patchResult?.diagnostics ?? [])].map((diagnostic) => ({ code: diagnostic.code, severity: diagnostic.severity, message: diagnostic.message })),
          ...(reusableContextResult ? { reusableContext: reusableContextResult.metadata } : {})
        },
        ...(runtimePatchAttempts.length ? { runtimePatchAttempts: runtimePatchAttempts as unknown as JsonObject[] } : {})
      }
    };
    return {
      ...withIntervention,
      summary: flowRunSummaryWithInterventionSummaries(withIntervention)
    };
  }

  private async maybePromoteRuntimeAdaptation(input: {
    adaptation: AutomationStudioFlowAdaptation;
    context: AutomationStudioRuntimeAdaptationContext;
  }): Promise<AutomationStudioFlowAdaptation> {
    const now = Date.now();
    const patchKinds = input.adaptation.patch.map((patch) => patch.kind);
    const validated = adaptationValidationCounts(input.adaptation).succeeded > 0;
    const requireFirstManualReview = input.context.settings.requireFirstManualReviewBeforeAutoPromotion === true
      || input.context.policy.preset === "autonomous" && booleanSetting(input.context.settings.metadata?.requireFirstManualReviewBeforeAutoPromotion, false);
    const priorManualReviewExists = requireFirstManualReview
      ? await this.flowHasPriorManualAdaptationReview(input.adaptation.projectId, input.adaptation.flowId, input.adaptation.adaptationId)
      : true;
    const hasExternalSideEffects = input.adaptation.patch.some((patch) => isJsonRecord(patch.metadata) && patch.metadata.externalSideEffect === true);
    const decision = decideAutomationStudioAdaptationPromotionGate({
      approvalMode: input.context.policy.proposalMode,
      riskLevel: input.adaptation.riskLevel,
      patchKinds,
      validated,
      promoteAdaptations: input.context.behavior.promoteAdaptations,
      requireFirstManualReview,
      priorManualReviewExists,
      hasExternalSideEffects
    });
    const decisionRecord = compactJsonObject({
      decisionId: `approval.${randomUUID()}`,
      mode: input.context.policy.proposalMode,
      risk: input.adaptation.riskLevel,
      patchKinds,
      validationStatus: validated ? "validated" : "unvalidated",
      reason: decision.reason,
      actor: "runtime",
      decidedAt: now,
      autoApply: decision.autoApply,
      requiresManualApproval: decision.requiresManualApproval,
      firstManualReviewRequired: requireFirstManualReview,
      priorManualReviewExists,
      externalSideEffects: hasExternalSideEffects
    });
    const withDecision = await this.saveFlowAdaptation({
      ...input.adaptation,
      updatedAt: now,
      metadata: {
        ...(input.adaptation.metadata ?? {}),
        approvalDecision: decisionRecord,
        approvalDecisions: [
          ...approvalDecisionHistory(input.adaptation.metadata),
          decisionRecord
        ]
      }
    });
    if (!decision.autoApply) return withDecision;
    try {
      return await this.reviewFlowAdaptation({
        projectId: withDecision.projectId,
        flowId: withDecision.flowId,
        adaptationId: withDecision.adaptationId,
        action: "apply",
        actorId: "runtime",
        reason: decision.reason
      });
    } catch (error) {
      return await this.saveFlowAdaptation({
        ...withDecision,
        updatedAt: Date.now(),
        metadata: {
          ...(withDecision.metadata ?? {}),
          approvalDecision: compactJsonObject({
            ...decisionRecord,
            autoApplyFailed: true,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      });
    }
  }

  private async flowHasPriorManualAdaptationReview(projectId: string, flowId: string, excludeAdaptationId: string): Promise<boolean> {
    const page = await this.listFlowAdaptationSummaries({ projectId, flowId, limit: 100, offset: 0 }).catch(() => ({ adaptations: [] }));
    for (const summary of page.adaptations ?? []) {
      if (summary.adaptationId === excludeAdaptationId) continue;
      const adaptation = await this.getFlowAdaptation(projectId, flowId, summary.adaptationId).catch(() => null);
      const review = isJsonRecord(adaptation?.metadata?.review) ? adaptation.metadata.review : undefined;
      const actorId = typeof review?.actorId === "string" ? review.actorId : "";
      const lastAction = typeof review?.lastAction === "string" ? review.lastAction : "";
      if (actorId && actorId !== "runtime" && actorId !== "system" && (lastAction === "approve" || lastAction === "apply")) return true;
    }
    return false;
  }

  private async retryRuntimeSessionAfterAutoAppliedPatch(input: {
    projectId: string;
    session: AutomationStudioRuntimeSession;
    detail: AutomationStudioFlowRunDetail;
    graphOptions: Parameters<typeof runAutomationStudioGraph>[1];
    adaptationContext: AutomationStudioRuntimeAdaptationContext;
    subflowId?: string;
  }): Promise<AutomationStudioRuntimeSession | null> {
    if (input.session.status !== "failed") return null;
    const attempts = Array.isArray(input.detail.metadata?.runtimePatchAttempts) ? input.detail.metadata.runtimePatchAttempts.filter(isJsonRecord) : [];
    const shouldRetry = attempts.some((attempt) => attempt.retryOriginalAction === true && isJsonRecord(attempt.approvalDecision) && attempt.approvalDecision.autoApply === true);
    if (!shouldRetry) return null;
    let updatedFlow: AutomationStudioFlowArtifact | null = null;
    if (input.subflowId) {
      const selectedSubflow = await this.getFlowSubflow(input.projectId, input.session.flowId, input.subflowId).catch(() => null);
      if (!selectedSubflow?.graphFlowId) return null;
      updatedFlow = await this.getFlow(input.projectId, selectedSubflow.graphFlowId).catch(() => null);
      if (!updatedFlow) return null;
      if (updatedFlow.metadata?.parentFlowId !== input.session.flowId
        || updatedFlow.metadata?.parentSubflowId !== input.subflowId) {
        throw new Error("Adaptive retry Subflow graph ownership no longer matches the selected parent and Subflow.");
      }
    } else {
      updatedFlow = await this.getFlow(input.projectId, input.session.flowId).catch(() => null);
    }
    if (!updatedFlow) return null;
    if (input.subflowId) await this.flowWriter.assertOwnedSubflowGraph(input.projectId, updatedFlow);
    const retryTrace = await runCanonicalAutomationStudioFlow(updatedFlow, await this.catalogue.listPublishedFlowSnapshots(), input.graphOptions, (await this.catalogue.listFlowPublicationRecords()).filter((record) => record.status === "deprecated").map((record) => `${record.flowId}@${record.version}`));
    const retrySession: AutomationStudioRuntimeSession = {
      ...input.session,
      status: retryTrace.status,
      finishedAt: retryTrace.finishedAt ?? Date.now(),
      trace: {
        ...retryTrace,
        attempts: [...(input.session.trace?.attempts ?? []), ...retryTrace.attempts],
        effects: [...(input.session.trace?.effects ?? []), ...retryTrace.effects],
        message: `Adaptive retry ${retryTrace.status}.${input.session.trace?.message ? ` Initial failure: ${input.session.trace.message}` : ""}`
      }
    };
    await this.writeRuntimeSession(input.projectId, retrySession);
    const retriedSubflows = input.detail.subflows.map((entry) => {
      if (!input.subflowId || entry.subflowId !== input.subflowId) return entry;
      const { failureReason: _initialFailureReason, ...retainedMetadata } = entry.metadata ?? {};
      const finishedAt = retryTrace.finishedAt ?? Date.now();
      return {
        ...entry,
        exitedAt: finishedAt,
        status: retryTrace.status,
        metadata: {
          ...retainedMetadata,
          durationMs: Math.max(0, finishedAt - entry.enteredAt),
          adaptiveRetryAttemptCount: retryTrace.attempts.length,
          ...(retryTrace.status !== "succeeded" && retryTrace.message ? { failureReason: retryTrace.message } : {})
        }
      };
    });
    const retryBase = runtimeSessionToFlowRunDetail(retrySession, input.projectId);
    const retryDetail = runtimeRunDetailWithAdaptationContext({
      ...retryBase,
      summary: {
        ...retryBase.summary,
        routeDecisionCount: input.detail.routeDecisions.length,
        subflowEntryCount: retriedSubflows.length
      },
      routeDecisions: input.detail.routeDecisions,
      subflows: retriedSubflows
    }, input.adaptationContext);
    await this.saveFlowRunDetail({
      ...retryDetail,
      interventions: input.detail.interventions,
      adaptationIds: input.detail.adaptationIds,
      changeProposalIds: input.detail.changeProposalIds,
      metadata: {
        ...(retryDetail.metadata ?? {}),
        ...(input.detail.metadata ?? {}),
        adaptiveRetry: {
          attempted: true,
          status: retryTrace.status,
          attemptCount: retryTrace.attempts.length
        }
      }
    });
    return retrySession;
  }

  async runRuntimeSession(input: {
    projectId?: string | null;
    runId?: string;
    flow?: AutomationStudioFlowDocument;
    flowId?: string;
    inputs?: JsonObject;
    maxSteps?: number;
    authorizedDomainIds?: string[];
    adaptiveMode?: AutomationStudioRuntimeInterventionMode;
    dryRunLlm?: boolean;
    authorizedExternalSideEffects?: boolean;
    subflowId?: string;
    idempotencyKey?: string;
    llmExecution?: { grantId: string; actorUserId: string; actorSessionId: string; purpose: "diagnosis_only" | "diagnose_and_adapt" };
    useReusableContext?: true;
  }): Promise<AutomationStudioRuntimeSession> {
    if (input.llmExecution) {
      const compatiblePurpose = input.llmExecution.purpose === "diagnosis_only" || input.llmExecution.purpose === "diagnose_and_adapt";
      const incompatible = !compatiblePurpose
        || (input.adaptiveMode !== undefined && input.adaptiveMode !== "manual_approval")
        || input.dryRunLlm === true
        || input.authorizedExternalSideEffects === true
        || (input.authorizedDomainIds?.length ?? 0) > 0
        || input.runId !== undefined;
      if (incompatible) {
        this.revokeLlmExecutionGrant?.(input.llmExecution.grantId);
        throw new Error("Explicit LLM execution flags are incompatible.");
      }
      input = {
        ...input,
        adaptiveMode: "manual_approval",
        authorizedExternalSideEffects: false
      };
    }
    const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.trim() ? input.idempotencyKey.trim() : "";
    if (input.llmExecution && idempotencyKey) {
      this.revokeLlmExecutionGrant?.(input.llmExecution.grantId);
      throw new Error("Explicit LLM execution does not accept idempotency keys.");
    }
    if (input.projectId && idempotencyKey) {
      const matching = (await this.listRuntimeSessions(input.projectId).catch(() => [])).find((candidate) => candidate.metadata?.idempotencyKey === idempotencyKey);
      if (matching) return matching;
    }
    const existing = input.projectId && input.runId ? await this.getRuntimeSession(input.projectId, input.runId) : null;
    if (existing?.status === "cancelled") return existing;
    const startInput: Parameters<AutomationStudioService["startRuntimeSession"]>[0] = {};
    if (input.projectId !== undefined) startInput.projectId = input.projectId;
    if (input.flow !== undefined) startInput.flow = input.flow;
    if (input.flowId !== undefined) startInput.flowId = input.flowId;
    if (input.inputs !== undefined) startInput.inputs = input.inputs;
    if (input.authorizedDomainIds !== undefined) startInput.authorizedDomainIds = input.authorizedDomainIds;
    if (idempotencyKey) startInput.metadata = { ...(startInput.metadata ?? {}), idempotencyKey };
    const runInterventionMode = normalizeAutomationStudioRuntimeInterventionMode(input.adaptiveMode);
    const adaptiveRunRequested = runInterventionMode !== "no_llm_intervention";
    if (adaptiveRunRequested) startInput.metadata = { ...(startInput.metadata ?? {}), adaptiveRuntime: true, adaptiveMode: runInterventionMode };
    let session: AutomationStudioRuntimeSession;
    if (existing) {
      session = existing;
    } else if (input.projectId && adaptiveRunRequested) {
      if (this.adaptiveRuntimeAdmissions.has(input.projectId)) throw new Error("Only one adaptive runtime run can be admitted per project at a time.");
      this.adaptiveRuntimeAdmissions.add(input.projectId);
      try {
        const activeAdaptiveRuns = (await this.listRuntimeSessions(input.projectId).catch(() => [])).filter((candidate) =>
          (candidate.status === "queued" || candidate.status === "running" || candidate.status === "waiting")
          && candidate.metadata?.adaptiveRuntime === true
        );
        if (activeAdaptiveRuns.length >= 1) throw new Error("Only one adaptive runtime run can be active per project.");
        session = await this.startRuntimeSession(startInput);
      } finally {
        this.adaptiveRuntimeAdmissions.delete(input.projectId);
      }
    } else {
      session = await this.startRuntimeSession(startInput);
    }
    const startedAt = Date.now();
    const abortController = new AbortController();
    const graphOptions: Parameters<typeof runAutomationStudioGraph>[1] = {
      inputs: (input.inputs ?? session.metadata?.inputs ?? {}) as Record<string, any>,
      signal: abortController.signal
    };
    if (this.ioRuntime) {
      graphOptions.effectDispatcher = this.runtimeService
        ? createRuntimePolicyEffectDispatcher(this.ioRuntime.io, this.ioRuntime.domainId, this.runtimeService)
        : createIoPolicyEffectDispatcher(this.ioRuntime.io, this.ioRuntime.domainId);
      graphOptions.runtimeCapabilities = ["policy-output", "io"];
      const requestedDomainIds = input.llmExecution ? [] : uniqueStrings(input.authorizedDomainIds ?? asStringArray(session.metadata?.authorizedDomainIds));
      if (this.ioRuntime.domainId) graphOptions.authorizedDomainIds = requestedDomainIds.filter((domainId) => domainId === this.ioRuntime!.domainId);
    }
    if (this.nativeNodeRuntime) graphOptions.runtimeCapabilities = [...new Set([...(graphOptions.runtimeCapabilities ?? []), ...this.nativeNodeRuntime.getRuntimeCapabilities()])];
    if (this.nativeNodeRuntime) graphOptions.nativeNodeExecutor = ({ node, inputs, signal, hostContext }) => this.nativeNodeRuntime!.execute(node, inputs, signal, hostContext);
    if (this.hostRuntime) graphOptions.hostRuntime = this.hostRuntime;
    if (input.maxSteps !== undefined) graphOptions.maxSteps = input.maxSteps;
    const canonical = input.projectId && session.metadata?.canonicalFlow === true
      ? await this.getFlow(input.projectId, session.flowId).catch(() => undefined)
      : undefined;
    if (canonical?.source.mode === "code" && !verifyCodeOwnedFlowCompilation(canonical)) throw new Error("Code-owned Flow compilation is stale or invalid; execution refused.");
    let adaptationContext = input.projectId && canonical
      ? runtimeAdaptationContextWithRunOverride(await this.resolveRuntimeAdaptationContext({ projectId: input.projectId, flow: canonical, currentRunId: session.runId }), input)
      : null;
    if (adaptationContext && input.llmExecution?.purpose === "diagnose_and_adapt") {
      adaptationContext = runtimeAdaptationContextForExplicitProposal(adaptationContext);
    }
    if (adaptationContext) graphOptions.recoveryBudget = recoveryBudgetFromRuntimeAdaptationContext(adaptationContext);
    if (input.projectId) {
      this.runtimeAbortControllers.set(`${input.projectId}:${session.runId}`, abortController);
      await this.writeRuntimeSession(input.projectId, {
        ...session,
        status: "running",
        startedAt: session.startedAt ?? startedAt,
        metadata: {
          ...(session.metadata ?? {}),
          adaptiveRuntime: Boolean(adaptationContext),
          adaptiveMode: runInterventionMode,
          ...(idempotencyKey ? { idempotencyKey } : {})
        }
      });
    }
    const runtimeCanonical = canonical && input.projectId ? await this.materializeRecordingDerivedFlow(input.projectId, canonical) : canonical;
    const runtimeFlow = input.projectId ? await this.materializeRecordingDerivedDocument(input.projectId, session.flow) : session.flow;
    try {
    if (input.projectId && runtimeCanonical) {
      const router = await this.getFlowRouter(input.projectId, runtimeCanonical.flowId);
      if (router) {
        const subflowPage = await this.listFlowSubflowSummaries({ projectId: input.projectId, flowId: runtimeCanonical.flowId, limit: 100, offset: 0 });
        const subflows = await Promise.all(subflowPage.subflows.map((item) => this.getFlowSubflow(input.projectId!, runtimeCanonical.flowId, item.subflowId)));
        const route = runAutomationStudioRouter({
          projectId: input.projectId,
          flowId: runtimeCanonical.flowId,
          router,
          subflows: subflows.filter((item): item is AutomationStudioFlowSubflow => Boolean(item)),
          inputs: graphOptions.inputs as JsonObject,
          currentStateSummary: jsonObjectFromUnknown((graphOptions.inputs as Record<string, unknown>).state) ?? {},
          now: () => startedAt
        });
        const selectedFlowId = route.selectedSubflow?.graphFlowId ?? "";
        const selectedFlow = selectedFlowId
          ? await this.getFlow(input.projectId, selectedFlowId).then((flow) => this.materializeRecordingDerivedFlow(input.projectId!, flow)).catch(() => undefined)
          : undefined;
        const selectedFlowIsOwned = Boolean(route.selectedSubflow && selectedFlow
          && this.flowWriter.persistedFlowRepresentation(selectedFlow) === "subflow_graph"
          && selectedFlow.metadata?.subflowGraph === true
          && selectedFlow.metadata?.parentFlowId === runtimeCanonical.flowId
          && selectedFlow.metadata?.parentSubflowId === route.selectedSubflow.subflowId);
        const trace = route.selectedSubflow && selectedFlow && selectedFlowIsOwned
          ? await runCanonicalAutomationStudioFlow(selectedFlow, await this.catalogue.listPublishedFlowSnapshots(), graphOptions, (await this.catalogue.listFlowPublicationRecords()).filter((record) => record.status === "deprecated").map((record) => `${record.flowId}@${record.version}`))
          : {
            status: "failed" as const,
            startedAt,
            finishedAt: Date.now(),
            attempts: [],
            values: {},
            effects: [],
            message: route.selectedSubflow
              ? `Router selected Subflow ${route.selectedSubflow.subflowId}, but its graph Flow ${selectedFlowId || "was not configured"} could not be loaded or did not prove matching Subflow ownership.`
              : route.diagnostics.map((diagnostic) => diagnostic.message).join(" ")
          };
        const next: AutomationStudioRuntimeSession = {
          ...session,
          status: trace.status,
          startedAt: session.startedAt ?? startedAt,
          ...(trace.finishedAt !== undefined ? { finishedAt: trace.finishedAt } : {}),
          trace
        };
        await this.writeRuntimeSession(input.projectId, next);
        const routedRunDetail = runtimeRunDetailWithAdaptationContext({
          ...runtimeSessionToFlowRunDetail(next, input.projectId),
          routeDecisions: [route.decision],
          subflows: route.selectedSubflow ? [{
            entryId: `subflow-entry.${next.runId}.${route.selectedSubflow.subflowId}`,
            subflowId: route.selectedSubflow.subflowId,
            enteredAt: startedAt,
            ...(trace.finishedAt !== undefined ? { exitedAt: trace.finishedAt } : {}),
            status: trace.status,
            metadata: {
              graphFlowId: selectedFlowId,
              routeDecisionId: route.decision.decisionId,
              ...(route.selectedSubflow.inputMapping?.length ? { inputMapping: route.selectedSubflow.inputMapping } : {}),
              ...(route.selectedSubflow.outputMapping?.length ? { outputMapping: route.selectedSubflow.outputMapping } : {}),
              ...(trace.finishedAt !== undefined ? { durationMs: trace.finishedAt - startedAt } : {}),
              ...(trace.status !== "succeeded" && trace.message ? { failureReason: trace.message } : {})
            }
          }] : []
        }, adaptationContext);
        const routedFailedTraceAttempt = [...trace.attempts].reverse().find((attempt) => attempt.status === "failed");
        const annotatedDetail = await this.maybeAnnotateRunDetailWithRuntimeLlm({
          detail: routedRunDetail,
          context: adaptationContext,
          runtimeFlow: canonicalFlowDocument(selectedFlow ?? runtimeCanonical),
          ...(route.selectedSubflow ? { subflowId: route.selectedSubflow.subflowId } : {}),
          ...(input.authorizedExternalSideEffects !== undefined ? { authorizedExternalSideEffects: input.authorizedExternalSideEffects } : {}),
          graphOptions,
          ...(input.llmExecution ? { executionGrant: input.llmExecution } : {}),
          ...(input.useReusableContext ? { useReusableContext: true as const } : {}),
          ...(routedFailedTraceAttempt ? { failedTraceAttempt: routedFailedTraceAttempt } : {})
        });
        const retry = adaptationContext && !input.llmExecution ? await this.retryRuntimeSessionAfterAutoAppliedPatch({
          projectId: input.projectId,
          session: next,
          detail: annotatedDetail,
          graphOptions,
          adaptationContext,
          ...(route.selectedSubflow ? { subflowId: route.selectedSubflow.subflowId } : {})
        }) : null;
        if (retry) return retry;
        await this.saveFlowRunDetail(annotatedDetail);
        return next;
      }
    }
    const directRepresentation = runtimeCanonical ? this.flowWriter.persistedFlowRepresentation(runtimeCanonical) : undefined;
    const representationDiagnostic = runtimeCanonical && directRepresentation === "legacy_single_graph"
      ? { code: "flow.legacy_single_graph_execution", message: "Executed through bounded legacy single-graph compatibility. Migrate this Flow to a Router and Subflow graph." }
      : undefined;
    const trace = runtimeCanonical && directRepresentation !== "legacy_single_graph"
      ? {
        status: "failed" as const,
        startedAt,
        finishedAt: Date.now(),
        attempts: [],
        values: {},
        effects: [],
        message: directRepresentation === "subflow_graph"
          ? "Subflow graph Flows cannot be launched directly; run their parent orchestration Flow."
          : "Top-level orchestration Flow has no Router-selected Subflow execution path."
      }
      : runtimeCanonical
      ? await runCanonicalAutomationStudioFlow(runtimeCanonical, await this.catalogue.listPublishedFlowSnapshots(), graphOptions, (await this.catalogue.listFlowPublicationRecords()).filter((record) => record.status === "deprecated").map((record) => `${record.flowId}@${record.version}`))
      : await runAutomationStudioGraph(runtimeFlow, graphOptions);
    const next: AutomationStudioRuntimeSession = {
      ...session,
      status: trace.status,
      startedAt: session.startedAt ?? startedAt,
      ...(trace.finishedAt !== undefined ? { finishedAt: trace.finishedAt } : {}),
      trace,
      ...(representationDiagnostic ? { metadata: { ...(session.metadata ?? {}), compatibilityDiagnostics: [representationDiagnostic] } } : {})
    };
    if (input.projectId) await this.writeRuntimeSession(input.projectId, next);
    if (input.projectId && adaptationContext) {
      const runDetail = runtimeRunDetailWithAdaptationContext(runtimeSessionToFlowRunDetail(next, input.projectId), adaptationContext);
      const failedTraceAttempt = [...trace.attempts].reverse().find((attempt) => attempt.status === "failed");
      const annotatedDetail = await this.maybeAnnotateRunDetailWithRuntimeLlm({
        detail: runDetail,
        context: adaptationContext,
        runtimeFlow: runtimeCanonical ? canonicalFlowDocument(runtimeCanonical) : runtimeFlow,
        ...(input.authorizedExternalSideEffects !== undefined ? { authorizedExternalSideEffects: input.authorizedExternalSideEffects } : {}),
        graphOptions,
        ...(input.llmExecution ? { executionGrant: input.llmExecution } : {}),
        ...(input.useReusableContext ? { useReusableContext: true as const } : {}),
        ...(failedTraceAttempt ? { failedTraceAttempt } : {})
      });
      const retry = input.llmExecution ? null : await this.retryRuntimeSessionAfterAutoAppliedPatch({
        projectId: input.projectId,
        session: next,
        detail: annotatedDetail,
        graphOptions,
        adaptationContext
      });
      if (retry) return retry;
      await this.saveFlowRunDetail(annotatedDetail);
    }
    return next;
    } finally {
      if (input.llmExecution) this.revokeLlmExecutionGrant?.(input.llmExecution.grantId);
      if (input.projectId) this.runtimeAbortControllers.delete(`${input.projectId}:${session.runId}`);
    }
  }

  async cancelRuntimeSession(projectId: string, runId: string, reason = "Cancelled by user."): Promise<AutomationStudioRuntimeSession | null> {
    const session = await this.getRuntimeSession(projectId, runId);
    if (!session) return null;
    if (isTerminalRuntimeSessionStatus(session.status)) return session;
    const controller = this.runtimeAbortControllers.get(`${projectId}:${runId}`);
    controller?.abort(reason);
    const now = Date.now();
    const cancelled: AutomationStudioRuntimeSession = {
      ...session,
      status: "cancelled",
      finishedAt: session.finishedAt ?? now,
      metadata: {
        ...(session.metadata ?? {}),
        cancellation: { at: now, reason }
      },
      trace: session.trace ?? {
        status: "cancelled",
        startedAt: session.startedAt ?? session.queuedAt,
        finishedAt: now,
        attempts: [],
        values: {},
        effects: [],
        message: reason
      }
    };
    await this.writeRuntimeSession(projectId, cancelled);
    return cancelled;
  }

  async getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> {
    return await this.summaries.getRuntimeSession(projectId, runId);
  }

  async listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]> {
    return await this.summaries.listRuntimeSessions(projectId);
  }

  async listRuntimeSessionSummaries(projectId: string, options: { limit?: unknown; offset?: unknown } = {}): Promise<AutomationStudioRuntimeRunSummaryPage> {
    return await this.summaries.listRuntimeSessionSummaries(projectId, options);
  }

  async listFlowSubflowSummaries(input: { projectId: string; flowId?: string; status?: string; role?: string; search?: string; sort?: "updated" | "name" | "status" | "role"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioSubflowSummaryPage> {
    return await this.summaries.listFlowSubflowSummaries(input);
  }
  async listFlowInstructionSummaries(input: { projectId: string; flowId?: string; subflowId?: string; status?: string; scopeKind?: string; requirement?: string; search?: string; sort?: "updated" | "title" | "status" | "scope" | "priority"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioInstructionSummaryPage> {
    return await this.summaries.listFlowInstructionSummaries(input);
  }
  async listFlowChangeProposalSummaries(input: { projectId: string; flowId?: string; subflowId?: string; limit?: unknown; offset?: unknown }): Promise<AutomationStudioChangeProposalSummaryPage> {
    const limit = clampInteger(input.limit, 1, 100, 25);
    const offset = clampInteger(input.offset, 0, 1_000_000, 0);
    const index = await this.indexes.readFlowChangeProposalIndex(input.projectId);
    const scoped = (index.changeProposals ?? []).filter((item) => (!input.flowId || item.flowId === input.flowId) && (!input.subflowId || item.subflowId === input.subflowId));
    return { changeProposals: scoped.slice(offset, offset + limit), total: scoped.length, limit, offset };
  }

  async listFlowRunSummaries(input: { projectId: string; flowId?: string; status?: string; search?: string; sort?: "updated" | "started" | "duration" | "actions" | "status"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioFlowRunSummaryPage> {
    return await this.summaries.listFlowRunSummaries(input);
  }

  async listFlowAdaptationSummaries(input: { projectId: string; flowId?: string; subflowId?: string; status?: string; risk?: string; search?: string; sort?: "updated" | "status" | "risk" | "trigger"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioAdaptationSummaryPage> {
    return await this.summaries.listFlowAdaptationSummaries(input);
  }
  async getFlowRouter(projectId: string, flowId: string): Promise<AutomationStudioFlowRouter | null> {
    return await this.flows.getFlowRouter(projectId, flowId);
  }

  async listProjectProblems(input: { projectId: string; domainId?: string | null; severity?: string; source?: string; status?: string; scopeId?: string; search?: string; limit?: unknown; cursor?: unknown }): Promise<AutomationStudioProblemPage> {
    await this.projects.findProject(input.projectId);
    const severity = input.severity?.trim().toLowerCase() || "";
    const source = input.source?.trim().toLowerCase() || "";
    const requestedStatus = input.status?.trim().toLowerCase() || "open";
    if (severity && !["error", "warning", "info"].includes(severity)) throw new Error("Invalid problem severity filter.");
    if (!["open", "resolved", "all"].includes(requestedStatus)) throw new Error("Invalid problem status filter.");
    const status = requestedStatus === "all" ? "" : requestedStatus;
    const scopeId = input.scopeId?.trim() || "";
    const search = input.search?.trim().toLowerCase() || "";
    const limit = automationStudioPageLimit(input.limit, 100);
    const owner = `project-problems:${input.projectId}`;
    const filterHash = automationStudioFilterHash({ severity, source, status, scopeId, search });
    const cursor = decodeAutomationStudioPageCursor<{ rank: number; source: string; id: string }>(input.cursor, { owner, filterHash, validate: (values) => Number.isSafeInteger(values.rank) && typeof values.source === "string" && typeof values.id === "string" });
    const base = baselineAutomationStudioProblems().filter((problem) => {
      const problemSource = String(problem.artifactKind ?? "framework").toLowerCase();
      const problemStatus = String((problem as any).status ?? "open").toLowerCase();
      const problemScope = String(problem.artifactId ?? "");
      const text = [problem.id, problem.message, problem.artifactKind, problem.artifactId].join(" ").toLowerCase();
      return (!source || problemSource === source) && (!status || problemStatus === status)
        && (!scopeId || problemScope === scopeId) && (!search || text.includes(search));
    });
    const all = base.filter((problem) => !severity || problem.severity === severity).sort((left, right) => problemSeverityRank(left.severity) - problemSeverityRank(right.severity)
      || String(left.artifactKind ?? "framework").localeCompare(String(right.artifactKind ?? "framework"))
      || left.id.localeCompare(right.id));
    const after = cursor ? all.filter((problem) => {
      const rank = problemSeverityRank(problem.severity);
      const problemSource = String(problem.artifactKind ?? "framework");
      return rank > cursor.rank || rank === cursor.rank && (problemSource > cursor.source || problemSource === cursor.source && problem.id > cursor.id);
    }) : all;
    const problems = after.slice(0, limit);
    const last = problems.at(-1);
    const counts = {
      error: base.filter((problem) => problem.severity === "error").length,
      warning: base.filter((problem) => problem.severity === "warning").length,
      info: base.filter((problem) => problem.severity === "info").length
    };
    return {
      problems,
      total: all.length,
      counts,
      limit,
      hasMore: after.length > limit,
      nextCursor: after.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { rank: problemSeverityRank(last.severity), source: String(last.artifactKind ?? "framework"), id: last.id } }) : null
    };
  }

  async getFlowRouterSummary(projectId: string, flowId: string): Promise<Omit<AutomationStudioFlowRouter, "rules"> & { rules?: never; ruleCount: number } | null> {
    await this.projects.findProject(projectId);
    await this.flows.ensureSqlFlowRouterProjection(projectId, flowId);
    const projected = await this.flows.tryWithFlowResourceRepository(projectId, async (item) => {
      const summary = await item.getRouterSummaryForFlow(flowId);
      if (!summary) return null;
      const page = await item.listRouterRoutesPage({ flowId, limit: 1 });
      return { summary, count: page.counts.total };
    });
    if (projected?.summary) {
      const summary = projected.summary;
      return {
        schemaVersion: "0.1",
        routerId: summary.routerId,
        projectId,
        flowId,
        name: "Flow Router",
        fallback: summary.fallbackKind === "subflow" && summary.fallbackSubflowId ? { kind: "subflow", subflowId: summary.fallbackSubflowId } : { kind: "fail", message: "No Flow Map route matched." },
        status: "active",
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        metadata: { routeGroups: summary.groups.map(sqlRouterGroupToFlowGroup), revision: summary.revision },
        ruleCount: projected.count
      };
    }
    const legacy = await this.getFlowRouter(projectId, flowId);
    if (!legacy) return null;
    const { rules, ...summary } = legacy;
    return { ...summary, ruleCount: rules.length };
  }

  async listFlowRouterRoutes(input: { projectId: string; flowId: string; groupId?: string | null; status?: "active" | "disabled"; search?: string; limit?: unknown; cursor?: unknown }): Promise<AutomationStudioRouterRoutePage> {
    await this.projects.findProject(input.projectId);
    await this.flows.ensureSqlFlowRouterProjection(input.projectId, input.flowId);
    const typed = await this.flows.tryWithFlowResourceRepository(input.projectId, async (repository) => {
      const [page, summary] = await Promise.all([repository.listRouterRoutesPage(input), repository.getRouterSummaryForFlow(input.flowId)]);
      return { page, summary };
    });
    if (typed?.summary) return {
      routes: typed.page.items.map(sqlRouterRouteToFlowRule),
      groups: typed.summary.groups.map(sqlRouterGroupToFlowGroup),
      counts: typed.page.counts,
      limit: typed.page.limit,
      nextCursor: typed.page.nextCursor,
      hasMore: typed.page.hasMore
    };
    return { routes: [], groups: [], counts: { total: 0, active: 0, disabled: 0, byGroup: {} }, limit: automationStudioPageLimit(input.limit, 100), nextCursor: null, hasMore: false };
  }

  async listFlowRouterTargetReferences(input: { projectId: string; flowId: string; subflowIds: string[]; perTargetLimit?: unknown }): Promise<AutomationStudioRouterTargetReferenceBatch> {
    await this.projects.findProject(input.projectId);
    await this.flows.ensureSqlFlowRouterProjection(input.projectId, input.flowId);
    const projected = await this.flows.tryWithFlowResourceRepository(input.projectId, async (repository) => repository.listRouterTargetReferences(input));
    if (!projected) return { targets: input.subflowIds.map((subflowId) => ({ subflowId, total: 0, hasMore: false, references: [] })), perTargetLimit: automationStudioPageLimit(input.perTargetLimit, 20) };
    return {
      targets: projected.targets.map((target) => ({
        subflowId: target.subflowId,
        total: target.total,
        hasMore: target.hasMore,
        references: [
          ...target.routes.map((route) => ({
            id: route.routeId,
            kind: "route" as const,
            name: route.name,
            status: route.enabled ? "active" : "disabled",
            order: route.priority,
            ...(route.conditionKind === "always" ? { conditionLabel: "Always" } : { condition: route.condition })
          })),
          ...(target.fallback ? [{
            id: `fallback:${target.subflowId}`,
            kind: "fallback" as const,
            name: "Fallback",
            status: "active",
            order: "fallback" as const,
            conditionLabel: "No rule matched"
          }] : [])
        ]
      })),
      perTargetLimit: projected.perTargetLimit
    };
  }

  async getFlowRouterGraphSummary(input: { projectId: string; flowId: string; groupId?: string | null; status?: "active" | "disabled"; search?: string; limit?: unknown; cursor?: unknown }): Promise<JsonObject> {
    const page = await this.listFlowRouterRoutes(input);
    return {
      schemaVersion: "0.1",
      flowId: input.flowId,
      counts: page.counts,
      groups: page.groups.map((group) => ({ id: group.groupId, label: group.name, order: group.order })),
      nodes: page.routes.map((route) => ({ id: route.ruleId, kind: "route", label: route.name, status: route.status, groupId: route.metadata?.groupId ?? null, order: route.order })),
      edges: page.routes.map((route) => ({ id: `edge:${route.ruleId}`, source: route.ruleId, target: route.target.subflowId, kind: "routes_to" })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore
    } as unknown as JsonObject;
  }

  async getFlowSubflow(projectId: string, flowId: string, subflowId: string): Promise<AutomationStudioFlowSubflow | null> {
    return await this.flows.getFlowSubflow(projectId, flowId, subflowId);
  }

  async getFlowInstruction(projectId: string, instructionId: string): Promise<AutomationStudioFlowInstruction | null> {
    return await this.summaries.getFlowInstruction(projectId, instructionId);
  }

  async getFlowInstructionSet(input: { projectId: string; flowId?: string; subflowId?: string }): Promise<AutomationStudioFlowInstruction[]> {
    const page = await this.listFlowInstructionSummaries({ ...input, limit: 100, offset: 0 });
    const instructions = await Promise.all(page.instructions.map((item) => this.getFlowInstruction(input.projectId, item.instructionId)));
    return instructions.filter((item): item is AutomationStudioFlowInstruction => Boolean(item));
  }

  async getFlowChangeProposal(projectId: string, flowId: string, proposalId: string): Promise<AutomationStudioFlowChangeProposal | null> {
    await this.projects.findProject(projectId);
    const stored = await new ProgramJsonStore<JsonObject>(this.flowPaths.flowChangeProposalFile(projectId, flowId, proposalId), () => ({})).read();
    return typeof stored.proposalId === "string" ? stored as unknown as AutomationStudioFlowChangeProposal : null;
  }

  async getFlowRunDetail(projectId: string, runId: string, options: { includeCollections?: boolean } = {}): Promise<AutomationStudioFlowRunDetail | null> {
    await this.projects.findProject(projectId);
    const typed = await this.summaries.tryWithRuntimeStreamStore(projectId, async (store) => await store.getRunDetail(runId, options));
    if (typed) return typed;
    const stored = await new ProgramJsonStore<JsonObject>(this.flowPaths.flowRunDetailFile(projectId, runId), () => ({})).read();
    if (typeof (stored.summary as { runId?: unknown } | undefined)?.runId === "string") return stored as unknown as AutomationStudioFlowRunDetail;
    const session = await this.getRuntimeSession(projectId, runId);
    if (!session) return null;
    return await this.saveFlowRunDetail({
      ...runtimeSessionToFlowRunDetail(session, projectId),
      metadata: {
        ...(session.metadata ?? {}),
        partialWriteRecovery: { recoveredAt: Date.now(), source: "runtime-session" }
      }
    });
  }

  async listFlowRunActions(input: { projectId: string; runId: string; limit?: unknown; offset?: unknown; cursor?: unknown }): Promise<AutomationStudioFlowRunActionPage> {
    const limit = clampInteger(input.limit, 1, 100, 50);
    const offset = clampInteger(input.offset, 0, 10_000_000, 0);
    await this.projects.findProject(input.projectId);
    const typed = await this.summaries.tryWithRuntimeStreamStore(input.projectId, async (store) => await store.listRunActions({ runId: input.runId, limit, offset, cursor: input.cursor }));
    if (typed && (typed.total > 0 || offset === 0)) return typed;
    if (!this.projectPaths.root) {
      const detail = await this.getFlowRunDetail(input.projectId, input.runId);
      const actions = detail?.actionAttempts ?? [];
      return { actions: actions.slice(offset, offset + limit), total: actions.length, limit, offset };
    }
    await this.summaries.ensureFlowRunSummaryIndex(input.projectId);
    const record = await this.summaries.flowRunSummaryRepository(input.projectId).get(input.runId);
    if (!record) return { actions: [], total: 0, limit, offset };
    const summary = record.data as unknown as AutomationStudioFlowRunSummary;
    let actions: AutomationStudioFlowRunActionAttemptRecord[];
    try {
      actions = await readJsonLinePage<AutomationStudioFlowRunActionAttemptRecord>(this.flowPaths.flowRunActionsFile(input.projectId, input.runId), offset, limit);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const detail = await this.getFlowRunDetail(input.projectId, input.runId);
      const recoveredActions = detail?.actionAttempts ?? [];
      await this.summaries.writeJsonLines(this.flowPaths.flowRunActionsFile(input.projectId, input.runId), recoveredActions);
      actions = recoveredActions.slice(offset, offset + limit);
    }
    return { actions, total: summary.actionAttemptCount ?? 0, limit, offset };
  }

  async getFlowRunActionDetail(input: { projectId: string; runId: string; attemptId: string }): Promise<AutomationStudioFlowRunActionAttemptRecord | null> {
    await this.projects.findProject(input.projectId);
    const typed = await this.summaries.tryWithRuntimeStreamStore(input.projectId, (store) => store.getRunActionDetail({ runId: input.runId, attemptId: input.attemptId }));
    if (typed) return typed;
    const detail = await this.getFlowRunDetail(input.projectId, input.runId);
    return detail?.actionAttempts?.find((action) => action.attemptId === input.attemptId) ?? null;
  }
  async exportFlowRunAudit(projectId: string, runId: string): Promise<JsonObject | null> {
    const detail = await this.getFlowRunDetail(projectId, runId);
    if (!detail) return null;
    const adaptationIds = uniqueStrings(detail.adaptationIds ?? []);
    const adaptations = (await Promise.all(adaptationIds.map(async (adaptationId) => {
      const flowId = detail.summary.flowId;
      const adaptation = await this.getFlowAdaptation(projectId, flowId, adaptationId).catch(() => null);
      if (!adaptation) return null;
      return compactJsonObject({
        adaptationId: adaptation.adaptationId,
        flowId: adaptation.flowId,
        trigger: adaptation.trigger,
        status: adaptation.status,
        riskLevel: adaptation.riskLevel,
        createdAt: adaptation.createdAt,
        updatedAt: adaptation.updatedAt,
        patch: adaptation.patch,
        validationResults: adaptation.validationResults,
        mutationEvidence: adaptationMutationEvidence(adaptation),
        approvalDecision: adaptation.metadata?.approvalDecision
      });
    }))).filter(isJsonRecord);
    const runDetailJson = JSON.stringify(detail);
    return compactJsonObject({
      schemaVersion: "0.1",
      exportedAt: Date.now(),
      projectId,
      runId,
      manifest: {
        actionCount: detail.actionAttempts?.length ?? detail.summary.actionAttemptCount ?? 0,
        recoveryCount: detail.recoveryAttempts?.length ?? 0,
        routeDecisionCount: detail.routeDecisions.length,
        subflowEntryCount: detail.subflows.length,
        interventionCount: detail.interventions.length,
        adaptationCount: adaptations.length,
        evidenceCount: detail.evidence?.length ?? 0
      },
      integrity: { algorithm: "sha256", runDetailHash: createHash("sha256").update(runDetailJson).digest("hex") },
      runDetail: detail,
      interventionSummaries: flowRunSummaryWithInterventionSummaries(detail).interventionSummaries ?? [],
      adaptations,
      retention: {
        rawPromptsRetained: false,
        compactContextRetained: true,
        sensitiveValuesRedacted: true
      }
    });
  }

  async getFlowAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioFlowAdaptation | null> {
    await this.projects.findProject(projectId);
    if (this.runtimeProjectDatabasePool && this.projectPaths.root) {
      const store = await AutomationStudioProjectAdaptationStore.open({ pool: this.runtimeProjectDatabasePool, projectId });
      try {
        const detail = await store.getAdaptation(adaptationId);
        if (detail) {
          if (detail.flowId !== flowId) return null;
          const audit = await store.listAuditEvents({ adaptationId, limit: 25, offset: 0 });
          return adaptationFromTypedStoreDetail({ ...detail, auditEvents: audit.events, auditTotal: audit.total });
        }
      } finally {
        await store.close();
      }
    }
    const stored = await new ProgramJsonStore<JsonObject>(this.flowPaths.flowAdaptationFile(projectId, flowId, adaptationId), () => ({})).read();
    if (typeof stored.adaptationId === "string") return stored as unknown as AutomationStudioFlowAdaptation;
    const bootstrap = await this.getFlowBootstrapAdaptation(projectId, flowId, adaptationId);
    if (!bootstrap) return null;
    return bootstrapAdaptationAsFlowAdaptation(bootstrap, await this.getLlmExecutionBinding(projectId, flowId));
  }

  async saveFlowRouter(router: AutomationStudioFlowRouter): Promise<AutomationStudioFlowRouter> {
    return await this.flowMutations.saveFlowRouter(router);
  }

  private async ensureFlowRouter(projectId: string, flowId: string): Promise<AutomationStudioFlowRouter> {
    const existing = await this.getFlowRouter(projectId, flowId);
    if (existing) return existing;
    const flow = await this.getFlow(projectId, flowId);
    const now = Date.now();
    return await this.saveFlowRouter({
      schemaVersion: "0.1",
      routerId: `router.${randomUUID()}`,
      projectId,
      flowId,
      name: `${flow.name} Flow Map`,
      ...(flow.description ? { description: flow.description } : {}),
      rules: [],
      fallback: { kind: "fail", message: "No Flow Map route matched." },
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: { routeGroups: [] }
    });
  }

  async upsertFlowMapRouteGroup(input: UpsertFlowMapRouteGroupInput): Promise<AutomationStudioFlowRouter> {
    const router = await this.ensureFlowRouter(input.projectId, input.flowId);
    const name = input.name.trim();
    if (!name) throw new Error("Route group name is required.");
    const now = Date.now();
    const groups = flowMapRouteGroups(router);
    const existing = input.groupId ? groups.find((group) => group.groupId === input.groupId) : undefined;
    const group: AutomationStudioFlowRouteGroup = {
      schemaVersion: "0.1",
      groupId: existing?.groupId ?? `route-group.${randomUUID()}`,
      routerId: router.routerId,
      name,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      order: clampInteger(input.order, 0, 1_000_000, existing?.order ?? nextRouteGroupOrder(groups)),
      status: flowMapExpansionStatus(input.status, existing?.status ?? "active"),
      collapsed: input.collapsed ?? existing?.collapsed ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.metadata ? { metadata: existing.metadata } : {})
    };
    return await this.saveFlowRouter(withFlowMapRouteGroups({ ...router, updatedAt: now }, upsertBy(groups, "groupId", group)));
  }

  async deleteFlowMapRouteGroup(input: { projectId: string; flowId: string; groupId: string }): Promise<AutomationStudioFlowRouter> {
    const router = await this.ensureFlowRouter(input.projectId, input.flowId);
    const groupId = input.groupId.trim();
    if (!groupId) throw new Error("Route group ID is required.");
    const now = Date.now();
    const rules = router.rules.map((rule) => removeUndefinedRouteRuleFields({
      ...rule,
      metadata: routeRuleMetadataWithoutGroup(rule.metadata, groupId),
      updatedAt: rule.metadata?.groupId === groupId ? now : rule.updatedAt
    }));
    return await this.saveFlowRouter(withFlowMapRouteGroups({ ...router, rules, updatedAt: now } as AutomationStudioFlowRouter, flowMapRouteGroups(router).filter((group) => group.groupId !== groupId)));
  }

  async upsertFlowMapRoute(input: UpsertFlowMapRouteInput): Promise<AutomationStudioFlowRouter> {
    const router = await this.ensureFlowRouter(input.projectId, input.flowId);
    const name = input.name.trim();
    const targetSubflowId = input.targetSubflowId.trim();
    if (!name) throw new Error("Route name is required.");
    if (!targetSubflowId) throw new Error("Route target subflow is required.");
    const now = Date.now();
    const existing = input.ruleId ? router.rules.find((rule) => rule.ruleId === input.ruleId) : undefined;
    const condition = input.clearCondition ? undefined : routeConditionFromInput(input) ?? existing?.condition;
    const confidence = input.confidence === undefined ? existing?.confidence : clampNumber(input.confidence, 0, 1, 1);
    const conditionMetadata = { ...(existing?.metadata ?? {}) };
    if (input.clearCondition) delete conditionMetadata.conditionSummary;
    else if (input.conditionSummary?.trim()) conditionMetadata.conditionSummary = input.conditionSummary.trim();
    const metadata = routeRuleMetadataWithGroup(conditionMetadata, input.groupId);
    const rule: AutomationStudioFlowRouteRule = removeUndefinedRouteRuleFields({
      schemaVersion: "0.1",
      ruleId: existing?.ruleId ?? `route.${randomUUID()}`,
      routerId: router.routerId,
      name,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      target: { kind: "subflow", subflowId: targetSubflowId },
      order: clampInteger(input.order, 0, 1_000_000, existing?.order ?? nextRouteOrder(router.rules)),
      status: flowMapExpansionStatus(input.status, existing?.status ?? "active"),
      ...(condition ? { condition } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(metadata ? { metadata } : {})
    });
    const rules = upsertBy(router.rules ?? [], "ruleId", rule).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
    const nextRouter = { ...router, rules, updatedAt: now } as AutomationStudioFlowRouter;
    if (input.setAsFallback) nextRouter.fallback = { kind: "subflow", subflowId: targetSubflowId };
    return await this.saveFlowRouter(nextRouter);
  }

  async setFlowMapFallback(input: { projectId: string; flowId: string; kind: "subflow" | "fail"; targetSubflowId?: string; message?: string }): Promise<AutomationStudioFlowRouter> {
    const router = await this.ensureFlowRouter(input.projectId, input.flowId);
    const fallback = input.kind === "subflow"
      ? { kind: "subflow" as const, subflowId: String(input.targetSubflowId ?? "").trim() }
      : { kind: "fail" as const, message: input.message?.trim() || "No Flow Map route matched." };
    if (fallback.kind === "subflow" && !fallback.subflowId) throw new Error("Fallback target subflow is required.");
    return await this.saveFlowRouter({ ...router, fallback, updatedAt: Date.now() });
  }
  async mutateFlowMapRoute(input: { projectId: string; flowId: string; ruleId: string; action: "move_up" | "move_down" | "duplicate" | "toggle" | "delete" }): Promise<AutomationStudioFlowRouter> {
    const router = await this.ensureFlowRouter(input.projectId, input.flowId);
    const ordered = flowMapSortedRules(router.rules);
    const index = ordered.findIndex((rule) => rule.ruleId === input.ruleId.trim());
    if (index < 0) throw new Error("Route rule was not found.");
    if (input.action === "delete") return await this.deleteFlowMapRoute({ projectId: input.projectId, flowId: input.flowId, ruleId: input.ruleId });
    const now = Date.now();
    if (input.action === "duplicate") {
      const source = ordered[index]!;
      const takenNames = new Set(ordered.map((rule) => rule.name.toLowerCase()));
      let name = source.name + " copy";
      let suffix = 2;
      while (takenNames.has(name.toLowerCase())) name = source.name + " copy " + suffix++;
      ordered.splice(index + 1, 0, { ...source, ruleId: "route." + randomUUID(), name, createdAt: now, updatedAt: now });
    } else if (input.action === "toggle") {
      const source = ordered[index]!;
      ordered[index] = { ...source, status: source.status === "active" ? "disabled" : "active", updatedAt: now };
    } else {
      const targetIndex = input.action === "move_up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) return router;
      const target = ordered[targetIndex]!;
      ordered[targetIndex] = ordered[index]!;
      ordered[index] = target;
    }
    const rules = ordered.map((rule, orderIndex) => ({ ...rule, order: orderIndex * 10, updatedAt: rule.updatedAt === now ? now : input.action.startsWith("move_") ? now : rule.updatedAt }));
    return await this.saveFlowRouter({ ...router, rules, updatedAt: now });
  }
  async deleteFlowMapRoute(input: { projectId: string; flowId: string; ruleId: string }): Promise<AutomationStudioFlowRouter> {
    const router = await this.ensureFlowRouter(input.projectId, input.flowId);
    const ruleId = input.ruleId.trim();
    if (!ruleId) throw new Error("Route rule ID is required.");
    const now = Date.now();
    return await this.saveFlowRouter({ ...router, rules: router.rules.filter((rule) => rule.ruleId !== ruleId), updatedAt: now } as AutomationStudioFlowRouter);
  }
  async saveFlowSubflow(subflow: AutomationStudioFlowSubflow): Promise<AutomationStudioFlowSubflow> {
    return await this.flowMutations.saveFlowSubflow(subflow);
  }

  async createFlowSubflow(input: CreateFlowSubflowInput): Promise<AutomationStudioFlowSubflow> {
    return await this.flowMutations.createFlowSubflow(input);
  }

  async migrateLegacyFlowRepresentation(input: { projectId: string; flowId: string; subflowId: string }): Promise<{
    parentFlow: AutomationStudioFlowArtifact;
    subflow: AutomationStudioFlowSubflow;
    graphFlow: AutomationStudioFlowArtifact;
  }> {
    const parentFlow = await this.getFlow(input.projectId, input.flowId);
    const representation = this.flowWriter.persistedFlowRepresentation(parentFlow);
    if (representation === "subflow_graph") throw new Error("Legacy representation migration requires a top-level parent Flow.");
    const subflow = await this.getFlowSubflow(input.projectId, input.flowId, input.subflowId);
    if (!subflow?.graphFlowId) throw new Error("The requested Subflow does not exist or does not own an executable graph Flow.");
    const graphFlow = await this.getFlow(input.projectId, subflow.graphFlowId);
    await this.flowWriter.assertOwnedSubflowGraph(input.projectId, graphFlow);
    if (graphFlow.metadata?.parentFlowId !== parentFlow.flowId
      || graphFlow.metadata?.parentSubflowId !== subflow.subflowId
      || subflow.flowId !== parentFlow.flowId
      || subflow.graphFlowId !== graphFlow.flowId) {
      throw new Error("The requested Subflow graph does not prove exact project, parent Flow, and Subflow ownership.");
    }
    if (representation === "orchestration") {
      if (parentFlow.nodes.length || parentFlow.edges.length) throw new Error("Orchestration Flow representation is invalid because the parent still owns graph content.");
      const router = await this.getFlowRouter(input.projectId, input.flowId);
      if (router?.fallback?.kind !== "subflow" || router.fallback.subflowId !== subflow.subflowId) {
        throw new Error("Flow is already orchestration, but its Router fallback does not target the requested Subflow.");
      }
      const savedParent = automationStudioFlowRepresentationKind(parentFlow) === "orchestration"
        ? parentFlow
        : await this.flowWriter.saveFlowInternal({
          projectId: input.projectId,
          flow: {
            ...parentFlow,
            metadata: withAutomationStudioFlowRepresentation(parentFlow.metadata, "orchestration")
          }
        }, false, "orchestration");
      return { parentFlow: savedParent, subflow, graphFlow };
    }
    if (parentFlow.source.mode === "code") {
      throw new Error("Code-owned legacy Flows require an explicit source migration before Subflow/Router conversion.");
    }
    return await this.flowSubflowMigration.migrateLegacyParentIntoOwnedSubflow(parentFlow, subflow, graphFlow);
  }
  async updateFlowSubflow(input: UpdateFlowSubflowInput): Promise<AutomationStudioFlowSubflow> {
    const existing = await this.getFlowSubflow(input.projectId, input.flowId, input.subflowId);
    if (!existing) throw new Error(`Unknown Automation Studio subflow: ${input.subflowId}`);
    if (input.graphFlowId !== undefined && input.graphFlowId.trim() !== existing.graphFlowId) throw new Error("A Subflow graph Flow cannot be reassigned; create or duplicate a Subflow instead.");
    if (input.expectedUpdatedAt !== undefined && existing.updatedAt !== input.expectedUpdatedAt) throw new Error("SUBFLOW_SAVE_CONFLICT: This subflow changed after Settings loaded.");
    const next = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? input.description.trim() ? { description: input.description.trim() } : { description: undefined } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.parentCategoryId !== undefined ? { metadata: subflowMetadataWithParentCategory(existing.metadata, input.parentCategoryId) } : {}),
      ...(input.routeTags !== undefined ? { routeTags: uniqueStrings(input.routeTags.map((tag) => tag.trim()).filter(Boolean)) } : {}),
      ...(input.inputMapping !== undefined ? { inputMapping: input.inputMapping } : {}),
      ...(input.outputMapping !== undefined ? { outputMapping: input.outputMapping } : {}),
      ...(input.localInstructionIds !== undefined ? { localInstructionIds: uniqueStrings(input.localInstructionIds.map((id) => id.trim()).filter(Boolean)) } : {}),
      ...(input.proposalModeOverride !== undefined ? input.proposalModeOverride ? { proposalModeOverride: input.proposalModeOverride } : { proposalModeOverride: undefined } : {}),
      ...(input.interventionModeOverride !== undefined ? input.interventionModeOverride ? { interventionModeOverride: input.interventionModeOverride } : { interventionModeOverride: undefined } : {}),
      ...(input.graphFlowId !== undefined ? { graphFlowId: input.graphFlowId.trim() } : {}),
      updatedAt: Date.now()
    };
    const saved = await this.saveFlowSubflow(removeUndefinedSubflowFields(next as AutomationStudioFlowSubflow));
    if (input.name !== undefined && saved.graphFlowId) await this.renameSubflowGraphFlow(input.projectId, saved, input.name.trim()).catch(() => undefined);
    await this.flowMutations.appendFlowSubflowMutationChangeFeed(saved, "update");
    return saved;
  }

  async renameFlowSubflow(input: { projectId: string; flowId: string; subflowId: string; name: string }): Promise<AutomationStudioFlowSubflow> {
    return await this.updateFlowSubflow(input);
  }

  async duplicateFlowSubflow(input: { projectId: string; flowId: string; subflowId: string; name?: string }): Promise<AutomationStudioFlowSubflow> {
    const existing = await this.getFlowSubflow(input.projectId, input.flowId, input.subflowId);
    if (!existing) throw new Error("Unknown Automation Studio subflow: " + input.subflowId);
    if (!existing.graphFlowId) throw new Error("Subflow does not own a Nodes graph and cannot be duplicated.");
    const now = Date.now();
    const subflowId = "subflow." + randomUUID();
    const graphFlowId = input.flowId + "." + subflowId + ".graph";
    const sourceGraph = await this.getFlow(input.projectId, existing.graphFlowId);
    const name = input.name?.trim() || existing.name + " Copy";
    await this.flowWriter.saveFlowInternal({
      projectId: input.projectId,
      flow: {
        ...sourceGraph,
        flowId: graphFlowId,
        name: name + " Graph",
        createdAt: now,
        updatedAt: now,
        metadata: { ...(sourceGraph.metadata ?? {}), parentFlowId: input.flowId, parentSubflowId: subflowId, subflowGraph: true, duplicatedFromFlowId: existing.graphFlowId }
      }
    }, false, "subflow_graph");
    const saved = await this.saveFlowSubflow({
      ...existing,
      subflowId,
      graphFlowId,
      name,
      status: "active",
      createdAt: now,
      updatedAt: now,
      stability: { runCount: 0, successCount: 0, failureCount: 0 },
      metadata: { ...(existing.metadata ?? {}), duplicatedFromSubflowId: existing.subflowId }
    });
    await this.flowMutations.appendFlowSubflowMutationChangeFeed(saved, "create");
    return saved;
  }
  async disableFlowSubflow(input: { projectId: string; flowId: string; subflowId: string }): Promise<AutomationStudioFlowSubflow> {
    const existing = await this.getFlowSubflow(input.projectId, input.flowId, input.subflowId);
    if (!existing) throw new Error(`Unknown Automation Studio subflow: ${input.subflowId}`);
    const saved = await this.saveFlowSubflow({ ...existing, status: "disabled", updatedAt: Date.now() });
    await this.flowMutations.appendFlowSubflowMutationChangeFeed(saved, "update");
    return saved;
  }

  async archiveFlowSubflow(input: { projectId: string; flowId: string; subflowId: string }): Promise<AutomationStudioFlowSubflow> {
    const existing = await this.getFlowSubflow(input.projectId, input.flowId, input.subflowId);
    if (!existing) throw new Error(`Unknown Automation Studio subflow: ${input.subflowId}`);
    const saved = await this.saveFlowSubflow({ ...existing, status: "archived", updatedAt: Date.now() });
    await this.flowMutations.appendFlowSubflowMutationChangeFeed(saved, "update");
    return saved;
  }

  async enableFlowSubflow(input: { projectId: string; flowId: string; subflowId: string }): Promise<AutomationStudioFlowSubflow> {
    const existing = await this.getFlowSubflow(input.projectId, input.flowId, input.subflowId);
    if (!existing) throw new Error("Unknown Automation Studio subflow: " + input.subflowId);
    const saved = await this.saveFlowSubflow({ ...existing, status: "active", updatedAt: Date.now() });
    await this.flowMutations.appendFlowSubflowMutationChangeFeed(saved, "update");
    return saved;
  }

  async deleteFlowSubflow(input: { projectId: string; flowId: string; subflowId: string }): Promise<{ deletedSubflowId: string; deletedGraphFlowId: string }> {
    const existing = await this.getFlowSubflow(input.projectId, input.flowId, input.subflowId);
    if (!existing) throw new Error("Unknown Automation Studio subflow: " + input.subflowId);
    if (!existing.graphFlowId) throw new Error("Subflow does not own a Nodes graph and cannot be deleted safely.");
    const router = await this.getFlowRouter(input.projectId, input.flowId);
    const referenced = router?.rules.some((rule) => rule.target.subflowId === input.subflowId) || (router?.fallback?.kind === "subflow" && router.fallback.subflowId === input.subflowId);
    if (referenced) throw new Error("Remove this Subflow from Router routes and fallback before deleting it.");
    const deletedAt = Date.now();
    await this.flows.markSqlFlowSubflowDeleted(input.projectId, existing, deletedAt);
    await this.flowWriter.deleteFlowArtifact({ projectId: input.projectId, flowId: existing.graphFlowId }, true);
    await ProgramJsonStore.deletePath(this.flowPaths.flowSubflowFile(input.projectId, input.flowId, input.subflowId));
    await this.indexes.writeFlowSubflowIndex(input.projectId, (index) => ({ schemaVersion: "0.1", summaryVersion: 2, subflows: (index.subflows ?? []).filter((item) => item.subflowId !== input.subflowId) }));
    if (this.projectPaths.root) await this.flowMutations.flowSubflowSummaryRepository(input.projectId).delete(input.subflowId);
    await this.flowWriter.appendProjectMutationChangeFeed({
      projectId: input.projectId,
      entityKind: "subflow",
      entityId: input.subflowId,
      parentId: input.flowId,
      operation: "delete",
      revision: subflowFeedRevision(existing),
      changedAt: deletedAt,
      hierarchyScope: { kind: "flow", id: input.flowId }
    });
    return { deletedSubflowId: input.subflowId, deletedGraphFlowId: existing.graphFlowId };
  }
  async saveFlowInstruction(projectId: string, instruction: AutomationStudioFlowInstruction): Promise<AutomationStudioFlowInstruction> {
    const summary = instructionSummaryFromInstruction(instruction);
    const filePath = summary.flowId ? this.flowPaths.flowInstructionFile(projectId, summary.flowId, instruction.instructionId) : this.projectPaths.projectInstructionFile(projectId, instruction.instructionId);
    await this.projects.ensureProjectStructure(projectId);
    await new ProgramJsonStore<JsonObject>(filePath, () => ({})).write(instruction as unknown as JsonObject);
    await this.indexes.writeFlowInstructionIndex(projectId, (index) => ({ schemaVersion: "0.1", summaryVersion: 2, instructions: upsertBy(index.instructions ?? [], "instructionId", { ...summary, projectId }) }));
    await this.summaries.writeFlowInstructionSummary(projectId, { ...summary, projectId });
    await this.flows.writeSqlFlowInstruction(projectId, instruction).catch(() => undefined);
    return instruction;
  }

  async saveFlowGenerationInstruction(input: { projectId: string; flowId: string; instruction: string }): Promise<AutomationStudioFlowInstruction> {
    const projectId = requiredBootstrapCommandId(input.projectId, "project");
    const flowId = requiredBootstrapCommandId(input.flowId, "Flow");
    const body = typeof input.instruction === "string" ? input.instruction.trim() : "";
    if (!body || body.length > 4_000) throw new Error("Flow generation instruction must contain 1 to 4,000 characters.");
    await this.assertBlankBootstrapTarget(projectId, flowId);
    const existing = (await this.getAllFlowInstructionsForBootstrap(projectId, flowId)).find((item) => item.metadata?.source === "evidence_guided_generation");
    const now = Date.now();
    return await this.saveFlowInstruction(projectId, {
      schemaVersion: "0.1",
      instructionId: existing?.instructionId ?? `instruction.exploration.${randomUUID()}`,
      title: "Evidence-guided generation goal",
      body,
      scope: { kind: "flow", projectId, flowId },
      priority: 50,
      status: "active",
      requirement: "required",
      tags: ["generation"],
      linkedRunIds: existing?.linkedRunIds ?? [], linkedAdaptationIds: existing?.linkedAdaptationIds ?? [],
      linkedRecordingIds: existing?.linkedRecordingIds ?? [], linkedSubflowIds: existing?.linkedSubflowIds ?? [],
      createdAt: existing?.createdAt ?? now, updatedAt: now,
      metadata: { source: "evidence_guided_generation" }
    });
  }

  async saveFlowChangeProposal(proposal: AutomationStudioFlowChangeProposal): Promise<AutomationStudioFlowChangeProposal> {
    await this.projects.ensureProjectStructure(proposal.projectId);
    await new ProgramJsonStore<JsonObject>(this.flowPaths.flowChangeProposalFile(proposal.projectId, proposal.flowId, proposal.proposalId), () => ({})).write(proposal as unknown as JsonObject);
    await this.indexes.writeFlowChangeProposalIndex(proposal.projectId, (index) => ({ schemaVersion: "0.1", changeProposals: upsertBy(index.changeProposals ?? [], "proposalId", changeProposalSummaryFromProposal(proposal)) }));
    return proposal;
  }

  async saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail> {
    return await this.summaries.saveFlowRunDetail(detail);
  }

  async saveFlowAdaptation(adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioFlowAdaptation> {
    const validation = validateAutomationStudioFlowAdaptation(adaptation);
    if (!validation.ok) throw new Error(`Invalid Automation Studio adaptation: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    const typed = await this.summaries.tryWithAdaptationStore(adaptation.projectId, async (store) => await store.putAdaptation({ adaptation, approvalMode: adaptationApprovalModeForStore(adaptation), evidence: adaptationEvidenceForStore(adaptation), changedAt: adaptation.updatedAt }));
    if (typed) return adaptationFromTypedStoreDetail(typed);
    await this.projects.ensureProjectStructure(adaptation.projectId);
    await new ProgramJsonStore<JsonObject>(this.flowPaths.flowAdaptationFile(adaptation.projectId, adaptation.flowId, adaptation.adaptationId), () => ({})).write(adaptation as unknown as JsonObject);
    await this.indexes.writeFlowAdaptationIndex(adaptation.projectId, (index) => ({ schemaVersion: "0.1", adaptations: upsertBy(index.adaptations ?? [], "adaptationId", adaptationSummaryFromAdaptation(adaptation)) }));
    if (this.projectPaths.root) await this.summaries.writeFlowAdaptationSummary(adaptation.projectId, adaptationSummaryFromAdaptation(adaptation));
    return adaptation;
  }

  async reviewFlowAdaptation(input: ReviewFlowAdaptationInput): Promise<AutomationStudioFlowAdaptation> {
    const typedReview = await this.reviewTypedFlowAdaptation(input);
    if (typedReview) return typedReview;
    const bootstrap = await this.getFlowBootstrapAdaptation(input.projectId, input.flowId, input.adaptationId);
    if (bootstrap) {
      if (input.action !== "approve" && input.action !== "reject" && input.action !== "apply" && input.action !== "revert") {
        throw new Error(`Flow Bootstrap adaptations do not support ${input.action}.`);
      }
      const reviewed = await this.reviewFlowBootstrapAdaptation({
        projectId: input.projectId,
        flowId: input.flowId,
        adaptationId: input.adaptationId,
        action: input.action,
        ...(input.actorId ? { actorId: input.actorId } : {}),
        ...(input.reason ? { reason: input.reason } : {})
      });
      return bootstrapAdaptationAsFlowAdaptation(reviewed, await this.getLlmExecutionBinding(input.projectId, input.flowId));
    }
    const adaptation = await this.getFlowAdaptation(input.projectId, input.flowId, input.adaptationId);
    if (!adaptation) throw new Error(`Unknown adaptation: ${input.adaptationId}`);
    const now = Date.now();
    const metadata = {
      ...(adaptation.metadata ?? {}),
      review: {
        ...((adaptation.metadata?.review && typeof adaptation.metadata.review === "object" && !Array.isArray(adaptation.metadata.review)) ? adaptation.metadata.review as JsonObject : {}),
        lastAction: input.action,
        reviewedAt: now,
        ...(input.actorId ? { actorId: input.actorId } : {}),
        ...(input.reason ? { reason: input.reason } : {})
      },
      validationCounts: adaptationValidationCounts(adaptation),
      confidenceScore: adaptationConfidenceScore(adaptation)
    } as JsonObject;
    let next: AutomationStudioFlowAdaptation = { ...adaptation, updatedAt: now, metadata };
    if (input.action === "apply" && adaptation.status === "applied") {
      const reviewMetadata = isJsonRecord(metadata.review) ? metadata.review : {};
      return await this.saveFlowAdaptation({
        ...adaptation,
        updatedAt: now,
        metadata: {
          ...(adaptation.metadata ?? {}),
          review: reviewMetadata,
          idempotentApply: { at: now, actorId: input.actorId ?? "runtime", reason: "Adaptation was already applied." }
        }
      });
    }
    if (input.action === "approve") next = { ...next, status: "validated" };
    if (input.action === "reject") next = { ...next, status: "rejected" };
    if (input.action === "disable") next = { ...next, status: "disabled" };
    if (input.action === "request_validation") next = { ...next, status: "testing" };
    if (input.action === "switch_manual") next = { ...next, status: "proposed", metadata: { ...metadata, proposalModeOverride: "manual" } };
    if (input.action === "supersede") next = { ...next, status: "superseded", metadata: { ...metadata, supersededByAdaptationId: input.supersededByAdaptationId ?? "" } };
    if (input.action === "revert") {
      next = await this.durableAdaptations.revertFlowAdaptationDurably(next, metadata, now, input.actorId ?? "unknown");
      return await this.saveFlowAdaptation(next);
    }
    if (input.action === "apply") {
      const gates = evaluateFlowAdaptationPromotionGates(next);
      if (!gates.ok) throw new Error(`Adaptation cannot be applied: ${gates.issues.join("; ")}`);
      const application = await this.durableAdaptations.applyFlowAdaptationDurably(next, now, input.actorId ?? "runtime");
      next = {
        ...next,
        status: "applied",
        appliedTo: application.appliedTo,
        metadata: {
          ...metadata,
          applicationRecord: application.record
        }
      };
    }
    return await this.saveFlowAdaptation(next);
  }

  private async getAllFlowInstructionsForBootstrap(projectId: string, flowId: string): Promise<AutomationStudioFlowInstruction[]> {
    const instructionIds = new Set<string>();
    for (let offset = 0; ; offset += 100) {
      const page = await this.listFlowInstructionSummaries({
        projectId,
        flowId,
        status: "active",
        limit: 100,
        offset
      });
      for (const instruction of page.instructions) instructionIds.add(instruction.instructionId);
      if (offset + page.instructions.length >= page.total || page.instructions.length === 0) break;
    }
    return (await Promise.all([...instructionIds].sort().map((instructionId) => this.getFlowInstruction(projectId, instructionId))))
      .filter((instruction): instruction is AutomationStudioFlowInstruction => instruction?.status === "active");
  }

  private async assertBlankBootstrapTarget(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact> {
    const parent = await this.getFlow(projectId, flowId);
    if (this.flowWriter.persistedFlowRepresentation(parent) !== "orchestration" || parent.nodes.length || parent.edges.length) {
      throw new Error("Flow Bootstrap requires a blank top-level orchestration Flow.");
    }
    if (await this.getFlowRouter(projectId, flowId)) throw new Error("Flow Bootstrap requires a Flow without a Router.");
    const page = await this.listFlowSubflowSummaries({ projectId, flowId, limit: 1, offset: 0 });
    if (page.total > 0) throw new Error("Flow Bootstrap requires a Flow without Subflows.");
    return parent;
  }

  private async transitionFlowBootstrapAdaptation(
    adaptation: AutomationStudioBootstrapAdaptation,
    status: AutomationStudioBootstrapAdaptation["status"],
    eventType: "approved" | "rejected",
    actorId: string | null
  ): Promise<AutomationStudioBootstrapAdaptation> {
    const now = Date.now();
    const next = {
      ...adaptation,
      status,
      updatedAt: now,
      auditEvents: [...(adaptation.auditEvents ?? []), bootstrapAdaptationAuditEvent({
        adaptationId: adaptation.adaptationId,
        eventType,
        actorId,
        fromStatus: adaptation.status,
        toStatus: status,
        createdAt: now
      })]
    };
    await this.bootstrapAdaptations.saveFlowBootstrapAdaptation(next);
    await this.appendBootstrapAdaptationChangeFeed(next, "update");
    return structuredClone(next);
  }

  private async applyFlowBootstrapAdaptation(
    adaptation: AutomationStudioBootstrapAdaptation,
    appliedBy: string
  ): Promise<AutomationStudioBootstrapAdaptation> {
    if (adaptation.status !== "validated") throw new Error("Only a validated Flow Bootstrap adaptation can be applied.");
    const parent = await this.assertBlankBootstrapTarget(adaptation.projectId, adaptation.flowId);
    const currentDigest = await this.getLlmExecutionDependencyDigest(adaptation.projectId, adaptation.flowId);
    if (currentDigest !== adaptation.baseDependencyDigest) {
      throw new Error("FLOW_BOOTSTRAP_STALE: Flow dependencies changed after this Bootstrap adaptation was proposed.");
    }
    assertAutomationStudioBootstrapHasNoRecordingProvenance(adaptation);
    const validation = validateAutomationStudioFlowBootstrapPlan({
      plan: adaptation.buildPlan.plan,
      registry: this.nativeNodeRuntime?.sdk.nodes ?? new AutomationStudioNodeRegistry(),
      resolution: this.nativeNodeRuntime?.getRegistryResolution(parent.scope) ?? {
        scope: parent.scope,
        runtimeCapabilities: [],
        permissions: []
      }
    });
    if (!validation.ok || !validation.validated || stableJson(validation.validated) !== stableJson(adaptation.buildPlan)) {
      throw new Error("Flow Bootstrap plan is invalid or no longer matches the current Core registry.");
    }
    const expectedTopology = normalizeAutomationStudioFlowBuildPlan({
      adaptationId: adaptation.adaptationId,
      parentFlow: parent,
      buildPlan: validation.validated,
      sourceInstructionIds: adaptation.sourceInstructionIds,
      now: adaptation.createdAt
    });
    if (stableJson(expectedTopology) !== stableJson(adaptation.topology)) {
      throw new Error("Flow Bootstrap topology is not the Core-owned normalization of its validated plan.");
    }
    const parentBefore = {
      ...(parent.metadata ? { metadata: structuredClone(parent.metadata) } : {}),
      ...(parent.expansion ? { expansion: structuredClone(parent.expansion) } : {}),
      updatedAt: parent.updatedAt
    };
    const createdSubflows: AutomationStudioFlowSubflow[] = [];
    let routerCreated = false;
    let parentChanged = false;
    try {
      for (const entry of adaptation.topology.subflows) {
        await this.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: structuredClone(entry.graphFlow) }, false, "subflow_graph");
        const savedSubflow = await this.saveFlowSubflow(structuredClone(entry.subflow));
        createdSubflows.push(savedSubflow);
        await this.flowMutations.appendFlowSubflowMutationChangeFeed(savedSubflow, "create");
      }
      await this.saveFlowRouter(structuredClone(adaptation.topology.router));
      routerCreated = true;
      const nextParent = await this.saveFlow({
        projectId: adaptation.projectId,
        expectedUpdatedAt: parent.updatedAt,
        flow: {
          ...parent,
          metadata: {
            ...(parent.metadata ?? {}),
            bootstrapAdaptationId: adaptation.adaptationId,
            bootstrapSourceInstructionIds: [...adaptation.sourceInstructionIds]
          }
        }
      });
      parentChanged = true;
      const appliedDependencyDigest = await this.getLlmExecutionDependencyDigest(adaptation.projectId, adaptation.flowId);
      const now = Date.now();
      const next: AutomationStudioBootstrapAdaptation = {
        ...adaptation,
        status: "applied",
        updatedAt: now,
        application: {
          appliedAt: now,
          appliedBy,
          appliedDependencyDigest,
          parentBefore
        },
        auditEvents: [...(adaptation.auditEvents ?? []), bootstrapAdaptationAuditEvent({
          adaptationId: adaptation.adaptationId,
          eventType: "applied",
          actorId: appliedBy,
          fromStatus: adaptation.status,
          toStatus: "applied",
          createdAt: now
        })]
      };
      await this.bootstrapAdaptations.saveFlowBootstrapAdaptation(next);
      await this.appendBootstrapAdaptationChangeFeed(next, "update");
      void nextParent;
      return structuredClone(next);
    } catch (error) {
      const rollbackFailures: string[] = [];
      if (routerCreated) await this.deleteFlowBootstrapRouter(adaptation).catch((rollbackError) => rollbackFailures.push(String(rollbackError)));
      for (const entry of createdSubflows.slice().reverse()) {
        await this.flowMutations.deleteCreatedFlowSubflow(
          adaptation.projectId,
          adaptation.flowId,
          entry.subflowId,
          entry.graphFlowId,
          true
        ).catch((rollbackError) => rollbackFailures.push(String(rollbackError)));
      }
      const currentParent = await this.getFlow(adaptation.projectId, adaptation.flowId).catch(() => null);
      if (currentParent && (parentChanged || currentParent.metadata?.bootstrapAdaptationId === adaptation.adaptationId)) {
        await this.saveFlow({
          projectId: adaptation.projectId,
          flow: {
            ...currentParent,
            ...(parentBefore.expansion ? { expansion: structuredClone(parentBefore.expansion) } : {}),
            metadata: parentBefore.metadata ? structuredClone(parentBefore.metadata) : {}
          }
        }).catch((rollbackError) => rollbackFailures.push(String(rollbackError)));
      }
      if (rollbackFailures.length) {
        throw new Error(`Flow Bootstrap application failed and rollback was incomplete: ${String(error)}; ${rollbackFailures.join("; ")}`);
      }
      throw error;
    }
  }

  private async revertFlowBootstrapAdaptation(
    adaptation: AutomationStudioBootstrapAdaptation,
    revertedBy: string
  ): Promise<AutomationStudioBootstrapAdaptation> {
    if (adaptation.status !== "applied" || !adaptation.application) throw new Error("Only an applied Flow Bootstrap adaptation can be reverted.");
    const currentDigest = await this.getLlmExecutionDependencyDigest(adaptation.projectId, adaptation.flowId);
    if (currentDigest !== adaptation.application.appliedDependencyDigest) {
      throw new Error("FLOW_BOOTSTRAP_STALE: Flow dependencies changed after this Bootstrap adaptation was applied.");
    }
    const appliedParent = await this.getFlow(adaptation.projectId, adaptation.flowId);
    const router = await this.getFlowRouter(adaptation.projectId, adaptation.flowId);
    if (!router || router.routerId !== adaptation.topology.router.routerId
      || router.metadata?.bootstrapAdaptationId !== adaptation.adaptationId) {
      throw new Error("Flow Bootstrap Router ownership changed; revert refused.");
    }
    for (const entry of adaptation.topology.subflows) {
      const current = await this.getFlowSubflow(adaptation.projectId, adaptation.flowId, entry.subflow.subflowId);
      const graph = await this.getFlow(adaptation.projectId, entry.graphFlow.flowId).catch(() => null);
      if (!current || current.graphFlowId !== entry.subflow.graphFlowId
        || current.metadata?.bootstrapAdaptationId !== adaptation.adaptationId
        || !graph || graph.metadata?.parentFlowId !== adaptation.flowId
        || graph.metadata?.parentSubflowId !== current.subflowId
        || graph.metadata?.bootstrapAdaptationId !== adaptation.adaptationId) {
        throw new Error("Flow Bootstrap topology ownership changed; revert refused.");
      }
    }
    try {
      await this.deleteFlowBootstrapRouter(adaptation);
      for (const entry of adaptation.topology.subflows.slice().reverse()) {
        await this.flowMutations.deleteCreatedFlowSubflow(
          adaptation.projectId,
          adaptation.flowId,
          entry.subflow.subflowId,
          entry.subflow.graphFlowId,
          true
        );
      }
      const parent = await this.getFlow(adaptation.projectId, adaptation.flowId);
      const before = adaptation.application.parentBefore;
      await this.saveFlow({
        projectId: adaptation.projectId,
        flow: {
          ...parent,
          ...(before.expansion ? { expansion: structuredClone(before.expansion) } : {}),
          metadata: before.metadata ? structuredClone(before.metadata) : {}
        }
      });
      const now = Date.now();
      const next: AutomationStudioBootstrapAdaptation = {
        ...adaptation,
        status: "reverted",
        updatedAt: now,
        application: adaptation.application,
        revert: { revertedAt: now, revertedBy },
        auditEvents: [...(adaptation.auditEvents ?? []), bootstrapAdaptationAuditEvent({
          adaptationId: adaptation.adaptationId,
          eventType: "rollback",
          actorId: revertedBy,
          fromStatus: adaptation.status,
          toStatus: "reverted",
          createdAt: now
        })]
      };
      await this.bootstrapAdaptations.saveFlowBootstrapAdaptation(next);
      await this.appendBootstrapAdaptationChangeFeed(next, "update");
      return structuredClone(next);
    } catch (error) {
      const rollbackFailures: string[] = [];
      for (const entry of adaptation.topology.subflows) {
        const graph = await this.getFlow(adaptation.projectId, entry.graphFlow.flowId).catch(() => null);
        if (!graph) {
          await this.flowWriter.saveFlowInternal({
            projectId: adaptation.projectId,
            flow: structuredClone(entry.graphFlow)
          }, false, "subflow_graph").catch((rollbackError) => rollbackFailures.push(String(rollbackError)));
        }
        const subflow = await this.getFlowSubflow(adaptation.projectId, adaptation.flowId, entry.subflow.subflowId);
        if (!subflow) {
          await this.saveFlowSubflow(structuredClone(entry.subflow))
            .catch((rollbackError) => rollbackFailures.push(String(rollbackError)));
        }
      }
      if (!await this.getFlowRouter(adaptation.projectId, adaptation.flowId)) {
        await this.saveFlowRouter(structuredClone(adaptation.topology.router))
          .catch((rollbackError) => rollbackFailures.push(String(rollbackError)));
      }
      const currentParent = await this.getFlow(adaptation.projectId, adaptation.flowId).catch(() => null);
      if (currentParent && stableJson(currentParent) !== stableJson(appliedParent)) {
        await this.saveFlow({
          projectId: adaptation.projectId,
          flow: { ...appliedParent, updatedAt: currentParent.updatedAt }
        }).catch((rollbackError) => rollbackFailures.push(String(rollbackError)));
      }
      if (rollbackFailures.length) {
        throw new Error(`Flow Bootstrap revert failed and rollback was incomplete: ${String(error)}; ${rollbackFailures.join("; ")}`);
      }
      throw error;
    }
  }
  private async deleteFlowBootstrapRouter(adaptation: AutomationStudioBootstrapAdaptation): Promise<void> {
    const current = await this.getFlowRouter(adaptation.projectId, adaptation.flowId);
    if (!current) return;
    if (current.routerId !== adaptation.topology.router.routerId
      || current.metadata?.bootstrapAdaptationId !== adaptation.adaptationId) {
      throw new Error("Flow Bootstrap Router ownership changed; mutation refused.");
    }
    const routerFile = this.flowPaths.flowRouterFile(adaptation.projectId, adaptation.flowId);
    await ProgramJsonStore.deletePath(routerFile);
    await rm(routerFile, { force: true });
    await this.indexes.writeFlowRouterIndex(adaptation.projectId, (index) => ({
      schemaVersion: "0.1",
      routers: (index.routers ?? []).filter((item) => item.routerId !== current.routerId)
    }));
    if (this.projectDatabasePool) {
      const lease = await this.projectDatabasePool.acquire(adaptation.projectId);
      try {
        await lease.database.transaction(async (sql) => {
          await sql.run("delete from router_routes where router_id = ?", [current.routerId]);
          await sql.run("delete from router_groups where router_id = ?", [current.routerId]);
          await sql.run("delete from routers where router_id = ?", [current.routerId]);
        });
      } finally {
        await lease.release();
      }
    }
    await this.flowWriter.appendProjectMutationChangeFeed({
      projectId: adaptation.projectId,
      entityKind: "router",
      entityId: current.routerId,
      parentId: adaptation.flowId,
      operation: "delete",
      revision: Math.max(1, Math.trunc(current.updatedAt)),
      changedAt: Date.now(),
      hierarchyScope: { kind: "flow", id: adaptation.flowId }
    });
  }

  private async appendBootstrapAdaptationChangeFeed(
    adaptation: AutomationStudioBootstrapAdaptation,
    operation: "create" | "update"
  ): Promise<void> {
    await this.flowWriter.appendProjectMutationChangeFeed({
      projectId: adaptation.projectId,
      entityKind: "bootstrap_adaptation",
      entityId: adaptation.adaptationId,
      parentId: adaptation.flowId,
      operation,
      revision: Math.max(1, Math.trunc(adaptation.updatedAt)),
      changedAt: adaptation.updatedAt,
      hierarchyScope: { kind: "flow", id: adaptation.flowId }
    });
  }
  async saveFlowAdaptationPolicy(projectId: string, policy: AutomationStudioAdaptationPolicy): Promise<AutomationStudioAdaptationPolicy> {
    await this.projects.ensureProjectStructure(projectId);
    await new ProgramJsonStore<JsonObject>(this.flowPaths.flowAdaptationPolicyFile(projectId, policy.scope.flowId, policy.policyId), () => ({})).write(policy as unknown as JsonObject);
    await this.indexes.writeFlowAdaptationPolicyIndex(projectId, (index) => ({ schemaVersion: "0.1", policies: upsertBy(index.policies ?? [], "policyId", adaptationPolicySummaryFromPolicy(projectId, policy)) }));
    return policy;
  }

  private validateRecordingCandidate(input: { candidate: AutomationStudioRecordingMapperCandidate; actionEntryId: string; sourceEntryId: string; recordingId: string; domainId: string; stateLink?: RecordingFlowActionCandidate["stateLink"]; mapperOutputIds?: string[] }): RecordingFlowActionCandidate {
    const outputId = input.candidate.outputId?.trim();
    if (!outputId) throw new Error("Recording mapper candidates must declare an outputId.");
    if (input.mapperOutputIds?.length && !input.mapperOutputIds.includes(outputId)) throw new Error(`Recording mapper emitted undeclared output ${outputId}.`);
    if (!this.ioRuntime?.io.hasOutput(input.domainId, outputId)) throw new Error(`Recording mapper emitted unregistered output ${outputId}.`);
    const sourceInputIds = uniqueStrings(input.candidate.sourceInputIds ?? []);
    for (const inputId of sourceInputIds) {
      const adapter = this.ioRuntime.io.getInput(input.domainId, inputId);
      if (!adapter) throw new Error(`Recording mapper referenced unregistered input ${inputId}.`);
      if ((adapter.definition.role ?? "state") !== "action") throw new Error(`Recording mapper source input ${inputId} is state-eligible and cannot be reclassified as an action.`);
    }
    const confirmation = input.candidate.expectedConfirmation;
    if (confirmation) {
      const adapter = this.ioRuntime.io.getInput(input.domainId, confirmation.inputId);
      if (!adapter) throw new Error(`Recording mapper referenced unregistered confirmation input ${confirmation.inputId}.`);
      if ((adapter.definition.role ?? "state") !== "action") throw new Error(`Confirmation input ${confirmation.inputId} must be an action-role observation.`);
    }
    const sourceObservationIds = uniqueStrings([input.sourceEntryId, input.actionEntryId, ...(input.candidate.sourceObservationIds ?? [])]);
    const parameters = normalizeRecordingCandidateElementTargetParameters(input.candidate.parameters ?? {});
    return {
      candidateId: `candidate.${safeSegment(input.actionEntryId)}.${randomUUID()}`,
      actionEntryId: input.actionEntryId,
      sourceObservationIds,
      sourceInputIds,
      outputId,
      parameters,
      ...(confirmation ? { expectedConfirmation: { ...confirmation } } : {}),
      confidence: clampConfidence(input.candidate.confidence),
      evidence: input.candidate.evidence?.length ? structuredClone(input.candidate.evidence) : sourceObservationIds.map((entryId) => ({ layer: "recording" as const, artifactId: input.recordingId, entryId })),
      ...(input.stateLink ? { stateLink: input.stateLink } : {}),
      policyStateEligible: false,
      ...(input.candidate.label ? { label: input.candidate.label } : {}),
      ...(input.candidate.description ? { description: input.candidate.description } : {})
    };
  }

  private async readRecordingFlowProposals(projectId: string, revalidate: boolean): Promise<RecordingFlowProposalArtifact[]> {
    const index = await this.indexes.readPipelineIndex(projectId);
    const proposals = await this.readPipelineArtifactList<RecordingFlowProposalArtifact>(projectId, "recordingFlowProposals", (index.recordingFlowProposals ?? []).map((item) => item.proposalId));
    if (!revalidate) return proposals;
    const checked: RecordingFlowProposalArtifact[] = [];
    for (const proposal of proposals) {
      const next = await this.validateRecordingFlowProposal(projectId, proposal);
      if (next.status === "invalidated" && (proposal.status !== "invalidated" || JSON.stringify(proposal.invalidation?.reasons) !== JSON.stringify(next.invalidation?.reasons))) {
        await this.recordings.writePipelineArtifact(projectId, "recordingFlowProposals", next.proposalId, next as unknown as JsonObject);
      }
      checked.push(next);
    }
    return checked;
  }

  private async validateRecordingFlowProposal(projectId: string, proposal: RecordingFlowProposalArtifact): Promise<RecordingFlowProposalArtifact> {
    const reasons: string[] = [];
    const mapper = proposal.domainId && this.nativeNodeRuntime
      ? this.nativeNodeRuntime.listRecordingMappers(proposal.domainId).find((item) => item.definition.id === proposal.mapper.id)
      : undefined;
    if (!mapper) reasons.push(`Mapper ${proposal.mapper.id} is no longer registered.`);
    else {
      if (mapper.definition.version !== proposal.mapper.version || mapper.packageVersion !== proposal.mapper.packageVersion) reasons.push(`Mapper ${proposal.mapper.id} changed from ${proposal.mapper.version}/${proposal.mapper.packageVersion}.`);
      for (const candidate of proposal.candidates) if (mapper.definition.outputIds?.length && !mapper.definition.outputIds.includes(candidate.outputId)) reasons.push(`Output ${candidate.outputId} is no longer declared by mapper ${proposal.mapper.id}.`);
    }
    for (const candidate of proposal.candidates) {
      if (!this.ioRuntime?.io.hasOutput(proposal.domainId, candidate.outputId)) reasons.push(`Output ${candidate.outputId} is no longer registered.`);
      for (const inputId of candidate.sourceInputIds) {
        const adapter = this.ioRuntime?.io.getInput(proposal.domainId, inputId);
        if (!adapter || (adapter.definition.role ?? "state") !== "action") reasons.push(`Source input ${inputId} is missing or is no longer action-role.`);
      }
      if (candidate.expectedConfirmation) {
        const adapter = this.ioRuntime?.io.getInput(proposal.domainId, candidate.expectedConfirmation.inputId);
        if (!adapter || (adapter.definition.role ?? "state") !== "action") reasons.push(`Confirmation input ${candidate.expectedConfirmation.inputId} is missing or is no longer action-role.`);
      }
    }
    if (!reasons.length || proposal.status === "rejected") return proposal;
    const flows = await this.catalogue.listCanonicalFlowArtifacts(projectId);
    const affectedFlowIds = uniqueStrings(flows
      .filter((flow) => flow.nodes.some((node) => node.metadata?.recordingProposalId === proposal.proposalId || (proposal.approvedDefinitions ?? []).some((definition) => definition.id === node.definitionId)))
      .map((flow) => typeof flow.metadata?.parentFlowId === "string" ? flow.metadata.parentFlowId : flow.flowId));
    return { ...proposal, status: "invalidated", invalidation: { invalidatedAt: proposal.invalidation?.invalidatedAt ?? Date.now(), reasons: uniqueStrings(reasons), affectedFlowIds }, updatedAt: Date.now() };
  }

  private async materializeRecordingDerivedFlow(projectId: string, flow: AutomationStudioFlowArtifact): Promise<AutomationStudioFlowArtifact> {
    const definitions = await this.listRecordingDerivedNodeDefinitions(projectId);
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    return { ...flow, nodes: flow.nodes.map((node) => materializeRecordingNode(node, byId.get(node.definitionId))) };
  }

  private async materializeRecordingDerivedDocument(projectId: string, flow: AutomationStudioFlowDocument): Promise<AutomationStudioFlowDocument> {
    const definitions = await this.listRecordingDerivedNodeDefinitions(projectId);
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    return { ...flow, nodes: flow.nodes.map((node) => materializeRecordingNode(node, byId.get(node.definitionId))) };
  }

  async listPipelineArtifacts(projectId: string, options: { revalidateRecordingFlowProposals?: boolean } = {}): Promise<AutomationPipelineArtifacts> {
    const index = await this.indexes.readPipelineIndex(projectId);
    const normalizationReviews = await this.readPipelineArtifactList<NormalizationReviewArtifact>(projectId, "normalizationReviews", index.normalizationReviews.map((item) => item.reviewId));
    const miningRuns = await this.readPipelineArtifactList<SignalMiningResult>(projectId, "miningRuns", index.miningRuns.map((item) => item.miningRunId));
    const embeddedFacts = miningRuns.flatMap((run) => run.facts ?? []);
    const embeddedObservations = miningRuns.flatMap((run) => run.observations ?? []);
    const embeddedCorrelations = miningRuns.flatMap((run) => run.correlations ?? []);
    const embeddedClaims = miningRuns.flatMap((run) => run.claims ?? []);
    const evidenceFacts = embeddedFacts.length ? embeddedFacts : await this.readPipelineArtifactList<EvidenceFact>(projectId, "evidenceFacts", (index.evidenceFacts ?? []).map((item) => item.factId));
    const evidenceObservations = embeddedObservations.length ? embeddedObservations : await this.readPipelineArtifactList<EvidenceObservation>(projectId, "evidenceObservations", (index.evidenceObservations ?? []).map((item) => item.observationId));
    const stateActionCorrelations = embeddedCorrelations.length ? embeddedCorrelations : await this.readPipelineArtifactList<StateActionCorrelation>(projectId, "stateActionCorrelations", (index.stateActionCorrelations ?? []).map((item) => item.correlationId));
    const evidenceClaims = embeddedClaims.length ? embeddedClaims : await this.readPipelineArtifactList<EvidenceClaim>(projectId, "evidenceClaims", (index.evidenceClaims ?? []).map((item) => item.claimId));
    const learnedTaskModels = await this.readPipelineArtifactList<LearnedTaskModel>(projectId, "learnedTaskModels", (index.learnedTaskModels ?? []).map((item) => item.learnedTaskModelId));
    const policyProposals = await this.readPipelineArtifactList<PolicyProposalArtifact>(projectId, "policyProposals", (index.policyProposals ?? []).map((item) => item.proposalId));
    const recordingFlowProposals = await this.readRecordingFlowProposals(projectId, options.revalidateRecordingFlowProposals === true);
    const replayResults = await this.readPipelineArtifactList<ReplayResultArtifact>(projectId, "replayResults", (index.replayResults ?? []).map((item) => item.replayId));
    return { normalizationReviews, miningRuns, evidenceFacts, evidenceObservations, stateActionCorrelations, evidenceClaims, learnedTaskModels, policyProposals, recordingFlowProposals, replayResults };
  }

  async listProjects(domainId?: string | null): Promise<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }> {
    return await this.catalogue.listProjects(domainId);
  }

  /** Infers a legacy project's domain only when its recordings agree on one domain. */
  async createProject(input: { name?: unknown; description?: unknown; categoryId?: unknown; domainId?: unknown }): Promise<AutomationStudioProject> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Project name is required.");
    const now = Date.now();
    const categoryId = typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null;
    const project: AutomationStudioProject = {
      id: randomUUID(),
      name,
      description: typeof input.description === "string" ? input.description.trim() : "",
      domainId: typeof input.domainId === "string" && input.domainId.trim() ? input.domainId.trim() : null,
      categoryId,
      createdAt: now,
      updatedAt: now
    };
    if (this.objectStore && this.projects.indexStore) {
      const record: AutomationStudioProjectRecord = { ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} };
      await ProgramJsonStore.transaction(this.projects.indexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projects.indexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        await transaction.write(this.projects.indexStore!.filePath, { ...state, projects: [project, ...state.projects] });
        const { customHierarchyNodes, deletedHierarchyIds, workspacePrefs, ...manifest } = record;
        await transaction.write(this.projectPaths.projectFile(project.id, "manifest.json"), manifest);
        await transaction.write(this.projectPaths.projectFile(project.id, "hierarchy", "nodes.json"), { customHierarchyNodes });
        await transaction.write(this.projectPaths.projectFile(project.id, "hierarchy", "deleted.json"), { deletedHierarchyIds });
        await transaction.write(this.projectPaths.projectFile(project.id, "workspace", "preferences.json"), { workspacePrefs });
      });
      return project;
    }
    await this.projects.writeProjectIndex((state) => ({ ...state, projects: [project, ...state.projects] }));
    await this.projects.writeProjectRecord({ ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} });
    return project;
  }

  async updateProject(input: { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
    const projectId = String(input.projectId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : undefined;
    if (name !== undefined && !name) throw new Error("Project name is required.");
    if (this.objectStore && this.projects.indexStore) {
      return await ProgramJsonStore.transaction(this.projects.indexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projects.indexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        const current = state.projects.find((project) => project.id === projectId);
        if (!current) throw new Error(`Unknown Automation Studio project: ${projectId}`);
        const updated = {
          ...current,
          ...(name !== undefined ? { name } : {}),
          ...(typeof input.description === "string" ? { description: input.description.trim() } : {}),
          ...(input.categoryId !== undefined ? { categoryId: typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null } : {}),
          updatedAt: Date.now()
        };
        await transaction.write(this.projects.indexStore!.filePath, { ...state, projects: state.projects.map((project) => project.id === projectId ? updated : project) });
        await transaction.write(this.projectPaths.projectFile(projectId, "manifest.json"), updated);
        return updated;
      });
    }
    let updated: AutomationStudioProject | undefined;
    await this.projects.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        updated = {
          ...project,
          ...(name !== undefined ? { name } : {}),
          ...(typeof input.description === "string" ? { description: input.description.trim() } : {}),
          ...(input.categoryId !== undefined ? { categoryId: typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null } : {}),
          updatedAt: Date.now()
        };
        return updated;
      })
    }));
    if (!updated) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    const existing = await this.projects.findProject(projectId);
    await this.projects.writeProjectRecord({ ...existing, ...updated });
    return updated;
  }

  async deleteProject(projectId: string): Promise<{ deletedProjectId: string }> {
    if (this.objectStore && this.projects.indexStore) {
      await ProgramJsonStore.transaction(this.projects.indexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projects.indexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        if (!state.projects.some((project) => project.id === projectId)) throw new Error(`Unknown Automation Studio project: ${projectId}`);
        await transaction.write(this.projects.indexStore!.filePath, { ...state, projects: state.projects.filter((project) => project.id !== projectId) });
        await transaction.deletePath(this.projectPaths.projectDirectory(projectId));
      });
      await this.uiCache.purgeProject(projectId).catch(() => undefined);
      return { deletedProjectId: projectId };
    }
    await this.projects.findProject(projectId);
    await this.projects.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.filter((project) => project.id !== projectId)
    }));
    if (this.projectPaths.root) {
      if (this.objectStore) await ProgramJsonStore.deletePath(this.projectPaths.projectDirectory(projectId));
      else await rm(this.projectPaths.projectDirectory(projectId), { recursive: true, force: true });
    }
    await this.uiCache.purgeProject(projectId).catch(() => undefined);
    return { deletedProjectId: projectId };
  }

  async createProjectCategory(input: { name?: unknown; domainId?: unknown }): Promise<AutomationStudioProjectCategory> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    const now = Date.now();
    const state = await this.projects.readProjectIndex();
    const domainId = typeof input.domainId === "string" && input.domainId.trim() ? input.domainId.trim() : null;
    const category = { id: randomUUID(), name, domainId, order: nextCategoryOrder((state.categories ?? []).filter((item) => (item.domainId ?? null) === domainId)), createdAt: now, updatedAt: now };
    await this.projects.writeProjectIndex((state) => ({ ...state, categories: [category, ...(state.categories ?? [])] }));
    return category;
  }

  async updateProjectCategory(input: { categoryId?: unknown; name?: unknown }): Promise<AutomationStudioProjectCategory> {
    const categoryId = String(input.categoryId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    let updated: AutomationStudioProjectCategory | undefined;
    await this.projects.writeProjectIndex((state) => ({
      ...state,
      categories: (state.categories ?? []).map((category) => {
        if (category.id !== categoryId) return category;
        updated = { ...category, name, updatedAt: Date.now() };
        return updated;
      })
    }));
    if (!updated) throw new Error(`Unknown Automation Studio project category: ${categoryId}`);
    return updated;
  }

  async deleteProjectCategory(categoryId: string): Promise<{ deletedCategoryId: string }> {
    if (this.objectStore && this.projects.indexStore) {
      await ProgramJsonStore.transaction(this.projects.indexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projects.indexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        const projects = state.projects.map((project) => project.categoryId === categoryId ? { ...project, categoryId: null, updatedAt: Date.now() } : project);
        await transaction.write(this.projects.indexStore!.filePath, { categories: state.categories.filter((category) => category.id !== categoryId), projects });
        for (const project of projects) {
          if (project.categoryId !== null || state.projects.find((item) => item.id === project.id)?.categoryId !== categoryId) continue;
          await transaction.write(this.projectPaths.projectFile(project.id, "manifest.json"), project);
        }
      });
      return { deletedCategoryId: categoryId };
    }
    const affectedProjects: AutomationStudioProject[] = [];
    await this.projects.writeProjectIndex((state) => ({
      ...state,
      categories: (state.categories ?? []).filter((category) => category.id !== categoryId),
      projects: state.projects.map((project) => {
        if (project.categoryId !== categoryId) return project;
        const updated = { ...project, categoryId: null, updatedAt: Date.now() };
        affectedProjects.push(updated);
        return updated;
      })
    }));
    for (const project of affectedProjects) {
      const existing = await this.projects.findProject(project.id);
      await this.projects.writeProjectRecord({ ...existing, ...project });
    }
    return { deletedCategoryId: categoryId };
  }

  async reorderProjectCategories(categoryIds: string[]): Promise<{ categories: AutomationStudioProjectCategory[] }> {
    const requestedIds = categoryIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
    let categories: AutomationStudioProjectCategory[] = [];
    await this.projects.writeProjectIndex((state) => {
      const requested = new Set(requestedIds);
      const known = new Set((state.categories ?? []).map((category) => category.id));
      if (requestedIds.some((id) => !known.has(id))) throw new Error("Unknown Automation Studio project category in reorder request.");
      const orderedIds = [...requestedIds, ...(state.categories ?? []).filter((category) => !requested.has(category.id)).map((category) => category.id)];
      const orderById = new Map(orderedIds.map((id, index) => [id, index]));
      categories = (state.categories ?? []).map((category) => ({ ...category, order: orderById.get(category.id) ?? category.order, updatedAt: Date.now() }));
      return { ...state, categories };
    });
    return { categories: this.projects.sortCategories(categories) };
  }

  async getProjectHierarchy(projectId: string): Promise<AutomationStudioProjectHierarchy> {
    const project = await this.projects.findProject(projectId);
    return {
      customHierarchyNodes: project.customHierarchyNodes,
      deletedHierarchyIds: project.deletedHierarchyIds,
      workspacePrefs: project.workspacePrefs ?? {}
    };
  }

  async putProjectHierarchyNode(projectId: string, node: AutomationStudioHierarchyNode): Promise<{ nodeId: string }> {
    const normalizedProjectId = requiredHierarchyId(projectId, "projectId");
    const normalizedNode = normalizeCustomHierarchyNode(node);
    const hierarchy = await this.getProjectHierarchy(normalizedProjectId);
    const existingIndex = hierarchy.customHierarchyNodes.findIndex((entry) => entry.id === normalizedNode.id);
    const customHierarchyNodes = hierarchy.customHierarchyNodes.filter((entry) => entry.id !== normalizedNode.id);
    customHierarchyNodes.splice(existingIndex < 0 ? customHierarchyNodes.length : existingIndex, 0, normalizedNode);
    await this.saveProjectHierarchy(normalizedProjectId, {
      ...hierarchy,
      customHierarchyNodes,
      deletedHierarchyIds: hierarchy.deletedHierarchyIds.filter((id) => id !== normalizedNode.id)
    });
    return { nodeId: normalizedNode.id };
  }

  async deleteProjectHierarchyNode(projectId: string, nodeId: string): Promise<{ nodeId: string; deletedCount: number }> {
    const normalizedProjectId = requiredHierarchyId(projectId, "projectId");
    const normalizedNodeId = requiredHierarchyId(nodeId, "nodeId");
    const hierarchy = await this.getProjectHierarchy(normalizedProjectId);
    const deletedNodeIds = new Set<string>([normalizedNodeId]);
    let discoveredDescendant = true;
    while (discoveredDescendant) {
      discoveredDescendant = false;
      for (const node of hierarchy.customHierarchyNodes) {
        if (node.parentId && deletedNodeIds.has(node.parentId) && !deletedNodeIds.has(node.id)) {
          deletedNodeIds.add(node.id);
          discoveredDescendant = true;
        }
      }
    }
    const removedIds = hierarchy.customHierarchyNodes
      .filter((node) => deletedNodeIds.has(node.id))
      .map((node) => node.id);
    if (removedIds.length > 0) {
      await this.saveProjectHierarchy(normalizedProjectId, {
        ...hierarchy,
        customHierarchyNodes: hierarchy.customHierarchyNodes.filter((node) => !deletedNodeIds.has(node.id)),
        deletedHierarchyIds: [...new Set([...hierarchy.deletedHierarchyIds, ...removedIds])]
      });
    }
    return { nodeId: normalizedNodeId, deletedCount: removedIds.length };
  }

  async listProjectHierarchyChildren(input: { projectId: string; parentId?: unknown; cursor?: unknown; limit?: unknown }): Promise<AutomationStudioHierarchyChildrenPage> {
    return await this.flows.listProjectHierarchyChildren(input);
  }

  async listFlowSubflowTargets(input: { projectId: string; flowId: string; status?: string; role?: string; search?: string; limit?: unknown; cursor?: unknown }): Promise<AutomationStudioSubflowTargetPage> {
    await this.projects.findProject(input.projectId);
    const typed = await this.flows.tryWithFlowResourceRepository(input.projectId, async (repository) => repository.listSubflowTargetsPage(input));
    if (typed) return { subflows: typed.items.map((item) => subflowSummaryFromSql(item, input.projectId)), total: typed.total, limit: typed.limit, nextCursor: typed.nextCursor, hasMore: typed.hasMore };
    const status = input.status?.trim() || "active";
    const role = input.role?.trim() || "";
    const search = input.search?.trim().toLowerCase() || "";
    const limit = automationStudioPageLimit(input.limit);
    const owner = `subflow-targets:${input.flowId}`;
    const filterHash = automationStudioFilterHash({ status, role, search });
    const cursor = decodeAutomationStudioPageCursor<{ name: string; subflowId: string }>(input.cursor, { owner, filterHash, validate: (values) => typeof values.name === "string" && typeof values.subflowId === "string" });
    const index = await this.indexes.readFlowSubflowIndex(input.projectId);
    const all = (index.subflows ?? []).filter((item) => item.flowId === input.flowId && item.status === status && (!role || item.role === role)
      && (!search || item.name.toLowerCase().includes(search) || item.subflowId.toLowerCase().includes(search)))
      .sort((left, right) => left.name.localeCompare(right.name) || left.subflowId.localeCompare(right.subflowId));
    const after = cursor ? all.filter((item) => item.name.toLowerCase() > cursor.name || item.name.toLowerCase() === cursor.name && item.subflowId > cursor.subflowId) : all;
    const subflows = after.slice(0, limit);
    const last = subflows.at(-1);
    return { subflows, total: all.length, limit, hasMore: after.length > limit, nextCursor: after.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { name: last.name.toLowerCase(), subflowId: last.subflowId } }) : null };
  }
  async listProjectChangeFeed(input: { projectId: string; afterSequence?: unknown; limit?: unknown }): Promise<AutomationStudioProjectChangeFeedPage> {
    return await this.flows.listProjectChangeFeed(input);
  }

  async getProjectUiCache(input: { projectId: string; userId: string; cacheKeys: unknown }): Promise<{ entries: Array<Omit<AutomationStudioUiCacheEntry, "projectId" | "userId">>; missingKeys: string[] }> {
    return await this.uiCache.getProjectUiCache(input);
  }

  async saveProjectUiCache(input: { projectId: string; userId: string; entries: unknown }): Promise<{ entries: Array<Omit<AutomationStudioUiCacheEntry, "projectId" | "userId">> }> {
    return await this.uiCache.saveProjectUiCache(input);
  }

  async deleteProjectUiCache(input: { projectId: string; userId: string; cacheKeys?: unknown }): Promise<{ deleted: number }> {
    return await this.uiCache.deleteProjectUiCache(input);
  }

  async listProjectUiCacheStats(input: { projectId?: unknown; userId: string }): Promise<{ stats: Array<Omit<AutomationStudioUiCacheStats, "userId"> & { entryCount: number; totalBytes: number; updatedAt: number | null }> }> {
    return await this.uiCache.listProjectUiCacheStats(input);
  }
  async saveProjectHierarchy(projectId: string, hierarchy: AutomationStudioProjectHierarchy): Promise<AutomationStudioProjectHierarchy> {
    const nextHierarchy: AutomationStudioProjectHierarchy = {
      customHierarchyNodes: Array.isArray(hierarchy.customHierarchyNodes) ? hierarchy.customHierarchyNodes : [],
      deletedHierarchyIds: Array.isArray(hierarchy.deletedHierarchyIds) ? hierarchy.deletedHierarchyIds : [],
      workspacePrefs: hierarchy.workspacePrefs && typeof hierarchy.workspacePrefs === "object" && !Array.isArray(hierarchy.workspacePrefs) ? hierarchy.workspacePrefs : {}
    };
    const changedAt = Date.now();
    if (this.objectStore && this.projects.indexStore) {
      await ProgramJsonStore.transaction(this.projects.indexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projects.indexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        const current = state.projects.find((project) => project.id === projectId);
        if (!current) throw new Error(`Unknown Automation Studio project: ${projectId}`);
        const updated = { ...current, updatedAt: changedAt };
        await transaction.write(this.projects.indexStore!.filePath, { ...state, projects: state.projects.map((project) => project.id === projectId ? updated : project) });
        await transaction.write(this.projectPaths.projectFile(projectId, "manifest.json"), updated);
        await transaction.write(this.projectPaths.projectFile(projectId, "hierarchy", "nodes.json"), { customHierarchyNodes: nextHierarchy.customHierarchyNodes });
        await transaction.write(this.projectPaths.projectFile(projectId, "hierarchy", "deleted.json"), { deletedHierarchyIds: nextHierarchy.deletedHierarchyIds });
        await transaction.write(this.projectPaths.projectFile(projectId, "workspace", "preferences.json"), { workspacePrefs: nextHierarchy.workspacePrefs });
      });
      await this.flowWriter.appendProjectMutationChangeFeed({
        projectId,
        entityKind: "hierarchy",
        entityId: projectId,
        operation: "update",
        revision: hierarchyFeedRevision(nextHierarchy, changedAt),
        changedAt,
        hierarchyScope: { kind: "project", id: projectId }
      });
      return nextHierarchy;
    }
    let updatedProject: AutomationStudioProject | undefined;
    await this.projects.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        updatedProject = { ...project, updatedAt: changedAt };
        return updatedProject;
      })
    }));
    if (!updatedProject) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    await this.projects.writeProjectRecord({ ...updatedProject, ...nextHierarchy });
    await this.flowWriter.appendProjectMutationChangeFeed({
      projectId,
      entityKind: "hierarchy",
      entityId: projectId,
      operation: "update",
      revision: hierarchyFeedRevision(nextHierarchy, changedAt),
      changedAt,
      hierarchyScope: { kind: "project", id: projectId }
    });
    return nextHierarchy;
  }

  async legacyEndpointDiagnostic(projectId: string): Promise<AutomationStudioLegacyRetirementDiagnostic> {
    return legacyDiagnostic(await this.legacy.readLegacyRetirementState(projectId));
  }

  private async repairFlowSummaryMetadataIndex(
    projectId: string,
    staleIndex: AutomationStudioFlowSummaryIndex
  ): Promise<AutomationStudioFlowSummaryIndex> {
    const repairedByFlowId = new Map<string, AutomationStudioFlowSummary>();
    await Promise.all((staleIndex.flows ?? []).map(async (summary) => {
      await this.flows.loadProjectFlow(projectId, summary.flowId);
      const flow = await this.repositories.flows.get(summary.flowId);
      if (flow?.projectId === projectId) repairedByFlowId.set(summary.flowId, flowSummaryFromFlow(flow));
    }));
    const repairedSubflowPlacement = new Map<string, { graphFlowId?: string; parentCategoryId?: string }>();
    for (const flowSummary of repairedByFlowId.values()) {
      for (const subflow of flowSummary.hierarchySubflows ?? []) {
        repairedSubflowPlacement.set(subflow.subflowId, {
          ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}),
          ...(subflow.parentCategoryId ? { parentCategoryId: subflow.parentCategoryId } : {})
        });
      }
    }
    if (repairedSubflowPlacement.size) {
      await this.indexes.writeFlowSubflowIndex(projectId, (index) => ({
        schemaVersion: "0.1",
        summaryVersion: 2,
        subflows: (index.subflows ?? []).map((subflow) => {
          const placement = repairedSubflowPlacement.get(subflow.subflowId);
          return placement ? { ...subflow, ...placement } : subflow;
        })
      }));
    }
    return await this.indexes.writeFlowIndex(projectId, (current) => {
      if (current.ownershipMetadataVersion === 1 && current.hierarchyMetadataVersion === 1) return current;
      return {
        schemaVersion: "0.1",
        ownershipMetadataVersion: 1,
        hierarchyMetadataVersion: 1,
        flows: (current.flows ?? []).map((summary) => repairedByFlowId.get(summary.flowId) ?? summary)
      };
    });
  }

  private async withCanonicalFlowHierarchySubflows(projectId: string, flows: AutomationStudioFlowSummary[]): Promise<AutomationStudioFlowSummary[]> {
    const index = await this.indexes.readFlowSubflowIndex(projectId).catch(() => emptyFlowSubflowIndex());
    const byFlowId = new Map<string, AutomationStudioSubflowSummary[]>();
    for (const subflow of index.subflows ?? []) {
      if (!subflow.flowId) continue;
      const items = byFlowId.get(subflow.flowId) ?? [];
      items.push(subflow);
      byFlowId.set(subflow.flowId, items);
    }
    if (!byFlowId.size) return flows;
    return flows.map((flow) => {
      const subflows = byFlowId.get(flow.flowId);
      if (!subflows) return flow;
      return {
        ...flow,
        hierarchySubflows: subflows
          .sort((left, right) => left.name.localeCompare(right.name) || left.subflowId.localeCompare(right.subflowId))
          .map((subflow) => ({
            subflowId: subflow.subflowId,
            name: subflow.name,
            ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}),
            ...(subflow.parentCategoryId ? { parentCategoryId: subflow.parentCategoryId } : {})
          }))
      };
    });
  }

  private async reviewTypedFlowAdaptation(input: ReviewFlowAdaptationInput): Promise<AutomationStudioFlowAdaptation | null> {
    if (!this.runtimeProjectDatabasePool || !this.projectPaths.root) return null;
    await this.projects.findProject(input.projectId);
    const store = await AutomationStudioProjectAdaptationStore.open({ pool: this.runtimeProjectDatabasePool, projectId: input.projectId });
    try {
      const detail = await store.getAdaptation(input.adaptationId);
      if (!detail || detail.flowId !== input.flowId) return null;
      if ((input.action === "apply" || input.action === "revert") && !await store.supportsGraphTransaction(detail.adaptation)) return null;
      const actorId = input.actorId ?? "reviewer";
      if (input.action === "apply") {
        const applied = await store.applyApprovedAdaptation({ adaptationId: input.adaptationId, actorId });
        await this.synchronizeCanonicalFlowGraphProjection(input.projectId, applied.adaptation.adaptation, applied.adaptation.updatedAt).catch(() => undefined);
        return adaptationFromTypedStoreDetail(applied.adaptation);
      }
      if (input.action === "revert") {
        const reverted = await store.rollbackAdaptation({ adaptationId: input.adaptationId, actorId, ...(input.reason ? { reason: input.reason } : {}) });
        await this.synchronizeCanonicalFlowGraphProjection(input.projectId, reverted.adaptation.adaptation, reverted.adaptation.updatedAt).catch(() => undefined);
        return adaptationFromTypedStoreDetail(reverted.adaptation);
      }
      if (input.action === "supersede") {
        if (!input.supersededByAdaptationId) throw new Error("Supersede requires a replacement adaptation ID.");
        return adaptationFromTypedStoreDetail(await store.supersedeAdaptation({ adaptationId: input.adaptationId, supersededByAdaptationId: input.supersededByAdaptationId, actorId, ...(input.reason ? { reason: input.reason } : {}) }));
      }
      if (input.action === "request_validation") return adaptationFromTypedStoreDetail(await store.setAdaptationStatus({ adaptationId: input.adaptationId, status: "testing", actorId, ...(input.reason ? { reason: input.reason } : {}) }));
      if (input.action === "approve") return adaptationFromTypedStoreDetail(await store.setAdaptationStatus({ adaptationId: input.adaptationId, status: "validated", actorId, ...(input.reason ? { reason: input.reason } : {}) }));
      if (input.action === "reject") return adaptationFromTypedStoreDetail(await store.setAdaptationStatus({ adaptationId: input.adaptationId, status: "rejected", actorId, ...(input.reason ? { reason: input.reason } : {}) }));
      if (input.action === "disable") return adaptationFromTypedStoreDetail(await store.setAdaptationStatus({ adaptationId: input.adaptationId, status: "disabled", approvalMode: "disabled", actorId, ...(input.reason ? { reason: input.reason } : {}) }));
      if (input.action === "switch_manual") return adaptationFromTypedStoreDetail(await store.setAdaptationStatus({ adaptationId: input.adaptationId, status: "proposed", approvalMode: "manual_approval", actorId, ...(input.reason ? { reason: input.reason } : {}) }));
      return null;
    } finally {
      await store.close();
    }
  }

  private async tryPersistRecordingSession(projectId: string, recording: RecordingSession): Promise<boolean> {
    const written = await this.summaries.tryWithRuntimeStreamStore(projectId, async (store) => {
      await store.putRecording(recording);
      return true;
    });
    return written === true;
  }

  private async tryAppendRecordingEntries(projectId: string, recording: RecordingSession, entries: RecordingSession["timeline"]): Promise<boolean> {
    if (!entries.length) {
      await this.summaries.tryWithRuntimeStreamStore(projectId, async (store) => await store.upsertRecordingSummary(recording));
      return true;
    }
    const written = await this.summaries.tryWithRuntimeStreamStore(projectId, async (store) => {
      await store.upsertRecordingSummary(recording);
      await store.appendRecordingEvents({ recordingId: recording.recordingId, events: entries as any[] });
      await store.upsertRecordingSummary(recording);
      return true;
    });
    return written === true;
  }

  async listFlowRunEvents(input: { projectId: string; runId: string; afterSequence?: unknown; cursor?: unknown; limit?: unknown }): Promise<AutomationStudioRuntimeEventPage> {
    await this.projects.findProject(input.projectId);
    const owner = `run-events:${input.runId}`;
    const filterHash = automationStudioFilterHash({});
    const cursor = decodeAutomationStudioPageCursor<{ sequence: number }>(input.cursor, { owner, filterHash, validate: (values) => Number.isSafeInteger(values.sequence) && Number(values.sequence) >= 0 });
    const afterSequence = cursor?.sequence ?? clampInteger(input.afterSequence, 0, 10_000_000_000, 0);
    const limit = automationStudioPageLimit(input.limit, 100);
    const typed = await this.summaries.tryWithRuntimeStreamStore(input.projectId, async (store) => await store.listRuntimeEvents({ runId: input.runId, afterSequence, limit, includePayload: false }));
    if (typed) return {
      ...typed,
      nextCursor: typed.hasMore ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { sequence: typed.lastSequence } }) : null
    };
    const detail = await this.getFlowRunDetail(input.projectId, input.runId);
    const actions = detail?.actionAttempts ?? [];
    const events = actions.map((action, index) => ({ sequence: index + 1, eventId: `action_attempt:${action.attemptId}`, eventKind: "action_attempt" as const, timestampMs: action.startedAt, title: action.nodeId, status: action.status, entityId: action.attemptId })).filter((event) => event.sequence > afterSequence).slice(0, limit);
    const hasMore = actions.length > afterSequence + events.length;
    const lastSequence = events.at(-1)?.sequence ?? afterSequence;
    return { events, nextCursor: hasMore ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { sequence: lastSequence } }) : null, hasMore, lastSequence };
  }

  async getFlowRunEventDetail(input: { projectId: string; runId: string; sequence: unknown }): Promise<import("../storage/index.ts").AutomationStudioRuntimeStreamEvent | null> {
    await this.projects.findProject(input.projectId);
    const typed = await this.summaries.tryWithRuntimeStreamStore(input.projectId, (store) => store.getRuntimeEventDetail({ runId: input.runId, sequence: input.sequence }));
    if (typed) return typed;
    const page = await this.listFlowRunEvents({ projectId: input.projectId, runId: input.runId, afterSequence: Math.max(0, Number(input.sequence) - 1), limit: 1 });
    return page.events[0] ?? null;
  }

  private async writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<void> {
    await this.projects.ensureProjectStructure(projectId);
    await new ProgramJsonStore<JsonObject>(this.projectPaths.projectFile(projectId, "runtime", "sessions", `${safeSegment(session.runId)}.json`), () => ({})).write({ session: session as unknown as JsonObject });
    await new ProgramJsonStore<RuntimeIndex>(this.projectPaths.projectFile(projectId, "runtime", "indexes", "sessions.json"), () => ({ sessions: [] })).update((index) => ({
      sessions: upsertBy(index.sessions ?? [], "runId", {
        runId: session.runId,
        targetKind: session.targetKind,
        targetId: session.targetId,
        status: session.status,
        updatedAt: Date.now()
      })
    }));
    await this.summaries.writeRuntimeSummary(projectId, session);
    await this.saveFlowRunDetail(runtimeSessionToFlowRunDetail(session, projectId));
  }

  private async withReusableLlmContextStore<T>(projectId: string, operation: (store: AutomationStudioProjectReusableLlmContextStore) => Promise<T>): Promise<T> {
    if (!this.reusableLlmContextEnabled) throw new Error("Reusable LLM context is disabled.");
    if (!this.runtimeProjectDatabasePool || !this.projectPaths.root) throw new Error("Reusable LLM context requires project storage.");
    await this.projects.findProject(projectId);
    const store = await AutomationStudioProjectReusableLlmContextStore.open({ pool: this.runtimeProjectDatabasePool, projectId, enabled: true, ...(this.reusableLlmContextContentProtection ? { contentProtection: this.reusableLlmContextContentProtection } : {}) });
    try { return await operation(store); }
    finally { await store.close(); }
  }

  /**
   * Graph-table revisions are the canonical execution source once a Flow has
   * entered revisioned graph storage. File/cache artifacts remain the owner of
   * non-graph metadata, but may lag a transactional graph adaptation.
   */
  private async synchronizeCanonicalFlowGraphProjection(
    projectId: string,
    adaptation: AutomationStudioFlowAdaptation,
    changedAt: number
  ): Promise<void> {
    const graphFlowId = typeof adaptation.metadata?.graphRevisionTargetFlowId === "string"
      ? adaptation.metadata.graphRevisionTargetFlowId.trim()
      : adaptation.flowId;
    if (!graphFlowId) throw new Error("Applied adaptation is missing its canonical graph target.");
    const stored = await this.getFlow(projectId, graphFlowId);
    const materialized = await this.flows.materializeCanonicalGraphFlow(projectId, stored);
    const synchronized: AutomationStudioFlowArtifact = {
      ...materialized,
      updatedAt: Math.max(stored.updatedAt, changedAt)
    };
    const validation = validateAutomationStudioFlow(synchronized);
    if (!validation.ok) throw new Error(`Canonical adaptation graph projection is invalid: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    await this.repositories.flows.put(synchronized);
    await this.flows.writeProjectFlow(projectId, synchronized);
    await this.flowWriter.writeFlowSourceFile(projectId, synchronized);
    await this.flowWriter.writeGeneratedFlowConfig(projectId, synchronized);
  }
  private async writeRecordingPipelineArtifact(projectId: string, recordingId: string, kind: PipelineArtifactKind, id: string, artifact: JsonObject): Promise<void> {
    const recording = await this.repositories.recordingSessions.get(recordingId) ?? await this.getRecordingSession(recordingId, projectId).catch(() => null);
    if (!recording) return;
    await this.recordings.ensureProjectRecordingPipeline(projectId, recording);
    await this.objectDocuments.writeArtifactDocument(projectId, this.recordingPaths.recordingPipelineArtifactFile(projectId, recordingId, kind, id), artifact);
    await this.recordings.updateRecordingPipeline(projectId, recordingId, (pipeline) => addRecordingPipelineArtifactId(pipeline, kind, id));
  }

  private async writeRecordingPipelineNormalizedTimeline(projectId: string, normalized: NormalizedTimeline): Promise<void> {
    const recording = await this.repositories.recordingSessions.get(normalized.recordingId) ?? await this.getRecordingSession(normalized.recordingId, projectId).catch(() => null);
    if (!recording) return;
    await this.recordings.ensureProjectRecordingPipeline(projectId, recording);
    await new ProgramJsonStore<JsonObject>(
      this.recordingPaths.recordingDerivedFile(projectId, normalized.recordingId, "normalization", "timelines", `${safeSegment(normalized.normalizedTimelineId)}.json`),
      () => ({})
    ).write({ normalizedTimeline: normalized as unknown as JsonObject });
    await this.recordings.updateRecordingPipeline(projectId, normalized.recordingId, (pipeline) => ({
      ...pipeline,
      updatedAt: Date.now(),
      artifacts: {
        ...pipeline.artifacts,
        normalizedTimelineIds: uniqueStrings([normalized.normalizedTimelineId, ...(pipeline.artifacts.normalizedTimelineIds ?? [])])
      }
    }));
  }

  private async deleteProjectRecordingPipeline(projectId: string, recordingId: string): Promise<void> {
    const pipeline = await new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPaths.recordingPipelineFile(projectId, recordingId),
      () => createRecordingPipelineDocument({ recordingId, startedAt: Date.now() })
    ).read();
    const artifactIds = await this.recordings.collectRecordingPipelineArtifactIds(projectId, recordingId, pipeline);
    for (const kind of pipelineArtifactKinds()) {
      for (const id of artifactIds[kind]) await this.objectDocuments.deletePipelineArtifactDocuments(projectId, recordingId, kind, id);
    }
    await this.recordings.deletePhysicalSharedPipelineArtifactsForRecording(projectId, recordingId);
    const recordingProposalRoot = this.projectPaths.projectFile(projectId, "proposals", safeSegment(recordingId));
    if (this.objectStore) await ProgramJsonStore.deletePath(recordingProposalRoot);
    await rm(recordingProposalRoot, { recursive: true, force: true });
    if (this.objectStore) await ProgramJsonStore.deletePath(this.recordingPaths.recordingDerivedDirectory(projectId, recordingId));
    else await rm(this.recordingPaths.recordingDerivedDirectory(projectId, recordingId), { recursive: true, force: true });
    await new ProgramJsonStore<PipelineIndex>(this.projectPaths.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => ({
      pipelines: (index.pipelines ?? []).filter((item) => item.recordingId !== recordingId),
      normalizationReviews: (index.normalizationReviews ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.normalizationReviews.has(item.reviewId)),
      miningRuns: (index.miningRuns ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.miningRuns.has(item.miningRunId)),
      evidenceFacts: (index.evidenceFacts ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.evidenceFacts.has(item.factId)),
      evidenceObservations: (index.evidenceObservations ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.evidenceObservations.has(item.observationId)),
      stateActionCorrelations: (index.stateActionCorrelations ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.stateActionCorrelations.has(item.correlationId)),
      evidenceClaims: (index.evidenceClaims ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.evidenceClaims.has(item.claimId)),
      learnedTaskModels: (index.learnedTaskModels ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.learnedTaskModels.has(item.learnedTaskModelId)),
      policyProposals: (index.policyProposals ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.policyProposals.has(item.proposalId)),
      recordingFlowProposals: (index.recordingFlowProposals ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.recordingFlowProposals.has(item.proposalId)),
      replayResults: (index.replayResults ?? []).filter((item) => item.recordingId !== recordingId && !artifactIds.replayResults.has(item.replayId))
    }));
    await this.recordings.prunePhysicalPipelineIndex(projectId, recordingId, artifactIds);
  }

  private async deleteProjectRecordingPolicyProposals(projectId: string, recordingId: string, keepProposalId?: string): Promise<void> {
    const ids = new Set<string>();
    const index = await this.indexes.readPipelineIndex(projectId);
    for (const item of index.policyProposals ?? []) {
      const proposal = await this.recordings.readPipelineArtifact<PolicyProposalArtifact>(projectId, "policyProposals", item.proposalId);
      if (proposal?.metadata?.recordingId === recordingId && proposal.proposalId !== keepProposalId) ids.add(proposal.proposalId);
    }
    if (!ids.size) return;
    for (const proposalId of ids) {
      const proposalDirectory = path.dirname(this.recordingPaths.recordingPipelineArtifactFile(projectId, recordingId, "policyProposals", proposalId));
      if (this.objectStore) await ProgramJsonStore.deletePath(proposalDirectory);
      await rm(proposalDirectory, { recursive: true, force: true });
    }
    await new ProgramJsonStore<PipelineIndex>(this.projectPaths.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((current) => ({
      ...emptyPipelineIndex(),
      ...current,
      policyProposals: (current.policyProposals ?? []).filter((item) => !ids.has(item.proposalId))
    }));
    await this.recordings.removeRecordingPipelineArtifactIds(projectId, recordingId, "policyProposalIds", ids);
  }

  private async pruneUnreferencedProjectObjects(projectId: string): Promise<void> {
    if (!this.objectStore) return;
    const candidates = new Set(await this.objectStore.listProjectObjectSha256s(projectId));
    if (!candidates.size) return;
    const live = await this.collectLiveProjectObjectReferences(projectId);
    const orphaned = [...candidates].filter((sha256) => !live.has(sha256));
    if (orphaned.length) await this.objectStore.deleteProjectObjects(projectId, orphaned);
  }

  private async collectLiveProjectObjectReferences(projectId: string): Promise<Set<string>> {
    const refs = new Set<string>();
    if (this.recordingStateIndexes) {
      const recordingIndex = await this.indexes.readRecordingIndex(projectId).catch(() => ({ recordings: [], normalizedTimelines: [] }));
      for (const item of recordingIndex.recordings ?? []) {
        const stateIndex = await this.readRecordingStateIndex(projectId, item.recordingId).catch(() => null);
        if (!stateIndex) continue;
        for (const ref of recordingIndexStateObjectRefs(stateIndex)) {
          const parsed = parseAutomationStudioObjectContentRef(ref);
          if (parsed?.projectId === projectId) refs.add(parsed.sha256);
        }
      }
    }
    for (const recording of await this.repositories.recordingSessions.list()) {
      if (recording.metadata?.projectId === projectId) addAutomationStudioObjectSha256s(refs, recording, projectId);
    }
    for (const timeline of await this.repositories.normalizedTimelines.list()) {
      if (timeline.metadata?.projectId === projectId) addAutomationStudioObjectSha256s(refs, timeline, projectId);
    }
    for (const registry of await this.repositories.signalRegistries.list()) addAutomationStudioObjectSha256s(refs, registry, projectId);
    for (const model of await this.repositories.learnedTaskModels.list()) addAutomationStudioObjectSha256s(refs, model, projectId);
    for (const policy of await this.repositories.policyGraphs.list()) addAutomationStudioObjectSha256s(refs, policy, projectId);
    const artifacts = await this.listPipelineArtifacts(projectId);
    addAutomationStudioObjectSha256s(refs, artifacts, projectId);
    return refs;
  }

  private async readPipelineArtifactList<TArtifact>(projectId: string, kind: PipelineArtifactKind, ids: string[]): Promise<TArtifact[]> {
    const artifacts = await mapWithConcurrency(ids, PIPELINE_ARTIFACT_IO_CONCURRENCY, async (id) => this.recordings.readPipelineArtifact<TArtifact>(projectId, kind, id));
    return artifacts.filter((artifact): artifact is TArtifact => Boolean(artifact));
  }

  private async renameSubflowGraphFlow(projectId: string, subflow: AutomationStudioFlowSubflow, name: string): Promise<void> {
    if (!subflow.graphFlowId || !name) return;
    const graph = await this.getFlow(projectId, subflow.graphFlowId);
    await this.saveFlow({
      projectId,
      flow: {
        ...graph,
        name: `${name} Graph`,
        metadata: { ...(graph.metadata ?? {}), parentFlowId: subflow.flowId, parentSubflowId: subflow.subflowId, subflowGraph: true }
      }
    });
  }

  /** Reads legacy project documents without the historical task-graph embedding side effect. */
  private async embedTaskGraphs(projectId: string, tasks: AutomationStudioTaskArtifact[], flows: AutomationStudioFlowDocument[]): Promise<AutomationStudioTaskArtifact[]> {
    const flowsById = new Map(flows.map((flow) => [flow.flowId, flow]));
    const nextTasks: AutomationStudioTaskArtifact[] = [];
    for (const task of tasks) {
      if (task.graph?.nodes && task.graph?.edges) {
        nextTasks.push(task);
        continue;
      }
      const graph = (typeof task.graphId === "string" ? flowsById.get(task.graphId) : undefined)
        ?? (typeof task.policyFlowId === "string" ? flowsById.get(task.policyFlowId) : undefined)
        ?? flows.find((flow) => flow.ownerKind === "task" && flow.ownerId === task.taskId);
      if (!graph) {
        nextTasks.push(task);
        continue;
      }
      const nextTask: AutomationStudioTaskArtifact = {
        ...task,
        graphId: graph.flowId,
        policyFlowId: graph.flowId,
        graph,
        metadata: {
          ...(task.metadata ?? {}),
          graphEmbeddedAt: Date.now()
        }
      };
      nextTasks.push(nextTask);
    }
    return nextTasks;
  }

  private async writeProjectRecordingSession(projectId: string, recording: RecordingSession): Promise<void> {
    await this.projects.ensureProjectStructure(projectId);
    const sessionDir = this.recordingPaths.recordingSessionDirectory(projectId, recording.recordingId);
    const recordingDocument = { ...recording, timeline: [] };
    const typedRecording = await this.tryPersistRecordingSession(projectId, recording);
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "recording.json"), () => ({ recording: recordingDocument as unknown as JsonObject })).write({ recording: recordingDocument as unknown as JsonObject });
    if (!typedRecording) await this.writeRecordingTimeline(projectId, recording.recordingId, recording.timeline);
    await this.writeRecordingStateIndex(projectId, recording);
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "snapshots", "initial-state.json"), () => ({ initialState: recording.initialState as unknown as JsonObject })).write({ initialState: recording.initialState as unknown as JsonObject });
    await this.recordings.ensureProjectRecordingPipeline(projectId, recording);
    await this.indexes.writeRecordingIndex(projectId, (index) => ({
      recordings: upsertBy(index.recordings ?? [], "recordingId", {
        recordingId: recording.recordingId,
        ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
        startedAt: recording.startedAt,
        ...(recording.endedAt !== undefined ? { endedAt: recording.endedAt } : {}),
        updatedAt: Date.now(),
        eventCount: recording.timeline.length,
        noteCount: recording.notes.length
      }),
      normalizedTimelines: index.normalizedTimelines ?? []
    }));
  }

  private async writeProjectRecordingIndexSummary(projectId: string, recording: RecordingSession): Promise<void> {
    await this.projects.ensureProjectStructure(projectId);
    await this.recordings.ensureProjectRecordingPipeline(projectId, recording);
    await this.indexes.writeRecordingIndex(projectId, (index) => ({
      recordings: upsertBy(index.recordings ?? [], "recordingId", {
        recordingId: recording.recordingId,
        ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
        startedAt: recording.startedAt,
        ...(recording.endedAt !== undefined ? { endedAt: recording.endedAt } : {}),
        updatedAt: Date.now(),
        eventCount: recording.timeline.length,
        noteCount: recording.notes.length
      }),
      normalizedTimelines: index.normalizedTimelines ?? []
    }));
  }

  private async writeProjectNormalizedTimeline(projectId: string, normalized: NormalizedTimeline): Promise<void> {
    await this.projects.ensureProjectStructure(projectId);
    await this.writeRecordingPipelineNormalizedTimeline(projectId, normalized);
    await this.indexes.writeRecordingIndex(projectId, (index) => ({
      recordings: index.recordings ?? [],
      normalizedTimelines: upsertBy(index.normalizedTimelines ?? [], "normalizedTimelineId", {
        normalizedTimelineId: normalized.normalizedTimelineId,
        recordingId: normalized.recordingId,
        generatedAt: normalized.generatedAt
      })
    }));
  }

  private async loadProjectRecordings(projectId: string): Promise<void> {
    if (!this.projectPaths.root) return;
    const index = await this.indexes.readRecordingIndex(projectId);
    for (const item of index.recordings ?? []) {
      await this.recordings.loadProjectRecording(projectId, item.recordingId);
    }
    for (const item of index.normalizedTimelines ?? []) {
      const stored = await new ProgramJsonStore<JsonObject>(
        this.recordingPaths.recordingDerivedFile(projectId, item.recordingId, "normalization", "timelines", `${safeSegment(item.normalizedTimelineId)}.json`),
        () => ({})
      ).read();
      const normalized = stored.normalizedTimeline as unknown as NormalizedTimeline | undefined;
      if (normalized?.normalizedTimelineId) await this.repositories.normalizedTimelines.put(normalized);
    }
  }

  private async writeRecordingStateIndex(projectId: string, recording: RecordingSession): Promise<void> {
    if (!this.recordingStateIndexes) return;
    await this.recordingStateIndexes.write(buildRecordingStateIndex(projectId, recording));
  }

  private async ensureRecordingStateIndexCurrent(projectId: string, recordingId: string): Promise<void> {
    if (!this.recordingStateIndexes) return;
    const key = `${projectId}:${recordingId}`;
    if (this.repairedRecordingStateIndexReads.has(key)) return;
    this.repairedRecordingStateIndexReads.add(key);
    await this.recordings.loadProjectRecording(projectId, recordingId);
    const rawRecording = await this.recordings.getRawRecordingSession(recordingId, projectId).catch(() => null);
    if (!rawRecording) return;
    const recording = await this.objectDocuments.hydrateRecordingStateSnapshotRefs(rawRecording, projectId);
    await this.recordingStateIndexes.write(buildRecordingStateIndex(projectId, recording));
  }

  private async readRecordingStateIndex(projectId: string, recordingId: string): Promise<RecordingStateIndex | null> {
    if (!this.recordingStateIndexes) return null;
    if (!await this.recordingStateIndexes.exists(projectId, recordingId)) return null;
    return await this.recordingStateIndexes.read(projectId, recordingId);
  }

  private async writeRecordingTimeline(projectId: string, recordingId: string, timeline: RecordingSession["timeline"]): Promise<void> {
    const filePath = this.recordingPaths.recordingTimelineFile(projectId, recordingId);
    await mkdir(path.dirname(filePath), { recursive: true });
    const text = timeline.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(filePath, text ? `${text}\n` : "", "utf8");
  }

  private async seedFixture(): Promise<void> {
    const fixture = createAutomationStudioFixture();
    await this.repositories.recordingSessions.put(fixture.recording);
    await this.repositories.normalizedTimelines.put(fixture.normalizedTimeline);
    await this.repositories.signalRegistries.put(fixture.signalRegistry);
    await this.repositories.learnedTaskModels.put(fixture.learnedTaskModel);
    await this.repositories.policyGraphs.put(fixture.policy);
  }
}

function nextCategoryOrder(categories: AutomationStudioProjectCategory[]): number {
  if (!categories.length) return 0;
  return Math.max(...normalizeProjectCategories(categories).map((category) => category.order)) + 1;
}

function sqlResourceStatus(status: string): "draft" | "active" | "archived" | "deleted" {
  if (status === "archived") return "archived";
  if (status === "deleted") return "deleted";
  if (status === "draft") return "draft";
  return "active";
}

function sqlRouterGroupToFlowGroup(group: AutomationStudioSqlRouter["groups"][number], _index = 0): AutomationStudioFlowRouteGroup {
  return {
    schemaVersion: "0.1",
    groupId: group.groupId,
    routerId: group.routerId,
    name: group.name,
    ...(group.description ? { description: group.description } : {}),
    order: group.order,
    status: group.status,
    collapsed: group.collapsed,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    metadata: { ...group.metadata, revision: group.revision }
  };
}

function sqlRouterRouteToFlowRule(route: AutomationStudioSqlRouterRoute): AutomationStudioFlowRouteRule {
  return {
    schemaVersion: "0.1",
    ruleId: route.routeId,
    routerId: route.routerId,
    name: route.name,
    target: { kind: "subflow", subflowId: route.targetSubflowId ?? "" },
    order: route.priority,
    status: route.enabled ? "active" : "disabled",
    ...(route.conditionKind !== "always" && route.condition && typeof route.condition === "object" ? { condition: route.condition } : {}),
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
    metadata: { ...(route.groupId ? { groupId: route.groupId } : {}), revision: route.revision }
  } as unknown as AutomationStudioFlowRouteRule;
}

function withFlowMapRouteGroups(router: AutomationStudioFlowRouter, groups: AutomationStudioFlowRouteGroup[]): AutomationStudioFlowRouter {
  return {
    ...router,
    metadata: compactJsonObject({
      ...(router.metadata ?? {}),
      routeGroups: groups.slice().sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    })
  };
}

function nextRouteGroupOrder(groups: AutomationStudioFlowRouteGroup[]): number {
  return groups.reduce((max, group) => Math.max(max, group.order), -10) + 10;
}

function nextRouteOrder(rules: AutomationStudioFlowRouteRule[]): number {
  return rules.reduce((max, rule) => Math.max(max, rule.order), -10) + 10;
}

function routeRuleMetadataWithGroup(metadata: JsonObject | undefined, groupId: string | null | undefined): JsonObject | undefined {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  if (typeof groupId === "string" && groupId.trim()) next.groupId = groupId.trim();
  if (groupId === null || groupId === "") delete next.groupId;
  return Object.keys(next).length ? next as JsonObject : undefined;
}

function routeRuleMetadataWithoutGroup(metadata: JsonObject | undefined, groupId: string): JsonObject | undefined {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  if (next.groupId === groupId) delete next.groupId;
  return Object.keys(next).length ? next as JsonObject : undefined;
}

function flowMapExpansionStatus(value: unknown, fallback: AutomationStudioFlowRouteRule["status"]): AutomationStudioFlowRouteRule["status"] {
  return value === "active" || value === "disabled" || value === "archived" ? value : fallback;
}
function routeConditionFromInput(input: UpsertFlowMapRouteInput): AutomationStudioFlowRouteRule["condition"] | undefined {
  const signalPath = input.conditionSignalPath?.trim();
  if (!signalPath) return undefined;
  const allowed = new Set(["equals", "not_equals", "exists", "greater_than", "less_than", "contains", "matches", "similar_to", "changed", "increased", "decreased", "became_true", "became_false", "stable_for"]);
  const operator = allowed.has(input.conditionOperator ?? "") ? input.conditionOperator! : "exists";
  return compactJsonObject({
    signalPath,
    operator,
    ...(operator !== "exists" && input.conditionExpected !== undefined ? { expected: input.conditionExpected } : {})
  }) as AutomationStudioFlowRouteRule["condition"];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function removeUndefinedRouteRuleFields(rule: Record<string, unknown>): AutomationStudioFlowRouteRule {
  return Object.fromEntries(Object.entries(rule).filter(([, value]) => value !== undefined)) as unknown as AutomationStudioFlowRouteRule;
}
function changeProposalSummaryFromProposal(proposal: AutomationStudioFlowChangeProposal): AutomationStudioChangeProposalSummary {
  return {
    proposalId: proposal.proposalId,
    flowId: proposal.flowId,
    projectId: proposal.projectId,
    ...(proposal.subflowId ? { subflowId: proposal.subflowId } : {}),
    mode: proposal.mode,
    status: proposal.status,
    riskLevel: proposal.riskLevel,
    patchCount: proposal.patches.length,
    updatedAt: proposal.updatedAt
  };
}
function adaptationSummaryFromAdaptation(adaptation: AutomationStudioFlowAdaptation): AutomationStudioAdaptationSummary {
  return {
    adaptationId: adaptation.adaptationId,
    flowId: adaptation.flowId,
    projectId: adaptation.projectId,
    ...(adaptation.subflowId ? { subflowId: adaptation.subflowId } : {}),
    status: adaptation.status,
    riskLevel: adaptation.riskLevel,
    trigger: adaptation.trigger,
    updatedAt: adaptation.updatedAt
  };
}

function adaptationFromTypedStoreDetail(detail: { adaptation: AutomationStudioFlowAdaptation; revisions?: unknown; artifacts?: unknown[]; auditEvents?: unknown[]; auditTotal?: number; approvalMode?: string; baseRevision?: number; appliedRevision?: number | null; statusReason?: string; supersededByAdaptationId?: string | null }): AutomationStudioFlowAdaptation {
  return {
    ...detail.adaptation,
    metadata: compactJsonObject({
      ...(detail.adaptation.metadata ?? {}),
      ...(detail.approvalMode === "manual_approval" ? { proposalModeOverride: "manual" } : {}),
      phase9: compactJsonObject({
        revisions: isJsonRecord(detail.revisions) ? detail.revisions : {},
        artifacts: Array.isArray(detail.artifacts) ? detail.artifacts : [],
        auditEvents: Array.isArray(detail.auditEvents) ? detail.auditEvents : [],
        auditTotal: detail.auditTotal,
        approvalMode: detail.approvalMode,
        baseRevision: detail.baseRevision,
        appliedRevision: detail.appliedRevision ?? undefined,
        statusReason: detail.statusReason,
        supersededByAdaptationId: detail.supersededByAdaptationId ?? undefined
      })
    })
  };
}

function adaptationApprovalModeForStore(adaptation: AutomationStudioFlowAdaptation): "adaptive" | "manual_approval" | "disabled" {
  if (adaptation.status === "disabled") return "disabled";
  const value = adaptation.metadata?.proposalModeOverride ?? adaptation.metadata?.approvalMode;
  if (value === "manual" || value === "manual_approval") return "manual_approval";
  if (value === "disabled" || value === "deterministic") return "disabled";
  return "adaptive";
}

function adaptationEvidenceForStore(adaptation: AutomationStudioFlowAdaptation): JsonObject | undefined {
  const evidence = compactJsonObject({ observedState: adaptation.observedState, expectedState: adaptation.expectedState, failedAction: adaptation.failedAction, diagnosis: adaptation.diagnosis });
  return Object.keys(evidence).length ? evidence : undefined;
}

function approvalDecisionHistory(metadata: JsonObject | undefined): JsonObject[] {
  const history = metadata?.approvalDecisions;
  return Array.isArray(history) ? history.filter(isJsonRecord).slice(-20) : [];
}

function evaluateFlowAdaptationPromotionGates(adaptation: AutomationStudioFlowAdaptation): { ok: boolean; issues: string[] } {
  const counts = adaptationValidationCounts(adaptation);
  const issues: string[] = [];
  if (counts.succeeded < 1) issues.push("at least one successful validation is required");
  if (counts.failed > 0 && counts.succeeded === 0) issues.push("recent failures exist without a successful validation");
  if (adaptation.riskLevel === "destructive") issues.push("destructive adaptations require manual proposal review");
  if (adaptation.status === "disabled") issues.push("disabled adaptations cannot be applied");
  if (adaptation.status === "rejected") issues.push("rejected adaptations cannot be applied");
  if (adaptationRequiresChangeProposal(adaptation) && !adaptation.proposalId) issues.push("structural adaptations require a linked change proposal");
  for (const patch of adaptation.patch) {
    if (patch.kind !== "create_subflow" && !patch.targetId?.trim()) issues.push(`patch ${patch.kind} is missing a target`);
  }
  return { ok: issues.length === 0, issues };
}

function adaptationValidationCounts(adaptation: AutomationStudioFlowAdaptation): { succeeded: number; failed: number; total: number } {
  const results = adaptation.validationResults ?? [];
  return {
    succeeded: results.filter((result) => result.status === "succeeded").length,
    failed: results.filter((result) => result.status === "failed").length,
    total: results.length
  };
}

function adaptationConfidenceScore(adaptation: AutomationStudioFlowAdaptation): number {
  const counts = adaptationValidationCounts(adaptation);
  if (!counts.total) return 0;
  const riskPenalty = adaptation.riskLevel === "low" ? 0 : adaptation.riskLevel === "medium" ? 0.1 : adaptation.riskLevel === "high" ? 0.25 : 0.5;
  return Math.max(0, Math.min(1, counts.succeeded / counts.total - riskPenalty));
}

function adaptationPolicySummaryFromPolicy(projectId: string, policy: AutomationStudioAdaptationPolicy): AutomationStudioAdaptationPolicySummary {
  return {
    policyId: policy.policyId,
    projectId,
    flowId: policy.scope.flowId,
    ...(policy.scope.kind === "subflow" ? { subflowId: policy.scope.subflowId } : {}),
    preset: policy.preset,
    proposalMode: policy.proposalMode,
    updatedAt: policy.updatedAt
  };
}

function recordingSummaryFromSession(recording: RecordingSession, projectId: string): RecordingSummaryItem {
  const title = stringMetadataValue(recording.metadata, "name")
    ?? stringMetadataValue(recording.metadata, "title")
    ?? recording.recordingId;
  const updatedAt = Math.max(recording.endedAt ?? 0, latestTimelineTimestamp(recording), recording.startedAt);
  return {
    id: recording.recordingId,
    title,
    status: recording.endedAt === undefined ? "recording" : "completed",
    projectId,
    taskId: recording.taskId ?? null,
    eventCount: recording.timeline.length,
    startedAt: new Date(recording.startedAt).toISOString(),
    endedAt: recording.endedAt === undefined ? null : new Date(recording.endedAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString()
  };
}

function summaryRecordingSession(recording: RecordingSession): RecordingSession {
  const { timeline: _timeline, notes: _notes, initialState: _initialState, ...summary } = recording;
  return {
    ...summary,
    initialState: { timestamp: recording.initialState?.timestamp ?? recording.startedAt, namespaces: {} },
    timeline: [],
    notes: [],
    metadata: {
      ...(recording.metadata ?? {}),
      summaryOnly: true,
      eventCount: typeof recording.metadata?.eventCount === "number" ? recording.metadata.eventCount : recording.timeline.length,
      noteCount: typeof recording.metadata?.noteCount === "number" ? recording.metadata.noteCount : recording.notes.length
    }
  };
}

function latestTimelineTimestamp(recording: RecordingSession): number {
  return recording.timeline.reduce((latest, entry) => Math.max(latest, typeof entry.timestamp === "number" ? entry.timestamp : 0), 0);
}

function recordingUpdatedAt(recording: RecordingSession): number {
  return Math.max(recording.endedAt ?? 0, latestTimelineTimestamp(recording), recording.startedAt);
}

function recordingEntryIsActionLike(entry: RecordingSession["timeline"][number]): boolean {
  const record = entry as unknown as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "action" || type === "client_action" || type === "recorded_action" || type === "interaction") return true;
  if (typeof record.actionType === "string" && record.actionType.trim()) return true;
  if (record.action && typeof record.action === "object" && !Array.isArray(record.action)) return true;
  return false;
}

function recordingTimelineForProposalMapping(timeline: RecordingSession["timeline"]): RecordingSession["timeline"] {
  return timeline.filter((entry) => {
    if (entry.type === "state_checkpoint") return false;
    if (entry.type === "observation" && (entry.observationType === "client.state_snapshot" || entry.observationType === "client.state_update")) return false;
    return true;
  });
}

function normalizeRecordingCandidateElementTargetParameters(parameters: JsonObject): JsonObject {
  const explicitTarget = normalizeAutomationStudioElementTarget(parameters.target, { source: "mapper" });
  const topLevelTarget = explicitTarget ?? normalizeAutomationStudioElementTarget(parameters, { source: "mapper" });
  if (!topLevelTarget) return { ...parameters };
  return compactJsonObject({ ...parameters, target: topLevelTarget });
}

function recordingActionEntryCandidate(entry: RecordingSession["timeline"][number]): AutomationStudioRecordingMapperCandidate | null {
  if (entry.type !== "action") return null;
  const outputId = typeof entry.outputId === "string" && entry.outputId.trim()
    ? entry.outputId.trim()
    : typeof entry.actionType === "string" && entry.actionType.trim()
      ? entry.actionType.trim()
      : "";
  if (!outputId) return null;
  const metadata = entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata) ? entry.metadata as JsonObject : {};
  if (metadata.policyEligible === false) return null;
  const inputId = typeof metadata.inputId === "string" && metadata.inputId.trim()
    ? metadata.inputId.trim()
    : typeof entry.confirmationInputId === "string" && entry.confirmationInputId.trim()
      ? entry.confirmationInputId.trim()
      : undefined;
  return {
    outputId,
    parameters: entry.parameters && typeof entry.parameters === "object" && !Array.isArray(entry.parameters) ? entry.parameters as JsonObject : {},
    ...(inputId ? { sourceInputIds: [inputId] } : {}),
    ...(entry.confirmationInputId ? { expectedConfirmation: { inputId: entry.confirmationInputId, timeoutMs: entry.confirmationTimeoutMs ?? 5_000 } } : {}),
    confidence: 0.95,
    label: readableTokenValue(outputId)
  };
}

function stringMetadataValue(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function mergePipelineArtifactIdSets(target: Record<PipelineArtifactKind, Set<string>>, source: Record<PipelineArtifactKind, Set<string>>): void {
  for (const kind of pipelineArtifactKinds()) {
    for (const id of source[kind]) target[kind].add(id);
  }
}

function compareSemanticVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function recordingEntryPayload(entry: RecordingSession["timeline"][number]): JsonObject {
  const { id: _id, recordingId: _recordingId, timestamp: _timestamp, monotonicOffsetMs: _offset, sequence: _sequence, sourceId: _sourceId, metadata: _metadata, ...payload } = entry;
  return structuredClone(payload) as unknown as JsonObject;
}

function countRecordingEntryTypes(entries: RecordingSession["timeline"]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => `${type}: ${count}`).join(", ") || "no entries";
}

function clampConfidence(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function appendRecordingProposalToFlow(flow: AutomationStudioFlowArtifact, proposal: RecordingFlowProposalArtifact): AutomationStudioFlowArtifact {
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const nodes = proposal.candidates.map((candidate, index) => {
    let id = `recorded.${safeSegment(candidate.candidateId)}`;
    let suffix = 2;
    while (nodeIds.has(id)) id = `recorded.${safeSegment(candidate.candidateId)}.${suffix++}`;
    nodeIds.add(id);
    return {
      id,
      definitionId: "builtin.policy.action",
      label: candidate.label ?? candidate.outputId,
      ...(candidate.description ? { description: candidate.description } : {}),
      parameterValues: compactJsonObject({
        outputId: candidate.outputId,
        parameters: structuredClone(candidate.parameters),
        ...(candidate.expectedConfirmation ? { confirmationInputId: candidate.expectedConfirmation.inputId, confirmationTimeoutMs: candidate.expectedConfirmation.timeoutMs ?? 5_000 } : {})
      }),
      position: { x: 120 + index * 340, y: 240 },
      metadata: {
        recordingProposalId: proposal.proposalId,
        recordingCandidateId: candidate.candidateId,
        mapperId: proposal.mapper.id,
        mapperVersion: proposal.mapper.version,
        actionEntryId: candidate.actionEntryId,
        timelineEntryId: candidate.actionEntryId,
        ...recordingCandidateStateLinkMetadata(candidate),
        sourceObservationIds: candidate.sourceObservationIds,
        evidence: candidate.evidence,
        rawEvidenceImmutable: true,
        manualProvenance: []
      }
    };
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `recorded-edge.${safeSegment(proposal.proposalId)}.${index + 1}`,
    sourceNodeId: nodes[index]!.id,
    targetNodeId: node.id,
    sourcePortId: "success",
    targetPortId: "ready",
    metadata: { recordingProposalId: proposal.proposalId }
  }));
  return { ...flow, nodes: [...flow.nodes, ...nodes], edges: [...flow.edges, ...edges], metadata: { ...(flow.metadata ?? {}), recordingProposalIds: uniqueStrings([...(Array.isArray(flow.metadata?.recordingProposalIds) ? flow.metadata.recordingProposalIds.map(String) : []), proposal.proposalId]) } };
}

function recordingProposalReplacementBase(flow: AutomationStudioFlowArtifact): AutomationStudioFlowArtifact {
  const generatedNodes = flow.nodes.every((node) => typeof node.metadata?.recordingProposalId === "string"
    && (!Array.isArray(node.metadata.manualProvenance) || node.metadata.manualProvenance.length === 0));
  const generatedEdges = flow.edges.every((edge) => typeof edge.metadata?.recordingProposalId === "string");
  if ((flow.nodes.length || flow.edges.length) && (!generatedNodes || !generatedEdges)) {
    throw new Error("Replacing a primary Subflow is allowed only when its graph is empty or entirely unedited recording-derived behavior.");
  }
  return {
    ...flow,
    nodes: [],
    edges: [],
    metadata: { ...(flow.metadata ?? {}), recordingProposalIds: [] }
  };
}

function recordingCandidateDefinition(proposal: RecordingFlowProposalArtifact, candidate: RecordingFlowActionCandidate, visibility: "private" | "public"): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: recordingProposalDefinitionId(proposal.proposalId, candidate.candidateId),
    version: "1.0.0",
    label: candidate.label ?? candidate.outputId,
    description: candidate.description ?? `Reviewed recording-derived action for ${candidate.outputId}.`,
    category: "recording-derived",
    source: { kind: "recording", proposalId: proposal.proposalId, mapperId: proposal.mapper.id },
    availability: proposal.domainId ? { kind: "domain", domainId: proposal.domainId } : { kind: "global" },
    capabilities: { executable: true, recordable: true, retryable: true },
    outputAction: { fixedOutputId: candidate.outputId },
    inputs: [{ id: "ready", label: "Ready", valueType: "any", role: "control" }],
    outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }, { id: "failed", label: "Failed", valueType: "any", role: "failure" }],
    parameters: recordingCandidateParameters(candidate),
    icon: "wand-sparkles",
    metadata: { visibility, candidateId: candidate.candidateId, outputId: candidate.outputId, parameters: candidate.parameters, ...(candidate.expectedConfirmation ? { expectedConfirmation: candidate.expectedConfirmation } : {}), evidence: candidate.evidence, sourceObservationIds: candidate.sourceObservationIds, ...recordingCandidateStateLinkMetadata(candidate), policyStateEligible: false }
  };
}

function recordingCandidateStateLinkMetadata(candidate: RecordingFlowActionCandidate): JsonObject {
  return candidate.stateLink ? compactJsonObject({
    stateLink: candidate.stateLink as unknown as JsonObject,
    stateSnapshotId: candidate.stateLink.stateSnapshotId,
    stateRef: candidate.stateLink.stateRef,
    screenshotRef: candidate.stateLink.screenshotRef
  }) : {};
}

function recordingCandidateParameters(candidate: RecordingFlowActionCandidate): AutomationStudioNodeDefinition["parameters"] {
  const payload = candidate.parameters && typeof candidate.parameters === "object" && !Array.isArray(candidate.parameters) ? candidate.parameters as JsonObject : {};
  return [
    { id: "parameters", label: "Output payload", description: "Values passed to this recorded output action.", valueType: "object" as const, defaultValue: payload },
    ...(candidate.expectedConfirmation ? [
      { id: "confirmationInputId", label: "Confirmation input", description: "Action input stream that confirms the output occurred.", valueType: "string" as const, defaultValue: candidate.expectedConfirmation.inputId ?? "", ui: { control: "identifier" as const, placeholder: "Registered action input ID" } },
      { id: "confirmationTimeoutMs", label: "Confirmation timeout", description: "How long to wait for confirmation.", valueType: "number" as const, defaultValue: candidate.expectedConfirmation.timeoutMs ?? 5_000 }
    ] : [])
  ];
}

function materializeRecordingNode<T extends { definitionId: string; parameterValues?: JsonObject; metadata?: JsonObject }>(node: T, definition: AutomationStudioNodeDefinition | undefined): T {
  if (!definition || definition.source.kind !== "recording") return node;
  const confirmation = definition.metadata?.expectedConfirmation && typeof definition.metadata.expectedConfirmation === "object" && !Array.isArray(definition.metadata.expectedConfirmation) ? definition.metadata.expectedConfirmation as JsonObject : undefined;
  return {
    ...node,
    definitionId: "builtin.policy.action",
    parameterValues: compactJsonObject({
      ...(node.parameterValues ?? {}),
      outputId: definition.metadata?.outputId,
      parameters: definition.metadata?.parameters ?? {},
      ...(typeof confirmation?.inputId === "string" ? { confirmationInputId: confirmation.inputId, confirmationTimeoutMs: typeof confirmation.timeoutMs === "number" ? confirmation.timeoutMs : 5_000 } : {})
    }),
    metadata: { ...(node.metadata ?? {}), recordingDefinitionId: definition.id, recordingProposalId: definition.source.proposalId }
  };
}

function problemSeverityRank(value: string): number { return value === "error" ? 0 : value === "warning" ? 1 : 2; }
function baselineAutomationStudioProblems(): import("../api/contracts.ts").AutomationStudioProblem[] {
  return [{
    id: "automation-studio.host-artifacts",
    severity: "info",
    message: "Automation Studio is ready for host-owned artifacts. Create or load a project to begin recording and authoring."
  }];
}

function nodeDefinitionScopeAllows(definition: AutomationStudioNodeDefinition, scope: AutomationStudioFlowScope): boolean {
  return definition.availability.kind === "both"
    || (definition.availability.kind === "global" && scope.kind === "global")
    || (definition.availability.kind === "domain" && scope.kind === "domain" && definition.availability.domainId === scope.domainId);
}

function canonicalFlowDigest(flow: AutomationStudioFlowArtifact): string {
  const { updatedAt: _updatedAt, ...stable } = flow;
  return createHash("sha256").update(stableJson(stable)).digest("hex");
}

function subflowMetadataWithParentCategory(metadata: AutomationStudioFlowSubflow["metadata"], parentCategoryId: string | null): AutomationStudioFlowSubflow["metadata"] | undefined {
  const next = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
  delete next.parentCategoryId;
  delete next.subflowCategoryId;
  delete next.categoryId;
  if (parentCategoryId?.trim()) {
    next.parentCategoryId = parentCategoryId.trim();
    next.subflowCategoryId = parentCategoryId.trim();
  }
  return Object.keys(next).length ? next : undefined;
}

function assertExactObjectFields(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${label} contains unsupported fields: ${unexpected.sort().join(", ")}`);
}

function requiredBootstrapCommandId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error(`Flow Bootstrap ${label} ID is invalid.`);
  return value.trim();
}

function requiredBootstrapDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) throw new Error("Flow Bootstrap execution digest is invalid.");
  return value.toLowerCase();
}

function requiredBootstrapSettingsRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error("Flow Bootstrap settings revision is invalid.");
  return value as number;
}
function automationStudioFlowSettingsFingerprint(flow: AutomationStudioFlowArtifact): number {
  const metadata = jsonObjectFromUnknown(flow.metadata) ?? {};
  const digest = createHash("sha256").update(stableJson({
    executionDefaults: flow.executionDefaults ?? {},
    trainingModeSettings: metadata.trainingModeSettings ?? {},
    adaptationPolicyId: metadata.adaptationPolicyId ?? null,
    adaptationPolicySettings: metadata.adaptationPolicySettings ?? {},
    llmProvider: metadata.llmProvider ?? "host",
    llmModel: metadata.llmModel ?? null,
    llmSecretKeyId: metadata.llmSecretKeyId ?? null,
    llmExecutionSettings: metadata.llmExecutionSettings ?? {}
  })).digest("hex");
  return Math.max(1, Number.parseInt(digest.slice(0, 8), 16));
}

function hierarchyFeedRevision(hierarchy: AutomationStudioProjectHierarchy, changedAt: number): number {
  return Math.max(1, Math.trunc(Math.max(changedAt, hierarchy.customHierarchyNodes.length + hierarchy.deletedHierarchyIds.length)));
}

function buildRecordingStateIndex(projectId: string, recording: RecordingSession): RecordingStateIndex {
  const now = Date.now();
  const index = emptyRecordingIndex({
    projectId,
    recordingId: recording.recordingId,
    startedAt: recording.startedAt,
    ...(recording.endedAt !== undefined ? { endedAt: recording.endedAt } : {}),
    updatedAt: now
  });
  index.summary = {
    ...index.summary,
    eventCount: recording.timeline.length,
    actionCount: recording.timeline.filter(recordingEntryIsActionLike).length,
    stateSnapshotCount: recording.timeline.filter(recordingEntryIsStateSnapshot).length,
    proposalCount: 0,
    updatedAt: now
  };
  index.timeline = {
    timelineRef: "timeline.jsonl",
    ...(recording.timeline[0]?.id ? { firstEntryId: recording.timeline[0].id } : {}),
    ...(recording.timeline.at(-1)?.id ? { lastEntryId: recording.timeline.at(-1)!.id } : {})
  };

  for (const [sequence, entry] of recording.timeline.entries()) {
    const actionId = recordingEntryActionId(entry);
    const indexedTimestamp = recordingEntryIndexedTimestamp(entry);
    index.entries[entry.id] = {
      entryId: entry.id,
      type: entry.type,
      ...(indexedTimestamp !== undefined ? { timestamp: indexedTimestamp } : {}),
      ...(typeof (entry as { startedAt?: unknown }).startedAt === "number" ? { startedAt: (entry as { startedAt: number }).startedAt } : {}),
      ...(typeof (entry as { completedAt?: unknown }).completedAt === "number" ? { completedAt: (entry as { completedAt: number }).completedAt } : {}),
      ...(typeof (entry as { monotonicOffsetMs?: unknown }).monotonicOffsetMs === "number" ? { monotonicOffsetMs: (entry as { monotonicOffsetMs: number }).monotonicOffsetMs } : {}),
      sequence,
      ...(actionId ? { actionId } : {}),
      objectRefs: recordingEntryObjectRefs(projectId, entry)
    };

    let stateSnapshotId = recordingEntryStateSnapshotId(entry);
    if (recordingEntryIsStateSnapshot(entry) && stateSnapshotId) {
      const stateItem = recordingEntryStateIndexItem(projectId, entry, stateSnapshotId);
      if (stateItem) {
        index.states[stateSnapshotId] = stateItem;
        index.entries[entry.id] = { ...index.entries[entry.id]!, stateSnapshotId };
      } else {
        stateSnapshotId = undefined;
      }
    }

    if (actionId) {
      const actionStateId = recordingEntryExplicitStateSnapshotId(entry);
      const visualTargetIndexItem = recordingActionVisualTargetIndexItem((entry as { visualTarget?: any }).visualTarget);
      index.actions[actionId] = {
        actionId,
        entryId: entry.id,
        actionType: recordingEntryActionType(entry),
        ...(typeof (entry as { outputId?: unknown }).outputId === "string" ? { outputId: (entry as { outputId: string }).outputId } : {}),
        ...(typeof (entry as { startedAt?: unknown }).startedAt === "number" ? { startedAt: (entry as { startedAt: number }).startedAt } : {}),
        ...(typeof (entry as { completedAt?: unknown }).completedAt === "number" ? { completedAt: (entry as { completedAt: number }).completedAt } : {}),
        ...(actionStateId ? { stateAtActionId: actionStateId } : {}),
        ...(visualTargetIndexItem ? { visualTarget: visualTargetIndexItem } : {}),
        sourceObjectRefs: recordingEntryObjectRefs(projectId, entry)
      };
      if (actionStateId) {
        index.entries[entry.id] = { ...index.entries[entry.id]!, stateSnapshotId: actionStateId };
        if (index.states[actionStateId] && !index.states[actionStateId]!.linkedActionIds.includes(actionId)) {
          index.states[actionStateId] = {
            ...index.states[actionStateId]!,
            linkedActionIds: [...index.states[actionStateId]!.linkedActionIds, actionId].sort()
          };
        }
      }
    }
  }

  return finalizeRecordingStateLinks(sortRecordingIndex(index)).index;
}

function resolveRecordingStateIndexItem(index: RecordingStateIndex, input: RecordingEntryStateLookupInput): { state?: RecordingStateIndexItem; reason: string } {
  if (input.stateSnapshotId) {
    const state = index.states[input.stateSnapshotId];
    return state ? { state, reason: "" } : { reason: `State snapshot ${input.stateSnapshotId} is not indexed for recording ${input.recordingId}.` };
  }
  if (input.actionId) {
    const action = index.actions[input.actionId];
    if (!action) return { reason: `Action ${input.actionId} is not indexed for recording ${input.recordingId}.` };
    if (!action.stateAtActionId) return { reason: `Action ${input.actionId} has no linked state snapshot.` };
    const state = index.states[action.stateAtActionId];
    return state ? { state, reason: "" } : { reason: `Action ${input.actionId} points to missing state snapshot ${action.stateAtActionId}.` };
  }
  if (input.entryId) {
    const entry = index.entries[input.entryId];
    if (!entry) return { reason: `Entry ${input.entryId} is not indexed for recording ${input.recordingId}.` };
    if (entry.stateSnapshotId) {
      const state = index.states[entry.stateSnapshotId];
      return state ? { state, reason: "" } : { reason: `Entry ${input.entryId} points to missing state snapshot ${entry.stateSnapshotId}.` };
    }
    if (entry.actionId) {
      const action = index.actions[entry.actionId];
      const state = action?.stateAtActionId ? index.states[action.stateAtActionId] : undefined;
      if (state) return { state, reason: "" };
    }
    const priorState = latestStateAtOrBeforeEntry(index, entry);
    if (priorState) return { state: priorState, reason: "" };
    return { reason: `Entry ${input.entryId} has no linked state snapshot.` };
  }
  return { reason: "State lookup requires stateSnapshotId, actionId, or entryId." };
}

function latestStateAtOrBeforeEntry(index: RecordingStateIndex, entry: RecordingEntryIndexItem): RecordingStateIndexItem | undefined {
  const targetTime = firstFiniteNumber(entry.startedAt, entry.timestamp, entry.completedAt, entry.monotonicOffsetMs);
  const targetSequence = entry.sequence;
  const states = Object.values(index.states).filter((state) => {
    const stateEntry = index.entries[state.entryId];
    if (targetTime !== undefined) {
      const stateTime = firstFiniteNumber(state.timestamp, stateEntry?.timestamp, stateEntry?.startedAt, state.monotonicOffsetMs, stateEntry?.monotonicOffsetMs);
      if (stateTime !== undefined) return stateTime <= targetTime;
    }
    return targetSequence !== undefined && stateEntry?.sequence !== undefined && stateEntry.sequence <= targetSequence;
  });
  return states.sort((left, right) => {
    const leftEntry = index.entries[left.entryId];
    const rightEntry = index.entries[right.entryId];
    const leftTime = firstFiniteNumber(left.timestamp, leftEntry?.timestamp, leftEntry?.startedAt, left.monotonicOffsetMs, leftEntry?.monotonicOffsetMs) ?? Number.NEGATIVE_INFINITY;
    const rightTime = firstFiniteNumber(right.timestamp, rightEntry?.timestamp, rightEntry?.startedAt, right.monotonicOffsetMs, rightEntry?.monotonicOffsetMs) ?? Number.NEGATIVE_INFINITY;
    if (leftTime !== rightTime) return rightTime - leftTime;
    const leftSequence = leftEntry?.sequence ?? Number.NEGATIVE_INFINITY;
    const rightSequence = rightEntry?.sequence ?? Number.NEGATIVE_INFINITY;
    if (leftSequence !== rightSequence) return rightSequence - leftSequence;
    return right.stateSnapshotId.localeCompare(left.stateSnapshotId);
  })[0];
}

function proposalNodeStateLinkFromIndex(index: RecordingStateIndex, actionEntryId: string): RecordingFlowActionCandidate["stateLink"] | undefined {
  const entry = index.entries[actionEntryId];
  const action = entry?.actionId ? index.actions[entry.actionId] : undefined;
  const stateSnapshotId = action?.stateAtActionId ?? entry?.stateSnapshotId;
  const state = stateSnapshotId ? index.states[stateSnapshotId] : undefined;
  const stateLink = entry && state ? {
    recordingId: index.recordingId,
    actionEntryId,
    ...(entry.actionId ? { actionId: entry.actionId } : {}),
    stateSnapshotId: state.stateSnapshotId,
    stateRef: state.stateRef,
    ...(state.screenshotRef ? { screenshotRef: state.screenshotRef } : {})
  } : undefined;
  return stateLink;
}

function resolveCandidateActionEntryId(index: RecordingStateIndex | null, sourceEntryId: string, candidate: AutomationStudioRecordingMapperCandidate): string {
  if (!index) return sourceEntryId;
  for (const entryId of uniqueStrings([sourceEntryId, ...(candidate.sourceObservationIds ?? [])])) {
    const entry = index.entries[entryId];
    if (entry?.actionId || entry?.type === "action") return entryId;
  }
  return sourceEntryId;
}

function missingRecordingStateLookup(input: RecordingEntryStateLookupInput, reason: string): RecordingEntryStateLookupResult {
  return {
    recordingId: input.recordingId,
    requested: compactJsonObject({ entryId: input.entryId, actionId: input.actionId, stateSnapshotId: input.stateSnapshotId }) as RecordingEntryStateLookupResult["requested"],
    resolved: null,
    reason
  };
}

function recordingEntryStateIndexItem(projectId: string, entry: RecordingSession["timeline"][number], stateSnapshotId: string): RecordingStateIndexItem | null {
  const payload = recordingEntryObservationPayload(entry);
  const stateRef = typeof payload.stateRef === "string" ? payload.stateRef : undefined;
  if (!stateRef) return null;
  const metadata = isJsonRecord(payload.metadata) ? payload.metadata : {};
  const screenshotRef = firstString(metadata.screenshotRef, payload.screenshotRef);
  const visualFrameId = firstString(metadata.visualFrameId, payload.visualFrameId);
  const coordinateSpace = coordinateSpaceFromValue(metadata.coordinateSpace);
  const refs = new Set<string>([stateRef, ...recordingEntryObjectRefs(projectId, entry)]);
  if (screenshotRef) refs.add(screenshotRef);
  return {
    stateSnapshotId,
    entryId: entry.id,
    timestamp: recordingEntryIndexedTimestamp(entry) ?? Date.now(),
    ...(typeof (entry as { monotonicOffsetMs?: unknown }).monotonicOffsetMs === "number" ? { monotonicOffsetMs: (entry as { monotonicOffsetMs: number }).monotonicOffsetMs } : {}),
    stateRef,
    ...(screenshotRef ? { screenshotRef } : {}),
    ...(visualFrameId ? { visualFrameId } : {}),
    ...(coordinateSpace ? { coordinateSpace } : {}),
    objectRefs: [...refs].sort(),
    linkedActionIds: []
  };
}

function recordingEntryIsStateSnapshot(entry: RecordingSession["timeline"][number]): boolean {
  return entry.type === "observation" && entry.observationType === "client.state_snapshot";
}

function recordingEntryStateSnapshotId(entry: RecordingSession["timeline"][number]): string | undefined {
  if (!recordingEntryIsStateSnapshot(entry)) {
    return recordingEntryExplicitStateSnapshotId(entry);
  }
  const payload = recordingEntryObservationPayload(entry);
  const metadata = isJsonRecord(payload.metadata) ? payload.metadata : {};
  return firstString(payload.snapshotId, metadata.stateSnapshotId, metadata.snapshotId, entry.correlationId, `state.${entry.id}`);
}

function recordingEntryExplicitStateSnapshotId(entry: RecordingSession["timeline"][number]): string | undefined {
  const metadata = isJsonRecord((entry as { metadata?: unknown }).metadata) ? (entry as { metadata: JsonObject }).metadata : {};
  return firstString(metadata.stateSnapshotId, metadata.stateAtActionId);
}

function recordingEntryIndexedTimestamp(entry: RecordingSession["timeline"][number]): number | undefined {
  const payload = recordingEntryObservationPayload(entry);
  const payloadMetadata = isJsonRecord(payload.metadata) ? payload.metadata : {};
  const entryMetadata = isJsonRecord((entry as { metadata?: unknown }).metadata) ? (entry as { metadata: JsonObject }).metadata : {};
  const payloadState = isStateSnapshotObject(payload.state) ? payload.state : undefined;
  return firstFiniteNumber(
    entryMetadata.eventTimestampMs,
    entryMetadata.actionTimestampMs,
    entryMetadata.stateTimestampMs,
    payloadMetadata.eventTimestampMs,
    payloadMetadata.actionTimestampMs,
    payloadMetadata.stateTimestampMs,
    payloadMetadata.stateSnapshotTimestamp,
    payload.eventTimestampMs,
    payload.actionTimestampMs,
    payload.stateTimestampMs,
    payload.stateSnapshotTimestamp,
    payloadState?.timestamp,
    entry.timestamp
  );
}

function recordingEntryActionId(entry: RecordingSession["timeline"][number]): string | undefined {
  return recordingEntryIsActionLike(entry) ? `action.${entry.id}` : undefined;
}

function recordingEntryActionType(entry: RecordingSession["timeline"][number]): string {
  if (typeof (entry as { actionType?: unknown }).actionType === "string" && (entry as { actionType: string }).actionType.trim()) return (entry as { actionType: string }).actionType.trim();
  if (typeof (entry as { eventType?: unknown }).eventType === "string" && (entry as { eventType: string }).eventType.trim()) return (entry as { eventType: string }).eventType.trim();
  if (typeof (entry as { outputId?: unknown }).outputId === "string" && (entry as { outputId: string }).outputId.trim()) return (entry as { outputId: string }).outputId.trim();
  return entry.type;
}

function recordingEntryObjectRefs(projectId: string, entry: RecordingSession["timeline"][number]): string[] {
  const refs = new Set<string>();
  const addRef = (value: unknown) => {
    if (typeof value !== "string") return;
    const parsed = parseAutomationStudioObjectContentRef(value);
    if (parsed?.projectId === projectId) refs.add(value);
  };
  const payload = recordingEntryObservationPayload(entry);
  addRef(payload.stateRef);
  addRef(payload.screenshotRef);
  const metadata = isJsonRecord(payload.metadata) ? payload.metadata : {};
  addRef(metadata.screenshotRef);
  addRefsFromValue(refs, payload, projectId);
  addRefsFromValue(refs, (entry as { metadata?: unknown }).metadata, projectId);
  return [...refs].sort();
}

function recordingEntryObservationPayload(entry: RecordingSession["timeline"][number]): JsonObject {
  return entry.type === "observation" && isJsonRecord(entry.payload) ? entry.payload : {};
}

function addRefsFromValue(refs: Set<string>, value: unknown, projectId: string, seen = new Set<unknown>()): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const parsed = parseAutomationStudioObjectContentRef(value);
    if (parsed?.projectId === projectId) refs.add(value);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) addRefsFromValue(refs, item, projectId, seen);
    return;
  }
  for (const item of Object.values(value)) addRefsFromValue(refs, item, projectId, seen);
}

function coordinateSpaceFromValue(value: unknown): RecordingStateIndexItem["coordinateSpace"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.width === "number"
    && typeof record.height === "number"
    && record.unit === "px"
    && record.origin === "top-left"
    ? { width: record.width, height: record.height, unit: "px", origin: "top-left" }
    : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringSetting(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function trainingModeValue(value: unknown): AutomationStudioTrainingModeSettings["mode"] {
  return value === "train_for_runs" || value === "train_until_stable" || value === "continuous_adaptive" ? value : "normal";
}

function approvalModeValue(value: unknown): AutomationStudioTrainingModeSettings["proposalApprovalMode"] {
  return value === "manual" || value === "mixed" ? value : "auto";
}

function adaptationPolicyPresetValue(value: unknown): AutomationStudioAdaptationPolicy["preset"] {
  return value === "locked" || value === "observe" || value === "repair" || value === "autonomous" ? value : "adaptive";
}

function collectAutomationStudioObjectSha256s(value: unknown, projectId: string): Set<string> {
  const refs = new Set<string>();
  addAutomationStudioObjectSha256s(refs, value, projectId);
  return refs;
}

function addAutomationStudioObjectSha256s(refs: Set<string>, value: unknown, projectId: string, seen = new Set<unknown>()): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const parsed = parseAutomationStudioObjectContentRef(value);
    if (parsed?.projectId === projectId) refs.add(parsed.sha256);
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) addAutomationStudioObjectSha256s(refs, item, projectId, seen);
    return;
  }
  const record = value as Record<string, unknown>;
  const reference = record.$fluxiqObject;
  if (reference && typeof reference === "object" && !Array.isArray(reference)) {
    const sha256 = (reference as Record<string, unknown>).sha256;
    if (typeof sha256 === "string" && /^[a-f0-9]{64}$/i.test(sha256)) refs.add(sha256.toLowerCase());
  }
  for (const item of Object.values(record)) addAutomationStudioObjectSha256s(refs, item, projectId, seen);
}

function executionPublicationDependencyState(
  roots: AutomationStudioFlowArtifact[],
  records: AutomationStudioFlowPublicationRecord[]
): JsonObject {
  const byTarget = new Map(records.map((record) => [`${record.flowId}@${record.version}`, record]));
  const pending = roots.flatMap((root) => root.nodes.flatMap((node) => {
    const call = getCallFlowConfiguration(node);
    return call ? [`${call.target.flowId}@${call.target.version}`] : [];
  }));
  const visited = new Set<string>();
  const missingTargets = new Set<string>();
  const reachable: AutomationStudioFlowPublicationRecord[] = [];
  while (pending.length) {
    const target = pending.pop()!;
    if (visited.has(target)) continue;
    visited.add(target);
    const record = byTarget.get(target);
    if (!record) {
      missingTargets.add(target);
      continue;
    }
    reachable.push(record);
    for (const node of record.snapshot.nodes) {
      const call = getCallFlowConfiguration(node);
      if (call) pending.push(`${call.target.flowId}@${call.target.version}`);
    }
  }
  reachable.sort((left, right) => left.publicationId.localeCompare(right.publicationId));
  const allSnapshots = records.map((record) => record.snapshot);
  const deprecatedPublicationIds = records
    .filter((record) => record.status === "deprecated")
    .map((record) => `${record.flowId}@${record.version}`)
    .sort();
  const validationDocuments: Array<AutomationStudioFlowArtifact | AutomationStudioPublishedFlowSnapshot> = [
    ...roots,
    ...reachable.map((record) => record.snapshot)
  ];
  const compositionValidity = validationDocuments
    .map((document) => {
      const result = validateFlowComposition({
        flow: document as AutomationStudioFlowArtifact,
        publishedSnapshots: allSnapshots,
        deprecatedPublicationIds,
        authorizedDomainIds: []
      });
      return {
        documentId: "version" in document ? `${document.flowId}@${document.version}` : `${document.flowId}@draft`,
        ok: result.ok,
        issues: result.issues.map((issue) => ({ severity: issue.severity, code: issue.code, path: issue.path }))
      };
    })
    .sort((left, right) => left.documentId.localeCompare(right.documentId));
  return {
    reachablePublications: reachable.map((record) => ({
      publicationId: record.publicationId,
      projectId: record.projectId,
      flowId: record.flowId,
      version: record.version,
      status: record.status,
      snapshot: record.snapshot as unknown as JsonObject
    })),
    missingTargets: [...missingTargets].sort(),
    compositionValidity
  } as unknown as JsonObject;
}
function bootstrapAdaptationAuditEvent(input: {
  adaptationId: string;
  eventType: AutomationStudioBootstrapAuditEvent["eventType"];
  actorId: string | null;
  fromStatus: AutomationStudioBootstrapAuditEvent["fromStatus"];
  toStatus: AutomationStudioBootstrapAuditEvent["toStatus"];
  createdAt: number;
  detail?: JsonObject;
}): AutomationStudioBootstrapAuditEvent {
  const reason = input.eventType === "created"
    ? "Flow Bootstrap adaptation recorded."
    : input.eventType === "approved"
      ? "Flow Bootstrap adaptation approved for application."
      : input.eventType === "rejected"
        ? "Flow Bootstrap adaptation rejected by reviewer."
        : input.eventType === "applied"
          ? "Flow Bootstrap topology applied."
          : "Flow Bootstrap topology reverted.";
  return {
    eventId: `adaptation.audit.${input.adaptationId}.${input.eventType}`,
    adaptationId: input.adaptationId,
    eventType: input.eventType,
    actorId: input.actorId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    reason,
    detail: { adaptationKind: "flow_bootstrap", ...(input.detail ?? {}) },
    detailObjectId: null,
    createdAt: input.createdAt
  };
}
function sanitizeEvidenceLoopTrace(trace: AutomationStudioLlmEvidenceLoopTrace[]): AutomationStudioLlmEvidenceLoopTrace[] {
  if (!Array.isArray(trace) || trace.length > 17) throw new Error("Flow Bootstrap evidence trace is invalid.");
  return trace.map((item) => {
    if (!Number.isInteger(item.iteration) || item.iteration < 0 || item.iteration > 16 || !["tool_call", "complete"].includes(item.decision)) throw new Error("Flow Bootstrap evidence trace is invalid.");
    const clean: AutomationStudioLlmEvidenceLoopTrace = { iteration: item.iteration, decision: item.decision };
    if (item.callId !== undefined) clean.callId = requiredBootstrapCommandId(item.callId, "evidence call");
    if (item.toolId !== undefined) clean.toolId = requiredBootstrapCommandId(item.toolId, "evidence tool");
    if (item.evidenceBytes !== undefined) {
      if (!Number.isSafeInteger(item.evidenceBytes) || item.evidenceBytes < 0 || item.evidenceBytes > 1_048_576) throw new Error("Flow Bootstrap evidence byte count is invalid.");
      clean.evidenceBytes = item.evidenceBytes;
    }
    if (item.usage) clean.usage = { ...item.usage };
    return clean;
  });
}
function evidenceTraceAuditDetail(trace: AutomationStudioLlmEvidenceLoopTrace[]): JsonObject {
  const clean = sanitizeEvidenceLoopTrace(trace);
  const providerDecisions = clean.filter((item) => item.iteration > 0);
  return {
    evidenceGuided: true,
    // Retained for compatibility with existing audit readers. This is the
    // total trace length and can include the deterministic iteration-0
    // observation, so it must not be interpreted as provider-call accounting.
    iterationCount: clean.length,
    traceStepCount: clean.length,
    providerCallCount: providerDecisions.length,
    decisionCount: providerDecisions.length,
    toolCallCount: clean.filter((item) => item.decision === "tool_call").length,
    evidenceBytes: clean.reduce((sum, item) => sum + (item.evidenceBytes ?? 0), 0),
    toolIds: [...new Set(clean.flatMap((item) => item.toolId ? [item.toolId] : []))].sort()
  };
}
function sanitizedBootstrapAccounting(value: AutomationStudioBootstrapAccounting): AutomationStudioBootstrapAccounting {
  const boundedText = (item: unknown, label: string): string => {
    if (typeof item !== "string" || !item.trim() || item.length > 200 || /[\u0000-\u001f\u007f]/.test(item)) throw new Error(`Flow Bootstrap ${label} is invalid.`);
    return item.trim();
  };
  const boundedInteger = (item: unknown, label: string): number => {
    if (!Number.isSafeInteger(item) || (item as number) < 0 || (item as number) > 50_000) throw new Error(`Flow Bootstrap ${label} is invalid.`);
    return item as number;
  };
  const boundedCost = (item: unknown): number => {
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 10) throw new Error("Flow Bootstrap estimated cost is invalid.");
    return item;
  };
  return {
    requestId: boundedText(value.requestId, "request ID"),
    estimatedInputTokens: boundedInteger(value.estimatedInputTokens, "estimated input tokens"),
    ...(value.provider !== undefined ? { provider: boundedText(value.provider, "provider") } : {}),
    ...(value.model !== undefined ? { model: boundedText(value.model, "model") } : {}),
    ...(value.inputTokens !== undefined ? { inputTokens: boundedInteger(value.inputTokens, "input tokens") } : {}),
    ...(value.outputTokens !== undefined ? { outputTokens: boundedInteger(value.outputTokens, "output tokens") } : {}),
    ...(value.totalTokens !== undefined ? { totalTokens: boundedInteger(value.totalTokens, "total tokens") } : {}),
    ...(value.estimatedCostUsd !== undefined ? { estimatedCostUsd: boundedCost(value.estimatedCostUsd) } : {})
  };
}

function bootstrapAdaptationAsFlowAdaptation(
  adaptation: AutomationStudioBootstrapAdaptation,
  currentBinding: { executionDigest: string; settingsRevision: number }
): AutomationStudioFlowAdaptation {
  assertAutomationStudioBootstrapHasNoRecordingProvenance(adaptation);
  const accounting = adaptation.accounting ? sanitizedBootstrapAccounting(adaptation.accounting) : undefined;
  const topologySummary = {
    routerId: adaptation.topology.router.routerId,
    subflowCount: adaptation.topology.subflows.length,
    nodeCount: adaptation.topology.subflows.reduce((total, entry) => total + entry.graphFlow.nodes.length, 0),
    edgeCount: adaptation.topology.subflows.reduce((total, entry) => total + entry.graphFlow.edges.length, 0)
  };
  return {
    schemaVersion: "0.1",
    adaptationId: adaptation.adaptationId,
    flowId: adaptation.flowId,
    projectId: adaptation.projectId,
    sourceInstructionIds: [...adaptation.sourceInstructionIds],
    trigger: "Instruction-built Flow Bootstrap",
    diagnosis: adaptation.summary,
    patch: [
      {
        kind: "edit_router",
        targetId: adaptation.topology.router.routerId,
        summary: `Create Router ${adaptation.topology.router.name} with ${adaptation.topology.router.rules.length} rules.`,
        after: {
          routerId: adaptation.topology.router.routerId,
          name: adaptation.topology.router.name,
          ruleCount: adaptation.topology.router.rules.length,
          fallbackKind: adaptation.topology.router.fallback?.kind ?? "none"
        }
      },
      ...adaptation.topology.subflows.map((entry) => ({
        kind: "create_subflow" as const,
        targetId: entry.subflow.subflowId,
        summary: `Create ${entry.subflow.name} with ${entry.graphFlow.nodes.length} nodes and ${entry.graphFlow.edges.length} edges.`,
        after: {
          subflowId: entry.subflow.subflowId,
          graphFlowId: entry.graphFlow.flowId,
          name: entry.subflow.name,
          role: entry.subflow.role,
          nodeCount: entry.graphFlow.nodes.length,
          edgeCount: entry.graphFlow.edges.length
        }
      }))
    ],
    ...(adaptation.status === "applied" ? {
      appliedTo: [
        { kind: "router" as const, id: adaptation.topology.router.routerId },
        ...adaptation.topology.subflows.map((entry) => ({ kind: "subflow" as const, id: entry.subflow.subflowId }))
      ]
    } : {}),
    status: adaptation.status,
    author: "llm",
    riskLevel: adaptation.riskLevel,
    createdAt: adaptation.createdAt,
    updatedAt: adaptation.updatedAt,
    metadata: {
      adaptationKind: "flow_bootstrap",
      bootstrap: {
        baseExecutionDigest: adaptation.baseDependencyDigest,
        baseSettingsRevision: adaptation.baseSettingsRevision,
        currentExecutionDigest: currentBinding.executionDigest,
        currentSettingsRevision: currentBinding.settingsRevision,
        ...topologySummary,
        ...(accounting ? { accounting } : {}),
        ...(adaptation.application ? {
          application: {
            appliedAt: adaptation.application.appliedAt,
            appliedBy: adaptation.application.appliedBy,
            appliedExecutionDigest: adaptation.application.appliedDependencyDigest
          }
        } : {}),
        ...(adaptation.revert ? { revert: { ...adaptation.revert } } : {})
      },
      phase9: {
        auditEvents: (adaptation.auditEvents ?? []).map((event) => structuredClone(event)),
        auditTotal: adaptation.auditEvents?.length ?? 0,
        approvalMode: "manual_approval"
      }
    }
  };
}
type AutomationStudioRuntimeInterventionMode = "fully_adaptive" | "manual_approval" | "no_llm_intervention" | "default" | "deterministic";

export function normalizeAutomationStudioRuntimeInterventionMode(mode: AutomationStudioRuntimeInterventionMode | undefined): "fully_adaptive" | "manual_approval" | "no_llm_intervention" {
  if (mode === "manual_approval") return mode;
  if (mode === "no_llm_intervention" || mode === "deterministic") return "no_llm_intervention";
  return "fully_adaptive";
}

function mergedFlowSettingsMetadata(metadata: JsonObject | undefined): JsonObject {
  const defaults = defaultAutomationStudioFlowSettingsMetadata();
  const canonical = withAutomationStudioInterventionMode(metadata, automationStudioInterventionMode(metadata));
  const configuredTrainingMode = jsonObjectFromUnknown(metadata?.trainingModeSettings)?.mode ?? metadata?.trainingMode;
  const legacy = metadata?.adaptationModeVersion !== 1 || configuredTrainingMode === "train_for_runs" || configuredTrainingMode === "train_until_stable";
  const source = legacy ? {
    ...canonical,
    ...(metadata ?? {}),
    adaptationModeVersion: 1,
    adaptationMode: automationStudioInterventionMode(metadata),
    trainingModeSettings: {
      ...(jsonObjectFromUnknown(canonical.trainingModeSettings) ?? {}),
      ...(jsonObjectFromUnknown(metadata?.trainingModeSettings) ?? {})
    },
    adaptationPolicySettings: {
      ...(jsonObjectFromUnknown(canonical.adaptationPolicySettings) ?? {}),
      ...(jsonObjectFromUnknown(metadata?.adaptationPolicySettings) ?? {})
    }
  } : canonical;
  return {
    ...defaults,
    ...source,
    trainingModeSettings: {
      ...(jsonObjectFromUnknown(defaults.trainingModeSettings) ?? {}),
      ...(jsonObjectFromUnknown(source.trainingModeSettings) ?? {}),
      recoveryBudget: {
        ...(jsonObjectFromUnknown(jsonObjectFromUnknown(defaults.trainingModeSettings)?.recoveryBudget) ?? {}),
        ...(jsonObjectFromUnknown(jsonObjectFromUnknown(source.trainingModeSettings)?.recoveryBudget) ?? {})
      }
    },
    adaptationPolicySettings: {
      ...(jsonObjectFromUnknown(defaults.adaptationPolicySettings) ?? {}),
      ...(jsonObjectFromUnknown(source.adaptationPolicySettings) ?? {})
    }
  };
}

function trainingModeSettingsFromMetadata(metadata: JsonObject): AutomationStudioTrainingModeSettings {
  const settings = jsonObjectFromUnknown(metadata.trainingModeSettings) ?? {};
  const budgets = jsonObjectFromUnknown(settings.budgets) ?? {};
  const recoveryBudget = jsonObjectFromUnknown(settings.recoveryBudget) ?? {};
  const trainForRunCount = finiteNumber(settings.trainForRunCount);
  const stableRunThreshold = finiteNumber(settings.stableRunThreshold);
  const minimumStabilityScore = finiteNumber(settings.minimumStabilityScore);
  const maxInterventionsPerRun = finiteNumber(budgets.maxInterventionsPerRun);
  const maxTokensPerRun = finiteNumber(budgets.maxTokensPerRun);
  const maxCostUsdPerTrainingWindow = finiteNumber(budgets.maxCostUsdPerTrainingWindow);
  const maxRetriesPerAction = finiteNumber(recoveryBudget.maxRetriesPerAction);
  const maxRecoveryAttemptsPerSubflow = finiteNumber(recoveryBudget.maxRecoveryAttemptsPerSubflow);
  const maxReroutesPerRun = finiteNumber(recoveryBudget.maxReroutesPerRun);
  return {
    mode: trainingModeValue(settings.mode ?? metadata.trainingMode),
    ...(trainForRunCount !== undefined ? { trainForRunCount } : {}),
    ...(stableRunThreshold !== undefined ? { stableRunThreshold } : {}),
    ...(minimumStabilityScore !== undefined ? { minimumStabilityScore } : {}),
    allowLlmIntervention: booleanSetting(settings.allowLlmIntervention, false),
    allowRuntimeRecovery: booleanSetting(settings.allowRuntimeRecovery, true),
    allowAdaptationCreation: booleanSetting(settings.allowAdaptationCreation, false),
    proposalApprovalMode: approvalModeValue(settings.proposalApprovalMode ?? metadata.proposalApprovalMode ?? metadata.proposalMode),
    allowPromotion: booleanSetting(settings.allowPromotion, false),
    requireFirstManualReviewBeforeAutoPromotion: booleanSetting(settings.requireFirstManualReviewBeforeAutoPromotion ?? metadata.requireFirstManualReviewBeforeAutoPromotion, false),
    recoveryBudget: {
      ...(maxRetriesPerAction !== undefined ? { maxRetriesPerAction } : {}),
      ...(maxRecoveryAttemptsPerSubflow !== undefined ? { maxRecoveryAttemptsPerSubflow } : {}),
      ...(maxReroutesPerRun !== undefined ? { maxReroutesPerRun } : {})
    },
    budgets: {
      ...(maxInterventionsPerRun !== undefined ? { maxInterventionsPerRun } : {}),
      ...(maxTokensPerRun !== undefined ? { maxTokensPerRun } : {}),
      ...(maxCostUsdPerTrainingWindow !== undefined ? { maxCostUsdPerTrainingWindow } : {}),
      exhaustedBehavior: budgets.exhaustedBehavior === "stop" ? "stop" : "ask"
    }
  };
}

function adaptationPolicyFromFlowMetadata(flow: AutomationStudioFlowArtifact, metadata: JsonObject): AutomationStudioAdaptationPolicy {
  const settings = jsonObjectFromUnknown(metadata.adaptationPolicySettings) ?? {};
  const now = flow.updatedAt ?? Date.now();
  const maxInterventionsPerRun = finiteNumber(settings.maxInterventionsPerRun);
  const maxEstimatedCostUsdPerRun = finiteNumber(settings.maxEstimatedCostUsdPerRun);
  return {
    schemaVersion: "0.1",
    policyId: stringSetting(metadata.adaptationPolicyId, "policy.default"),
    scope: { kind: "flow", flowId: flow.flowId },
    preset: adaptationPolicyPresetValue(settings.preset),
    proposalMode: approvalModeValue(settings.proposalMode ?? metadata.proposalApprovalMode ?? metadata.proposalMode),
    allowRuntimeRecovery: booleanSetting(settings.allowRuntimeRecovery, true),
    allowCreateRecoveryPaths: booleanSetting(settings.allowCreateRecoveryPaths, true),
    allowModifySubflows: booleanSetting(settings.allowModifySubflows, true),
    allowCreateSubflows: booleanSetting(settings.allowCreateSubflows, true),
    allowModifyRouter: booleanSetting(settings.allowModifyRouter, true),
    allowModifyExpectations: booleanSetting(settings.allowModifyExpectations, true),
    allowModifyActionTargets: booleanSetting(settings.allowModifyActionTargets, true),
    allowDeleteOrDisableBehavior: booleanSetting(settings.allowDeleteOrDisableBehavior, false),
    allowExternalSideEffects: booleanSetting(settings.allowExternalSideEffects, false),
    requireApprovalForDestructiveChanges: booleanSetting(settings.requireApprovalForDestructiveChanges, true),
    requireApprovalForExternalSideEffects: booleanSetting(settings.requireApprovalForExternalSideEffects, true),
    ...(maxInterventionsPerRun !== undefined ? { maxInterventionsPerRun } : {}),
    ...(maxEstimatedCostUsdPerRun !== undefined ? { maxEstimatedCostUsdPerRun } : {}),
    createdAt: flow.createdAt,
    updatedAt: now,
    metadata: {
      source: "flow.metadata",
      ...(stringSetting(metadata.llmProvider, "") ? { llmProvider: stringSetting(metadata.llmProvider, "") } : {})
    }
  };
}

function runtimeTrainingBudgetStateFromSummaries(runs: AutomationStudioFlowRunSummary[]): AutomationStudioTrainingBudgetState {
  return {
    interventionsThisRun: 0,
    tokensThisRun: 0,
    costUsdThisTrainingWindow: runs.reduce((sum, run) => sum + (run.tokenUsage?.estimatedCostUsd ?? 0), 0)
  };
}

function runtimeAdaptationContextDiagnostics(
  settings: AutomationStudioTrainingModeSettings,
  policy: AutomationStudioAdaptationPolicy,
  behavior: AutomationStudioTrainingModeBehavior,
  budgetDecision: ReturnType<typeof decideAutomationStudioTrainingBudget>
): string[] {
  const diagnostics: string[] = [];
  if (!behavior.invokeLlm) diagnostics.push("LLM intervention is disabled by training mode or settings.");
  if (!behavior.createAdaptations) diagnostics.push("Adaptation creation is disabled by training mode or settings.");
  if (!policy.allowRuntimeRecovery) diagnostics.push("Runtime recovery is disabled by adaptation policy.");
  if (!budgetDecision.ok) diagnostics.push(`Training budget exhausted: ${budgetDecision.exhausted.join(", ")}.`);
  if (settings.mode === "normal") diagnostics.push("Normal mode records adaptive context without invoking LLM.");
  return diagnostics;
}

function runtimeAdaptationContextWithRunOverride(
  context: AutomationStudioRuntimeAdaptationContext,
  input: { adaptiveMode?: AutomationStudioRuntimeInterventionMode; dryRunLlm?: boolean }
): AutomationStudioRuntimeAdaptationContext {
  const mode = normalizeAutomationStudioRuntimeInterventionMode(input.adaptiveMode);
  if (mode === "fully_adaptive" && input.dryRunLlm !== true) return context;
  const behavior = { ...context.behavior };
  const metadata: JsonObject = { ...(context.settings.metadata ?? {}), runtimeOverrideMode: mode };
  if (mode === "no_llm_intervention") {
    behavior.invokeLlm = false;
    behavior.createAdaptations = false;
    behavior.promoteAdaptations = false;
  }
  if (mode === "manual_approval") {
    behavior.invokeLlm = true;
    behavior.runRecovery = false;
    behavior.createAdaptations = false;
    behavior.promoteAdaptations = false;
    context = { ...context, policy: { ...context.policy, proposalMode: "manual" } };
  }
  if (input.dryRunLlm === true) {
    behavior.invokeLlm = true;
    behavior.runRecovery = true;
    behavior.createAdaptations = true;
    behavior.promoteAdaptations = false;
    metadata.dryRunAdaptation = true;
  }
  return {
    ...context,
    behavior,
    settings: {
      ...context.settings,
      metadata
    },
    diagnostics: [
      ...context.diagnostics,
      ...(mode !== "fully_adaptive" ? [`Runtime override mode: ${mode}.`] : []),
      ...(input.dryRunLlm === true ? ["Runtime override enabled dry-run LLM adaptation suggestions."] : [])
    ]
  };
}

function runtimeAdaptationContextForExplicitProposal(context: AutomationStudioRuntimeAdaptationContext): AutomationStudioRuntimeAdaptationContext {
  return {
    ...context,
    behavior: {
      ...context.behavior,
      invokeLlm: true,
      runRecovery: false,
      createAdaptations: true,
      promoteAdaptations: true
    },
    policy: {
      ...context.policy,
      proposalMode: "manual",
      // The explicit grant is schema-bound to one target-override proposal.
      // Permit only that mutation class; preflight still forbids execution and
      // the ordinary PIN-gated review path remains required for application.
      allowModifyActionTargets: true
    },
    diagnostics: [...context.diagnostics, "Explicit diagnose_and_adapt run permits one target-override proposal with manual review only."]
  };
}

function recoveryBudgetFromRuntimeAdaptationContext(context: AutomationStudioRuntimeAdaptationContext): AutomationStudioRecoveryBudget {
  const maxAdaptationOrLlmAttemptsPerRun = firstFiniteNumber(context.policy.maxInterventionsPerRun, context.settings.budgets?.maxInterventionsPerRun);
  return {
    ...(context.settings.recoveryBudget ?? {}),
    ...(maxAdaptationOrLlmAttemptsPerRun !== undefined ? { maxAdaptationOrLlmAttemptsPerRun } : {})
  };
}

function runtimeRunDetailWithAdaptationContext(detail: AutomationStudioFlowRunDetail, context: AutomationStudioRuntimeAdaptationContext | null): AutomationStudioFlowRunDetail {
  if (!context) return detail;
  const annotated = annotateRunDetailWithTrainingMode(detail, context.settings, context.behavior);
  return {
    ...annotated,
    metadata: {
      ...(annotated.metadata ?? {}),
      runtimeAdaptationContext: runtimeAdaptationContextSummary(context)
    }
  };
}

function adaptationMutationEvidence(adaptation: AutomationStudioFlowAdaptation): JsonObject[] {
  const record = isJsonRecord(adaptation.metadata?.applicationRecord) ? adaptation.metadata.applicationRecord : undefined;
  const mutations = Array.isArray(record?.mutations) ? record.mutations.filter(isJsonRecord) : [];
  return mutations.map((mutation) => compactJsonObject({
    patchKind: mutation.patchKind,
    artifactKind: mutation.artifactKind,
    artifactId: mutation.artifactId,
    targetKind: mutation.targetKind,
    targetId: mutation.targetId,
    before: mutation.before,
    after: mutation.after,
    rollback: mutation.rollback,
    validation: mutation.validation
  }));
}

function runtimeAdaptationContextSummary(context: AutomationStudioRuntimeAdaptationContext): JsonObject {
  return {
    flowId: context.flowId,
    mode: context.settings.mode,
    policyId: context.policy.policyId,
    policyPreset: context.policy.preset,
    approvalMode: context.policy.proposalMode,
    behavior: {
      invokeLlm: context.behavior.invokeLlm,
      runRecovery: context.behavior.runRecovery,
      createAdaptations: context.behavior.createAdaptations,
      promoteAdaptations: context.behavior.promoteAdaptations
    },
    budget: {
      ok: context.budgetDecision.ok,
      behavior: context.budgetDecision.behavior,
      exhausted: context.budgetDecision.exhausted,
      interventionsThisRun: context.budgetState.interventionsThisRun,
      tokensThisRun: context.budgetState.tokensThisRun,
      costUsdThisTrainingWindow: context.budgetState.costUsdThisTrainingWindow
    },
    metrics: {
      stabilityScore: context.metrics.stabilityScore,
      deterministicSuccessRuns: context.metrics.deterministicSuccessRuns,
      unresolvedFailures: context.metrics.unresolvedFailures,
      llmInterventionsPerRun: context.metrics.llmInterventionsPerRun,
      acceptedAdaptations: context.metrics.acceptedAdaptations,
      rejectedAdaptations: context.metrics.rejectedAdaptations
    },
    runsCompleted: context.runsCompleted,
    recentRunCount: context.recentRunCount,
    recentAdaptationCount: context.recentAdaptationCount,
    diagnostics: context.diagnostics
  };
}

function isTerminalRuntimeSessionStatus(status: AutomationStudioRuntimeSession["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

async function readJsonLinePage<T>(filePath: string, offset: number, limit: number): Promise<T[]> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const items: T[] = [];
  let index = 0;
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      if (index >= offset && items.length < limit) items.push(JSON.parse(line) as T);
      index += 1;
      if (items.length >= limit) break;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return items;
}

const AUTOMATION_STUDIO_HIERARCHY_NODE_KINDS = new Set<AutomationStudioHierarchyNode["kind"]>([
  "folder", "client", "proposal", "flow", "config", "recording", "run", "task", "routine"
]);
const AUTOMATION_STUDIO_HIERARCHY_NODE_CATEGORIES = new Set<AutomationStudioHierarchyNode["category"]>([
  "client", "proposal", "flow", "config", "recording", "run", "task", "routine"
]);

function requiredHierarchyId(value: unknown, fieldName: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`Automation Studio hierarchy ${fieldName} is required.`);
  return normalized;
}

function normalizeCustomHierarchyNode(value: unknown): AutomationStudioHierarchyNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Automation Studio hierarchy node must be an object.");
  }
  const node = value as Record<string, unknown>;
  const id = requiredHierarchyId(node.id, "node.id");
  const label = requiredHierarchyId(node.label, "node.label");
  if (!AUTOMATION_STUDIO_HIERARCHY_NODE_KINDS.has(node.kind as AutomationStudioHierarchyNode["kind"])) {
    throw new Error("Automation Studio hierarchy node.kind is invalid.");
  }
  if (!AUTOMATION_STUDIO_HIERARCHY_NODE_CATEGORIES.has(node.category as AutomationStudioHierarchyNode["category"])) {
    throw new Error("Automation Studio hierarchy node.category is invalid.");
  }
  const parentId = node.parentId === null ? null : requiredHierarchyId(node.parentId, "node.parentId");
  const optionalId = (fieldName: "viewId" | "sourceId" | "recordingId"): string | undefined => (
    node[fieldName] === undefined ? undefined : requiredHierarchyId(node[fieldName], `node.${fieldName}`)
  );
  const viewId = optionalId("viewId");
  const sourceId = optionalId("sourceId");
  const recordingId = optionalId("recordingId");
  return {
    id,
    label,
    kind: node.kind as AutomationStudioHierarchyNode["kind"],
    category: node.category as AutomationStudioHierarchyNode["category"],
    parentId,
    ...(viewId ? { viewId } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(recordingId ? { recordingId } : {})
  };
}

function latestByGeneratedAt<T extends { generatedAt?: number }>(items: T[]): T | undefined {
  return [...items].sort((left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0))[0];
}

function reusableLlmContextSummary(record: AutomationStudioReusableLlmContextRecord): AutomationStudioReusableLlmContextSummary {
  const { promptProjection: _promptProjection, ...summary } = record;
  return summary;
}
