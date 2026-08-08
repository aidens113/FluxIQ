import { createHash, randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioSnapshot } from "../api/index.ts";
import type { AutomationStudioProject, AutomationStudioProjectCategory, AutomationStudioProjectHierarchy } from "../api/contracts.ts";
import {
  appendRecordingEntry,
  appendRecordingNote,
  createAutomationStudioFixture,
  createBlankAutomationStudioFlow,
  createBlankAutomationStudioFlowArtifact,
  createPublishedFlowSnapshot,
  getCallFlowConfiguration,
  createRecordingSession,
  diffStateSnapshots,
  finalizeRecordingSession,
  type AutomationStudioConfigArtifact,
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowCatalogEntry,
  type AutomationStudioFlowDocument,
  type AutomationStudioFlowMigrationLedger,
  type AutomationStudioFlowMigrationOutcome,
  type AutomationStudioFlowPublicationRecord,
  AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION,
  AutomationStudioLegacyWriteDisabledError,
  type AutomationStudioFlowMigrationRollbackPlan,
  type AutomationStudioLegacyBackup,
  type AutomationStudioLegacyDeferredArtifact,
  type AutomationStudioLegacyImporterEvidence,
  type AutomationStudioLegacyRetirementAuditEvent,
  type AutomationStudioLegacyRetirementDiagnostic,
  type AutomationStudioLegacyRetirementReport,
  type AutomationStudioLegacyRetirementState,
  type AutomationStudioFlowScope,
  type AutomationStudioProjectArtifacts,
  type AutomationStudioProjectArtifactKind,
  type AutomationStudioRoutineArtifact,
  type AutomationStudioRuntimeSession,
  type AutomationStudioTaskArtifact,
  type AppendRecordingEntryInput,
  type CreateRecordingSessionInput,
  type PolicyGraph,
  type PolicyNode,
  type RecordingDomainDefinition,
  type RecordingDomainEventInput,
  type RecordingDomainEventProcessingResult,
  RecordingDomainRegistry,
  type StateDelta,
  type StateElementDescriptor,
  type StateElementKind,
  type RecordingSession,
  type SignalRegistry,
  type StateSnapshot,
  type StateValue,
  processRecordingDomainEvent,
  resolveAutomationStudioFlowCatalog,
  projectPublishedFlowSnapshotToNodeDefinition,
  validateFlowComposition,
  validateAutomationStudioFlow
} from "../model/index.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import { compileFlowSource, convertCodeOwnedFlowToVisual, verifyCodeOwnedFlowCompilation, type AutomationStudioFlowCompilation } from "../dsl/index.ts";
import type { EvidenceClaim, EvidenceFact, EvidenceObservation, SignalMiningResult, StateActionCorrelation } from "../mining/index.ts";
import { normalizeRecordingTimeline, type NormalizationOptions, type NormalizedTimeline } from "../normalization/index.ts";
import { runAutomationStudioGraph } from "./executor.ts";
import { runCanonicalAutomationStudioFlow } from "./composite-executor.ts";
import type { AutomationStudioNativeNodeRuntime } from "./native-node-runtime.ts";
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
import { ProgramJsonStore, programDataFile, safeSegment } from "../../_shared/storage.ts";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../nodes/index.ts";
import type { IoRegistry } from "../../../io/index.ts";
import { createIoPolicyEffectDispatcher } from "./io-policy.ts";
import {
  type CanonicalAutomationStudioRepositories,
  createCanonicalAutomationStudioMemoryRepositories,
  AutomationStudioObjectStore,
  AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES,
  isAutomationStudioObjectReference
} from "../storage/index.ts";

export type AutomationStudioServiceOptions = {
  dataDir?: string;
  storageRootDir?: string;
  customNodeRootDir?: string;
  repositories?: CanonicalAutomationStudioRepositories;
  seedFixture?: boolean;
};

export type AutomationStudioFlowMigrationInspection = {
  projectId: string;
  backupId: string;
  outcomes: AutomationStudioFlowMigrationOutcome[];
  migrationNeeded: boolean;
};

type AutomationStudioProjectRecord = AutomationStudioProject & AutomationStudioProjectHierarchy;

const PIPELINE_ARTIFACT_WRITE_CONCURRENCY = 16;
const MAX_PRE_ACTION_STATE_CORRELATIONS = 12;
const MAX_POST_ACTION_STATE_DELTAS = 12;

type AutomationStudioProjectIndex = {
  categories: AutomationStudioProjectCategory[];
  projects: AutomationStudioProject[];
};

type RecordingIndex = {
  recordings: { recordingId: string; taskId?: string; startedAt: number; endedAt?: number; updatedAt: number }[];
  normalizedTimelines: { normalizedTimelineId: string; recordingId: string; generatedAt: number }[];
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

export type NormalizationReviewArtifact = {
  schemaVersion: "0.1";
  reviewId: string;
  recordingId: string;
  normalizedTimelineId: string;
  mappings: Array<{ rawEntryId: string; normalizedEntryIds: string[]; status: "preserved" | "derived" | "dropped"; reason?: string }>;
  waitClips: Array<{ beforeEntryId: string; afterEntryId: string; waitMs: number }>;
  issues: NormalizedTimeline["issues"];
  generatedAt: number;
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

export type ProcessFinalizedRecordingResult = {
  schemaVersion: "0.1";
  recordingId: string;
  status: "processed" | "skipped" | "partial";
  normalizedTimeline?: NormalizedTimeline;
  review?: NormalizationReviewArtifact;
  miningRun?: SignalMiningResult;
  proposal?: PolicyProposalArtifact;
  recordingFlowProposals?: RecordingFlowProposalArtifact[];
  issues: string[];
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

type RuntimeIndex = {
  sessions: { runId: string; targetKind: AutomationStudioRuntimeSession["targetKind"]; targetId: string; status: AutomationStudioRuntimeSession["status"]; updatedAt: number }[];
};

export class AutomationStudioService {
  private readonly repositories: CanonicalAutomationStudioRepositories;
  private readonly projectIndexStore?: ProgramJsonStore<AutomationStudioProjectIndex>;
  private readonly legacyProjectStore?: ProgramJsonStore<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProjectRecord[] }>;
  private readonly projectRootDir?: string;
  private readonly nodeRootDir?: string;
  private readonly recordingDomains = new RecordingDomainRegistry();
  private readonly objectStore?: AutomationStudioObjectStore;
  private readonly recordingMutationLocks = new Map<string, Promise<void>>();
  private readonly ready: Promise<void>;
  private storageReady?: Promise<void>;
  private ioRuntime?: { io: IoRegistry; domainId: string | null };
  private nativeNodeRuntime?: AutomationStudioNativeNodeRuntime;
  private readonly memoryLegacyRetirementStates = new Map<string, AutomationStudioLegacyRetirementState>();
  private readonly memoryLegacyBackups = new Map<string, AutomationStudioLegacyBackup>();
  private readonly memoryLegacyAudit = new Map<string, AutomationStudioLegacyRetirementAuditEvent[]>();

  constructor(options: AutomationStudioServiceOptions = {}) {
    this.repositories = options.repositories ?? createCanonicalAutomationStudioMemoryRepositories();
    if (options.dataDir || options.storageRootDir) {
      const automationDataDir = options.storageRootDir ?? path.join(options.dataDir!, "programs", "automation-studio");
      if (options.storageRootDir) this.objectStore = new AutomationStudioObjectStore(automationDataDir);
      this.projectRootDir = path.join(automationDataDir, "projects");
      const nodeRootDir = options.customNodeRootDir ?? (options.storageRootDir ? undefined : path.join(automationDataDir, "nodes"));
      if (nodeRootDir) this.nodeRootDir = nodeRootDir;
      this.projectIndexStore = new ProgramJsonStore(path.join(this.projectRootDir, "index.json"), () => ({ categories: [], projects: [] }));
      if (options.dataDir) this.legacyProjectStore = new ProgramJsonStore(programDataFile(options.dataDir, "automation-studio", "projects.json"), () => ({ categories: [], projects: [] }));
    }
    this.ready = options.seedFixture === true ? this.seedFixture() : Promise.resolve();
  }

  /** Connects Automation Studio policy execution to importer-registered IO. */
  bindIoRuntime(io: IoRegistry, domainId?: string | null): this {
    this.ioRuntime = { io, domainId: domainId ?? null };
    return this;
  }

  /** Binds explicitly registered importer and trusted-local Code Node implementations. */
  bindNativeNodeRuntime(runtime: AutomationStudioNativeNodeRuntime): this { this.nativeNodeRuntime = runtime; return this; }

  async snapshot(domainId?: string | null): Promise<AutomationStudioSnapshot> {
    await this.ready;
    return {
      tasks: [],
      recordings: [],
      policies: [],
      canonical: {
        recordingSessions: await this.repositories.recordingSessions.list(domainId),
        normalizedTimelines: await this.repositories.normalizedTimelines.list(domainId),
        signalRegistries: await this.repositories.signalRegistries.list(domainId),
        learnedTaskModels: await this.repositories.learnedTaskModels.list(domainId),
        policyGraphs: await this.repositories.policyGraphs.list(domainId)
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

  async getRecordingSession(recordingId: string, projectId?: string | null): Promise<RecordingSession> {
    await this.ready;
    if (projectId) await this.loadProjectRecordings(projectId);
    const recording = await this.repositories.recordingSessions.get(recordingId);
    if (!recording) throw new Error(`Unknown Automation Studio recording: ${recordingId}`);
    return recording;
  }

  async listRecordingSummaries(input: { page?: unknown; pageSize?: unknown } = {}): Promise<RecordingSummaryList> {
    await this.ready;
    const page = normalizePositiveInteger(input.page, 1, 1, 1_000_000);
    const pageSize = normalizePositiveInteger(input.pageSize, 10, 1, 100);
    const { projects } = await this.listProjects();
    const summaries: RecordingSummaryItem[] = [];
    const seen = new Set<string>();

    if (this.objectStore) {
      for (const recording of await this.repositories.recordingSessions.list()) {
        const projectId = typeof recording.metadata?.projectId === "string" ? recording.metadata.projectId : "";
        if (projectId) summaries.push(recordingSummaryFromSession(recording, projectId));
      }
    } else for (const project of projects) {
      if (this.projectRootDir) await this.loadProjectRecordings(project.id);
      const recordingIds = this.projectRootDir
        ? (await this.readRecordingIndex(project.id)).recordings.map((item) => item.recordingId)
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
    const recording = input.projectId && this.objectStore
      ? { ...created, metadata: { ...(created.metadata ?? {}), projectId: input.projectId } }
      : created;
    await this.repositories.recordingSessions.put(recording);
    if (input.projectId) await this.writeProjectRecordingSession(input.projectId, recording);
    return recording;
  }

  async appendRecordingEvent(input: { projectId?: string | null; recordingId: string; entry: AppendRecordingEntryInput }): Promise<RecordingSession> {
    return await this.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      const recording = await this.getRecordingSession(input.recordingId, input.projectId);
      const next = appendRecordingEntry(recording, input.entry);
      await this.repositories.recordingSessions.put(next);
      if (input.projectId) await this.writeProjectRecordingSession(input.projectId, next);
      return next;
    });
  }

  async finalizeRecording(input: { projectId?: string | null; recordingId: string; endedAt?: number }): Promise<RecordingSession> {
    return await this.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      const recording = await this.getRecordingSession(input.recordingId, input.projectId);
      const finalized = finalizeRecordingSession(recording, input.endedAt);
      await this.repositories.recordingSessions.put(finalized);
      if (input.projectId) await this.writeProjectRecordingSession(input.projectId, finalized);
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
    const artifacts = await this.listPipelineArtifacts(input.projectId);
    const latestProposal = latestByGeneratedAt(artifacts.policyProposals.filter((proposal) => proposal.metadata?.recordingId === input.recordingId));
    const existingRecordingFlowProposals = artifacts.recordingFlowProposals.filter((proposal) => proposal.recordingId === input.recordingId && proposal.status !== "invalidated");
    const domainId = recording.environment.domainId;
    const expectsRecordingFlowProposal = Boolean(domainId && this.ioRuntime && this.nativeNodeRuntime?.listRecordingMappers(domainId).length);
    const latestRecordingFlowProposal = latestByGeneratedAt(existingRecordingFlowProposals);
    if (!input.force && latestProposal && recordingUpdatedAt(recording) <= latestProposal.generatedAt && (!expectsRecordingFlowProposal || (latestRecordingFlowProposal && recordingUpdatedAt(recording) <= latestRecordingFlowProposal.generatedAt))) {
      return {
        schemaVersion: "0.1",
        recordingId: input.recordingId,
        status: "skipped",
        proposal: latestProposal,
        ...(existingRecordingFlowProposals.length ? { recordingFlowProposals: existingRecordingFlowProposals } : {}),
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
        recordingFlowProposals = await this.createRecordingFlowProposals({ projectId: input.projectId, recordingId: input.recordingId });
      } catch (error) {
        issues.push(errorMessage(error, "Recording Flow proposals could not be created."));
      }
    }
    return {
      schemaVersion: "0.1",
      recordingId: input.recordingId,
      status: proposal ? "processed" : issues.length ? "partial" : "skipped",
      ...(normalizedTimeline ? { normalizedTimeline } : {}),
      ...(review ? { review } : {}),
      ...(miningRun ? { miningRun } : {}),
      ...(proposal ? { proposal } : {}),
      ...(recordingFlowProposals?.length ? { recordingFlowProposals } : {}),
      issues,
      generatedAt: Date.now()
    };
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
    return await this.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
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

  async deleteRecording(input: { projectId?: string | null; recordingId: string }): Promise<{ deletedRecordingId: string }> {
    await this.repositories.recordingSessions.delete(input.recordingId);
    if (input.projectId && this.projectRootDir) {
      await this.deleteProjectRecordingPipeline(input.projectId, input.recordingId);
      if (this.objectStore) await ProgramJsonStore.deletePath(this.recordingSessionDirectory(input.projectId, input.recordingId));
      else await rm(this.recordingSessionDirectory(input.projectId, input.recordingId), { recursive: true, force: true });
      await this.writeRecordingIndex(input.projectId, (index) => ({
        recordings: (index.recordings ?? []).filter((item) => item.recordingId !== input.recordingId),
        normalizedTimelines: (index.normalizedTimelines ?? []).filter((item) => item.recordingId !== input.recordingId)
      }));
    }
    return { deletedRecordingId: input.recordingId };
  }

  async appendRecordingNoteEntry(input: { projectId?: string | null; recordingId: string; text?: unknown; linkedEntryIds?: unknown; startOffsetMs?: unknown; endOffsetMs?: unknown }): Promise<RecordingSession> {
    return await this.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
      const recording = await this.getRecordingSession(input.recordingId, input.projectId);
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
    const mappings: NormalizationReviewArtifact["mappings"] = recording.timeline.map((entry) => ({
      rawEntryId: entry.id,
      normalizedEntryIds: normalized.timeline.filter((candidate) => candidate.id === entry.id || candidate.correlationId === entry.id || candidate.metadata?.normalizedFrom === entry.id).map((candidate) => candidate.id),
      status: "preserved" as const
    }));
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
    await this.writePipelineArtifact(input.projectId, "normalizationReviews", review.reviewId, review as unknown as JsonObject);
    return review;
  }

  async mineRecordingEvidence(input: { projectId: string; normalizedTimelineId?: string; recordingId?: string }): Promise<SignalMiningResult> {
    const timeline = input.normalizedTimelineId
      ? (await this.repositories.normalizedTimelines.get(input.normalizedTimelineId))
      : (await this.listProjectNormalizedTimelines(input.projectId)).find((item) => item.recordingId === input.recordingId);
    if (!timeline) throw new Error("Normalized timeline is required before mining.");
    const miningRunId = `mining.${safeSegment(timeline.normalizedTimelineId)}.${Date.now()}`;
    const actions = timeline.timeline.filter((entry) => entry.type === "action" || entry.type === "domain_event");
    const deltas = timeline.timeline.filter((entry) => entry.type === "state_delta");
    const facts = timeline.timeline.map((entry) => createEvidenceFact(miningRunId, timeline, entry, this.recordingDomains.get(String(entry.metadata?.domainId ?? ""))));
    const factsByEntryId = new Map(facts.map((fact) => [String(fact.source.entryId ?? ""), fact]));
    const observations = facts.flatMap((fact) => createEvidenceObservations(fact));
    const observationsByFactId = new Map<string, EvidenceObservation[]>();
    for (const observation of observations) {
      for (const factId of observation.factIds) {
        observationsByFactId.set(factId, [...(observationsByFactId.get(factId) ?? []), observation]);
      }
    }
    const descriptors = stateElementDescriptorsForTimeline(timeline, this.recordingDomains.list());
    const correlations = createStateActionCorrelations(miningRunId, timeline, actions, descriptors);
    const windows = actions.map((entry, index) => ({
      id: `window.${entry.id}`,
      kind: "immediate_post_action" as const,
      actionEntryId: entry.id,
      startOffsetMs: entry.monotonicOffsetMs,
      endOffsetMs: actions[index + 1]?.monotonicOffsetMs ?? timeline.timeline[timeline.timeline.length - 1]?.monotonicOffsetMs ?? entry.monotonicOffsetMs,
      sourceEvidence: [{ layer: "normalized_timeline" as const, artifactId: timeline.normalizedTimelineId, entryId: entry.id }]
    }));
    const actionEffects = actions.flatMap((action) => deltas
      .filter((delta) => delta.monotonicOffsetMs >= action.monotonicOffsetMs)
      .slice(0, 3)
      .flatMap((delta) => (delta as any).deltas?.map((stateDelta: any) => ({
        actionOccurrenceId: action.id,
        signalPath: formatStatePath(stateDelta.namespace, stateDelta.path),
        relationship: "possible_effect" as const,
        probability: 0.55,
        delayMs: { min: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs), median: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs), max: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs) },
        evidence: [{ layer: "normalized_timeline" as const, artifactId: timeline.normalizedTimelineId, entryId: delta.id, signalPath: formatStatePath(stateDelta.namespace, stateDelta.path) }]
      })) ?? []));
    const conditionCandidates = [...new Map(actionEffects.map((effect) => [effect.signalPath, effect])).values()].map((effect) => ({
      signalPath: effect.signalPath,
      role: "context_signal" as const,
      probability: 0.5,
      evidence: effect.evidence
    }));
    const claims = [
      ...correlations.map((correlation, index) => createCorrelationClaim(miningRunId, timeline, correlation, index, observations)),
      ...createTransitionClaims(miningRunId, timeline, actions, factsByEntryId, observationsByFactId)
    ];
    const result: SignalMiningResult = {
      schemaVersion: "0.1",
      miningRunId,
      normalizedTimelineId: timeline.normalizedTimelineId,
      evidenceFactIds: facts.map((fact) => fact.factId),
      evidenceObservationIds: observations.map((observation) => observation.observationId),
      stateActionCorrelationIds: correlations.map((correlation) => correlation.correlationId),
      evidenceClaimIds: claims.map((claim) => claim.claimId),
      facts,
      observations,
      correlations,
      claims,
      windows,
      actionEffects,
      conditionCandidates,
      issues: actions.length ? [] : ["No action/domain events were available to mine."],
      generatedAt: Date.now(),
      metadata: {
        recordingId: timeline.recordingId,
        ...(timeline.taskId !== undefined ? { taskId: timeline.taskId } : {})
      }
    };
    await this.writePipelineArtifacts(input.projectId, [
      ...facts.map((fact) => ({ kind: "evidenceFacts" as const, id: fact.factId, artifact: fact as unknown as JsonObject })),
      ...observations.map((observation) => ({ kind: "evidenceObservations" as const, id: observation.observationId, artifact: observation as unknown as JsonObject })),
      ...correlations.map((correlation) => ({ kind: "stateActionCorrelations" as const, id: correlation.correlationId, artifact: correlation as unknown as JsonObject })),
      ...claims.map((claim) => ({ kind: "evidenceClaims" as const, id: claim.claimId, artifact: claim as unknown as JsonObject })),
      { kind: "miningRuns" as const, id: result.miningRunId, artifact: result as unknown as JsonObject }
    ]);
    return result;
  }

  async learnTaskModel(input: { projectId: string; taskId?: string; miningRunId?: string }): Promise<LearnedTaskModel> {
    const miningRun = input.miningRunId
      ? await this.readPipelineArtifact<SignalMiningResult>(input.projectId, "miningRuns", input.miningRunId)
      : latestByGeneratedAt((await this.listPipelineArtifacts(input.projectId)).miningRuns);
    if (!miningRun) throw new Error("A mining run is required before learning a task model.");
    const model = createTaskProposalModelFromMiningRun(miningRun, input.taskId);
    await this.repositories.learnedTaskModels.put(model);
    await this.writePipelineArtifact(input.projectId, "learnedTaskModels", model.learnedTaskModelId, model as unknown as JsonObject);
    return model;
  }

  async proposePolicyFromModel(input: { projectId: string; learnedTaskModelId?: string; miningRunId?: string; recordingId?: string }): Promise<PolicyProposalArtifact> {
    let model = input.learnedTaskModelId
      ? await this.repositories.learnedTaskModels.get(input.learnedTaskModelId) ?? await this.readPipelineArtifact<LearnedTaskModel>(input.projectId, "learnedTaskModels", input.learnedTaskModelId)
      : null;
    const artifacts = await this.listPipelineArtifacts(input.projectId);
    if (!model && input.miningRunId) {
      const miningRun = artifacts.miningRuns.find((run) => run.miningRunId === input.miningRunId) ?? await this.readPipelineArtifact<SignalMiningResult>(input.projectId, "miningRuns", input.miningRunId);
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
      sourceEvidence: cluster.actionTemplate.sourceEvidence ?? [],
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
      proposalId: `proposal.${safeSegment(input.recordingId ?? model.sourceRecordings[0] ?? model.learnedTaskModelId)}`,
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
    const proposalRecordingId = typeof proposal.metadata?.recordingId === "string" ? proposal.metadata.recordingId : null;
    if (proposalRecordingId) await this.deleteProjectRecordingPolicyProposals(input.projectId, proposalRecordingId, proposal.proposalId);
    await this.writePipelineArtifact(input.projectId, "policyProposals", proposal.proposalId, proposal as unknown as JsonObject);
    return proposal;
  }

  async approvePolicyProposal(input: { projectId: string; proposalId: string; targetFlowId?: string; targetTaskId?: string; policyOverride?: PolicyGraph; requireExistingFlow?: boolean; requireExistingTask?: boolean }): Promise<PolicyProposalArtifact> {
    const proposal = await this.readPipelineArtifact<PolicyProposalArtifact>(input.projectId, "policyProposals", input.proposalId);
    if (!proposal) throw new Error("Unknown policy proposal.");
    const targetTaskId = input.targetTaskId?.trim() || proposal.policy.taskId;
    const policyInput = input.policyOverride ? { ...input.policyOverride, taskId: targetTaskId } : { ...proposal.policy, taskId: targetTaskId };
    const proposalForApproval: PolicyProposalArtifact = {
      ...proposal,
      policy: policyInput,
      patch: {
        ...(proposal.patch ?? {
          schemaVersion: "0.1" as const,
          patchId: `patch.${safeSegment(proposal.proposalId)}`,
          basePolicyId: null,
          mergeStrategy: "append_or_branch" as const,
          sourceRecordingIds: [String(proposal.metadata?.recordingId ?? "")].filter(Boolean),
          sourceMiningRunIds: [String(proposal.metadata?.miningRunId ?? "")].filter(Boolean),
          generatedAt: proposal.generatedAt
        }),
        targetTaskId,
        nodes: policyInput.nodes,
        edges: policyInput.edges
      }
    };
    const project = await this.findProject(input.projectId);
    const requestedFlowId = input.targetFlowId?.trim();
    const resolvedFlowId = requestedFlowId ?? `flow.${safeSegment(targetTaskId)}`;
    const existingFlow = await this.repositories.flows.get(resolvedFlowId);
    if (existingFlow && existingFlow.projectId !== input.projectId) throw new Error(`Flow ${requestedFlowId} belongs to another project.`);
    if (input.requireExistingFlow && !existingFlow) throw new Error("The target Flow is no longer available. Open an existing Flow or save this proposal as a new Flow.");
    const existingTask = input.targetTaskId ? await this.getProjectArtifact(input.projectId, "task", targetTaskId).then((artifact) => artifact as AutomationStudioTaskArtifact).catch(() => null) : null;
    if (input.requireExistingTask && !existingTask) throw new Error("The legacy target is no longer available. Select an existing canonical Flow or save this proposal as a new Flow.");
    const existingPolicyId = typeof existingFlow?.metadata?.policyId === "string" ? existingFlow.metadata.policyId : typeof existingTask?.metadata?.policyId === "string" ? existingTask.metadata.policyId : undefined;
    const existingPolicy = existingPolicyId ? await this.repositories.policyGraphs.get(existingPolicyId).catch(() => null) : null;
    const mergedPolicy = input.policyOverride
      ? withPolicyOutgoingEdges({
        ...policyInput,
        policyId: existingPolicy?.policyId ?? policyInput.policyId,
        taskId: targetTaskId,
        sourceEvidence: uniqueEvidenceReferences([...(existingPolicy?.sourceEvidence ?? []), ...(policyInput.sourceEvidence ?? proposal.policy.sourceEvidence ?? [])]),
        generatedMetadata: {
          ...(policyInput.generatedMetadata ?? proposal.policy.generatedMetadata),
          generatedAt: Date.now()
        },
        metadata: {
          ...(existingPolicy?.metadata ?? {}),
          ...(policyInput.metadata ?? {}),
          proposalId: proposal.proposalId,
          sourceRecordingIds: uniqueStrings([
            ...asStringArray(existingPolicy?.metadata?.sourceRecordingIds),
            ...asStringArray(policyInput.metadata?.sourceRecordingIds),
            String(proposal.metadata?.recordingId ?? "")
          ])
        }
      })
      : mergeProposalPatchIntoPolicy(existingPolicy, proposalForApproval);
    const approvedAt = Date.now();
    await this.repositories.policyGraphs.put(mergedPolicy);
    await new ProgramJsonStore<JsonObject>(this.projectFile(input.projectId, "policies", `${safeSegment(mergedPolicy.policyId)}.json`), () => ({})).write({ policy: mergedPolicy as unknown as JsonObject });
    const flowInput: Parameters<typeof policyGraphToAutomationStudioFlow>[1] = {
      flowId: existingFlow?.flowId ?? resolvedFlowId,
      existingFlow: existingFlow ? canonicalFlowDocument(existingFlow) : null,
      proposalId: proposal.proposalId
    };
    if (typeof proposal.metadata?.recordingId === "string") flowInput.recordingId = proposal.metadata.recordingId;
    const projected = policyGraphToAutomationStudioFlow(mergedPolicy, flowInput);
    const baseFlow = existingFlow ?? createBlankAutomationStudioFlowArtifact({ flowId: projected.flowId, projectId: input.projectId, name: existingTask?.name ?? humanTaskName(mergedPolicy.taskId), description: proposal.summary, scope: flowScopeForProject(project), origin: "recorded" });
    const savedFlow = await this.saveFlow({ projectId: input.projectId, flow: {
      ...baseFlow,
      name: existingFlow?.name ?? existingTask?.name ?? humanTaskName(mergedPolicy.taskId),
      description: proposal.summary,
      nodes: projected.nodes,
      edges: projected.edges,
      evidenceReferences: uniqueEvidenceReferences([...(baseFlow.evidenceReferences ?? []), ...(mergedPolicy.sourceEvidence ?? [])]),
      publication: { status: "draft" },
      metadata: { ...(baseFlow.metadata ?? {}), source: "policy_proposal", policyId: mergedPolicy.policyId, policyTaskId: mergedPolicy.taskId, sourceRecordingIds: asStringArray(mergedPolicy.metadata?.sourceRecordingIds), lastProposalId: proposal.proposalId, ...(typeof proposal.metadata?.recordingId === "string" ? { lastRecordingId: proposal.metadata.recordingId } : {}) }
    } });
    const approved = { ...proposalForApproval, policy: mergedPolicy, status: "approved" as const, approvedAt, metadata: { ...(proposalForApproval.metadata ?? {}), approvedFlowId: savedFlow.flowId } };
    await this.writePipelineArtifact(input.projectId, "policyProposals", approved.proposalId, approved as unknown as JsonObject);
    return approved;
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
    await this.writePipelineArtifact(input.projectId, "replayResults", result.replayId, result as unknown as JsonObject);
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
    return await this.withRecordingMutationLock(input.projectId, input.recordingId, async () => {
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
    const artifacts = await this.readLegacyProjectArtifacts(projectId);
    const tasksWithGraphs = await this.embedTaskGraphs(projectId, artifacts.tasks, artifacts.flows);
    return {
      tasks: tasksWithGraphs,
      routines: artifacts.routines,
      configs: artifacts.configs,
      flows: artifacts.flows
    };
  }

  /** Lists canonical Flows together with read-only legacy Task/Routine adapters. */
  async listFlows(projectId: string): Promise<AutomationStudioFlowCatalogEntry[]> {
    const project = await this.findProject(projectId);
    const [canonicalFlows, legacyArtifacts] = await Promise.all([
      this.listCanonicalFlowArtifacts(projectId),
      this.readLegacyProjectArtifacts(projectId)
    ]);
    const catalog = resolveAutomationStudioFlowCatalog({
      projectId,
      scope: flowScopeForProject(project),
      canonicalFlows,
      legacyArtifacts
    });
    const invalidated = (await this.readRecordingFlowProposals(projectId, true)).filter((proposal) => proposal.status === "invalidated");
    return catalog.map((entry) => {
      const warnings = invalidated.filter((proposal) => proposal.invalidation?.affectedFlowIds.includes(entry.flow.flowId)).map((proposal) => ({ proposalId: proposal.proposalId, reasons: proposal.invalidation?.reasons ?? [] }));
      return warnings.length ? { ...entry, flow: { ...entry.flow, metadata: { ...(entry.flow.metadata ?? {}), recordingProposalWarnings: warnings } } } : entry;
    });
  }

  async createFlow(input: { projectId: string; name?: unknown; description?: unknown; flowId?: string }): Promise<AutomationStudioFlowArtifact> {
    const project = await this.findProject(input.projectId);
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Flow name is required.");
    const flowId = typeof input.flowId === "string" && input.flowId.trim() ? input.flowId.trim() : `flow.${randomUUID()}`;
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
    await this.findProject(projectId);
    const flow = await this.repositories.flows.get(flowId);
    if (!flow || flow.projectId !== projectId) throw new Error(`Unknown Automation Studio Flow: ${flowId}`);
    return flow;
  }

  async saveFlow(input: { projectId: string; flow: AutomationStudioFlowArtifact }): Promise<AutomationStudioFlowArtifact> {
    return await this.saveFlowInternal(input, false);
  }

  private async saveFlowInternal(input: { projectId: string; flow: AutomationStudioFlowArtifact }, allowPublicationMutation: boolean): Promise<AutomationStudioFlowArtifact> {
    const project = await this.findProject(input.projectId);
    if (input.flow.projectId !== project.id) throw new Error("Flow projectId must match the target project.");
    const expectedScope = flowScopeForProject(project);
    if (!sameFlowScope(input.flow.scope, expectedScope)) throw new Error("Flow scope must match the target project scope.");
    const existing = await this.repositories.flows.get(input.flow.flowId);
    if (existing && existing.projectId !== project.id) throw new Error(`Flow ID is already owned by project ${existing.projectId}.`);
    if (existing && existing.source.mode !== input.flow.source.mode) throw new Error("Flow source ownership changes require an explicit conversion endpoint.");
    if (existing) assertPublicationMutationAllowed(existing, input.flow, allowPublicationMutation);
    else if (!allowPublicationMutation && (input.flow.publication.status === "published" || input.flow.publication.status === "deprecated" || input.flow.publicationHistory?.length)) throw new Error("Published Flow state can only be created through publishFlow().");
    const now = Date.now();
    let flow: AutomationStudioFlowArtifact = {
      ...input.flow,
      createdAt: existing?.createdAt ?? input.flow.createdAt ?? now,
      updatedAt: now
    };
    if (existing) flow = recordManualRecordingProposalChanges(existing, flow, now);
    const validation = validateAutomationStudioFlow(flow);
    if (!validation.ok) throw new Error(`Invalid Automation Studio Flow: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    if (!verifyCodeOwnedFlowCompilation(flow)) throw new Error("Code-owned Flow IR does not match its compiler digest.");
    return await this.repositories.flows.put(flow);
  }

  async compileAndSaveFlowSource(input: { projectId: string; flowId: string; moduleId: string; sourceText: string }): Promise<{ compilation: AutomationStudioFlowCompilation; flow?: AutomationStudioFlowArtifact }> {
    const existing = await this.getFlow(input.projectId, input.flowId);
    const compilation = compileFlowSource(input.sourceText, { projectId: input.projectId, moduleId: input.moduleId, ...(this.nativeNodeRuntime ? { registry: this.nativeNodeRuntime.sdk.nodes } : {}) });
    if (!compilation.ok) return { compilation };
    if (compilation.plan.flow.flowId !== existing.flowId) throw new Error("Compiled Flow ID must match the Flow being converted.");
    if (!sameFlowScope(compilation.plan.flow.scope, existing.scope)) throw new Error("Compiled Flow scope must match the project scope.");
    const flow: AutomationStudioFlowArtifact = { ...compilation.plan.flow, projectId: existing.projectId, createdAt: existing.createdAt, updatedAt: Date.now(), publication: { status: "draft" as const }, ...(existing.publicationHistory ? { publicationHistory: existing.publicationHistory } : {}) };
    await this.repositories.flows.put(flow);
    return { compilation, flow };
  }

  async convertFlowToVisual(input: { projectId: string; flowId: string }): Promise<AutomationStudioFlowArtifact> {
    const existing = await this.getFlow(input.projectId, input.flowId);
    if (existing.source.mode !== "code") return existing;
    const flow = convertCodeOwnedFlowToVisual(existing);
    await this.repositories.flows.put(flow);
    return flow;
  }

  async deleteFlow(input: { projectId: string; flowId: string }): Promise<{ deletedFlowId: string }> {
    await this.getFlow(input.projectId, input.flowId);
    await this.repositories.flows.delete(input.flowId);
    return { deletedFlowId: input.flowId };
  }

  /** Publishes an immutable interface snapshot; Call Flow execution is introduced later. */
  async publishFlow(input: { projectId: string; flowId: string; version: string; flowDigest?: string; publishedBy?: string; changelog?: string }): Promise<AutomationStudioFlowArtifact> {
    const flow = await this.getFlow(input.projectId, input.flowId);
    const now = Date.now();
    const availablePublications = await this.listFlowPublicationRecords();
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
    const saved = await this.saveFlowInternal({
      projectId: input.projectId,
      flow: published
    }, true);
    await this.repositories.flowPublications.put({ schemaVersion: "0.1", publicationId, projectId: input.projectId, flowId: flow.flowId, version: input.version, status: "published", snapshot, createdAt: now });
    return saved;
  }

  async listFlowPublications(projectId: string, flowId?: string): Promise<AutomationStudioFlowPublicationRecord[]> {
    await this.findProject(projectId);
    return (await this.listFlowPublicationRecords()).filter((record) => record.projectId === projectId && (!flowId || record.flowId === flowId)).sort((left, right) => right.createdAt - left.createdAt);
  }

  async deprecateFlowPublication(input: { projectId: string; flowId: string; version: string; reason?: string }): Promise<AutomationStudioFlowPublicationRecord> {
    const flow = await this.getFlow(input.projectId, input.flowId);
    const publicationId = flowPublicationId(input.flowId, input.version);
    const records = await this.listFlowPublicationRecords();
    const current = records.find((record) => record.publicationId === publicationId);
    if (!current) throw new Error(`Unknown published Flow version: ${input.flowId}@${input.version}`);
    if (current.projectId !== input.projectId) throw new Error("Published Flow version belongs to another project.");
    if (current.status === "deprecated") return current;
    const deprecated: AutomationStudioFlowPublicationRecord = { ...current, status: "deprecated", deprecatedAt: Date.now(), ...(input.reason?.trim() ? { deprecationReason: input.reason.trim() } : {}) };
    await this.repositories.flowPublications.put(deprecated);
    if ((flow.publication.status === "published" || flow.publication.status === "deprecated") && flow.publication.version === input.version) {
      await this.repositories.flows.put({ ...flow, publication: { ...flow.publication, status: "deprecated" }, updatedAt: Date.now() });
    }
    return deprecated;
  }

  async inspectFlowDependencies(projectId: string, flowId: string): Promise<{ dependencies: AutomationStudioFlowPublicationRecord[]; usedBy: Array<{ projectId: string; flowId: string; flowName: string; version: string; nodeId: string }>; availableUpgrades: Array<{ nodeId: string; flowId: string; currentVersion: string; versions: string[] }> }> {
    const flow = await this.getFlow(projectId, flowId);
    const records = await this.listFlowPublicationRecords();
    const calls = flow.nodes.flatMap((node) => { const call = getCallFlowConfiguration(node); return call ? [{ node, call }] : []; });
    const dependencies = calls.flatMap(({ call }) => records.filter((record) => record.flowId === call.target.flowId && record.version === call.target.version));
    const allFlows = await this.repositories.flows.list();
    const usedBy = allFlows.filter((candidate) => sameFlowScope(candidate.scope, flow.scope)).flatMap((candidate) => candidate.nodes.flatMap((node) => { const call = getCallFlowConfiguration(node); return call?.target.flowId === flowId ? [{ projectId: candidate.projectId, flowId: candidate.flowId, flowName: candidate.name, version: call.target.version, nodeId: node.id }] : []; }));
    const availableUpgrades = calls.map(({ node, call }) => ({ nodeId: node.id, flowId: call.target.flowId, currentVersion: call.target.version, versions: records.filter((record) => record.flowId === call.target.flowId && record.status === "published" && record.version !== call.target.version).map((record) => record.version).sort(compareSemanticVersions).reverse() })).filter((item) => item.versions.length);
    return { dependencies, usedBy, availableUpgrades };
  }

  /** Public, immutable Flow versions visible as composite-node definitions in this project's scope. */
  async listPublishedFlowNodes(projectId: string) {
    const project = await this.findProject(projectId);
    const scope = flowScopeForProject(project);
    return (await this.listFlowPublicationRecords())
      .filter((record) => record.status === "published")
      .map((record) => record.snapshot)
      .filter((snapshot) => sameFlowScope(snapshot.scope, scope) || (scope.kind === "domain" && snapshot.scope.kind === "global" && (snapshot.requiredRuntimeCapabilities ?? []).length === 0))
      .map(projectPublishedFlowSnapshotToNodeDefinition);
  }

  async listNativeNodeDefinitions(projectId: string) {
    const project = await this.findProject(projectId); const scope = flowScopeForProject(project);
    const native = (this.nativeNodeRuntime?.listDefinitions() ?? []).filter((definition) => definition.availability.kind === "both" || (definition.availability.kind === "global" && scope.kind === "global") || (definition.availability.kind === "domain" && scope.kind === "domain" && definition.availability.domainId === scope.domainId));
    return [...native, ...(await this.listRecordingDerivedNodeDefinitions(projectId))];
  }

  /** Runs importer-owned semanticizers over immutable recording entries. */
  async createRecordingFlowProposals(input: { projectId: string; recordingId: string; mapperId?: string }): Promise<RecordingFlowProposalArtifact[]> {
    const project = await this.findProject(input.projectId);
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const domainId = recording.environment.domainId ?? project.domainId ?? null;
    if (!domainId) return [];
    if (!this.nativeNodeRuntime) throw new Error("Recording proposal generation requires a bound importer runtime.");
    if (!this.ioRuntime) throw new Error("Recording proposal generation requires a bound IO registry.");
    const mappers = this.nativeNodeRuntime.listRecordingMappers(domainId).filter((item) => !input.mapperId || item.definition.id === input.mapperId);
    if (input.mapperId && !mappers.length) throw new Error(`Unknown recording mapper for ${domainId}: ${input.mapperId}`);
    const proposals: RecordingFlowProposalArtifact[] = [];
    for (const mapper of mappers) {
      const controller = new AbortController();
      const candidates: RecordingFlowActionCandidate[] = [];
      for (const entry of recording.timeline) {
        const observation: AutomationStudioRecordingMapperObservation = {
          observationId: entry.id,
          recordingId: recording.recordingId,
          domainId,
          type: entry.type,
          timestamp: entry.timestamp,
          payload: recordingEntryPayload(entry),
          metadata: { ...(entry.metadata ?? {}) }
        };
        const mapped = await mapper.implementation(observation, { signal: controller.signal });
        const mappedCandidates = !mapped ? [] : "candidates" in mapped ? mapped.candidates : [mapped];
        for (const candidate of mappedCandidates) {
          candidates.push(this.validateRecordingCandidate({ candidate, entryId: entry.id, recordingId: recording.recordingId, domainId, ...(mapper.definition.outputIds ? { mapperOutputIds: mapper.definition.outputIds } : {}) }));
        }
      }
      if (!candidates.length) continue;
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
      await this.writePipelineArtifact(project.id, "recordingFlowProposals", proposal.proposalId, proposal as unknown as JsonObject);
      proposals.push(proposal);
    }
    return proposals;
  }

  async reviewRecordingFlowProposal(input: {
    projectId: string;
    proposalId: string;
    decision: "approved" | "rejected";
    notes?: string;
    reviewerId?: string;
    destination?: { kind: "flow"; flowId?: string; name?: string } | { kind: "node"; visibility: "private" | "public" };
  }): Promise<{ proposal: RecordingFlowProposalArtifact; flow?: AutomationStudioFlowArtifact }> {
    const original = await this.readPipelineArtifact<RecordingFlowProposalArtifact>(input.projectId, "recordingFlowProposals", input.proposalId);
    if (!original) throw new Error(`Unknown recording Flow proposal: ${input.proposalId}`);
    if (original.status !== "proposed") throw new Error(`Recording Flow proposal has already been reviewed (${original.status}).`);
    const checked = await this.validateRecordingFlowProposal(input.projectId, original);
    if (checked.status === "invalidated") throw new Error(`Recording Flow proposal is invalidated: ${checked.invalidation?.reasons.join(", ")}`);
    const now = Date.now();
    if (input.decision === "rejected") {
      const rejected: RecordingFlowProposalArtifact = { ...checked, status: "rejected", review: { decision: "rejected", reviewedAt: now, ...(input.reviewerId ? { reviewerId: input.reviewerId } : {}), ...(input.notes ? { notes: input.notes } : {}) }, updatedAt: now };
      await this.writePipelineArtifact(input.projectId, "recordingFlowProposals", rejected.proposalId, rejected as unknown as JsonObject);
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
      flow = await this.saveFlow({ projectId: input.projectId, flow: appendRecordingProposalToFlow(flow, checked) });
      destination = { kind: "flow", flowId: flow.flowId, created };
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
    await this.writePipelineArtifact(input.projectId, "recordingFlowProposals", approved.proposalId, approved as unknown as JsonObject);
    return { proposal: approved, ...(flow ? { flow } : {}) };
  }

  async listRecordingDerivedNodeDefinitions(projectId: string): Promise<AutomationStudioNodeDefinition[]> {
    const project = await this.findProject(projectId);
    const state = await this.readProjectIndex();
    const scopedProjectIds = state.projects.filter((candidate) => (candidate.domainId ?? null) === (project.domainId ?? null)).map((candidate) => candidate.id);
    const proposals = (await Promise.all(scopedProjectIds.map(async (candidateProjectId) => (await this.readRecordingFlowProposals(candidateProjectId, true)).filter((proposal) => candidateProjectId === projectId || (proposal.review?.destination?.kind === "node" && proposal.review.destination.visibility === "public"))))).flat();
    return proposals.filter((proposal) => proposal.status === "approved" && proposal.review?.destination?.kind === "node").flatMap((proposal) => proposal.approvedDefinitions ?? []);
  }

  async inspectFlowMigration(projectId: string): Promise<AutomationStudioFlowMigrationInspection> {
    const project = await this.findProject(projectId);
    const [canonicalFlows, legacyArtifacts] = await Promise.all([
      this.listCanonicalFlowArtifacts(projectId),
      this.readLegacyProjectArtifacts(projectId)
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
    await this.findProject(projectId);
    const [state, artifacts, canonicalFlows, migration] = await Promise.all([
      this.readLegacyRetirementState(projectId),
      this.readLegacyProjectArtifacts(projectId),
      this.listCanonicalFlowArtifacts(projectId),
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
    const current = await this.readLegacyRetirementState(input.projectId);
    if (current.phase === "write_locked") throw new Error("Legacy retirement evidence is immutable after writes are locked.");
    const next: AutomationStudioLegacyRetirementState = {
      ...current,
      ...(input.importerEvidence ? { importerEvidence: structuredClone(input.importerEvidence) } : {}),
      ...(input.intentionallyDeferred ? { intentionallyDeferred: structuredClone(input.intentionallyDeferred) } : {}),
      ...(input.importerCoverageAcknowledged !== undefined ? { importerCoverageAcknowledged: input.importerCoverageAcknowledged } : {}),
      updatedAt: Date.now()
    };
    await this.writeLegacyRetirementState(next);
    await this.appendLegacyRetirementAudit(input.projectId, "evidence_updated", { importerCount: next.importerEvidence.length, deferredCount: next.intentionallyDeferred.length, importerCoverageAcknowledged: next.importerCoverageAcknowledged });
    return await this.inspectLegacyRetirement(input.projectId);
  }

  async exportLegacyProject(projectId: string): Promise<AutomationStudioLegacyBackup> {
    return await this.ensureLegacyBackup(projectId);
  }

  async verifyLegacyBackup(projectId: string, backupId: string): Promise<AutomationStudioLegacyRetirementReport> {
    const backup = await this.readLegacyBackup(projectId, backupId);
    if (!backup) throw new Error(`Unknown legacy backup: ${backupId}`);
    if (legacyArtifactsDigest(backup.artifacts) !== backup.digest) throw new Error(`Legacy backup ${backupId} failed digest verification.`);
    const current = await this.readLegacyRetirementState(projectId);
    const next = { ...current, verifiedBackupId: backup.backupId, backupRestoreVerifiedAt: Date.now(), updatedAt: Date.now() };
    await this.writeLegacyRetirementState(next);
    await this.appendLegacyRetirementAudit(projectId, "backup_verified", { backupId: backup.backupId, digest: backup.digest });
    return await this.inspectLegacyRetirement(projectId);
  }

  async sealLegacyWrites(input: { projectId: string; expectedSchemaVersion: string }): Promise<AutomationStudioLegacyRetirementReport> {
    if (input.expectedSchemaVersion !== AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION) throw new Error(`Legacy write lock requires expected schema ${AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION}.`);
    const report = await this.inspectLegacyRetirement(input.projectId);
    if (!report.canLockWrites) throw new Error(`Legacy writes cannot be locked: ${report.criteria.filter((item) => !item.satisfied).map((item) => item.id).join(", ")}.`);
    if (report.state.phase === "write_locked") return report;
    const now = Date.now();
    await this.writeLegacyRetirementState({ ...report.state, projectSchemaVersion: AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION, phase: "write_locked", sealedAt: now, updatedAt: now });
    await this.appendLegacyRetirementAudit(input.projectId, "writes_locked", { projectSchemaVersion: AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION });
    return await this.inspectLegacyRetirement(input.projectId);
  }

  async listLegacyRetirementAudit(projectId: string): Promise<AutomationStudioLegacyRetirementAuditEvent[]> {
    await this.findProject(projectId);
    return await this.readLegacyRetirementAudit(projectId);
  }

  async planFlowMigrationRollback(projectId: string, migrationId: string): Promise<AutomationStudioFlowMigrationRollbackPlan> {
    const ledger = await this.repositories.flowMigrationLedgers.get(migrationId);
    if (!ledger || ledger.projectId !== projectId) throw new Error(`Unknown Flow migration: ${migrationId}`);
    if (ledger.rolledBackAt) return { schemaVersion: "0.1", projectId, migrationId, backupId: ledger.backupId, status: "applied", flowIds: [], blockers: [], generatedAt: Date.now() };
    const backup = await this.readLegacyBackup(projectId, ledger.backupId);
    const blockers: string[] = [];
    if (!backup || legacyArtifactsDigest(backup.artifacts) !== backup.digest) blockers.push(`Backup ${ledger.backupId} is missing or invalid.`);
    const flowIds: string[] = [];
    for (const outcome of ledger.outcomes.filter((item) => item.status === "created")) {
      const flow = await this.repositories.flows.get(outcome.flowId);
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
    for (const flowId of plan.flowIds) await this.repositories.flows.delete(flowId);
    const ledger = await this.repositories.flowMigrationLedgers.get(migrationId);
    if (ledger) await this.repositories.flowMigrationLedgers.put({ ...ledger, rolledBackAt: Date.now(), updatedAt: Date.now() });
    await this.appendLegacyRetirementAudit(projectId, "rollback_applied", { migrationId, backupId: plan.backupId, flowIds: plan.flowIds });
    return { ...plan, status: "applied", generatedAt: Date.now() };
  }

  async migrateFlows(projectId: string): Promise<AutomationStudioFlowMigrationLedger> {
    const backup = await this.ensureLegacyBackup(projectId);
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
        const saved = await this.saveFlow({ projectId, flow: entry.flow });
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
    await this.appendLegacyRetirementAudit(projectId, "migration_applied", { migrationId: ledger.migrationId, backupId: ledger.backupId, status: ledger.status, createdFlowIds: outcomes.filter((item) => item.status === "created").map((item) => item.flowId) });
    return savedLedger;
  }

  async saveProjectArtifact(input: { projectId: string; kind: AutomationStudioProjectArtifactKind; artifact: unknown }): Promise<unknown> {
    await this.findProject(input.projectId);
    if (input.kind !== "config") await this.assertLegacyWriteAllowed(input.projectId);
    if (!input.artifact || typeof input.artifact !== "object" || Array.isArray(input.artifact)) throw new Error("Artifact object is required.");
    const artifact = input.artifact as Record<string, unknown>;
    const id = this.projectArtifactId(input.kind, artifact);
    const now = Date.now();
    const withTimestamps = {
      ...artifact,
      schemaVersion: typeof artifact.schemaVersion === "string" ? artifact.schemaVersion : "0.1",
      createdAt: typeof artifact.createdAt === "number" ? artifact.createdAt : now,
      updatedAt: now
    } as unknown as JsonObject;
    await new ProgramJsonStore<JsonObject>(this.projectArtifactFile(input.projectId, input.kind, id), () => ({})).write(withTimestamps);
    return withTimestamps;
  }

  async getProjectArtifact(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): Promise<unknown> {
    await this.findProject(projectId);
    const artifact = await new ProgramJsonStore<JsonObject>(this.projectArtifactFile(projectId, kind, artifactId), () => ({})).read();
    if (!Object.keys(artifact).length) throw new Error(`Unknown Automation Studio ${kind}: ${artifactId}`);
    return artifact;
  }

  async deleteProjectArtifact(input: { projectId: string; kind: AutomationStudioProjectArtifactKind; artifactId: string; deleteOwnedArtifacts?: boolean }): Promise<{ deleted: boolean; projectId: string; kind: AutomationStudioProjectArtifactKind; artifactId: string; deletedArtifactIds: string[] }> {
    await this.findProject(input.projectId);
    if (input.kind !== "config") await this.assertLegacyWriteAllowed(input.projectId);
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
          await this.deleteProjectArtifactFile(input.projectId, "flow", flowId);
          deletedArtifactIds.add(`flow:${flowId}`);
        }
        const policyId = typeof task.metadata?.policyId === "string" ? task.metadata.policyId : null;
        if (policyId) {
          await this.repositories.policyGraphs.delete(policyId).catch(() => false);
          if (this.projectRootDir) {
            const policyPath = this.projectFile(input.projectId, "policies", `${safeSegment(policyId)}.json`);
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
          await this.deleteProjectArtifactFile(input.projectId, "flow", flowId);
          deletedArtifactIds.add(`flow:${flowId}`);
        }
      }
    }
    await this.deleteProjectArtifactFile(input.projectId, input.kind, artifactId);
    return { deleted: true, projectId: input.projectId, kind: input.kind, artifactId, deletedArtifactIds: [...deletedArtifactIds] };
  }

  /** @deprecated Creates an owner-bound compatibility Flow. Use createFlow() for new work. */
  async createDefaultFlow(input: { projectId: string; ownerKind: "task" | "routine"; ownerId: string; name: string; description?: string }): Promise<AutomationStudioFlowDocument> {
    await this.assertLegacyWriteAllowed(input.projectId);
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
    await this.loadProjectRecordings(projectId);
    const index = await this.readRecordingIndex(projectId);
    const timelines: NormalizedTimeline[] = [];
    for (const item of index.normalizedTimelines ?? []) {
      const timeline = await this.repositories.normalizedTimelines.get(item.normalizedTimelineId);
      if (timeline) timelines.push(timeline);
    }
    return timelines;
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
    const canonical = input.projectId && input.flowId ? await this.repositories.flows.get(input.flowId) : undefined;
    if (canonical && canonical.projectId !== input.projectId) throw new Error(`Unknown Automation Studio Flow: ${input.flowId}`);
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

  async runRuntimeSession(input: {
    projectId?: string | null;
    runId?: string;
    flow?: AutomationStudioFlowDocument;
    flowId?: string;
    inputs?: JsonObject;
    maxSteps?: number;
    authorizedDomainIds?: string[];
  }): Promise<AutomationStudioRuntimeSession> {
    const existing = input.projectId && input.runId ? await this.getRuntimeSession(input.projectId, input.runId) : null;
    const startInput: Parameters<AutomationStudioService["startRuntimeSession"]>[0] = {};
    if (input.projectId !== undefined) startInput.projectId = input.projectId;
    if (input.flow !== undefined) startInput.flow = input.flow;
    if (input.flowId !== undefined) startInput.flowId = input.flowId;
    if (input.inputs !== undefined) startInput.inputs = input.inputs;
    if (input.authorizedDomainIds !== undefined) startInput.authorizedDomainIds = input.authorizedDomainIds;
    const session = existing ?? await this.startRuntimeSession(startInput);
    const startedAt = Date.now();
    const graphOptions: Parameters<typeof runAutomationStudioGraph>[1] = {
      inputs: (input.inputs ?? session.metadata?.inputs ?? {}) as Record<string, any>
    };
    if (this.ioRuntime) {
      graphOptions.effectDispatcher = createIoPolicyEffectDispatcher(this.ioRuntime.io, this.ioRuntime.domainId);
      graphOptions.runtimeCapabilities = ["policy-output", "io"];
      const requestedDomainIds = uniqueStrings(input.authorizedDomainIds ?? asStringArray(session.metadata?.authorizedDomainIds));
      if (this.ioRuntime.domainId) graphOptions.authorizedDomainIds = requestedDomainIds.filter((domainId) => domainId === this.ioRuntime!.domainId);
    }
    if (this.nativeNodeRuntime) graphOptions.runtimeCapabilities = [...new Set([...(graphOptions.runtimeCapabilities ?? []), ...this.nativeNodeRuntime.getRuntimeCapabilities()])];
    if (this.nativeNodeRuntime) graphOptions.nativeNodeExecutor = ({ node, inputs, signal }) => this.nativeNodeRuntime!.execute(node, inputs, signal);
    if (input.maxSteps !== undefined) graphOptions.maxSteps = input.maxSteps;
    const canonical = input.projectId && session.metadata?.canonicalFlow === true ? await this.repositories.flows.get(session.flowId) : undefined;
    if (canonical?.source.mode === "code" && !verifyCodeOwnedFlowCompilation(canonical)) throw new Error("Code-owned Flow compilation is stale or invalid; execution refused.");
    const runtimeCanonical = canonical && input.projectId ? await this.materializeRecordingDerivedFlow(input.projectId, canonical) : canonical;
    const runtimeFlow = input.projectId ? await this.materializeRecordingDerivedDocument(input.projectId, session.flow) : session.flow;
    const trace = runtimeCanonical
      ? await runCanonicalAutomationStudioFlow(runtimeCanonical, await this.listPublishedFlowSnapshots(), graphOptions, (await this.listFlowPublicationRecords()).filter((record) => record.status === "deprecated").map((record) => `${record.flowId}@${record.version}`))
      : await runAutomationStudioGraph(runtimeFlow, graphOptions);
    const next: AutomationStudioRuntimeSession = {
      ...session,
      status: trace.status,
      startedAt: session.startedAt ?? startedAt,
      ...(trace.finishedAt !== undefined ? { finishedAt: trace.finishedAt } : {}),
      trace
    };
    if (input.projectId) await this.writeRuntimeSession(input.projectId, next);
    return next;
  }

  async getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> {
    await this.findProject(projectId);
    const stored = await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "runtime", "sessions", `${safeSegment(runId)}.json`), () => ({})).read();
    return stored.session as unknown as AutomationStudioRuntimeSession | undefined ?? null;
  }

  async listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]> {
    const index = await this.readRuntimeIndex(projectId);
    const sessions: AutomationStudioRuntimeSession[] = [];
    for (const item of index.sessions ?? []) {
      const session = await this.getRuntimeSession(projectId, item.runId);
      if (session) sessions.push(session);
    }
    return sessions.sort((left, right) => (right.startedAt ?? right.queuedAt) - (left.startedAt ?? left.queuedAt));
  }

  private validateRecordingCandidate(input: { candidate: AutomationStudioRecordingMapperCandidate; entryId: string; recordingId: string; domainId: string; mapperOutputIds?: string[] }): RecordingFlowActionCandidate {
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
    const sourceObservationIds = uniqueStrings([input.entryId, ...(input.candidate.sourceObservationIds ?? [])]);
    return {
      candidateId: `candidate.${safeSegment(input.entryId)}.${randomUUID()}`,
      sourceObservationIds,
      sourceInputIds,
      outputId,
      parameters: { ...(input.candidate.parameters ?? {}) },
      ...(confirmation ? { expectedConfirmation: { ...confirmation } } : {}),
      confidence: clampConfidence(input.candidate.confidence),
      evidence: input.candidate.evidence?.length ? structuredClone(input.candidate.evidence) : sourceObservationIds.map((observationId) => ({ layer: "recording" as const, artifactId: input.recordingId, entryId: observationId, observationId })),
      policyStateEligible: false,
      ...(input.candidate.label ? { label: input.candidate.label } : {}),
      ...(input.candidate.description ? { description: input.candidate.description } : {})
    };
  }

  private async readRecordingFlowProposals(projectId: string, revalidate: boolean): Promise<RecordingFlowProposalArtifact[]> {
    const index = await this.readPipelineIndex(projectId);
    const proposals = await this.readPipelineArtifactList<RecordingFlowProposalArtifact>(projectId, "recordingFlowProposals", (index.recordingFlowProposals ?? []).map((item) => item.proposalId));
    if (!revalidate) return proposals;
    const checked: RecordingFlowProposalArtifact[] = [];
    for (const proposal of proposals) {
      const next = await this.validateRecordingFlowProposal(projectId, proposal);
      if (next.status === "invalidated" && (proposal.status !== "invalidated" || JSON.stringify(proposal.invalidation?.reasons) !== JSON.stringify(next.invalidation?.reasons))) {
        await this.writePipelineArtifact(projectId, "recordingFlowProposals", next.proposalId, next as unknown as JsonObject);
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
    const flows = await this.listCanonicalFlowArtifacts(projectId);
    const affectedFlowIds = flows.filter((flow) => flow.nodes.some((node) => node.metadata?.recordingProposalId === proposal.proposalId || (proposal.approvedDefinitions ?? []).some((definition) => definition.id === node.definitionId))).map((flow) => flow.flowId);
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

  async listPipelineArtifacts(projectId: string): Promise<AutomationPipelineArtifacts> {
    const index = await this.readPipelineIndex(projectId);
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
    const recordingFlowProposals = await this.readRecordingFlowProposals(projectId, true);
    const replayResults = await this.readPipelineArtifactList<ReplayResultArtifact>(projectId, "replayResults", (index.replayResults ?? []).map((item) => item.replayId));
    return { normalizationReviews, miningRuns, evidenceFacts, evidenceObservations, stateActionCorrelations, evidenceClaims, learnedTaskModels, policyProposals, recordingFlowProposals, replayResults };
  }

  async listProjects(domainId?: string | null): Promise<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }> {
    const state = await this.readProjectIndex();
    const inferredScopes = await this.inferLegacyProjectScopes(state.projects);
    const projects = state.projects.map((project) => project.domainId === undefined && inferredScopes.has(project.id)
      ? { ...project, domainId: inferredScopes.get(project.id)! }
      : project);
    return {
      categories: this.sortCategories((state.categories ?? []).filter((category) => (category.domainId ?? null) === (domainId ?? null))),
      projects: projects
        .filter((project) => (project.domainId ?? null) === (domainId ?? null))
        .sort((left, right) => right.updatedAt - left.updatedAt)
    };
  }

  /** Infers a legacy project's domain only when its recordings agree on one domain. */
  private async inferLegacyProjectScopes(projects: AutomationStudioProject[]): Promise<Map<string, string>> {
    const legacyIds = new Set(projects.filter((project) => project.domainId === undefined).map((project) => project.id));
    if (!legacyIds.size) return new Map();
    const domainsByProject = new Map<string, Set<string>>();
    for (const recording of await this.repositories.recordingSessions.list()) {
      const projectId = typeof recording.metadata?.projectId === "string" ? recording.metadata.projectId : null;
      const domainId = recording.environment.domainId;
      if (!projectId || !domainId || !legacyIds.has(projectId)) continue;
      const domains = domainsByProject.get(projectId) ?? new Set<string>();
      domains.add(domainId);
      domainsByProject.set(projectId, domains);
    }
    return new Map([...domainsByProject].flatMap(([projectId, domains]) => domains.size === 1 ? [[projectId, [...domains][0]!]] : []));
  }

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
    if (this.objectStore && this.projectIndexStore) {
      const record: AutomationStudioProjectRecord = { ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} };
      await ProgramJsonStore.transaction(this.projectIndexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projectIndexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        await transaction.write(this.projectIndexStore!.filePath, { ...state, projects: [project, ...state.projects] });
        const { customHierarchyNodes, deletedHierarchyIds, workspacePrefs, ...manifest } = record;
        await transaction.write(this.projectFile(project.id, "manifest.json"), manifest);
        await transaction.write(this.projectFile(project.id, "hierarchy", "nodes.json"), { customHierarchyNodes });
        await transaction.write(this.projectFile(project.id, "hierarchy", "deleted.json"), { deletedHierarchyIds });
        await transaction.write(this.projectFile(project.id, "workspace", "preferences.json"), { workspacePrefs });
      });
      return project;
    }
    await this.writeProjectIndex((state) => ({ ...state, projects: [project, ...state.projects] }));
    await this.writeProjectRecord({ ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} });
    return project;
  }

  async updateProject(input: { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
    const projectId = String(input.projectId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : undefined;
    if (name !== undefined && !name) throw new Error("Project name is required.");
    if (this.objectStore && this.projectIndexStore) {
      return await ProgramJsonStore.transaction(this.projectIndexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projectIndexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        const current = state.projects.find((project) => project.id === projectId);
        if (!current) throw new Error(`Unknown Automation Studio project: ${projectId}`);
        const updated = {
          ...current,
          ...(name !== undefined ? { name } : {}),
          ...(typeof input.description === "string" ? { description: input.description.trim() } : {}),
          ...(input.categoryId !== undefined ? { categoryId: typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null } : {}),
          updatedAt: Date.now()
        };
        await transaction.write(this.projectIndexStore!.filePath, { ...state, projects: state.projects.map((project) => project.id === projectId ? updated : project) });
        await transaction.write(this.projectFile(projectId, "manifest.json"), updated);
        return updated;
      });
    }
    let updated: AutomationStudioProject | undefined;
    await this.writeProjectIndex((state) => ({
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
    const existing = await this.findProject(projectId);
    await this.writeProjectRecord({ ...existing, ...updated });
    return updated;
  }

  async deleteProject(projectId: string): Promise<{ deletedProjectId: string }> {
    if (this.objectStore && this.projectIndexStore) {
      await ProgramJsonStore.transaction(this.projectIndexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projectIndexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        if (!state.projects.some((project) => project.id === projectId)) throw new Error(`Unknown Automation Studio project: ${projectId}`);
        await transaction.write(this.projectIndexStore!.filePath, { ...state, projects: state.projects.filter((project) => project.id !== projectId) });
        await transaction.deletePath(this.projectDirectory(projectId));
      });
      return { deletedProjectId: projectId };
    }
    await this.findProject(projectId);
    await this.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.filter((project) => project.id !== projectId)
    }));
    if (this.projectRootDir) {
      if (this.objectStore) await ProgramJsonStore.deletePath(this.projectDirectory(projectId));
      else await rm(this.projectDirectory(projectId), { recursive: true, force: true });
    }
    return { deletedProjectId: projectId };
  }

  async createProjectCategory(input: { name?: unknown; domainId?: unknown }): Promise<AutomationStudioProjectCategory> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    const now = Date.now();
    const state = await this.readProjectIndex();
    const domainId = typeof input.domainId === "string" && input.domainId.trim() ? input.domainId.trim() : null;
    const category = { id: randomUUID(), name, domainId, order: nextCategoryOrder((state.categories ?? []).filter((item) => (item.domainId ?? null) === domainId)), createdAt: now, updatedAt: now };
    await this.writeProjectIndex((state) => ({ ...state, categories: [category, ...(state.categories ?? [])] }));
    return category;
  }

  async updateProjectCategory(input: { categoryId?: unknown; name?: unknown }): Promise<AutomationStudioProjectCategory> {
    const categoryId = String(input.categoryId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    let updated: AutomationStudioProjectCategory | undefined;
    await this.writeProjectIndex((state) => ({
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
    if (this.objectStore && this.projectIndexStore) {
      await ProgramJsonStore.transaction(this.projectIndexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projectIndexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        const projects = state.projects.map((project) => project.categoryId === categoryId ? { ...project, categoryId: null, updatedAt: Date.now() } : project);
        await transaction.write(this.projectIndexStore!.filePath, { categories: state.categories.filter((category) => category.id !== categoryId), projects });
        for (const project of projects) {
          if (project.categoryId !== null || state.projects.find((item) => item.id === project.id)?.categoryId !== categoryId) continue;
          await transaction.write(this.projectFile(project.id, "manifest.json"), project);
        }
      });
      return { deletedCategoryId: categoryId };
    }
    const affectedProjects: AutomationStudioProject[] = [];
    await this.writeProjectIndex((state) => ({
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
      const existing = await this.findProject(project.id);
      await this.writeProjectRecord({ ...existing, ...project });
    }
    return { deletedCategoryId: categoryId };
  }

  async reorderProjectCategories(categoryIds: string[]): Promise<{ categories: AutomationStudioProjectCategory[] }> {
    const requestedIds = categoryIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
    let categories: AutomationStudioProjectCategory[] = [];
    await this.writeProjectIndex((state) => {
      const requested = new Set(requestedIds);
      const known = new Set((state.categories ?? []).map((category) => category.id));
      if (requestedIds.some((id) => !known.has(id))) throw new Error("Unknown Automation Studio project category in reorder request.");
      const orderedIds = [...requestedIds, ...(state.categories ?? []).filter((category) => !requested.has(category.id)).map((category) => category.id)];
      const orderById = new Map(orderedIds.map((id, index) => [id, index]));
      categories = (state.categories ?? []).map((category) => ({ ...category, order: orderById.get(category.id) ?? category.order, updatedAt: Date.now() }));
      return { ...state, categories };
    });
    return { categories: this.sortCategories(categories) };
  }

  async getProjectHierarchy(projectId: string): Promise<AutomationStudioProjectHierarchy> {
    const project = await this.findProject(projectId);
    return {
      customHierarchyNodes: project.customHierarchyNodes,
      deletedHierarchyIds: project.deletedHierarchyIds,
      workspacePrefs: project.workspacePrefs ?? {}
    };
  }

  async saveProjectHierarchy(projectId: string, hierarchy: AutomationStudioProjectHierarchy): Promise<AutomationStudioProjectHierarchy> {
    const nextHierarchy: AutomationStudioProjectHierarchy = {
      customHierarchyNodes: Array.isArray(hierarchy.customHierarchyNodes) ? hierarchy.customHierarchyNodes : [],
      deletedHierarchyIds: Array.isArray(hierarchy.deletedHierarchyIds) ? hierarchy.deletedHierarchyIds : [],
      workspacePrefs: hierarchy.workspacePrefs && typeof hierarchy.workspacePrefs === "object" && !Array.isArray(hierarchy.workspacePrefs) ? hierarchy.workspacePrefs : {}
    };
    if (this.objectStore && this.projectIndexStore) {
      await ProgramJsonStore.transaction(this.projectIndexStore.filePath, async (transaction) => {
        const state = await transaction.read(this.projectIndexStore!.filePath, () => ({ categories: [], projects: [] } as AutomationStudioProjectIndex));
        const current = state.projects.find((project) => project.id === projectId);
        if (!current) throw new Error(`Unknown Automation Studio project: ${projectId}`);
        const updated = { ...current, updatedAt: Date.now() };
        await transaction.write(this.projectIndexStore!.filePath, { ...state, projects: state.projects.map((project) => project.id === projectId ? updated : project) });
        await transaction.write(this.projectFile(projectId, "manifest.json"), updated);
        await transaction.write(this.projectFile(projectId, "hierarchy", "nodes.json"), { customHierarchyNodes: nextHierarchy.customHierarchyNodes });
        await transaction.write(this.projectFile(projectId, "hierarchy", "deleted.json"), { deletedHierarchyIds: nextHierarchy.deletedHierarchyIds });
        await transaction.write(this.projectFile(projectId, "workspace", "preferences.json"), { workspacePrefs: nextHierarchy.workspacePrefs });
      });
      return nextHierarchy;
    }
    let updatedProject: AutomationStudioProject | undefined;
    await this.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        updatedProject = { ...project, updatedAt: Date.now() };
        return updatedProject;
      })
    }));
    if (!updatedProject) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    await this.writeProjectRecord({ ...updatedProject, ...nextHierarchy });
    return nextHierarchy;
  }

  private async readProjectIndex(): Promise<AutomationStudioProjectIndex> {
    await this.ensureStorageReady();
    const state = this.projectIndexStore ? await this.projectIndexStore.read() : { categories: [], projects: [] };
    return { categories: normalizeProjectCategories(state.categories ?? []), projects: state.projects ?? [] };
  }

  private async writeProjectIndex(mutator: (state: AutomationStudioProjectIndex) => AutomationStudioProjectIndex): Promise<AutomationStudioProjectIndex> {
    await this.ensureStorageReady();
    if (!this.projectIndexStore) return mutator({ categories: [], projects: [] });
    return await this.projectIndexStore.update((state) => mutator({ categories: normalizeProjectCategories(state.categories ?? []), projects: state.projects ?? [] }));
  }

  private sortCategories(categories: AutomationStudioProjectCategory[]): AutomationStudioProjectCategory[] {
    return [...normalizeProjectCategories(categories)].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  }

  private async findProject(projectId: string): Promise<AutomationStudioProjectRecord> {
    const state = await this.readProjectIndex();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error(`Unknown Automation Studio project: ${projectId}`);
    return await this.readProjectRecord(project);
  }

  private async readProjectRecord(project: AutomationStudioProject): Promise<AutomationStudioProjectRecord> {
    if (!this.projectRootDir) return { ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} };
    await this.ensureProjectStructure(project.id);
    const legacyHierarchy = await new ProgramJsonStore<AutomationStudioProjectHierarchy>(this.projectFile(project.id, "hierarchy", "index.json"), () => ({ customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} })).read();
    const nodes = await new ProgramJsonStore<{ customHierarchyNodes: AutomationStudioProjectHierarchy["customHierarchyNodes"] }>(this.projectFile(project.id, "hierarchy", "nodes.json"), () => ({ customHierarchyNodes: legacyHierarchy.customHierarchyNodes ?? [] })).read();
    const deleted = await new ProgramJsonStore<{ deletedHierarchyIds: string[] }>(this.projectFile(project.id, "hierarchy", "deleted.json"), () => ({ deletedHierarchyIds: legacyHierarchy.deletedHierarchyIds ?? [] })).read();
    const workspace = await new ProgramJsonStore<{ workspacePrefs: AutomationStudioProjectHierarchy["workspacePrefs"] }>(this.projectFile(project.id, "workspace", "preferences.json"), () => ({ workspacePrefs: legacyHierarchy.workspacePrefs ?? {} })).read();
    return {
      ...project,
      customHierarchyNodes: Array.isArray(nodes.customHierarchyNodes) ? nodes.customHierarchyNodes : [],
      deletedHierarchyIds: Array.isArray(deleted.deletedHierarchyIds) ? deleted.deletedHierarchyIds : [],
      workspacePrefs: workspace.workspacePrefs && typeof workspace.workspacePrefs === "object" && !Array.isArray(workspace.workspacePrefs) ? workspace.workspacePrefs : {}
    };
  }

  private async writeProjectRecord(project: AutomationStudioProjectRecord): Promise<void> {
    if (!this.projectRootDir) return;
    await this.ensureProjectStructure(project.id);
    const { customHierarchyNodes, deletedHierarchyIds, workspacePrefs, ...manifest } = project;
    await new ProgramJsonStore(this.projectFile(project.id, "manifest.json"), () => ({})).write(manifest);
    await new ProgramJsonStore<{ customHierarchyNodes: AutomationStudioProjectHierarchy["customHierarchyNodes"] }>(this.projectFile(project.id, "hierarchy", "nodes.json"), () => ({ customHierarchyNodes: [] })).write({ customHierarchyNodes });
    await new ProgramJsonStore<{ deletedHierarchyIds: string[] }>(this.projectFile(project.id, "hierarchy", "deleted.json"), () => ({ deletedHierarchyIds: [] })).write({ deletedHierarchyIds });
    await new ProgramJsonStore<{ workspacePrefs: AutomationStudioProjectHierarchy["workspacePrefs"] }>(this.projectFile(project.id, "workspace", "preferences.json"), () => ({ workspacePrefs: {} })).write({ workspacePrefs });
  }

  private async migrateLegacyProjectStore(): Promise<void> {
    if (!this.projectIndexStore || !this.legacyProjectStore) return;
    const index = await this.projectIndexStore.read();
    if (index.projects.length > 0 || index.categories.length > 0) return;
    const legacy = await this.legacyProjectStore.read();
    if (!legacy.projects.length && !legacy.categories.length) return;
    await this.projectIndexStore.write({
      categories: normalizeProjectCategories(legacy.categories ?? []),
      projects: legacy.projects.map(({ customHierarchyNodes: _customHierarchyNodes, deletedHierarchyIds: _deletedHierarchyIds, workspacePrefs: _workspacePrefs, ...project }) => project)
    });
    for (const project of legacy.projects) await this.writeProjectRecord(project);
  }

  private async prepareStorage(): Promise<void> {
    await this.ensureNodeLibraryStructure();
    await this.migrateLegacyProjectStore();
  }

  private async ensureStorageReady(): Promise<void> {
    this.storageReady ??= this.prepareStorage();
    await this.storageReady;
  }

  async legacyEndpointDiagnostic(projectId: string): Promise<AutomationStudioLegacyRetirementDiagnostic> {
    return legacyDiagnostic(await this.readLegacyRetirementState(projectId));
  }

  private async assertLegacyWriteAllowed(projectId: string): Promise<void> {
    const state = await this.readLegacyRetirementState(projectId);
    if (state.phase === "write_locked") throw new AutomationStudioLegacyWriteDisabledError(legacyDiagnostic(state));
  }

  private async readLegacyRetirementState(projectId: string): Promise<AutomationStudioLegacyRetirementState> {
    await this.findProject(projectId);
    const fallback = (): AutomationStudioLegacyRetirementState => ({ schemaVersion: "0.1", projectId, projectSchemaVersion: "0.1", phase: "compatibility", importerEvidence: [], intentionallyDeferred: [], importerCoverageAcknowledged: false, updatedAt: Date.now() });
    if (!this.projectRootDir) return structuredClone(this.memoryLegacyRetirementStates.get(projectId) ?? fallback());
    return await new ProgramJsonStore<AutomationStudioLegacyRetirementState>(this.projectFile(projectId, "migration", "retirement-state.json"), fallback).read();
  }

  private async writeLegacyRetirementState(state: AutomationStudioLegacyRetirementState): Promise<void> {
    if (!this.projectRootDir) { this.memoryLegacyRetirementStates.set(state.projectId, structuredClone(state)); return; }
    await new ProgramJsonStore<AutomationStudioLegacyRetirementState>(this.projectFile(state.projectId, "migration", "retirement-state.json"), () => state).write(state);
  }

  private async ensureLegacyBackup(projectId: string): Promise<AutomationStudioLegacyBackup> {
    const artifacts = await this.readLegacyProjectArtifacts(projectId);
    const digest = legacyArtifactsDigest(artifacts);
    const baseBackupId = `legacy-source.${safeSegment(projectId)}`;
    const baseBackup = await this.readLegacyBackup(projectId, baseBackupId);
    if (baseBackup?.digest === digest) return baseBackup;
    const backupId = baseBackup ? `${baseBackupId}.${digest.slice(0, 12)}` : baseBackupId;
    const existing = await this.readLegacyBackup(projectId, backupId);
    if (existing?.digest === digest) return existing;
    const backup: AutomationStudioLegacyBackup = { schemaVersion: "0.1", backupId, projectId, digest, artifacts: structuredClone(artifacts), createdAt: Date.now() };
    if (!this.projectRootDir) this.memoryLegacyBackups.set(`${projectId}:${backupId}`, structuredClone(backup));
    else await new ProgramJsonStore<AutomationStudioLegacyBackup>(this.projectFile(projectId, "migration", "backups", `${safeSegment(backupId)}.json`), () => backup).write(backup);
    await this.appendLegacyRetirementAudit(projectId, "backup_created", { backupId, digest: backup.digest });
    return backup;
  }

  private async readLegacyBackup(projectId: string, backupId: string): Promise<AutomationStudioLegacyBackup | null> {
    if (!this.projectRootDir) return structuredClone(this.memoryLegacyBackups.get(`${projectId}:${backupId}`) ?? null);
    const value = await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "migration", "backups", `${safeSegment(backupId)}.json`), () => ({})).read();
    return Object.keys(value).length ? value as unknown as AutomationStudioLegacyBackup : null;
  }

  private async readLegacyRetirementAudit(projectId: string): Promise<AutomationStudioLegacyRetirementAuditEvent[]> {
    if (!this.projectRootDir) return structuredClone(this.memoryLegacyAudit.get(projectId) ?? []);
    return (await new ProgramJsonStore<{ events: AutomationStudioLegacyRetirementAuditEvent[] }>(this.projectFile(projectId, "migration", "retirement-audit.json"), () => ({ events: [] })).read()).events ?? [];
  }

  private async appendLegacyRetirementAudit(projectId: string, type: AutomationStudioLegacyRetirementAuditEvent["type"], details: JsonObject): Promise<void> {
    const event: AutomationStudioLegacyRetirementAuditEvent = { eventId: `legacy-audit.${randomUUID()}`, projectId, type, timestamp: Date.now(), details };
    if (!this.projectRootDir) { this.memoryLegacyAudit.set(projectId, [...(this.memoryLegacyAudit.get(projectId) ?? []), structuredClone(event)]); return; }
    await new ProgramJsonStore<{ events: AutomationStudioLegacyRetirementAuditEvent[] }>(this.projectFile(projectId, "migration", "retirement-audit.json"), () => ({ events: [] })).update((value) => ({ events: [...(value.events ?? []), event] }));
  }

  private async ensureNodeLibraryStructure(): Promise<void> {
    // Importer-owned custom-node source roots are read lazily. Built-in node
    // classes are code registrations and do not need placeholder directories.
  }

  private async ensureProjectStructure(projectId: string): Promise<void> {
    // ProgramJsonStore creates only the parent needed by an actual write.
  }

  private projectDirectory(projectId: string): string {
    if (!this.projectRootDir) return "";
    return path.join(this.projectRootDir, safeSegment(projectId));
  }

  private projectFile(projectId: string, ...parts: string[]): string {
    return path.join(this.projectDirectory(projectId), ...parts);
  }

  private async readRecordingIndex(projectId: string): Promise<RecordingIndex> {
    await this.findProject(projectId);
    return await new ProgramJsonStore<RecordingIndex>(this.projectFile(projectId, "recordings", "indexes", "recordings.json"), () => ({ recordings: [], normalizedTimelines: [] })).read();
  }

  private async readRuntimeIndex(projectId: string): Promise<RuntimeIndex> {
    await this.findProject(projectId);
    return await new ProgramJsonStore<RuntimeIndex>(this.projectFile(projectId, "runtime", "indexes", "sessions.json"), () => ({ sessions: [] })).read();
  }

  private async readPipelineIndex(projectId: string): Promise<PipelineIndex> {
    await this.findProject(projectId);
    return await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).read();
  }

  private async writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<void> {
    await this.ensureProjectStructure(projectId);
    await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "runtime", "sessions", `${safeSegment(session.runId)}.json`), () => ({})).write({ session: session as unknown as JsonObject });
    await new ProgramJsonStore<RuntimeIndex>(this.projectFile(projectId, "runtime", "indexes", "sessions.json"), () => ({ sessions: [] })).update((index) => ({
      sessions: upsertBy(index.sessions ?? [], "runId", {
        runId: session.runId,
        targetKind: session.targetKind,
        targetId: session.targetId,
        status: session.status,
        updatedAt: Date.now()
      })
    }));
  }

  private pipelineFolder(kind: PipelineArtifactKind): string {
    if (kind === "normalizationReviews") return path.join("normalization", "reviews");
    if (kind === "miningRuns") return path.join("evidence", "mining-runs");
    if (kind === "evidenceFacts") return path.join("evidence", "facts");
    if (kind === "evidenceObservations") return path.join("evidence", "observations");
    if (kind === "stateActionCorrelations") return path.join("evidence", "correlations");
    if (kind === "evidenceClaims") return path.join("evidence", "claims");
    if (kind === "learnedTaskModels") return path.join("task-models");
    if (kind === "policyProposals") return "proposal";
    if (kind === "recordingFlowProposals") return path.join("proposal", "flows");
    return "replays";
  }

  private recordingSessionDirectory(projectId: string, recordingId: string): string {
    return this.projectFile(projectId, "recordings", "sessions", safeSegment(recordingId));
  }

  private recordingDerivedDirectory(projectId: string, recordingId: string): string {
    return path.join(this.recordingSessionDirectory(projectId, recordingId), "derived");
  }

  private recordingDerivedFile(projectId: string, recordingId: string, ...parts: string[]): string {
    return path.join(this.recordingDerivedDirectory(projectId, recordingId), ...parts);
  }

  private recordingPipelineFile(projectId: string, recordingId: string): string {
    return this.recordingDerivedFile(projectId, recordingId, "index.json");
  }

  private recordingPipelineArtifactFile(projectId: string, recordingId: string, kind: PipelineArtifactKind, id: string): string {
    if (kind === "policyProposals") return this.recordingDerivedFile(projectId, recordingId, "proposal", "proposal.json");
    if (kind === "recordingFlowProposals") return this.recordingDerivedFile(projectId, recordingId, "proposal", "flows", `${safeSegment(id)}.json`);
    return this.recordingDerivedFile(projectId, recordingId, this.recordingPipelineArtifactFolder(kind), `${safeSegment(id)}.json`);
  }

  private async writePipelineArtifact(projectId: string, kind: PipelineArtifactKind, id: string, artifact: JsonObject): Promise<void> {
    await this.writePipelineArtifacts(projectId, [{ kind, id, artifact }]);
  }

  private async writePipelineArtifacts(projectId: string, artifacts: Array<{ kind: PipelineArtifactKind; id: string; artifact: JsonObject }>): Promise<void> {
    if (!artifacts.length) return;
    await this.ensureProjectStructure(projectId);
    const generatedAt = Date.now();
    const byRecording = new Map<string, Array<{ kind: PipelineArtifactKind; id: string; artifact: JsonObject }>>();
    const indexed: Array<{ kind: PipelineArtifactKind; id: string; artifact: JsonObject; recordingId?: string }> = [];
    const aggregateArtifacts: Array<{ kind: PipelineArtifactKind; id: string; artifact: JsonObject }> = [];
    for (const item of artifacts) {
      const recordingId = await this.pipelineArtifactRecordingId(projectId, item.kind, item.artifact);
      indexed.push({ ...item, ...(recordingId ? { recordingId } : {}) });
      if (recordingId) byRecording.set(recordingId, [...(byRecording.get(recordingId) ?? []), item]);
      else aggregateArtifacts.push(item);
    }
    if (this.objectStore) {
      const prepared = new Map<string, JsonObject>();
      for (const item of indexed) prepared.set(`${item.kind}:${item.id}`, await this.prepareArtifactDocument(projectId, item.artifact));
      const recordings = new Map<string, RecordingSession>();
      for (const recordingId of byRecording.keys()) recordings.set(recordingId, await this.getRecordingSession(recordingId, projectId));
      const indexPath = this.projectFile(projectId, "indexes", "pipeline.json");
      await ProgramJsonStore.transaction(indexPath, async (transaction) => {
        let index = await transaction.read(indexPath, emptyPipelineIndex);
        for (const item of aggregateArtifacts) {
          const filePath = this.projectFile(projectId, "pipeline", "shared", this.pipelineFolder(item.kind), `${safeSegment(item.id)}.json`);
          await transaction.write(filePath, prepared.get(`${item.kind}:${item.id}`)!);
        }
        for (const [recordingId, items] of byRecording) {
          const recording = recordings.get(recordingId)!;
          const pipelinePath = this.recordingPipelineFile(projectId, recordingId);
          let pipeline = await transaction.read(pipelinePath, () => createRecordingPipelineDocument(recording));
          for (const item of items) {
            pipeline = addRecordingPipelineArtifactId(pipeline, item.kind, item.id);
            await transaction.write(this.recordingPipelineArtifactFile(projectId, recordingId, item.kind, item.id), prepared.get(`${item.kind}:${item.id}`)!);
          }
          await transaction.write(pipelinePath, pipeline);
          index = {
            ...index,
            pipelines: upsertBy(index.pipelines ?? [], "pipelineId", {
              pipelineId: pipeline.pipelineId,
              recordingId,
              ...(recording.taskId ? { taskId: recording.taskId } : {}),
              updatedAt: pipeline.updatedAt
            })
          };
        }
        index = indexed.reduce((next, item) => upsertPipelineIndex(next, item.kind, item.id, generatedAt, item.artifact.status, item.recordingId), index);
        await transaction.write(indexPath, index);
      });
      return;
    }
    await mapWithConcurrency(aggregateArtifacts, PIPELINE_ARTIFACT_WRITE_CONCURRENCY, async (item) => this.writeArtifactDocument(
      projectId,
      this.projectFile(projectId, "pipeline", "shared", this.pipelineFolder(item.kind), `${safeSegment(item.id)}.json`),
      item.artifact
    ));
    for (const [recordingId, items] of byRecording) await this.writeRecordingPipelineArtifacts(projectId, recordingId, items);
    await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => indexed.reduce(
      (next, item) => upsertPipelineIndex(next, item.kind, item.id, generatedAt, item.artifact.status, item.recordingId),
      index
    ));
  }

  private async ensureProjectRecordingPipeline(projectId: string, recording: RecordingSession): Promise<RecordingPipelineDocument> {
    await this.ensureProjectStructure(projectId);
    const pipelineId = recordingPipelineId(recording.recordingId);
    const store = new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPipelineFile(projectId, recording.recordingId),
      () => createRecordingPipelineDocument(recording)
    );
    const now = Date.now();
    const existing = await store.read();
    const next: RecordingPipelineDocument = {
      ...createRecordingPipelineDocument(recording),
      ...existing,
      pipelineId,
      recordingId: recording.recordingId,
      ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
      updatedAt: now,
      artifacts: {
        ...createRecordingPipelineDocument(recording).artifacts,
        ...(existing.artifacts ?? {})
      }
    };
    await store.write(next);
    await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => ({
      ...emptyPipelineIndex(),
      ...index,
      pipelines: upsertBy(index.pipelines ?? [], "pipelineId", {
        pipelineId,
        recordingId: recording.recordingId,
        ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
        updatedAt: now
      })
    }));
    return next;
  }

  private async writeRecordingPipelineArtifact(projectId: string, recordingId: string, kind: PipelineArtifactKind, id: string, artifact: JsonObject): Promise<void> {
    const recording = await this.repositories.recordingSessions.get(recordingId) ?? await this.getRecordingSession(recordingId, projectId).catch(() => null);
    if (!recording) return;
    await this.ensureProjectRecordingPipeline(projectId, recording);
    await this.writeArtifactDocument(projectId, this.recordingPipelineArtifactFile(projectId, recordingId, kind, id), artifact);
    await this.updateRecordingPipeline(projectId, recordingId, (pipeline) => addRecordingPipelineArtifactId(pipeline, kind, id));
  }

  private async writeRecordingPipelineArtifacts(projectId: string, recordingId: string, artifacts: Array<{ kind: PipelineArtifactKind; id: string; artifact: JsonObject }>): Promise<void> {
    const recording = await this.repositories.recordingSessions.get(recordingId) ?? await this.getRecordingSession(recordingId, projectId).catch(() => null);
    if (!recording || !artifacts.length) return;
    await this.ensureProjectRecordingPipeline(projectId, recording);
    await mapWithConcurrency(artifacts, PIPELINE_ARTIFACT_WRITE_CONCURRENCY, async (item) => this.writeArtifactDocument(projectId, this.recordingPipelineArtifactFile(projectId, recordingId, item.kind, item.id), item.artifact));
    await this.updateRecordingPipeline(projectId, recordingId, (pipeline) => artifacts.reduce((next, item) => addRecordingPipelineArtifactId(next, item.kind, item.id), pipeline));
  }

  private async writeRecordingPipelineNormalizedTimeline(projectId: string, normalized: NormalizedTimeline): Promise<void> {
    const recording = await this.repositories.recordingSessions.get(normalized.recordingId) ?? await this.getRecordingSession(normalized.recordingId, projectId).catch(() => null);
    if (!recording) return;
    await this.ensureProjectRecordingPipeline(projectId, recording);
    await new ProgramJsonStore<JsonObject>(
      this.recordingDerivedFile(projectId, normalized.recordingId, "normalization", "timelines", `${safeSegment(normalized.normalizedTimelineId)}.json`),
      () => ({})
    ).write({ normalizedTimeline: normalized as unknown as JsonObject });
    await this.updateRecordingPipeline(projectId, normalized.recordingId, (pipeline) => ({
      ...pipeline,
      updatedAt: Date.now(),
      artifacts: {
        ...pipeline.artifacts,
        normalizedTimelineIds: uniqueStrings([normalized.normalizedTimelineId, ...(pipeline.artifacts.normalizedTimelineIds ?? [])])
      }
    }));
  }

  private async updateRecordingPipeline(projectId: string, recordingId: string, mutator: (pipeline: RecordingPipelineDocument) => RecordingPipelineDocument): Promise<RecordingPipelineDocument> {
    const recording = await this.getRecordingSession(recordingId, projectId);
    await this.ensureProjectRecordingPipeline(projectId, recording);
    const store = new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPipelineFile(projectId, recordingId),
      () => createRecordingPipelineDocument(recording)
    );
    const next = mutator(await store.read());
    await store.write(next);
    await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => ({
      ...emptyPipelineIndex(),
      ...index,
      pipelines: upsertBy(index.pipelines ?? [], "pipelineId", {
        pipelineId: next.pipelineId,
        recordingId: next.recordingId,
        ...(next.taskId !== undefined ? { taskId: next.taskId } : {}),
        updatedAt: next.updatedAt
      })
    }));
    return next;
  }

  private recordingPipelineArtifactFolder(kind: PipelineArtifactKind): string {
    return this.pipelineFolder(kind);
  }

  private async pipelineArtifactRecordingId(projectId: string, kind: PipelineArtifactKind, artifact: JsonObject): Promise<string | null> {
    if (typeof artifact.recordingId === "string") return artifact.recordingId;
    if ((kind === "evidenceFacts" || kind === "evidenceObservations" || kind === "stateActionCorrelations" || kind === "evidenceClaims") && typeof artifact.recordingId === "string") return artifact.recordingId;
    if (kind === "miningRuns" && artifact.metadata && typeof artifact.metadata === "object" && !Array.isArray(artifact.metadata) && typeof (artifact.metadata as JsonObject).recordingId === "string") return (artifact.metadata as JsonObject).recordingId as string;
    if (kind === "learnedTaskModels" && Array.isArray(artifact.sourceRecordings) && typeof artifact.sourceRecordings[0] === "string") return artifact.sourceRecordings[0];
    if (kind === "policyProposals" && artifact.metadata && typeof artifact.metadata === "object" && !Array.isArray(artifact.metadata) && typeof (artifact.metadata as JsonObject).recordingId === "string") return (artifact.metadata as JsonObject).recordingId as string;
    if (kind === "policyProposals" && typeof artifact.learnedTaskModelId === "string") {
      const model = await this.readPipelineArtifact<LearnedTaskModel>(projectId, "learnedTaskModels", artifact.learnedTaskModelId);
      return model?.sourceRecordings[0] ?? null;
    }
    if (kind === "recordingFlowProposals" && typeof artifact.recordingId === "string") return artifact.recordingId;
    return null;
  }

  private async deleteProjectRecordingPipeline(projectId: string, recordingId: string): Promise<void> {
    await this.deleteProjectRecordingPolicyProposals(projectId, recordingId);
    const pipeline = await new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPipelineFile(projectId, recordingId),
      () => createRecordingPipelineDocument({ recordingId, startedAt: Date.now() })
    ).read();
    if (this.objectStore) await ProgramJsonStore.deletePath(this.recordingDerivedDirectory(projectId, recordingId));
    else await rm(this.recordingDerivedDirectory(projectId, recordingId), { recursive: true, force: true });
    await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => ({
      pipelines: (index.pipelines ?? []).filter((item) => item.recordingId !== recordingId),
      normalizationReviews: (index.normalizationReviews ?? []).filter((item) => !pipeline.artifacts.normalizationReviewIds.includes(item.reviewId)),
      miningRuns: (index.miningRuns ?? []).filter((item) => !pipeline.artifacts.miningRunIds.includes(item.miningRunId)),
      evidenceFacts: (index.evidenceFacts ?? []).filter((item) => !(pipeline.artifacts.evidenceFactIds ?? []).includes(item.factId)),
      evidenceObservations: (index.evidenceObservations ?? []).filter((item) => !(pipeline.artifacts.evidenceObservationIds ?? []).includes(item.observationId)),
      stateActionCorrelations: (index.stateActionCorrelations ?? []).filter((item) => !(pipeline.artifacts.stateActionCorrelationIds ?? []).includes(item.correlationId)),
      evidenceClaims: (index.evidenceClaims ?? []).filter((item) => !(pipeline.artifacts.evidenceClaimIds ?? []).includes(item.claimId)),
      learnedTaskModels: (index.learnedTaskModels ?? []).filter((item) => !pipeline.artifacts.learnedTaskModelIds.includes(item.learnedTaskModelId)),
      policyProposals: (index.policyProposals ?? []).filter((item) => !pipeline.artifacts.policyProposalIds.includes(item.proposalId)),
      recordingFlowProposals: (index.recordingFlowProposals ?? []).filter((item) => !(pipeline.artifacts.recordingFlowProposalIds ?? []).includes(item.proposalId)),
      replayResults: (index.replayResults ?? []).filter((item) => !pipeline.artifacts.replayResultIds.includes(item.replayId))
    }));
  }

  private async deleteProjectRecordingPolicyProposals(projectId: string, recordingId: string, keepProposalId?: string): Promise<void> {
    const ids = new Set<string>();
    const index = await this.readPipelineIndex(projectId);
    for (const item of index.policyProposals ?? []) {
      const proposal = await this.readPipelineArtifact<PolicyProposalArtifact>(projectId, "policyProposals", item.proposalId);
      if (proposal?.metadata?.recordingId === recordingId && proposal.proposalId !== keepProposalId) ids.add(proposal.proposalId);
    }
    if (!ids.size) return;
    const proposalPath = path.join(this.recordingDerivedDirectory(projectId, recordingId), "proposal", "proposal.json");
    if (this.objectStore) await ProgramJsonStore.deletePath(proposalPath);
    else await rm(proposalPath, { recursive: true, force: true });
    await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((current) => ({
      ...emptyPipelineIndex(),
      ...current,
      policyProposals: (current.policyProposals ?? []).filter((item) => !ids.has(item.proposalId))
    }));
    await this.removeRecordingPipelineArtifactIds(projectId, recordingId, "policyProposalIds", ids);
  }

  private async removeRecordingPipelineArtifactIds(projectId: string, recordingId: string, key: keyof RecordingPipelineDocument["artifacts"], ids: Set<string>): Promise<void> {
    if (!ids.size) return;
    const store = new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPipelineFile(projectId, recordingId),
      () => createRecordingPipelineDocument({ recordingId, startedAt: Date.now() })
    );
    const pipeline = await store.read();
    const current = Array.isArray(pipeline.artifacts[key]) ? pipeline.artifacts[key] as string[] : [];
    const next = current.filter((id) => !ids.has(id));
    if (next.length === current.length) return;
    await store.write({
      ...pipeline,
      updatedAt: Date.now(),
      artifacts: {
        ...pipeline.artifacts,
        [key]: next
      }
    });
  }

  private async readPipelineArtifact<TArtifact>(projectId: string, kind: PipelineArtifactKind, id: string): Promise<TArtifact | null> {
    await this.ensureProjectStructure(projectId);
    const recordingId = await this.pipelineIndexRecordingId(projectId, kind, id);
    const filePath = recordingId
      ? this.recordingPipelineArtifactFile(projectId, recordingId, kind, id)
      : this.projectFile(projectId, "pipeline", "shared", this.pipelineFolder(kind), `${safeSegment(id)}.json`);
    const artifact = await this.readArtifactDocument(filePath);
    return Object.keys(artifact).length ? artifact as unknown as TArtifact : null;
  }

  private async writeArtifactDocument(projectId: string, filePath: string, artifact: JsonObject): Promise<void> {
    const stored = await this.prepareArtifactDocument(projectId, artifact);
    await new ProgramJsonStore<JsonObject>(filePath, () => ({})).write(stored);
  }

  private async prepareArtifactDocument(projectId: string, artifact: JsonObject): Promise<JsonObject> {
    const size = Buffer.byteLength(JSON.stringify(artifact), "utf8");
    return this.objectStore && size >= AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES
      ? await this.objectStore.putJson(projectId, artifact) as unknown as JsonObject
      : artifact;
  }

  private async readArtifactDocument(filePath: string): Promise<JsonObject> {
    const stored = await new ProgramJsonStore<JsonObject>(filePath, () => ({})).read();
    return this.objectStore && isAutomationStudioObjectReference(stored)
      ? await this.objectStore.readJson(stored)
      : stored;
  }

  private async pipelineIndexRecordingId(projectId: string, kind: PipelineArtifactKind, id: string): Promise<string | null> {
    const index = await this.readPipelineIndex(projectId);
    const key = pipelineIndexKey(kind);
    const item = ((index[kind] as any[]) ?? []).find((candidate) => candidate[key] === id);
    return typeof item?.recordingId === "string" ? item.recordingId : null;
  }

  private async readPipelineArtifactList<TArtifact>(projectId: string, kind: PipelineArtifactKind, ids: string[]): Promise<TArtifact[]> {
    const artifacts: TArtifact[] = [];
    for (const id of ids) {
      const artifact = await this.readPipelineArtifact<TArtifact>(projectId, kind, id);
      if (artifact) artifacts.push(artifact);
    }
    return artifacts;
  }

  private async readProjectArtifactList<TArtifact>(projectId: string, folder: "tasks" | "routines" | "configs" | "flows"): Promise<TArtifact[]> {
    await this.ensureProjectStructure(projectId);
    if (!this.projectRootDir) return [];
    const dir = path.join(this.projectDirectory(projectId), folder);
    if (this.objectStore) {
      const documents = await ProgramJsonStore.listDirectoryDocuments<JsonObject>(dir, projectArtifactDocumentFileName(folder));
      return (documents ?? []) as unknown as TArtifact[];
    }
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }
    const artifacts: TArtifact[] = [];
    const fileName = projectArtifactDocumentFileName(folder);
    for (const entry of entries) {
      const data = await new ProgramJsonStore<JsonObject>(path.join(dir, entry, fileName), () => ({})).read();
      if (Object.keys(data).length) artifacts.push(data as unknown as TArtifact);
    }
    return artifacts;
  }

  /** Reads legacy project documents without the historical task-graph embedding side effect. */
  private async readLegacyProjectArtifacts(projectId: string): Promise<AutomationStudioProjectArtifacts> {
    await this.findProject(projectId);
    const [tasks, routines, configs, flows] = await Promise.all([
      this.readProjectArtifactList<AutomationStudioTaskArtifact>(projectId, "tasks"),
      this.readProjectArtifactList<AutomationStudioRoutineArtifact>(projectId, "routines"),
      this.readProjectArtifactList<AutomationStudioConfigArtifact>(projectId, "configs"),
      this.readProjectArtifactList<AutomationStudioFlowDocument>(projectId, "flows")
    ]);
    return { tasks, routines, configs, flows };
  }

  private async listCanonicalFlowArtifacts(projectId: string): Promise<AutomationStudioFlowArtifact[]> {
    return (await this.repositories.flows.list()).filter((flow) => flow.projectId === projectId);
  }

  private async listPublishedFlowSnapshots() {
    return (await this.listFlowPublicationRecords()).map((record) => record.snapshot);
  }

  private async listFlowPublicationRecords(): Promise<AutomationStudioFlowPublicationRecord[]> {
    const persisted = await this.repositories.flowPublications.list();
    const byId = new Map(persisted.map((record) => [record.publicationId, record]));
    for (const flow of await this.repositories.flows.list()) {
      const history = flow.publicationHistory ?? ((flow.publication.status === "published" || flow.publication.status === "deprecated") && flow.publication.snapshot ? [flow.publication.snapshot] : []);
      for (const snapshot of history) {
        const publicationId = flowPublicationId(flow.flowId, snapshot.version);
        if (!byId.has(publicationId)) byId.set(publicationId, { schemaVersion: "0.1", publicationId, projectId: flow.projectId, flowId: flow.flowId, version: snapshot.version, status: (flow.publication.status === "deprecated" && flow.publication.version === snapshot.version) ? "deprecated" : "published", snapshot, createdAt: snapshot.publishedAt });
      }
    }
    return [...byId.values()];
  }

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

  private projectArtifactFile(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): string {
    const folder = this.projectArtifactFolder(kind);
    return this.projectFile(projectId, folder, safeSegment(artifactId), projectArtifactDocumentFileName(folder));
  }

  private async deleteProjectArtifactFile(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): Promise<void> {
    if (!this.projectRootDir) return;
    const artifactRoot = path.dirname(this.projectArtifactFile(projectId, kind, artifactId));
    if (this.objectStore) await ProgramJsonStore.deletePath(artifactRoot);
    else await rm(artifactRoot, { recursive: true, force: true });
  }

  private projectArtifactFolder(kind: AutomationStudioProjectArtifactKind): "tasks" | "routines" | "configs" | "flows" {
    if (kind === "task") return "tasks";
    if (kind === "routine") return "routines";
    if (kind === "config") return "configs";
    return "flows";
  }

  private projectArtifactId(kind: AutomationStudioProjectArtifactKind, artifact: Record<string, unknown>): string {
    const id = kind === "task" ? artifact.taskId : kind === "routine" ? artifact.routineId : kind === "config" ? artifact.configId : artifact.flowId;
    if (typeof id !== "string" || !id.trim()) throw new Error(`${kind} ID is required.`);
    return id;
  }

  private async writeRecordingIndex(projectId: string, mutator: (index: RecordingIndex) => RecordingIndex): Promise<RecordingIndex> {
    await this.findProject(projectId);
    return await new ProgramJsonStore<RecordingIndex>(this.projectFile(projectId, "recordings", "indexes", "recordings.json"), () => ({ recordings: [], normalizedTimelines: [] })).update(mutator);
  }

  private async withRecordingMutationLock<TResult>(projectId: string | null | undefined, recordingId: string, operation: () => Promise<TResult>): Promise<TResult> {
    const key = `${safeSegment(projectId ?? "global")}:${safeSegment(recordingId)}`;
    const previous = this.recordingMutationLocks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current, () => current);
    this.recordingMutationLocks.set(key, chained);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.recordingMutationLocks.get(key) === chained) this.recordingMutationLocks.delete(key);
    }
  }

  private async writeProjectRecordingSession(projectId: string, recording: RecordingSession): Promise<void> {
    if (this.objectStore) return;
    await this.ensureProjectStructure(projectId);
    const sessionDir = this.recordingSessionDirectory(projectId, recording.recordingId);
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "recording.json"), () => ({ recording: recording as unknown as JsonObject })).write({ recording: recording as unknown as JsonObject });
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "events", "timeline.json"), () => ({ timeline: [] })).write({ timeline: recording.timeline as unknown as JsonObject[] });
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "snapshots", "initial-state.json"), () => ({ initialState: recording.initialState as unknown as JsonObject })).write({ initialState: recording.initialState as unknown as JsonObject });
    await this.ensureProjectRecordingPipeline(projectId, recording);
    await this.writeRecordingIndex(projectId, (index) => ({
      recordings: upsertBy(index.recordings ?? [], "recordingId", {
        recordingId: recording.recordingId,
        ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
        startedAt: recording.startedAt,
        ...(recording.endedAt !== undefined ? { endedAt: recording.endedAt } : {}),
        updatedAt: Date.now()
      }),
      normalizedTimelines: index.normalizedTimelines ?? []
    }));
  }

  private async writeProjectNormalizedTimeline(projectId: string, normalized: NormalizedTimeline): Promise<void> {
    if (this.objectStore) return;
    await this.ensureProjectStructure(projectId);
    await this.writeRecordingPipelineNormalizedTimeline(projectId, normalized);
    await this.writeRecordingIndex(projectId, (index) => ({
      recordings: index.recordings ?? [],
      normalizedTimelines: upsertBy(index.normalizedTimelines ?? [], "normalizedTimelineId", {
        normalizedTimelineId: normalized.normalizedTimelineId,
        recordingId: normalized.recordingId,
        generatedAt: normalized.generatedAt
      })
    }));
  }

  private async loadProjectRecordings(projectId: string): Promise<void> {
    if (this.objectStore) return;
    if (!this.projectRootDir) return;
    const index = await this.readRecordingIndex(projectId);
    for (const item of index.recordings ?? []) {
      const stored = await new ProgramJsonStore<JsonObject>(
        path.join(this.recordingSessionDirectory(projectId, item.recordingId), "recording.json"),
        () => ({})
      ).read();
      const recording = stored.recording as unknown as RecordingSession | undefined;
      if (recording?.recordingId) await this.repositories.recordingSessions.put(recording);
    }
    for (const item of index.normalizedTimelines ?? []) {
      const stored = await new ProgramJsonStore<JsonObject>(
        this.recordingDerivedFile(projectId, item.recordingId, "normalization", "timelines", `${safeSegment(item.normalizedTimelineId)}.json`),
        () => ({})
      ).read();
      const normalized = stored.normalizedTimeline as unknown as NormalizedTimeline | undefined;
      if (normalized?.normalizedTimelineId) await this.repositories.normalizedTimelines.put(normalized);
    }
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

function normalizeProjectCategories(categories: AutomationStudioProjectCategory[]): AutomationStudioProjectCategory[] {
  return categories.map((category, index) => ({
    ...category,
    order: typeof category.order === "number" && Number.isFinite(category.order) ? category.order : index
  }));
}

function nextCategoryOrder(categories: AutomationStudioProjectCategory[]): number {
  if (!categories.length) return 0;
  return Math.max(...normalizeProjectCategories(categories).map((category) => category.order)) + 1;
}

function upsertBy<TItem, TKey extends keyof TItem>(items: TItem[], key: TKey, item: TItem): TItem[] {
  const index = items.findIndex((candidate) => candidate[key] === item[key]);
  if (index < 0) return [item, ...items];
  return items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
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

function latestTimelineTimestamp(recording: RecordingSession): number {
  return recording.timeline.reduce((latest, entry) => Math.max(latest, typeof entry.timestamp === "number" ? entry.timestamp : 0), 0);
}

function recordingUpdatedAt(recording: RecordingSession): number {
  return Math.max(recording.endedAt ?? 0, latestTimelineTimestamp(recording), recording.startedAt);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
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

function projectArtifactDocumentFileName(folder: "tasks" | "routines" | "configs" | "flows"): string {
  if (folder === "tasks") return "task.json";
  if (folder === "routines") return "routine.json";
  if (folder === "configs") return "config.json";
  return "flow.json";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function flowPublicationId(flowId: string, version: string): string {
  return `${flowId}@${version}`;
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

function createEvidenceFact(
  miningRunId: string,
  timeline: NormalizedTimeline,
  entry: NormalizedTimeline["timeline"][number],
  domain?: RecordingDomainDefinition
): EvidenceFact {
  const domainId = typeof entry.metadata?.domainId === "string" ? entry.metadata.domainId : undefined;
  const eventType = "eventType" in entry ? entry.eventType : undefined;
  const eventDefinition = domain && eventType ? domain.events.find((event) => event.eventType === eventType) : undefined;
  const title = factTitle(entry, eventDefinition?.label);
  return {
    schemaVersion: "0.1",
    factId: `fact.${safeSegment(timeline.recordingId)}.${safeSegment(entry.id)}`,
    miningRunId,
    recordingId: timeline.recordingId,
    normalizedTimelineId: timeline.normalizedTimelineId,
    kind: entry.type,
    title,
    summary: factSummary(entry, title),
    occurredAt: entry.timestamp,
    offsetMs: entry.monotonicOffsetMs,
    source: { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: entry.id },
    ...(domainId ? { domain: { domainId, ...(eventType ? { eventType } : {}), ...(eventDefinition?.label ? { label: eventDefinition.label } : {}) } } : {}),
    data: compactJsonObject({
      ...(entry.type === "action" ? { actionType: entry.actionType, ...(entry.outputId ? { outputId: entry.outputId } : {}), ...(entry.confirmationInputId ? { confirmationInputId: entry.confirmationInputId, confirmationTimeoutMs: entry.confirmationTimeoutMs ?? 5_000 } : {}), target: entry.target as JsonObject | undefined, parameters: entry.parameters as JsonObject } : {}),
      ...(entry.type === "domain_event" ? { eventType: entry.eventType, payload: entry.payload } : {}),
      ...(entry.type === "state_delta" ? { deltas: entry.deltas as unknown as JsonObject[] } : {}),
      ...(entry.type === "observation" ? { observationType: entry.observationType, signals: entry.signals as JsonObject | undefined, payload: entry.payload } : {}),
      ...(entry.type === "marker" ? { label: entry.label } : {}),
      ...(entry.type === "note" ? { noteId: entry.noteId } : {})
    }),
    metadata: compactJsonObject({
      sourceId: entry.sourceId,
      ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
      ...(entry.metadata ?? {})
    })
  };
}

function createEvidenceObservations(fact: EvidenceFact): EvidenceObservation[] {
  if (fact.kind === "state_delta" && Array.isArray(fact.data?.deltas)) {
    return fact.data.deltas.map((delta, index) => {
      const statePath = formatStatePath(String((delta as any).namespace ?? ""), String((delta as any).path ?? ""));
      const previous = (delta as any).previous;
      const current = (delta as any).current;
      return {
        schemaVersion: "0.1",
        observationId: `obs.${safeSegment(fact.factId)}.${index + 1}`,
        miningRunId: fact.miningRunId,
        recordingId: fact.recordingId,
        normalizedTimelineId: fact.normalizedTimelineId,
        kind: "state_changed",
        title: `${readableStatePath(statePath)} ${readableTokenValue(String((delta as any).change ?? "changed"))}`,
        summary: `${readableStatePath(statePath)} changed from ${stateValueSummary(previous)} to ${stateValueSummary(current)}.`,
        factIds: [fact.factId],
        subject: { type: "state", statePath, label: readableStatePath(statePath) },
        ...(previous && typeof previous === "object" && !Array.isArray(previous) ? { before: previous as JsonObject } : {}),
        ...(current && typeof current === "object" && !Array.isArray(current) ? { after: current as JsonObject } : {}),
        metadata: compactJsonObject({ change: (delta as any).change })
      };
    });
  }
  const kind: EvidenceObservation["kind"] = fact.kind === "action"
    ? "action_performed"
    : fact.kind === "domain_event"
      ? "domain_event_observed"
      : fact.kind === "state_checkpoint"
        ? "state_recorded"
        : fact.kind === "note"
          ? "note_added"
          : fact.kind === "marker"
            ? "marker_added"
            : "condition_observed";
  return [{
    schemaVersion: "0.1",
    observationId: `obs.${safeSegment(fact.factId)}`,
    miningRunId: fact.miningRunId,
    recordingId: fact.recordingId,
    normalizedTimelineId: fact.normalizedTimelineId,
    kind,
    title: fact.title,
    summary: fact.summary,
    factIds: [fact.factId],
    subject: compactJsonObject({
      type: fact.kind,
      ...(fact.domain?.eventType ? { eventType: fact.domain.eventType } : {}),
      ...(typeof fact.data?.outputId === "string" ? { outputId: fact.data.outputId } : {}),
      ...(typeof fact.data?.confirmationInputId === "string" ? { confirmationInputId: fact.data.confirmationInputId, confirmationTimeoutMs: typeof fact.data.confirmationTimeoutMs === "number" ? fact.data.confirmationTimeoutMs : 5_000 } : {}),
      ...(fact.data?.parameters && typeof fact.data.parameters === "object" && !Array.isArray(fact.data.parameters) ? { parameters: fact.data.parameters } : {}),
      ...(fact.data?.target && typeof fact.data.target === "object" && !Array.isArray(fact.data.target) ? { target: fact.data.target } : {})
    }) as NonNullable<EvidenceObservation["subject"]>,
    ...(fact.domain ? { metadata: { domain: fact.domain } } : {})
  }];
}

function stateElementDescriptorsForTimeline(timeline: NormalizedTimeline, domains: RecordingDomainDefinition[]): Map<string, StateElementDescriptor> {
  const descriptors = new Map<string, StateElementDescriptor>();
  const domainIds = new Set<string>([
    ...(typeof timeline.metadata?.domainId === "string" ? [timeline.metadata.domainId] : []),
    ...timeline.timeline.map((entry) => typeof entry.metadata?.domainId === "string" ? entry.metadata.domainId : "").filter(Boolean)
  ]);
  for (const domain of domains) {
    if (domainIds.size && !domainIds.has(domain.domainId)) continue;
    for (const pathDefinition of domain.statePaths ?? []) {
      const statePath = formatStatePath(pathDefinition.namespace, pathDefinition.path);
      descriptors.set(statePath, {
        namespace: pathDefinition.namespace,
        path: pathDefinition.path,
        kind: pathDefinition.elementKind ?? inferStateElementKind(pathDefinition.path, pathDefinition.type),
        ...(pathDefinition.label !== undefined ? { label: pathDefinition.label } : {}),
        ...(pathDefinition.description !== undefined ? { description: pathDefinition.description } : {}),
        ...(pathDefinition.entityId !== undefined ? { entityId: pathDefinition.entityId } : {}),
        ...(pathDefinition.entityKind !== undefined ? { entityKind: pathDefinition.entityKind } : {}),
        ...(pathDefinition.stableAcrossSessions !== undefined ? { stableAcrossSessions: pathDefinition.stableAcrossSessions } : {}),
        ...(pathDefinition.sensitive !== undefined ? { sensitive: pathDefinition.sensitive } : {}),
        ...(pathDefinition.metadata !== undefined ? { metadata: pathDefinition.metadata } : {})
      });
    }
  }
  return descriptors;
}

function createStateActionCorrelations(
  miningRunId: string,
  timeline: NormalizedTimeline,
  actions: NormalizedTimeline["timeline"],
  descriptors: Map<string, StateElementDescriptor>
): StateActionCorrelation[] {
  const correlations: StateActionCorrelation[] = [];
  const checkpoints = timeline.timeline.filter((entry) => entry.type === "state_checkpoint");
  const stateDeltas = timeline.timeline.filter((entry) => entry.type === "state_delta");
  actions.forEach((action, actionIndex) => {
    const previousAction = actions[actionIndex - 1];
    const nextAction = actions[actionIndex + 1];
    const windowStartOffsetMs = previousAction?.monotonicOffsetMs ?? 0;
    const windowEndOffsetMs = nextAction?.monotonicOffsetMs ?? timeline.timeline[timeline.timeline.length - 1]?.monotonicOffsetMs ?? action.monotonicOffsetMs;
    const previousCheckpoint = [...checkpoints].reverse().find((checkpoint) => checkpoint.monotonicOffsetMs <= action.monotonicOffsetMs);
    if (previousCheckpoint?.type === "state_checkpoint") {
      let index = 0;
      for (const [statePath, stateValue] of prioritizedStateValuesForAction(previousCheckpoint.state, descriptors, MAX_PRE_ACTION_STATE_CORRELATIONS)) {
        const descriptor = descriptorForStateValue(statePath, stateValue, descriptors);
        correlations.push({
          schemaVersion: "0.1",
          correlationId: `corr.${safeSegment(timeline.recordingId)}.${safeSegment(action.id)}.before.${index + 1}`,
          miningRunId,
          recordingId: timeline.recordingId,
          normalizedTimelineId: timeline.normalizedTimelineId,
          actionEntryId: action.id,
          statePath,
          relation: descriptor.kind === "enabled" && stateValue.value === true ? "became_enabled_before_action" : "present_before_action",
          elementKind: descriptor.kind,
          descriptor,
          before: stateValueToJson(stateValue),
          timing: {
            beforeMs: Math.max(0, action.monotonicOffsetMs - previousCheckpoint.monotonicOffsetMs),
            windowStartOffsetMs,
            actionOffsetMs: action.monotonicOffsetMs,
            windowEndOffsetMs
          },
          support: [
            { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: previousCheckpoint.id, signalPath: statePath },
            { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: action.id }
          ]
        });
        index += 1;
      }
    }
    for (const deltaEntry of stateDeltas.filter((entry) => entry.monotonicOffsetMs >= action.monotonicOffsetMs && entry.monotonicOffsetMs <= windowEndOffsetMs).slice(0, MAX_POST_ACTION_STATE_DELTAS)) {
      if (deltaEntry.type !== "state_delta") continue;
      deltaEntry.deltas.forEach((delta, deltaIndex) => {
        const statePath = formatStatePath(delta.namespace, delta.path);
        const stateValue = delta.current ?? delta.previous;
        if (!stateValue || !isValuableStateElement(statePath, stateValue, descriptors)) return;
        const descriptor = descriptorForStateValue(statePath, stateValue, descriptors);
        correlations.push({
          schemaVersion: "0.1",
          correlationId: `corr.${safeSegment(timeline.recordingId)}.${safeSegment(action.id)}.after.${safeSegment(deltaEntry.id)}.${safeSegment(statePath)}.${deltaIndex + 1}`,
          miningRunId,
          recordingId: timeline.recordingId,
          normalizedTimelineId: timeline.normalizedTimelineId,
          actionEntryId: action.id,
          statePath,
          relation: correlationRelationForDelta(delta, descriptor.kind),
          elementKind: descriptor.kind,
          descriptor,
          ...(delta.previous ? { before: stateValueToJson(delta.previous) } : {}),
          ...(delta.current ? { after: stateValueToJson(delta.current) } : {}),
          timing: {
            afterMs: Math.max(0, deltaEntry.monotonicOffsetMs - action.monotonicOffsetMs),
            windowStartOffsetMs,
            actionOffsetMs: action.monotonicOffsetMs,
            windowEndOffsetMs
          },
          support: [
            { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: action.id },
            { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: deltaEntry.id, signalPath: statePath }
          ]
        });
      });
    }
  });
  return correlations;
}

function createCorrelationClaim(
  miningRunId: string,
  timeline: NormalizedTimeline,
  correlation: StateActionCorrelation,
  index: number,
  observations: EvidenceObservation[]
): EvidenceClaim {
  const relatedObservations = observations.filter((observation) => observation.subject?.statePath === correlation.statePath || observation.factIds.some((factId) => correlation.support.some((evidence) => evidence.artifactId === factId)));
  const isAfter = correlation.relation.includes("after") || correlation.relation === "changed_between_actions";
  const label = correlation.descriptor?.label ?? readableStatePath(correlation.statePath);
  return {
    schemaVersion: "0.1",
    claimId: `claim.${safeSegment(timeline.recordingId)}.correlation.${index + 1}`,
    miningRunId,
    recordingId: timeline.recordingId,
    normalizedTimelineId: timeline.normalizedTimelineId,
    claimType: isAfter ? "action_effect" : "candidate_condition",
    title: isAfter ? `${label} changed after action` : `${label} was present before action`,
    summary: isAfter
      ? `${label} ${correlation.relation.replace(/_/g, " ")} within ${correlation.timing.afterMs ?? 0}ms after the action.`
      : `${label} was observed before the action and may identify context, readiness, or the action target.`,
    observationIds: relatedObservations.map((observation) => observation.observationId),
    factIds: uniqueStrings(relatedObservations.flatMap((observation) => observation.factIds)),
    statement: {
      subject: { kind: "action", entryId: correlation.actionEntryId },
      relationship: correlation.relation,
      object: { kind: "state_element", signalPath: correlation.statePath, elementKind: correlation.elementKind }
    },
    confidence: { score: confidenceForCorrelation(correlation), basis: "Inferred from state timing around a recorded action.", sampleSize: 1 },
    sourceEvidence: [{ layer: "state_action_correlation", artifactId: correlation.correlationId, relationship: correlation.relation }, ...correlation.support],
    metadata: { correlationId: correlation.correlationId }
  };
}

function createTransitionClaims(
  miningRunId: string,
  timeline: NormalizedTimeline,
  actions: NormalizedTimeline["timeline"],
  factsByEntryId: Map<string, EvidenceFact>,
  observationsByFactId: Map<string, EvidenceObservation[]>
): EvidenceClaim[] {
  return actions.slice(0, -1).map((entry, index) => {
    const next = actions[index + 1]!;
    const currentFact = factsByEntryId.get(entry.id);
    const nextFact = factsByEntryId.get(next.id);
    const currentObservation = currentFact ? observationsByFactId.get(currentFact.factId)?.[0] : undefined;
    const nextObservation = nextFact ? observationsByFactId.get(nextFact.factId)?.[0] : undefined;
    const gapMs = Math.max(0, next.monotonicOffsetMs - entry.monotonicOffsetMs);
    return {
      schemaVersion: "0.1",
      claimId: `claim.${safeSegment(timeline.recordingId)}.transition.${index + 1}`,
      miningRunId,
      recordingId: timeline.recordingId,
      normalizedTimelineId: timeline.normalizedTimelineId,
      claimType: gapMs >= 250 ? "wait" : "transition",
      title: gapMs >= 250 ? `Waited ${gapMs}ms before ${nextObservation?.title ?? next.id}` : `${currentObservation?.title ?? entry.id} led to ${nextObservation?.title ?? next.id}`,
      summary: `${nextObservation?.title ?? "Next action"} occurred ${gapMs}ms after ${currentObservation?.title ?? "the previous action"}.`,
      observationIds: uniqueStrings([currentObservation?.observationId ?? "", nextObservation?.observationId ?? ""]),
      factIds: uniqueStrings([currentFact?.factId ?? "", nextFact?.factId ?? ""]),
      statement: {
        subject: { kind: "observation", observationId: currentObservation?.observationId ?? null },
        relationship: gapMs >= 250 ? "followed_after_wait" : "followed_by",
        object: { kind: "observation", observationId: nextObservation?.observationId ?? null, waitMs: gapMs }
      },
      confidence: { score: 0.6, basis: "Observed ordering within one recording.", sampleSize: 1 },
      sourceEvidence: [
        { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: entry.id },
        { layer: "normalized_timeline", artifactId: timeline.normalizedTimelineId, entryId: next.id }
      ]
    };
  });
}

function factTitle(entry: NormalizedTimeline["timeline"][number], eventLabel?: string): string {
  if (entry.type === "action") return `Action: ${readableTokenValue(entry.actionType)}`;
  if (entry.type === "domain_event") return eventLabel ?? `Event: ${readableTokenValue(entry.eventType)}`;
  if (entry.type === "state_delta") return `State changed: ${entry.deltas.map((delta) => readableStatePath(formatStatePath(delta.namespace, delta.path))).slice(0, 3).join(", ")}`;
  if (entry.type === "state_checkpoint") return "State checkpoint recorded";
  if (entry.type === "observation") return `Observation: ${readableTokenValue(entry.observationType)}`;
  if (entry.type === "marker") return `Marker: ${entry.label}`;
  return "Note added";
}

function factSummary(entry: NormalizedTimeline["timeline"][number], title: string): string {
  if (entry.type === "domain_event" && entry.payload) return `${title} with ${Object.keys(entry.payload).join(", ") || "payload"}.`;
  if (entry.type === "state_delta") return `${entry.deltas.length} state change${entry.deltas.length === 1 ? "" : "s"} observed.`;
  if (entry.type === "observation" && entry.signals) return `${Object.keys(entry.signals).length} signal${Object.keys(entry.signals).length === 1 ? "" : "s"} observed.`;
  return `${title} at ${entry.monotonicOffsetMs}ms.`;
}

function formatStatePath(namespace: string, pathValue: string): string {
  return namespace ? `${namespace}.${pathValue}` : pathValue;
}

function readableStatePath(pathValue: string): string {
  return pathValue.split(".").filter(Boolean).map(readableTokenValue).join(" / ");
}

function readableTokenValue(value: string): string {
  return value.replace(/[_:.-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Unknown";
}

function stateValueSummary(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return String(value ?? "missing");
  const stateValue = value as { value?: unknown };
  if (stateValue.value === undefined) return "missing";
  if (typeof stateValue.value === "object") return JSON.stringify(stateValue.value);
  return String(stateValue.value);
}

function stateValuesFromSnapshot(snapshot: StateSnapshot): Array<[string, StateValue]> {
  return Object.entries(snapshot.namespaces).flatMap(([namespace, stateNamespace]) =>
    Object.entries(stateNamespace.values).map(([pathValue, stateValue]) => [formatStatePath(namespace, pathValue), stateValue] as [string, StateValue])
  );
}

function prioritizedStateValuesForAction(snapshot: StateSnapshot, descriptors: Map<string, StateElementDescriptor>, limit: number): Array<[string, StateValue]> {
  return stateValuesFromSnapshot(snapshot)
    .filter(([statePath, stateValue]) => isValuableStateElement(statePath, stateValue, descriptors))
    .map(([statePath, stateValue]) => ({ statePath, stateValue, score: stateElementPriority(statePath, stateValue, descriptors) }))
    .sort((left, right) => right.score - left.score || left.statePath.localeCompare(right.statePath))
    .slice(0, limit)
    .map((item) => [item.statePath, item.stateValue]);
}

function stateElementPriority(statePath: string, stateValue: StateValue, descriptors: Map<string, StateElementDescriptor>): number {
  const descriptor = descriptorForStateValue(statePath, stateValue, descriptors);
  let score = descriptors.has(statePath) ? 50 : 0;
  if (descriptor.stableAcrossSessions) score += 20;
  if (descriptor.entityId) score += 12;
  if (descriptor.kind === "static_id" || descriptor.kind === "selector") score += 18;
  if (descriptor.kind === "text" || descriptor.kind === "label") score += 14;
  if (descriptor.kind === "status" || descriptor.kind === "enabled" || descriptor.kind === "visibility") score += 10;
  if (descriptor.kind === "count") score += 4;
  if (stateValue.value === true) score += 4;
  if (typeof stateValue.value === "string" && stateValue.value.trim()) score += 3;
  return score;
}

function descriptorForStateValue(statePath: string, stateValue: StateValue, descriptors: Map<string, StateElementDescriptor>): StateElementDescriptor {
  const existing = descriptors.get(statePath);
  if (existing) return existing;
  const [namespace, ...pathParts] = statePath.split(".");
  const pathValue = pathParts.join(".");
  return {
    namespace: namespace || "custom",
    path: pathValue,
    kind: typeof stateValue.metadata?.elementKind === "string" ? stateValue.metadata.elementKind as StateElementKind : inferStateElementKind(pathValue, stateValue.type),
    ...(typeof stateValue.semanticRole === "string" ? { description: stateValue.semanticRole } : {}),
    ...(typeof stateValue.metadata?.label === "string" ? { label: stateValue.metadata.label } : {}),
    ...(typeof stateValue.metadata?.entityId === "string" ? { entityId: stateValue.metadata.entityId } : {}),
    ...(typeof stateValue.metadata?.entityKind === "string" ? { entityKind: stateValue.metadata.entityKind } : {}),
    ...(typeof stateValue.metadata?.stableAcrossSessions === "boolean" ? { stableAcrossSessions: stateValue.metadata.stableAcrossSessions } : {}),
    ...(stateValue.sensitive !== undefined ? { sensitive: stateValue.sensitive } : {})
  };
}

function isValuableStateElement(statePath: string, stateValue: StateValue, descriptors: Map<string, StateElementDescriptor>): boolean {
  if (stateValue.sensitive || stateValue.comparable === false) return false;
  const descriptor = descriptorForStateValue(statePath, stateValue, descriptors);
  if (descriptor.kind === "unknown" || descriptor.kind === "position" || descriptor.kind === "bounds") return false;
  const normalizedPath = statePath.toLowerCase();
  if (normalizedPath.includes("mouse") || normalizedPath.includes("cursor") || normalizedPath.includes("hover")) return false;
  return true;
}

function inferStateElementKind(pathValue: string, type: StateValue["type"]): StateElementKind {
  const normalized = pathValue.toLowerCase();
  if (normalized.includes("selector")) return "selector";
  if (normalized.includes("testid") || normalized.includes("test_id") || normalized.endsWith("id") || normalized.includes(".id")) return "static_id";
  if (normalized.includes("internal")) return "internal_id";
  if (normalized.includes("label")) return "label";
  if (normalized.includes("text") || normalized.includes("title") || normalized.includes("message")) return "text";
  if (normalized.includes("status") || normalized.includes("state")) return "status";
  if (normalized.includes("route")) return "route";
  if (normalized.includes("url") || normalized.includes("href")) return "url";
  if (normalized.includes("visible") || normalized.includes("visibility")) return "visibility";
  if (normalized.includes("enabled") || normalized.includes("disabled")) return "enabled";
  if (normalized.includes("count") || normalized.includes("total") || normalized.includes("quantity")) return "count";
  if (type === "point") return "position";
  if (type === "rectangle") return "bounds";
  if (type === "entity_ref" || type === "entity_ref_list") return "internal_id";
  if (type === "json") return "json";
  if (type === "string") return "text";
  if (type === "number" || type === "integer") return "count";
  if (type === "boolean") return "visibility";
  return "unknown";
}

function correlationRelationForDelta(delta: StateDelta, kind: StateElementKind): StateActionCorrelation["relation"] {
  if (delta.change === "added") return "appeared_after_action";
  if (delta.change === "removed") return "disappeared_after_action";
  if (kind === "visibility" && delta.current?.value === true) return "became_visible_after_action";
  return "changed_after_action";
}

function stateValueToJson(value: StateValue): JsonObject {
  return compactJsonObject({
    type: value.type,
    value: value.value,
    observedAt: value.observedAt,
    ...(value.sourceId !== undefined ? { sourceId: value.sourceId } : {}),
    ...(value.volatility !== undefined ? { volatility: value.volatility } : {}),
    ...(value.semanticRole !== undefined ? { semanticRole: value.semanticRole } : {}),
    ...(value.metadata !== undefined ? { metadata: value.metadata } : {})
  });
}

function recordingEntryPayload(entry: RecordingSession["timeline"][number]): JsonObject {
  const { id: _id, recordingId: _recordingId, timestamp: _timestamp, monotonicOffsetMs: _offset, sequence: _sequence, sourceId: _sourceId, metadata: _metadata, ...payload } = entry;
  return structuredClone(payload) as unknown as JsonObject;
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
      position: { x: 120 + index * 260, y: 240 },
      metadata: {
        recordingProposalId: proposal.proposalId,
        recordingCandidateId: candidate.candidateId,
        mapperId: proposal.mapper.id,
        mapperVersion: proposal.mapper.version,
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

function recordManualRecordingProposalChanges(existing: AutomationStudioFlowArtifact, next: AutomationStudioFlowArtifact, editedAt: number): AutomationStudioFlowArtifact {
  const existingById = new Map(existing.nodes.map((node) => [node.id, node]));
  const immutableKeys = ["recordingProposalId", "recordingCandidateId", "mapperId", "mapperVersion", "sourceObservationIds", "evidence", "rawEvidenceImmutable"] as const;
  const nodes = next.nodes.map((node) => {
    const previous = existingById.get(node.id);
    if (!previous?.metadata?.recordingProposalId) return node;
    const changedFields = (["definitionId", "label", "description", "parameterValues", "position"] as const).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(node[key]));
    const immutableMetadata = Object.fromEntries(immutableKeys.flatMap((key) => previous.metadata?.[key] === undefined ? [] : [[key, structuredClone(previous.metadata[key])]])) as JsonObject;
    if (!changedFields.length) return { ...node, metadata: { ...(node.metadata ?? {}), ...immutableMetadata } };
    const priorEvents = Array.isArray(previous.metadata.manualProvenance) ? previous.metadata.manualProvenance : [];
    return { ...node, metadata: { ...(node.metadata ?? {}), ...immutableMetadata, manualProvenance: [...priorEvents, { editedAt, changedFields }] } };
  });
  const retainedIds = new Set(next.nodes.map((node) => node.id));
  const deleted = existing.nodes.filter((node) => node.metadata?.recordingProposalId && !retainedIds.has(node.id)).map((node) => ({ editedAt, change: "node_deleted", nodeId: node.id, recordingProposalId: String(node.metadata!.recordingProposalId) }));
  if (!deleted.length) return { ...next, nodes };
  const prior = Array.isArray(existing.metadata?.manualRecordingProposalChanges) ? existing.metadata.manualRecordingProposalChanges : [];
  return { ...next, nodes, metadata: { ...(next.metadata ?? {}), manualRecordingProposalChanges: [...prior, ...deleted] } };
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
    parameters: [],
    icon: "wand-sparkles",
    metadata: { visibility, candidateId: candidate.candidateId, outputId: candidate.outputId, parameters: candidate.parameters, ...(candidate.expectedConfirmation ? { expectedConfirmation: candidate.expectedConfirmation } : {}), evidence: candidate.evidence, sourceObservationIds: candidate.sourceObservationIds, policyStateEligible: false }
  };
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

function confidenceForCorrelation(correlation: StateActionCorrelation): number {
  if (correlation.relation === "changed_after_action" || correlation.relation === "appeared_after_action" || correlation.relation === "became_visible_after_action") return 0.68;
  if (correlation.elementKind === "static_id" || correlation.elementKind === "selector" || correlation.elementKind === "label" || correlation.elementKind === "text") return 0.58;
  return 0.5;
}

function compactJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject;
}

function canonicalFlowDocument(flow: AutomationStudioFlowArtifact): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: flow.flowId,
    ownerKind: "policy",
    ownerId: flow.flowId,
    name: flow.name,
    ...(flow.description ? { description: flow.description } : {}),
    nodes: structuredClone(flow.nodes),
    edges: structuredClone(flow.edges),
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    metadata: { canonicalFlow: true }
  };
}

function flowScopeForProject(project: AutomationStudioProject): AutomationStudioFlowScope {
  return typeof project.domainId === "string" && project.domainId.trim()
    ? { kind: "domain", domainId: project.domainId }
    : { kind: "global" };
}

function sameFlowScope(left: AutomationStudioFlowScope, right: AutomationStudioFlowScope): boolean {
  return left.kind === right.kind && (left.kind !== "domain" || left.domainId === (right as Extract<AutomationStudioFlowScope, { kind: "domain" }>).domainId);
}

function nodeDefinitionScopeAllows(definition: AutomationStudioNodeDefinition, scope: AutomationStudioFlowScope): boolean {
  return definition.availability.kind === "both"
    || (definition.availability.kind === "global" && scope.kind === "global")
    || (definition.availability.kind === "domain" && scope.kind === "domain" && definition.availability.domainId === scope.domainId);
}

function assertPublicationMutationAllowed(existing: AutomationStudioFlowArtifact, incoming: AutomationStudioFlowArtifact, allowPublicationMutation: boolean): void {
  if (allowPublicationMutation) return;
  if ((incoming.publication.status === "published" || incoming.publication.status === "deprecated") && existing.publication.status !== incoming.publication.status) {
    throw new Error("Published Flow lifecycle can only be changed through publication endpoints.");
  }
  if ((existing.publication.status === "published" || existing.publication.status === "deprecated") && stableJson(existing.publication) !== stableJson(incoming.publication)) {
    throw new Error("Published Flow snapshot metadata is immutable; use publication lifecycle endpoints.");
  }
  if (stableJson(existing.publicationHistory ?? []) !== stableJson(incoming.publicationHistory ?? [])) {
    throw new Error("Flow publication history is immutable; use publishFlow() to append a version.");
  }
}

function legacyDiagnostic(state: AutomationStudioLegacyRetirementState): AutomationStudioLegacyRetirementDiagnostic {
  return state.phase === "write_locked"
    ? { code: "legacy.write_locked", deprecated: true, replacement: "canonical-flow-api", projectSchemaVersion: state.projectSchemaVersion, phase: state.phase, message: "Legacy Task/Routine writes are disabled for this Flow-first project. Use canonical Flow APIs." }
    : { code: "legacy.compatibility_write", deprecated: true, replacement: "canonical-flow-api", projectSchemaVersion: state.projectSchemaVersion, phase: state.phase, message: "Legacy Task/Routine writes are deprecated and available only during the compatibility window." };
}

function legacyArtifactsDigest(artifacts: AutomationStudioProjectArtifacts): string {
  return createHash("sha256").update(stableJson(artifacts)).digest("hex");
}

function canonicalFlowDigest(flow: AutomationStudioFlowArtifact): string {
  const { updatedAt: _updatedAt, ...stable } = flow;
  return createHash("sha256").update(stableJson(stable)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function latestByGeneratedAt<T extends { generatedAt?: number }>(items: T[]): T | undefined {
  return [...items].sort((left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0))[0];
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }));
  return results;
}
