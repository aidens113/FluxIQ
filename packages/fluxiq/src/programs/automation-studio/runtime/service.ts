import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioSnapshot } from "../api";
import type { AutomationStudioProject, AutomationStudioProjectCategory, AutomationStudioProjectHierarchy } from "../api/contracts";
import {
  appendRecordingEntry,
  appendRecordingNote,
  createAutomationStudioFixture,
  createBlankAutomationStudioFlow,
  createRecordingSession,
  diffStateSnapshots,
  finalizeRecordingSession,
  type AutomationStudioConfigArtifact,
  type AutomationStudioFlowDocument,
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
  processRecordingDomainEvent
} from "../model";
import type { LearnedTaskModel } from "../learning";
import type { EvidenceClaim, EvidenceFact, EvidenceObservation, SignalMiningResult, StateActionCorrelation } from "../mining";
import { normalizeRecordingTimeline, type NormalizationOptions, type NormalizedTimeline } from "../normalization";
import { automationNodeClasses } from "../nodes";
import { runAutomationStudioGraph } from "./executor";
import { ProgramJsonStore, programDataFile, safeSegment } from "../../_shared/storage";
import type { JsonObject } from "../../../core";
import {
  type CanonicalAutomationStudioRepositories,
  createCanonicalAutomationStudioMemoryRepositories
} from "../storage";

export type AutomationStudioServiceOptions = {
  dataDir?: string;
  repositories?: CanonicalAutomationStudioRepositories;
  seedFixture?: boolean;
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

export type PolicyProposalArtifact = {
  schemaVersion: "0.1";
  proposalId: string;
  learnedTaskModelId: string;
  policy: PolicyGraph;
  status: "draft" | "approved";
  summary: string;
  generatedAt: number;
  approvedAt?: number;
  metadata?: JsonObject;
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
  replayResults: ReplayResultArtifact[];
};

type PipelineIndex = {
  pipelines: { pipelineId: string; recordingId: string; taskId?: string; updatedAt: number }[];
  normalizationReviews: { reviewId: string; generatedAt: number; recordingId?: string }[];
  miningRuns: { miningRunId: string; generatedAt: number; recordingId?: string }[];
  evidenceFacts: { factId: string; generatedAt: number; recordingId?: string }[];
  evidenceObservations: { observationId: string; generatedAt: number; recordingId?: string }[];
  stateActionCorrelations: { correlationId: string; generatedAt: number; recordingId?: string }[];
  evidenceClaims: { claimId: string; generatedAt: number; recordingId?: string }[];
  learnedTaskModels: { learnedTaskModelId: string; generatedAt: number; recordingId?: string }[];
  policyProposals: { proposalId: string; generatedAt: number; status: PolicyProposalArtifact["status"]; recordingId?: string }[];
  replayResults: { replayId: string; generatedAt: number; recordingId?: string }[];
};

type PipelineArtifactKind = Exclude<keyof PipelineIndex, "pipelines">;

type RecordingPipelineDocument = {
  schemaVersion: "0.1";
  pipelineId: string;
  recordingId: string;
  taskId?: string;
  status: "ready" | "processing" | "complete";
  createdAt: number;
  updatedAt: number;
  artifacts: {
    normalizedTimelineIds: string[];
    normalizationReviewIds: string[];
    miningRunIds: string[];
    evidenceFactIds: string[];
    evidenceObservationIds: string[];
    stateActionCorrelationIds: string[];
    evidenceClaimIds: string[];
    learnedTaskModelIds: string[];
    policyProposalIds: string[];
    replayResultIds: string[];
  };
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
  private readonly recordingMutationLocks = new Map<string, Promise<void>>();
  private readonly ready: Promise<void>;
  private storageReady?: Promise<void>;

  constructor(options: AutomationStudioServiceOptions = {}) {
    this.repositories = options.repositories ?? createCanonicalAutomationStudioMemoryRepositories();
    if (options.dataDir) {
      const automationDataDir = path.join(options.dataDir, "programs", "automation-studio");
      this.projectRootDir = path.join(automationDataDir, "projects");
      this.nodeRootDir = path.join(automationDataDir, "nodes");
      this.projectIndexStore = new ProgramJsonStore(path.join(this.projectRootDir, "index.json"), () => ({ categories: [], projects: [] }));
      this.legacyProjectStore = new ProgramJsonStore(programDataFile(options.dataDir, "automation-studio", "projects.json"), () => ({ categories: [], projects: [] }));
    }
    this.ready = options.seedFixture === true ? this.seedFixture() : Promise.resolve();
  }

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

    for (const project of projects) {
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

  async createRecording(input: CreateRecordingSessionInput & { projectId?: string | null }): Promise<RecordingSession> {
    await this.ready;
    const recording = createRecordingSession(input);
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
      issues.push(errorMessage(error, "Task proposal could not be created."));
    }
    return {
      schemaVersion: "0.1",
      recordingId: input.recordingId,
      status: proposal ? "processed" : issues.length ? "partial" : "skipped",
      ...(normalizedTimeline ? { normalizedTimeline } : {}),
      ...(review ? { review } : {}),
      ...(miningRun ? { miningRun } : {}),
      ...(proposal ? { proposal } : {}),
      issues,
      generatedAt: Date.now()
    };
  }

  async normalizeRecording(input: { projectId?: string | null; recordingId: string; options?: NormalizationOptions }): Promise<NormalizedTimeline> {
    const recording = await this.getRecordingSession(input.recordingId, input.projectId);
    const normalized = normalizeRecordingTimeline(recording, input.options);
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
      await rm(this.recordingSessionDirectory(input.projectId, input.recordingId), { recursive: true, force: true });
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
      metadata: { recordingId: timeline.recordingId }
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
    const model = createTaskDraftModelFromMiningRun(miningRun, input.taskId);
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
      if (miningRun) model = createTaskDraftModelFromMiningRun(miningRun);
    }
    if (!model && input.recordingId) {
      const timelines = await this.listProjectNormalizedTimelines(input.projectId);
      const timelineIds = new Set(timelines.filter((timeline) => timeline.recordingId === input.recordingId).map((timeline) => timeline.normalizedTimelineId));
      const miningRun = latestByGeneratedAt(artifacts.miningRuns.filter((run) => run.metadata?.recordingId === input.recordingId || timelineIds.has(run.normalizedTimelineId)));
      if (miningRun) model = createTaskDraftModelFromMiningRun(miningRun);
    }
    model ??= latestByGeneratedAt(artifacts.learnedTaskModels) ?? null;
    if (!model) throw new Error("Mined evidence is required before proposing a task.");
    const nodes: PolicyNode[] = model.actionClusters.map((cluster) => ({
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
    const edges = model.transitions.map((transition) => ({
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
    const proposal: PolicyProposalArtifact = {
      schemaVersion: "0.1",
      proposalId: `proposal.${safeSegment(input.recordingId ?? model.sourceRecordings[0] ?? model.learnedTaskModelId)}`,
      learnedTaskModelId: model.learnedTaskModelId,
      policy,
      status: "draft",
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

  async approvePolicyProposal(input: { projectId: string; proposalId: string }): Promise<PolicyProposalArtifact> {
    const proposal = await this.readPipelineArtifact<PolicyProposalArtifact>(input.projectId, "policyProposals", input.proposalId);
    if (!proposal) throw new Error("Unknown policy proposal.");
    const approved = { ...proposal, status: "approved" as const, approvedAt: Date.now() };
    await this.repositories.policyGraphs.put(approved.policy);
    await this.writePipelineArtifact(input.projectId, "policyProposals", approved.proposalId, approved as unknown as JsonObject);
    await new ProgramJsonStore<JsonObject>(this.projectFile(input.projectId, "policies", `${safeSegment(approved.policy.policyId)}.json`), () => ({})).write({ policy: approved.policy as unknown as JsonObject });
    const existingTask = await this.getProjectArtifact(input.projectId, "task", approved.policy.taskId).then((artifact) => artifact as AutomationStudioTaskArtifact).catch(() => null);
    const task: AutomationStudioTaskArtifact = {
      schemaVersion: "0.1",
      taskId: approved.policy.taskId,
      name: humanTaskName(approved.policy.taskId),
      description: approved.summary,
      recordingIds: uniqueStrings([...(existingTask?.recordingIds ?? []), String(approved.metadata?.recordingId ?? "")]),
      createdAt: existingTask?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      metadata: {
        ...(existingTask?.metadata ?? {}),
        status: "draft",
        source: "policy_proposal",
        proposalId: approved.proposalId,
        policyId: approved.policy.policyId,
        approvedAt: approved.approvedAt
      }
    };
    await this.saveProjectArtifact({ projectId: input.projectId, kind: "task", artifact: task });
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
    await this.findProject(projectId);
    return {
      tasks: await this.readProjectArtifactList<AutomationStudioTaskArtifact>(projectId, "tasks"),
      routines: await this.readProjectArtifactList<AutomationStudioRoutineArtifact>(projectId, "routines"),
      configs: await this.readProjectArtifactList<AutomationStudioConfigArtifact>(projectId, "configs"),
      flows: await this.readProjectArtifactList<AutomationStudioFlowDocument>(projectId, "flows")
    };
  }

  async saveProjectArtifact(input: { projectId: string; kind: AutomationStudioProjectArtifactKind; artifact: unknown }): Promise<unknown> {
    await this.findProject(input.projectId);
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

  async createDefaultFlow(input: { projectId: string; ownerKind: "task" | "routine"; ownerId: string; name: string; description?: string }): Promise<AutomationStudioFlowDocument> {
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
    metadata?: JsonObject;
  }): Promise<AutomationStudioRuntimeSession> {
    const flow = input.flow ?? (input.projectId && input.flowId ? await this.getProjectArtifact(input.projectId, "flow", input.flowId) as AutomationStudioFlowDocument : undefined);
    if (!flow) throw new Error("A flow document or project flow ID is required.");
    const now = Date.now();
    const session: AutomationStudioRuntimeSession = {
      schemaVersion: "0.1",
      runId: randomUUID(),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      targetKind: input.targetKind ?? (flow.ownerKind === "policy" ? "flow" : flow.ownerKind),
      targetId: input.targetId ?? flow.ownerId,
      flowId: flow.flowId,
      status: "queued",
      queuedAt: now,
      flow,
      metadata: { ...(input.metadata ?? {}), inputs: input.inputs ?? {} }
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
  }): Promise<AutomationStudioRuntimeSession> {
    const existing = input.projectId && input.runId ? await this.getRuntimeSession(input.projectId, input.runId) : null;
    const startInput: Parameters<AutomationStudioService["startRuntimeSession"]>[0] = {};
    if (input.projectId !== undefined) startInput.projectId = input.projectId;
    if (input.flow !== undefined) startInput.flow = input.flow;
    if (input.flowId !== undefined) startInput.flowId = input.flowId;
    if (input.inputs !== undefined) startInput.inputs = input.inputs;
    const session = existing ?? await this.startRuntimeSession(startInput);
    const startedAt = Date.now();
    const graphOptions: Parameters<typeof runAutomationStudioGraph>[1] = {
      inputs: (input.inputs ?? session.metadata?.inputs ?? {}) as Record<string, any>
    };
    if (input.maxSteps !== undefined) graphOptions.maxSteps = input.maxSteps;
    const trace = await runAutomationStudioGraph(session.flow, graphOptions);
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
    const replayResults = await this.readPipelineArtifactList<ReplayResultArtifact>(projectId, "replayResults", (index.replayResults ?? []).map((item) => item.replayId));
    return { normalizationReviews, miningRuns, evidenceFacts, evidenceObservations, stateActionCorrelations, evidenceClaims, learnedTaskModels, policyProposals, replayResults };
  }

  async listProjects(): Promise<{ categories: AutomationStudioProjectCategory[]; projects: AutomationStudioProject[] }> {
    const state = await this.readProjectIndex();
    return {
      categories: this.sortCategories(state.categories ?? []),
      projects: state.projects
        .sort((left, right) => right.updatedAt - left.updatedAt)
    };
  }

  async createProject(input: { name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Project name is required.");
    const now = Date.now();
    const categoryId = typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId.trim() : null;
    const project: AutomationStudioProject = {
      id: randomUUID(),
      name,
      description: typeof input.description === "string" ? input.description.trim() : "",
      categoryId,
      createdAt: now,
      updatedAt: now
    };
    await this.writeProjectIndex((state) => ({ ...state, projects: [project, ...state.projects] }));
    await this.writeProjectRecord({ ...project, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} });
    return project;
  }

  async updateProject(input: { projectId?: unknown; name?: unknown; description?: unknown; categoryId?: unknown }): Promise<AutomationStudioProject> {
    const projectId = String(input.projectId ?? "");
    const name = typeof input.name === "string" ? input.name.trim() : undefined;
    if (name !== undefined && !name) throw new Error("Project name is required.");
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
    await this.findProject(projectId);
    await this.writeProjectIndex((state) => ({
      ...state,
      projects: state.projects.filter((project) => project.id !== projectId)
    }));
    if (this.projectRootDir) await rm(this.projectDirectory(projectId), { recursive: true, force: true });
    return { deletedProjectId: projectId };
  }

  async createProjectCategory(input: { name?: unknown }): Promise<AutomationStudioProjectCategory> {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("Category name is required.");
    const now = Date.now();
    const state = await this.readProjectIndex();
    const category = { id: randomUUID(), name, order: nextCategoryOrder(state.categories), createdAt: now, updatedAt: now };
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

  private async ensureNodeLibraryStructure(): Promise<void> {
    if (!this.nodeRootDir) return;
    await Promise.all([
      mkdir(path.join(this.nodeRootDir, "custom"), { recursive: true }),
      mkdir(path.join(this.nodeRootDir, "packages"), { recursive: true }),
      ...automationNodeClasses.map((nodeClass) => mkdir(path.join(this.nodeRootDir!, "custom", nodeClass), { recursive: true }))
    ]);
  }

  private async ensureProjectStructure(projectId: string): Promise<void> {
    if (!this.projectRootDir) return;
    const root = this.projectDirectory(projectId);
    await Promise.all([
      mkdir(root, { recursive: true }),
      mkdir(path.join(root, "hierarchy"), { recursive: true }),
      mkdir(path.join(root, "workspace"), { recursive: true }),
      mkdir(path.join(root, "tasks"), { recursive: true }),
      mkdir(path.join(root, "routines"), { recursive: true }),
      mkdir(path.join(root, "configs"), { recursive: true }),
      mkdir(path.join(root, "flows"), { recursive: true }),
      mkdir(path.join(root, "recordings"), { recursive: true }),
      mkdir(path.join(root, "recordings", "indexes"), { recursive: true }),
      mkdir(path.join(root, "proposals"), { recursive: true }),
      mkdir(path.join(root, "proposals", "indexes"), { recursive: true }),
      mkdir(path.join(root, "policies"), { recursive: true }),
      mkdir(path.join(root, "pipeline"), { recursive: true }),
      mkdir(path.join(root, "indexes"), { recursive: true }),
      mkdir(path.join(root, "runtime"), { recursive: true }),
      mkdir(path.join(root, "runtime", "sessions"), { recursive: true }),
      mkdir(path.join(root, "runtime", "indexes"), { recursive: true }),
      mkdir(path.join(root, "state"), { recursive: true }),
      mkdir(path.join(root, "custom-nodes"), { recursive: true }),
      mkdir(path.join(root, "artifacts"), { recursive: true })
    ]);
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
    return this.recordingDerivedFile(projectId, recordingId, this.recordingPipelineArtifactFolder(kind), `${safeSegment(id)}.json`);
  }

  private async writePipelineArtifact(projectId: string, kind: PipelineArtifactKind, id: string, artifact: JsonObject): Promise<void> {
    await this.ensureProjectStructure(projectId);
    const recordingId = await this.pipelineArtifactRecordingId(projectId, kind, artifact);
    if (recordingId) {
      await this.writeRecordingPipelineArtifact(projectId, recordingId, kind, id, artifact);
    } else {
      await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "pipeline", "shared", this.pipelineFolder(kind), `${safeSegment(id)}.json`), () => ({})).write(artifact);
    }
    await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => upsertPipelineIndex(index, kind, id, Date.now(), artifact.status, recordingId ?? undefined));
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
    await mapWithConcurrency(aggregateArtifacts, PIPELINE_ARTIFACT_WRITE_CONCURRENCY, async (item) => new ProgramJsonStore<JsonObject>(
      this.projectFile(projectId, "pipeline", "shared", this.pipelineFolder(item.kind), `${safeSegment(item.id)}.json`),
      () => ({})
    ).write(item.artifact));
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
    await Promise.all([
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "normalization", "timelines"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "normalization", "reviews"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "evidence", "mining-runs"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "evidence", "facts"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "evidence", "observations"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "evidence", "correlations"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "evidence", "claims"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "task-models"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "proposal"), { recursive: true }),
      mkdir(this.recordingDerivedFile(projectId, recording.recordingId, "replays"), { recursive: true })
    ]);
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
    await new ProgramJsonStore<JsonObject>(this.recordingPipelineArtifactFile(projectId, recordingId, kind, id), () => ({})).write(artifact);
    await this.updateRecordingPipeline(projectId, recordingId, (pipeline) => addRecordingPipelineArtifactId(pipeline, kind, id));
  }

  private async writeRecordingPipelineArtifacts(projectId: string, recordingId: string, artifacts: Array<{ kind: PipelineArtifactKind; id: string; artifact: JsonObject }>): Promise<void> {
    const recording = await this.repositories.recordingSessions.get(recordingId) ?? await this.getRecordingSession(recordingId, projectId).catch(() => null);
    if (!recording || !artifacts.length) return;
    await this.ensureProjectRecordingPipeline(projectId, recording);
    await mapWithConcurrency(artifacts, PIPELINE_ARTIFACT_WRITE_CONCURRENCY, async (item) => new ProgramJsonStore<JsonObject>(this.recordingPipelineArtifactFile(projectId, recordingId, item.kind, item.id), () => ({})).write(item.artifact));
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
    return null;
  }

  private async deleteProjectRecordingPipeline(projectId: string, recordingId: string): Promise<void> {
    await this.deleteProjectRecordingPolicyProposals(projectId, recordingId);
    const pipeline = await new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPipelineFile(projectId, recordingId),
      () => createRecordingPipelineDocument({ recordingId, startedAt: Date.now() })
    ).read();
    await rm(this.recordingDerivedDirectory(projectId, recordingId), { recursive: true, force: true });
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
    await rm(path.join(this.recordingDerivedDirectory(projectId, recordingId), "proposal"), { recursive: true, force: true });
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
    const artifact = await new ProgramJsonStore<JsonObject>(filePath, () => ({})).read();
    return Object.keys(artifact).length ? artifact as unknown as TArtifact : null;
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

  private projectArtifactFile(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): string {
    const folder = this.projectArtifactFolder(kind);
    return this.projectFile(projectId, folder, safeSegment(artifactId), projectArtifactDocumentFileName(folder));
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
    await this.ensureProjectStructure(projectId);
    const sessionDir = this.recordingSessionDirectory(projectId, recording.recordingId);
    await mkdir(path.join(sessionDir, "events"), { recursive: true });
    await mkdir(path.join(sessionDir, "snapshots"), { recursive: true });
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

function emptyPipelineIndex(): PipelineIndex {
  return { pipelines: [], normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [], stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: [] };
}

function upsertPipelineIndex(index: PipelineIndex, kind: PipelineArtifactKind, id: string, generatedAt: number, status?: unknown, recordingId?: string): PipelineIndex {
  const item = kind === "normalizationReviews"
    ? { reviewId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
    : kind === "miningRuns"
      ? { miningRunId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
      : kind === "evidenceFacts"
        ? { factId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
      : kind === "evidenceObservations"
        ? { observationId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
        : kind === "stateActionCorrelations"
          ? { correlationId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
          : kind === "evidenceClaims"
            ? { claimId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
            : kind === "learnedTaskModels"
              ? { learnedTaskModelId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
              : kind === "policyProposals"
                ? { proposalId: id, generatedAt, status: status === "approved" ? "approved" as const : "draft" as const, ...(recordingId ? { recordingId } : {}) }
                : { replayId: id, generatedAt, ...(recordingId ? { recordingId } : {}) };
  const key = pipelineIndexKey(kind) as keyof typeof item;
  return {
    ...emptyPipelineIndex(),
    ...index,
    [kind]: upsertBy((index[kind] as any[]) ?? [], key as any, item as any).sort((left: any, right: any) => right.generatedAt - left.generatedAt)
  };
}

function pipelineIndexKey(kind: PipelineArtifactKind): string {
  if (kind === "normalizationReviews") return "reviewId";
  if (kind === "miningRuns") return "miningRunId";
  if (kind === "evidenceFacts") return "factId";
  if (kind === "evidenceObservations") return "observationId";
  if (kind === "stateActionCorrelations") return "correlationId";
  if (kind === "evidenceClaims") return "claimId";
  if (kind === "learnedTaskModels") return "learnedTaskModelId";
  if (kind === "policyProposals") return "proposalId";
  return "replayId";
}

function projectArtifactDocumentFileName(folder: "tasks" | "routines" | "configs" | "flows"): string {
  if (folder === "tasks") return "task.json";
  if (folder === "routines") return "routine.json";
  if (folder === "configs") return "config.json";
  return "flow.json";
}

function recordingPipelineId(recordingId: string): string {
  return `pipeline.${safeSegment(recordingId)}`;
}

function createRecordingPipelineDocument(recording: Pick<RecordingSession, "recordingId" | "taskId" | "startedAt">): RecordingPipelineDocument {
  return {
    schemaVersion: "0.1",
    pipelineId: recordingPipelineId(recording.recordingId),
    recordingId: recording.recordingId,
    ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
    status: "ready",
    createdAt: recording.startedAt,
    updatedAt: Date.now(),
    artifacts: emptyRecordingPipelineArtifacts()
  };
}

function emptyRecordingPipelineArtifacts(): RecordingPipelineDocument["artifacts"] {
  return {
    normalizedTimelineIds: [],
    normalizationReviewIds: [],
    miningRunIds: [],
    evidenceFactIds: [],
    evidenceObservationIds: [],
    stateActionCorrelationIds: [],
    evidenceClaimIds: [],
    learnedTaskModelIds: [],
    policyProposalIds: [],
    replayResultIds: []
  };
}

function addRecordingPipelineArtifactId(pipeline: RecordingPipelineDocument, kind: PipelineArtifactKind, id: string): RecordingPipelineDocument {
  const key = kind === "normalizationReviews"
    ? "normalizationReviewIds"
    : kind === "miningRuns"
      ? "miningRunIds"
      : kind === "evidenceFacts"
        ? "evidenceFactIds"
      : kind === "evidenceObservations"
        ? "evidenceObservationIds"
        : kind === "stateActionCorrelations"
          ? "stateActionCorrelationIds"
          : kind === "evidenceClaims"
            ? "evidenceClaimIds"
            : kind === "learnedTaskModels"
              ? "learnedTaskModelIds"
              : kind === "policyProposals"
                ? "policyProposalIds"
                : "replayResultIds";
  return {
    ...pipeline,
    status: kind === "replayResults" || kind === "policyProposals" ? "complete" : "processing",
    updatedAt: Date.now(),
    artifacts: {
      ...pipeline.artifacts,
      [key]: uniqueStrings([id, ...(pipeline.artifacts[key] ?? [])])
    }
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
      ...(entry.type === "action" ? { actionType: entry.actionType, target: entry.target as JsonObject | undefined, parameters: entry.parameters as JsonObject } : {}),
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

function humanTaskName(taskId: string): string {
  const name = readableTokenValue(taskId.replace(/^task[.:_-]?/i, ""));
  return name === "Unknown" ? "Generated Task Draft" : name;
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

function confidenceForCorrelation(correlation: StateActionCorrelation): number {
  if (correlation.relation === "changed_after_action" || correlation.relation === "appeared_after_action" || correlation.relation === "became_visible_after_action") return 0.68;
  if (correlation.elementKind === "static_id" || correlation.elementKind === "selector" || correlation.elementKind === "label" || correlation.elementKind === "text") return 0.58;
  return 0.5;
}

function compactJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject;
}

function createTaskDraftModelFromMiningRun(miningRun: SignalMiningResult, taskId?: string): LearnedTaskModel {
  const resolvedTaskId = taskId ?? String(miningRun.metadata?.taskId ?? miningRun.metadata?.recordingId ?? "task.learned");
  const actionClaims = (miningRun.claims ?? []).filter((claim) => claim.claimType === "action_effect");
  const transitionClaims = (miningRun.claims ?? []).filter((claim) => claim.claimType === "transition" || claim.claimType === "wait");
  const actionObservations = (miningRun.observations ?? []).filter((observation) => observation.kind === "action_performed" || observation.kind === "domain_event_observed");
  const factsById = new Map((miningRun.facts ?? []).map((fact) => [fact.factId, fact]));
  const windows = miningRun.windows.filter((window) => window.actionEntryId);
  const clusterSources = actionObservations.length ? actionObservations : windows.length ? windows : actionClaims.length ? actionClaims : transitionClaims;
  const actionClusters = clusterSources.map((item, index) => {
    const claim = "claimId" in item ? item : undefined;
    const observation = "observationId" in item ? item : undefined;
    const observationSourceEntryId = observation ? factsById.get(observation.factIds[0] ?? "")?.source.entryId : undefined;
    const window = "actionEntryId" in item ? item : windows[index];
    const actionEntryId = typeof claim?.statement.subject.entryId === "string"
      ? claim.statement.subject.entryId
      : typeof observationSourceEntryId === "string"
        ? observationSourceEntryId
        : typeof observation?.metadata?.entryId === "string"
          ? observation.metadata.entryId
          : window?.actionEntryId;
    const matchingEffects = uniqueBy(miningRun.actionEffects.filter((effect) => effect.actionOccurrenceId === actionEntryId), (effect) => `${effect.signalPath}:${effect.relationship}`);
    const matchingActionClaims = actionClaims.filter((candidate) => candidate.statement.subject.entryId === actionEntryId);
    const primaryEvidence = claim
      ? [{ layer: "evidence_claim" as const, artifactId: claim.claimId, relationship: claim.claimType }]
      : observation
        ? [{ layer: "evidence_observation" as const, artifactId: observation.observationId, relationship: observation.kind }]
        : window?.sourceEvidence ?? [];
    const claimEvidence = uniqueBy([
      ...matchingActionClaims.map((candidate) => ({ layer: "evidence_claim" as const, artifactId: candidate.claimId, relationship: candidate.claimType })),
      ...primaryEvidence
    ], (evidence) => `${evidence.layer}:${evidence.artifactId}`);
    const actionType = observation?.subject?.eventType
      ?? (observation?.subject?.target && typeof observation.subject.target === "object" && typeof observation.subject.target.actionType === "string" ? observation.subject.target.actionType : undefined)
      ?? (claim?.statement.subject && typeof claim.statement.subject === "object" && typeof claim.statement.subject.actionType === "string" ? claim.statement.subject.actionType : undefined)
      ?? "learned.action";
    return {
      id: `cluster.${index + 1}`,
      label: claim?.title ?? observation?.title ?? `Step ${index + 1}`,
      actionTemplate: { id: `action.${index + 1}`, actionType, parameters: {}, sourceEvidence: claimEvidence },
      positiveRequirements: uniqueBy((miningRun.claims ?? [])
        .filter((candidate) => candidate.claimType === "candidate_condition")
        .map((candidate) => ({
          signalPath: String(candidate.statement.object?.signalPath ?? candidate.statement.subject.signalPath ?? ""),
          operator: "exists" as const,
          weight: candidate.confidence.score
        }))
        .filter((condition) => condition.signalPath)
        .slice(0, 3), (condition) => condition.signalPath),
      negativeRequirements: [],
      expectedEffects: matchingEffects.map((effect) => ({
        signalPath: effect.signalPath,
        condition: { signalPath: effect.signalPath, operator: "changed" as const },
        probability: actionClaims.find((candidate) => candidate.statement.object?.signalPath === effect.signalPath && candidate.statement.subject.entryId === actionEntryId)?.confidence.score ?? effect.probability,
        evidence: matchingActionClaims
          .filter((candidate) => candidate.statement.object?.signalPath === effect.signalPath)
          .map((candidate) => ({ layer: "evidence_claim" as const, artifactId: candidate.claimId, relationship: candidate.claimType }))
      })),
      possibleSideEffects: [],
      confidence: claim?.confidence.score ?? Math.min(0.85, 0.45 + matchingEffects.length * 0.05 + (observation ? 0.1 : 0)),
      sourceOccurrences: actionEntryId ? [actionEntryId] : [],
      ...(claim ? { metadata: { sourceClaimId: claim.claimId, observationIds: claim.observationIds, factIds: claim.factIds } } : observation ? { metadata: { sourceObservationId: observation.observationId, factIds: observation.factIds } } : {})
    };
  });
  const transitions = actionClusters.slice(0, -1).map((cluster, index) => ({
    id: `transition.${index + 1}`,
    fromClusterId: cluster.id,
    toClusterId: actionClusters[index + 1]!.id,
    probability: 0.8,
    evidence: []
  }));
  return {
    schemaVersion: "0.1",
    learnedTaskModelId: `model.${safeSegment(resolvedTaskId)}.${Date.now()}`,
    taskId: resolvedTaskId,
    version: "0.1",
    actionClusters,
    transitions,
    invariants: miningRun.conditionCandidates.slice(0, 5).map((candidate) => ({ signalPath: candidate.signalPath, operator: "exists" })),
    unresolvedQuestions: miningRun.issues.map((issue, index) => ({ id: `question.${index + 1}`, question: issue, severity: "important", evidence: [] })),
    sourceRecordings: [String(miningRun.metadata?.recordingId ?? "")].filter(Boolean),
    sourceMiningRuns: [miningRun.miningRunId],
    generatedAt: Date.now(),
    metadata: { source: "mined_evidence" }
  };
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function average(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : 0;
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
