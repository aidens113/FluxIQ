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
  type RecordingSession,
  type SignalRegistry,
  type StateSnapshot,
  processRecordingDomainEvent
} from "../model";
import type { LearnedTaskModel } from "../learning";
import type { SignalMiningResult } from "../mining";
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

type AutomationStudioProjectIndex = {
  categories: AutomationStudioProjectCategory[];
  projects: AutomationStudioProject[];
};

type RecordingIndex = {
  recordings: { recordingId: string; taskId?: string; startedAt: number; endedAt?: number; updatedAt: number }[];
  normalizedTimelines: { normalizedTimelineId: string; recordingId: string; generatedAt: number }[];
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
  learnedTaskModels: LearnedTaskModel[];
  policyProposals: PolicyProposalArtifact[];
  replayResults: ReplayResultArtifact[];
};

type PipelineIndex = {
  normalizationReviews: { reviewId: string; generatedAt: number }[];
  miningRuns: { miningRunId: string; generatedAt: number }[];
  learnedTaskModels: { learnedTaskModelId: string; generatedAt: number }[];
  policyProposals: { proposalId: string; generatedAt: number; status: PolicyProposalArtifact["status"] }[];
  replayResults: { replayId: string; generatedAt: number }[];
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
      await rm(this.projectFile(input.projectId, "recordings", "sessions", safeSegment(input.recordingId)), { recursive: true, force: true });
      await this.writeRecordingIndex(input.projectId, (index) => ({
        recordings: (index.recordings ?? []).filter((item) => item.recordingId !== input.recordingId),
        normalizedTimelines: index.normalizedTimelines ?? []
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
    const actions = timeline.timeline.filter((entry) => entry.type === "action" || entry.type === "domain_event");
    const deltas = timeline.timeline.filter((entry) => entry.type === "state_delta");
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
        signalPath: stateDelta.path,
        relationship: "possible_effect" as const,
        probability: 0.55,
        delayMs: { min: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs), median: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs), max: Math.max(0, delta.monotonicOffsetMs - action.monotonicOffsetMs) },
        evidence: [{ layer: "normalized_timeline" as const, artifactId: timeline.normalizedTimelineId, entryId: delta.id, signalPath: stateDelta.path }]
      })) ?? []));
    const conditionCandidates = [...new Map(actionEffects.map((effect) => [effect.signalPath, effect])).values()].map((effect) => ({
      signalPath: effect.signalPath,
      role: "context_signal" as const,
      probability: 0.5,
      evidence: effect.evidence
    }));
    const result: SignalMiningResult = {
      schemaVersion: "0.1",
      miningRunId: `mining.${safeSegment(timeline.normalizedTimelineId)}.${Date.now()}`,
      normalizedTimelineId: timeline.normalizedTimelineId,
      windows,
      actionEffects,
      conditionCandidates,
      issues: actions.length ? [] : ["No action/domain events were available to mine."],
      generatedAt: Date.now(),
      metadata: { recordingId: timeline.recordingId }
    };
    await this.writePipelineArtifact(input.projectId, "miningRuns", result.miningRunId, result as unknown as JsonObject);
    return result;
  }

  async learnTaskModel(input: { projectId: string; taskId?: string; miningRunId?: string }): Promise<LearnedTaskModel> {
    const miningRun = input.miningRunId
      ? await this.readPipelineArtifact<SignalMiningResult>(input.projectId, "miningRuns", input.miningRunId)
      : (await this.listPipelineArtifacts(input.projectId)).miningRuns[0];
    if (!miningRun) throw new Error("A mining run is required before learning a task model.");
    const taskId = input.taskId ?? String(miningRun.metadata?.taskId ?? miningRun.metadata?.recordingId ?? "task.learned");
    const actionClusters = miningRun.windows.filter((window) => window.actionEntryId).map((window, index) => ({
      id: `cluster.${index + 1}`,
      label: `Step ${index + 1}`,
      actionTemplate: { id: `action.${index + 1}`, actionType: "learned.action", parameters: {}, sourceEvidence: window.sourceEvidence },
      positiveRequirements: miningRun.conditionCandidates.slice(0, 3).map((candidate) => ({ signalPath: candidate.signalPath, operator: "exists" as const, weight: candidate.probability })),
      negativeRequirements: [],
      expectedEffects: miningRun.actionEffects.filter((effect) => effect.actionOccurrenceId === window.actionEntryId).map((effect) => ({ signalPath: effect.signalPath, condition: { signalPath: effect.signalPath, operator: "changed" as const }, probability: effect.probability, evidence: effect.evidence })),
      possibleSideEffects: [],
      confidence: Math.min(0.85, 0.45 + miningRun.actionEffects.length * 0.05),
      sourceOccurrences: window.actionEntryId ? [window.actionEntryId] : []
    }));
    const transitions = actionClusters.slice(0, -1).map((cluster, index) => ({
      id: `transition.${index + 1}`,
      fromClusterId: cluster.id,
      toClusterId: actionClusters[index + 1]!.id,
      probability: 0.8,
      evidence: []
    }));
    const model: LearnedTaskModel = {
      schemaVersion: "0.1",
      learnedTaskModelId: `model.${safeSegment(taskId)}.${Date.now()}`,
      taskId,
      version: "0.1",
      actionClusters,
      transitions,
      invariants: miningRun.conditionCandidates.slice(0, 5).map((candidate) => ({ signalPath: candidate.signalPath, operator: "exists" })),
      unresolvedQuestions: miningRun.issues.map((issue, index) => ({ id: `question.${index + 1}`, question: issue, severity: "important", evidence: [] })),
      sourceRecordings: [String(miningRun.metadata?.recordingId ?? "")].filter(Boolean),
      sourceMiningRuns: [miningRun.miningRunId],
      generatedAt: Date.now()
    };
    await this.repositories.learnedTaskModels.put(model);
    await this.writePipelineArtifact(input.projectId, "learnedTaskModels", model.learnedTaskModelId, model as unknown as JsonObject);
    return model;
  }

  async proposePolicyFromModel(input: { projectId: string; learnedTaskModelId?: string }): Promise<PolicyProposalArtifact> {
    const model = input.learnedTaskModelId
      ? await this.repositories.learnedTaskModels.get(input.learnedTaskModelId) ?? await this.readPipelineArtifact<LearnedTaskModel>(input.projectId, "learnedTaskModels", input.learnedTaskModelId)
      : (await this.listPipelineArtifacts(input.projectId)).learnedTaskModels[0];
    if (!model) throw new Error("A learned task model is required before proposing a policy.");
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
      sourceEvidence: [{ layer: "learned_task_model", artifactId: model.learnedTaskModelId }],
      generatedMetadata: { generatedBy: "signal_miner", generatedAt: Date.now(), confidence: average(nodes.map((node) => node.generatedMetadata.confidence ?? 0)) },
      metadata: { learnedTaskModelId: model.learnedTaskModelId }
    };
    const proposal: PolicyProposalArtifact = {
      schemaVersion: "0.1",
      proposalId: `proposal.${safeSegment(policy.policyId)}`,
      learnedTaskModelId: model.learnedTaskModelId,
      policy,
      status: "draft",
      summary: `${policy.nodes.length} nodes and ${policy.edges.length} edges proposed from learned evidence.`,
      generatedAt: Date.now()
    };
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
    const learnedTaskModels = await this.readPipelineArtifactList<LearnedTaskModel>(projectId, "learnedTaskModels", index.learnedTaskModels.map((item) => item.learnedTaskModelId));
    const policyProposals = await this.readPipelineArtifactList<PolicyProposalArtifact>(projectId, "policyProposals", index.policyProposals.map((item) => item.proposalId));
    const replayResults = await this.readPipelineArtifactList<ReplayResultArtifact>(projectId, "replayResults", index.replayResults.map((item) => item.replayId));
    return { normalizationReviews, miningRuns, learnedTaskModels, policyProposals, replayResults };
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
      mkdir(path.join(root, "recordings", "sessions"), { recursive: true }),
      mkdir(path.join(root, "recordings", "normalized"), { recursive: true }),
      mkdir(path.join(root, "recordings", "snapshots"), { recursive: true }),
      mkdir(path.join(root, "recordings", "indexes"), { recursive: true }),
      mkdir(path.join(root, "policies"), { recursive: true }),
      mkdir(path.join(root, "pipeline"), { recursive: true }),
      mkdir(path.join(root, "pipeline", "normalization-reviews"), { recursive: true }),
      mkdir(path.join(root, "pipeline", "mining-runs"), { recursive: true }),
      mkdir(path.join(root, "pipeline", "learned-task-models"), { recursive: true }),
      mkdir(path.join(root, "pipeline", "policy-proposals"), { recursive: true }),
      mkdir(path.join(root, "pipeline", "replay-results"), { recursive: true }),
      mkdir(path.join(root, "pipeline", "indexes"), { recursive: true }),
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
    return await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "pipeline", "indexes", "pipeline.json"), () => emptyPipelineIndex()).read();
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

  private pipelineFolder(kind: keyof PipelineIndex): string {
    if (kind === "normalizationReviews") return "normalization-reviews";
    if (kind === "miningRuns") return "mining-runs";
    if (kind === "learnedTaskModels") return "learned-task-models";
    if (kind === "policyProposals") return "policy-proposals";
    return "replay-results";
  }

  private async writePipelineArtifact(projectId: string, kind: keyof PipelineIndex, id: string, artifact: JsonObject): Promise<void> {
    await this.ensureProjectStructure(projectId);
    await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "pipeline", this.pipelineFolder(kind), `${safeSegment(id)}.json`), () => ({})).write(artifact);
    await new ProgramJsonStore<PipelineIndex>(this.projectFile(projectId, "pipeline", "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => upsertPipelineIndex(index, kind, id, Date.now(), artifact.status));
  }

  private async readPipelineArtifact<TArtifact>(projectId: string, kind: keyof PipelineIndex, id: string): Promise<TArtifact | null> {
    await this.ensureProjectStructure(projectId);
    const artifact = await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "pipeline", this.pipelineFolder(kind), `${safeSegment(id)}.json`), () => ({})).read();
    return Object.keys(artifact).length ? artifact as unknown as TArtifact : null;
  }

  private async readPipelineArtifactList<TArtifact>(projectId: string, kind: keyof PipelineIndex, ids: string[]): Promise<TArtifact[]> {
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
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }
    const artifacts: TArtifact[] = [];
    for (const file of files.filter((item) => item.endsWith(".json"))) {
      const data = await new ProgramJsonStore<JsonObject>(path.join(dir, file), () => ({})).read();
      if (Object.keys(data).length) artifacts.push(data as unknown as TArtifact);
    }
    return artifacts;
  }

  private projectArtifactFile(projectId: string, kind: AutomationStudioProjectArtifactKind, artifactId: string): string {
    return this.projectFile(projectId, this.projectArtifactFolder(kind), `${safeSegment(artifactId)}.json`);
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
    const recordingId = safeSegment(recording.recordingId);
    const sessionDir = path.join(this.projectDirectory(projectId), "recordings", "sessions", recordingId);
    await mkdir(path.join(sessionDir, "events"), { recursive: true });
    await mkdir(path.join(sessionDir, "snapshots"), { recursive: true });
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "recording.json"), () => ({ recording: recording as unknown as JsonObject })).write({ recording: recording as unknown as JsonObject });
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "events", "timeline.json"), () => ({ timeline: [] })).write({ timeline: recording.timeline as unknown as JsonObject[] });
    await new ProgramJsonStore<JsonObject>(path.join(sessionDir, "snapshots", "initial-state.json"), () => ({ initialState: recording.initialState as unknown as JsonObject })).write({ initialState: recording.initialState as unknown as JsonObject });
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
    const fileName = `${safeSegment(normalized.normalizedTimelineId)}.json`;
    await new ProgramJsonStore<JsonObject>(this.projectFile(projectId, "recordings", "normalized", fileName), () => ({ normalizedTimeline: normalized as unknown as JsonObject })).write({ normalizedTimeline: normalized as unknown as JsonObject });
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
        this.projectFile(projectId, "recordings", "sessions", safeSegment(item.recordingId), "recording.json"),
        () => ({})
      ).read();
      const recording = stored.recording as unknown as RecordingSession | undefined;
      if (recording?.recordingId) await this.repositories.recordingSessions.put(recording);
    }
    for (const item of index.normalizedTimelines ?? []) {
      const stored = await new ProgramJsonStore<JsonObject>(
        this.projectFile(projectId, "recordings", "normalized", `${safeSegment(item.normalizedTimelineId)}.json`),
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

function emptyPipelineIndex(): PipelineIndex {
  return { normalizationReviews: [], miningRuns: [], learnedTaskModels: [], policyProposals: [], replayResults: [] };
}

function upsertPipelineIndex(index: PipelineIndex, kind: keyof PipelineIndex, id: string, generatedAt: number, status?: unknown): PipelineIndex {
  const item = kind === "normalizationReviews"
    ? { reviewId: id, generatedAt }
    : kind === "miningRuns"
      ? { miningRunId: id, generatedAt }
      : kind === "learnedTaskModels"
        ? { learnedTaskModelId: id, generatedAt }
        : kind === "policyProposals"
          ? { proposalId: id, generatedAt, status: status === "approved" ? "approved" as const : "draft" as const }
          : { replayId: id, generatedAt };
  const key = Object.keys(item)[0] as keyof typeof item;
  return {
    ...emptyPipelineIndex(),
    ...index,
    [kind]: upsertBy((index[kind] as any[]) ?? [], key as any, item as any).sort((left: any, right: any) => right.generatedAt - left.generatedAt)
  };
}

function average(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : 0;
}
