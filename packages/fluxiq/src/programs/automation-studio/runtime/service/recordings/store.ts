import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import type { LearnedTaskModel } from "../../../learning/index.ts";
import type { RecordingSession } from "../../../model/index.ts";
import { AutomationStudioObjectStore, type CanonicalAutomationStudioRepositories } from "../../../storage/index.ts";
import {
  addRecordingPipelineArtifactId,
  createRecordingPipelineDocument,
  emptyPipelineIndex,
  type PipelineArtifactKind,
  type PipelineIndex,
  pipelineIndexKey,
  type RecordingPipelineDocument,
  recordingPipelineId,
  upsertPipelineIndex
} from "../../pipeline-model.ts";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioProjectPaths, AutomationStudioRecordingPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import type { AutomationStudioObjectDocuments } from "../object-documents.ts";
import { mapWithConcurrency } from "../collections.ts";
import { upsertBy } from "../collections.ts";

// Recording sessions and the derived pipeline written beside them: the
// pipeline index, its artifact documents, and the physical cleanup that
// follows a deleted recording. The seed-fixture gate is handed in after
// construction because the facade cannot build it until its collaborators
// exist; nothing here runs before that wiring completes.
export class AutomationStudioRecordingStore {
  private ready: Promise<void> = Promise.resolve();

  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly recordingPaths: AutomationStudioRecordingPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly indexes: AutomationStudioServiceIndexes,
    private readonly objectDocuments: AutomationStudioObjectDocuments,
    private readonly repositories: CanonicalAutomationStudioRepositories,
    private readonly objectStore?: AutomationStudioObjectStore
  ) {}

  bindReady(ready: Promise<void>): void {
    this.ready = ready;
  }

  async getRecordingSession(recordingId: string, projectId?: string | null): Promise<RecordingSession> {
    await this.ready;
    const recording = await this.getRawRecordingSession(recordingId, projectId);
    return await this.objectDocuments.hydrateRecordingStateSnapshotRefs(recording, projectId);
  }

  async collectRecordingPipelineArtifactIds(projectId: string, recordingId: string, pipeline: RecordingPipelineDocument, pipelineIndex?: PipelineIndex): Promise<Record<PipelineArtifactKind, Set<string>>> {
    const ids = emptyPipelineArtifactIdSets();
    for (const id of pipeline.artifacts.normalizationReviewIds ?? []) ids.normalizationReviews.add(id);
    for (const id of pipeline.artifacts.miningRunIds ?? []) ids.miningRuns.add(id);
    for (const id of pipeline.artifacts.evidenceFactIds ?? []) ids.evidenceFacts.add(id);
    for (const id of pipeline.artifacts.evidenceObservationIds ?? []) ids.evidenceObservations.add(id);
    for (const id of pipeline.artifacts.stateActionCorrelationIds ?? []) ids.stateActionCorrelations.add(id);
    for (const id of pipeline.artifacts.evidenceClaimIds ?? []) ids.evidenceClaims.add(id);
    for (const id of pipeline.artifacts.learnedTaskModelIds ?? []) ids.learnedTaskModels.add(id);
    for (const id of pipeline.artifacts.policyProposalIds ?? []) ids.policyProposals.add(id);
    for (const id of pipeline.artifacts.recordingFlowProposalIds ?? []) ids.recordingFlowProposals.add(id);
    for (const id of pipeline.artifacts.replayResultIds ?? []) ids.replayResults.add(id);

    const index = pipelineIndex ?? await this.indexes.readPipelineIndex(projectId);
    for (const kind of pipelineArtifactKinds()) {
      const key = pipelineIndexKey(kind);
      for (const item of ((index[kind] as Array<Record<string, unknown>>) ?? [])) {
        const id = typeof item[key] === "string" ? item[key] : undefined;
        if (!id) continue;
        if (item.recordingId === recordingId) {
          ids[kind].add(id);
          continue;
        }
        const artifact = await this.readPipelineArtifact<JsonObject>(projectId, kind, id);
        if (artifact && await this.pipelineArtifactRecordingId(projectId, kind, artifact) === recordingId) ids[kind].add(id);
      }
    }
    return ids;
  }

  async deleteOrphanedPhysicalRecordingSessionDirectories(projectId: string): Promise<void> {
    if (!this.paths.root) return;
    const sessionsDir = this.paths.projectFile(projectId, "recordings");
    const entries = await readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
    if (!entries.length) return;
    const liveRecordingIds = new Set<string>();
    for (const recording of await this.repositories.recordingSessions.list()) {
      if (recording.metadata?.projectId === projectId) liveRecordingIds.add(safeSegment(recording.recordingId));
    }
    const index = await this.indexes.readRecordingIndex(projectId).catch(() => ({ recordings: [], normalizedTimelines: [] }));
    for (const item of index.recordings ?? []) liveRecordingIds.add(safeSegment(item.recordingId));
    await Promise.all(entries
      .filter((entry) => entry.isDirectory() && !liveRecordingIds.has(entry.name))
      .map((entry) => rm(path.join(sessionsDir, entry.name), { recursive: true, force: true })));
  }

  async deletePhysicalJsonFilesMatching(directory: string, predicate: (document: unknown) => boolean): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.deletePhysicalJsonFilesMatching(entryPath, predicate);
        await rm(entryPath, { recursive: false, force: true }).catch(() => undefined);
        return;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) return;
      const parsed = await readJsonFileIfPresent(entryPath);
      if (parsed !== undefined && predicate(parsed)) await rm(entryPath, { force: true });
    }));
  }

  async deletePhysicalSharedPipelineArtifactsForRecording(projectId: string, recordingId: string): Promise<void> {
    const root = this.paths.projectFile(projectId, "pipeline", "shared");
    await this.deletePhysicalJsonFilesMatching(root, (document) => documentBelongsToRecording(document, recordingId));
  }

  async deletePhysicalSharedPipelineArtifactsForRecordings(projectId: string, recordingIds: Set<string>): Promise<void> {
    const root = this.paths.projectFile(projectId, "pipeline", "shared");
    await this.deletePhysicalJsonFilesMatching(root, (document) => {
      for (const recordingId of recordingIds) {
        if (documentBelongsToRecording(document, recordingId)) return true;
      }
      return false;
    });
  }

  async ensureProjectRecordingPipeline(projectId: string, recording: RecordingSession): Promise<RecordingPipelineDocument> {
    await this.projects.ensureProjectStructure(projectId);
    const pipelineId = recordingPipelineId(recording.recordingId);
    const store = new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPaths.recordingPipelineFile(projectId, recording.recordingId),
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
    await new ProgramJsonStore<PipelineIndex>(this.paths.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => ({
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

  async getRawRecordingSession(recordingId: string, projectId?: string | null): Promise<RecordingSession> {
    if (projectId) await this.loadProjectRecording(projectId, recordingId);
    const recording = await this.repositories.recordingSessions.get(recordingId);
    if (!recording) throw new Error(`Unknown Automation Studio recording: ${recordingId}`);
    return recording;
  }

  async loadProjectRecording(projectId: string, recordingId: string): Promise<void> {
    if (!this.paths.root) return;
    const existing = await this.repositories.recordingSessions.get(recordingId);
    if (existing && existing.metadata?.summaryOnly !== true) return;
    const stored = await new ProgramJsonStore<JsonObject>(
      path.join(this.recordingPaths.recordingSessionDirectory(projectId, recordingId), "recording.json"),
      () => ({})
    ).read();
    const recording = stored.recording as unknown as RecordingSession | undefined;
    if (recording?.recordingId) {
      const storedTimeline = await this.readRecordingTimeline(projectId, recordingId);
      const timeline = storedTimeline.length ? storedTimeline : recording.timeline;
      await this.repositories.recordingSessions.put({ ...recording, timeline });
    }
  }

  async pipelineArtifactRecordingId(projectId: string, kind: PipelineArtifactKind, artifact: JsonObject): Promise<string | null> {
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

  async pipelineIndexRecordingId(projectId: string, kind: PipelineArtifactKind, id: string): Promise<string | null> {
    const index = await this.indexes.readPipelineIndex(projectId);
    const key = pipelineIndexKey(kind);
    const item = ((index[kind] as any[]) ?? []).find((candidate) => candidate[key] === id);
    return typeof item?.recordingId === "string" ? item.recordingId : null;
  }

  async prunePhysicalPipelineIndex(projectId: string, recordingId: string, artifactIds: Record<PipelineArtifactKind, Set<string>>): Promise<void> {
    const filePath = this.paths.projectFile(projectId, "indexes", "pipeline.json");
    const parsed = await readJsonFileIfPresent(filePath);
    const document = unwrapProgramJsonDocument(parsed);
    if (!document || typeof document !== "object" || Array.isArray(document)) return;
    const index = { ...emptyPipelineIndex(), ...document as Partial<PipelineIndex> };
    const next: PipelineIndex = {
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
    };
    await mkdir(path.dirname(filePath), { recursive: true });
    const output = isProgramJsonEnvelope(parsed) ? { version: 1, data: next } : next;
    await writeFile(filePath, JSON.stringify(output, null, 2), "utf8");
  }

  async prunePhysicalPipelineIndexForRecordings(projectId: string, recordingIds: Set<string>, artifactIds: Record<PipelineArtifactKind, Set<string>>): Promise<void> {
    const filePath = this.paths.projectFile(projectId, "indexes", "pipeline.json");
    const parsed = await readJsonFileIfPresent(filePath);
    const document = unwrapProgramJsonDocument(parsed);
    if (!document || typeof document !== "object" || Array.isArray(document)) return;
    const index = { ...emptyPipelineIndex(), ...document as Partial<PipelineIndex> };
    const withoutDeleted = (item: { recordingId?: string }, kind: PipelineArtifactKind): boolean => {
      if (item.recordingId && recordingIds.has(item.recordingId)) return false;
      const key = pipelineIndexKey(kind);
      const id = (item as Record<string, unknown>)[key];
      return typeof id !== "string" || !artifactIds[kind].has(id);
    };
    const next: PipelineIndex = {
      pipelines: (index.pipelines ?? []).filter((item) => !recordingIds.has(item.recordingId)),
      normalizationReviews: (index.normalizationReviews ?? []).filter((item) => withoutDeleted(item, "normalizationReviews")),
      miningRuns: (index.miningRuns ?? []).filter((item) => withoutDeleted(item, "miningRuns")),
      evidenceFacts: (index.evidenceFacts ?? []).filter((item) => withoutDeleted(item, "evidenceFacts")),
      evidenceObservations: (index.evidenceObservations ?? []).filter((item) => withoutDeleted(item, "evidenceObservations")),
      stateActionCorrelations: (index.stateActionCorrelations ?? []).filter((item) => withoutDeleted(item, "stateActionCorrelations")),
      evidenceClaims: (index.evidenceClaims ?? []).filter((item) => withoutDeleted(item, "evidenceClaims")),
      learnedTaskModels: (index.learnedTaskModels ?? []).filter((item) => withoutDeleted(item, "learnedTaskModels")),
      policyProposals: (index.policyProposals ?? []).filter((item) => withoutDeleted(item, "policyProposals")),
      recordingFlowProposals: (index.recordingFlowProposals ?? []).filter((item) => withoutDeleted(item, "recordingFlowProposals")),
      replayResults: (index.replayResults ?? []).filter((item) => withoutDeleted(item, "replayResults"))
    };
    await mkdir(path.dirname(filePath), { recursive: true });
    const output = isProgramJsonEnvelope(parsed) ? { version: 1, data: next } : next;
    await writeFile(filePath, JSON.stringify(output, null, 2), "utf8");
  }

  async readPipelineArtifact<TArtifact>(projectId: string, kind: PipelineArtifactKind, id: string): Promise<TArtifact | null> {
    await this.projects.ensureProjectStructure(projectId);
    const recordingId = await this.pipelineIndexRecordingId(projectId, kind, id);
    const filePath = recordingId
      ? this.recordingPaths.recordingPipelineArtifactFile(projectId, recordingId, kind, id)
      : this.paths.projectFile(projectId, "pipeline", "shared", this.recordingPaths.pipelineFolder(kind), `${safeSegment(id)}.json`);
    let artifact = await this.objectDocuments.readArtifactDocument(filePath);
    if (!Object.keys(artifact).length && recordingId) {
      const legacyFilePath = this.recordingPaths.legacyRecordingPipelineArtifactFile(projectId, recordingId, kind, id);
      if (legacyFilePath && legacyFilePath !== filePath) artifact = await this.objectDocuments.readArtifactDocument(legacyFilePath);
    }
    return Object.keys(artifact).length ? artifact as unknown as TArtifact : null;
  }

  async readRecordingTimeline(projectId: string, recordingId: string): Promise<RecordingSession["timeline"]> {
    const filePath = this.recordingPaths.recordingTimelineFile(projectId, recordingId);
    const text = await readFile(filePath, "utf8").catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return "";
      throw error;
    });
    const entries: RecordingSession["timeline"] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      entries.push(JSON.parse(trimmed) as RecordingSession["timeline"][number]);
    }
    return entries;
  }

  async removeRecordingPipelineArtifactId(projectId: string, recordingId: string, kind: "policyProposals" | "recordingFlowProposals", id: string): Promise<void> {
    const key = kind === "policyProposals" ? "policyProposalIds" : "recordingFlowProposalIds";
    const store = new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPaths.recordingPipelineFile(projectId, recordingId),
      () => createRecordingPipelineDocument({ recordingId, startedAt: Date.now() })
    );
    const pipeline = await store.read();
    await store.write({
      ...pipeline,
      updatedAt: Date.now(),
      artifacts: {
        ...pipeline.artifacts,
        [key]: (pipeline.artifacts[key] ?? []).filter((item) => item !== id)
      }
    });
  }

  async removeRecordingPipelineArtifactIds(projectId: string, recordingId: string, key: keyof RecordingPipelineDocument["artifacts"], ids: Set<string>): Promise<void> {
    if (!ids.size) return;
    const store = new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPaths.recordingPipelineFile(projectId, recordingId),
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

  async updateRecordingPipeline(projectId: string, recordingId: string, mutator: (pipeline: RecordingPipelineDocument) => RecordingPipelineDocument): Promise<RecordingPipelineDocument> {
    const recording = await this.getRecordingSession(recordingId, projectId);
    await this.ensureProjectRecordingPipeline(projectId, recording);
    const store = new ProgramJsonStore<RecordingPipelineDocument>(
      this.recordingPaths.recordingPipelineFile(projectId, recordingId),
      () => createRecordingPipelineDocument(recording)
    );
    const next = mutator(await store.read());
    await store.write(next);
    await new ProgramJsonStore<PipelineIndex>(this.paths.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => ({
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

  async writePipelineArtifact(projectId: string, kind: PipelineArtifactKind, id: string, artifact: JsonObject): Promise<void> {
    await this.writePipelineArtifacts(projectId, [{ kind, id, artifact }]);
  }

  async writePipelineArtifacts(projectId: string, artifacts: Array<{ kind: PipelineArtifactKind; id: string; artifact: JsonObject }>): Promise<void> {
    if (!artifacts.length) return;
    await this.projects.ensureProjectStructure(projectId);
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
      for (const item of indexed) prepared.set(`${item.kind}:${item.id}`, await this.objectDocuments.prepareArtifactDocument(projectId, item.artifact));
      const recordings = new Map<string, RecordingSession>();
      for (const recordingId of byRecording.keys()) recordings.set(recordingId, await this.getRecordingSession(recordingId, projectId));
      const indexPath = this.paths.projectFile(projectId, "indexes", "pipeline.json");
      await ProgramJsonStore.transaction(indexPath, async (transaction) => {
        let index = await transaction.read(indexPath, emptyPipelineIndex);
        for (const item of aggregateArtifacts) {
          const filePath = this.paths.projectFile(projectId, "pipeline", "shared", this.recordingPaths.pipelineFolder(item.kind), `${safeSegment(item.id)}.json`);
          await transaction.write(filePath, prepared.get(`${item.kind}:${item.id}`)!);
        }
        for (const [recordingId, items] of byRecording) {
          const recording = recordings.get(recordingId)!;
          const pipelinePath = this.recordingPaths.recordingPipelineFile(projectId, recordingId);
          let pipeline = await transaction.read(pipelinePath, () => createRecordingPipelineDocument(recording));
          for (const item of items) {
            pipeline = addRecordingPipelineArtifactId(pipeline, item.kind, item.id);
            await transaction.write(this.recordingPaths.recordingPipelineArtifactFile(projectId, recordingId, item.kind, item.id), prepared.get(`${item.kind}:${item.id}`)!);
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
    await mapWithConcurrency(aggregateArtifacts, PIPELINE_ARTIFACT_IO_CONCURRENCY, async (item) => this.objectDocuments.writeArtifactDocument(
      projectId,
      this.paths.projectFile(projectId, "pipeline", "shared", this.recordingPaths.pipelineFolder(item.kind), `${safeSegment(item.id)}.json`),
      item.artifact
    ));
    for (const [recordingId, items] of byRecording) await this.writeRecordingPipelineArtifacts(projectId, recordingId, items);
    await new ProgramJsonStore<PipelineIndex>(this.paths.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => indexed.reduce(
      (next, item) => upsertPipelineIndex(next, item.kind, item.id, generatedAt, item.artifact.status, item.recordingId),
      index
    ));
  }

  async writePipelineIndexWithoutRecordings(projectId: string, recordingIds: Set<string>, artifactIds: Record<PipelineArtifactKind, Set<string>>): Promise<void> {
    const withoutDeleted = (item: { recordingId?: string }, kind: PipelineArtifactKind): boolean => {
      if (item.recordingId && recordingIds.has(item.recordingId)) return false;
      const key = pipelineIndexKey(kind);
      const id = (item as Record<string, unknown>)[key];
      return typeof id !== "string" || !artifactIds[kind].has(id);
    };
    const nextIndex = (index: PipelineIndex): PipelineIndex => ({
      pipelines: (index.pipelines ?? []).filter((item) => !recordingIds.has(item.recordingId)),
      normalizationReviews: (index.normalizationReviews ?? []).filter((item) => withoutDeleted(item, "normalizationReviews")),
      miningRuns: (index.miningRuns ?? []).filter((item) => withoutDeleted(item, "miningRuns")),
      evidenceFacts: (index.evidenceFacts ?? []).filter((item) => withoutDeleted(item, "evidenceFacts")),
      evidenceObservations: (index.evidenceObservations ?? []).filter((item) => withoutDeleted(item, "evidenceObservations")),
      stateActionCorrelations: (index.stateActionCorrelations ?? []).filter((item) => withoutDeleted(item, "stateActionCorrelations")),
      evidenceClaims: (index.evidenceClaims ?? []).filter((item) => withoutDeleted(item, "evidenceClaims")),
      learnedTaskModels: (index.learnedTaskModels ?? []).filter((item) => withoutDeleted(item, "learnedTaskModels")),
      policyProposals: (index.policyProposals ?? []).filter((item) => withoutDeleted(item, "policyProposals")),
      recordingFlowProposals: (index.recordingFlowProposals ?? []).filter((item) => withoutDeleted(item, "recordingFlowProposals")),
      replayResults: (index.replayResults ?? []).filter((item) => withoutDeleted(item, "replayResults"))
    });
    await new ProgramJsonStore<PipelineIndex>(this.paths.projectFile(projectId, "indexes", "pipeline.json"), () => emptyPipelineIndex()).update((index) => nextIndex({ ...emptyPipelineIndex(), ...index }));
    await this.prunePhysicalPipelineIndexForRecordings(projectId, recordingIds, artifactIds);
  }

  async writeRecordingPipelineArtifacts(projectId: string, recordingId: string, artifacts: Array<{ kind: PipelineArtifactKind; id: string; artifact: JsonObject }>): Promise<void> {
    const recording = await this.repositories.recordingSessions.get(recordingId) ?? await this.getRecordingSession(recordingId, projectId).catch(() => null);
    if (!recording || !artifacts.length) return;
    await this.ensureProjectRecordingPipeline(projectId, recording);
    await mapWithConcurrency(artifacts, PIPELINE_ARTIFACT_IO_CONCURRENCY, async (item) => this.objectDocuments.writeArtifactDocument(projectId, this.recordingPaths.recordingPipelineArtifactFile(projectId, recordingId, item.kind, item.id), item.artifact));
    await this.updateRecordingPipeline(projectId, recordingId, (pipeline) => artifacts.reduce((next, item) => addRecordingPipelineArtifactId(next, item.kind, item.id), pipeline));
  }
}

export const PIPELINE_ARTIFACT_IO_CONCURRENCY = 16;

export function emptyPipelineArtifactIdSets(): Record<PipelineArtifactKind, Set<string>> {
  return {
    normalizationReviews: new Set(),
    miningRuns: new Set(),
    evidenceFacts: new Set(),
    evidenceObservations: new Set(),
    stateActionCorrelations: new Set(),
    evidenceClaims: new Set(),
    learnedTaskModels: new Set(),
    policyProposals: new Set(),
    recordingFlowProposals: new Set(),
    replayResults: new Set()
  };
}

export function pipelineArtifactKinds(): PipelineArtifactKind[] {
  return [
    "normalizationReviews",
    "miningRuns",
    "evidenceFacts",
    "evidenceObservations",
    "stateActionCorrelations",
    "evidenceClaims",
    "learnedTaskModels",
    "policyProposals",
    "recordingFlowProposals",
    "replayResults"
  ];
}

function documentBelongsToRecording(document: unknown, recordingId: string): boolean {
  const unwrapped = unwrapProgramJsonDocument(document);
  const record = unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped) ? unwrapped as Record<string, unknown> : null;
  if (!record) return false;
  if (record.recordingId === recordingId) return true;
  const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata as Record<string, unknown> : null;
  if (metadata?.recordingId === recordingId) return true;
  return Array.isArray(record.sourceRecordings) && record.sourceRecordings.includes(recordingId);
}

function isProgramJsonEnvelope(document: unknown): document is { version: 1; data: Record<string, unknown> } {
  const record = document && typeof document === "object" && !Array.isArray(document) ? document as Record<string, unknown> : null;
  return Boolean(record?.version === 1 && record.data && typeof record.data === "object" && !Array.isArray(record.data));
}

async function readJsonFileIfPresent(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function unwrapProgramJsonDocument(document: unknown): unknown {
  return isProgramJsonEnvelope(document) ? document.data : document;
}
