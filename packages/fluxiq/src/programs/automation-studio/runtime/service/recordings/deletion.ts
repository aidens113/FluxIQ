import { rm } from "node:fs/promises";
import path from "node:path";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioObjectStore, CanonicalAutomationStudioRepositories, RecordingStateIndexStore } from "../../../storage/index.ts";
import { createRecordingPipelineDocument, emptyPipelineIndex, type PipelineArtifactKind, type PipelineIndex, type RecordingPipelineDocument } from "../../pipeline-model.ts";
import { parseAutomationStudioObjectContentRef, recordingIndexStateObjectRefs, type RecordingIndex as RecordingStateIndex } from "../../../storage/index.ts";
import { mapWithConcurrency, uniqueStrings } from "../collections.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import type { AutomationStudioObjectDocuments } from "../object-documents.ts";
import type { AutomationStudioProjectPaths, AutomationStudioRecordingPaths } from "../paths/index.ts";
import { addAutomationStudioObjectSha256s } from "./object-references.ts";
import { emptyPipelineArtifactIdSets, PIPELINE_ARTIFACT_IO_CONCURRENCY, pipelineArtifactKinds, type AutomationStudioRecordingStore } from "./store.ts";

function mergePipelineArtifactIdSets(target: Record<PipelineArtifactKind, Set<string>>, source: Record<PipelineArtifactKind, Set<string>>): void {
  for (const kind of pipelineArtifactKinds()) {
    for (const id of source[kind]) target[kind].add(id);
  }
}

// Deleting recordings, and the physical cleanup that has to follow. A deleted
// recording leaves behind pipeline artifacts and content-addressed objects that
// nothing else references; the prune walks what is still live first, so an
// object shared with a surviving recording is never collected.
export class AutomationStudioRecordingDeletion {
  constructor(
    private readonly projectPaths: AutomationStudioProjectPaths,
    private readonly recordingPaths: AutomationStudioRecordingPaths,
    private readonly indexes: AutomationStudioServiceIndexes,
    private readonly objectDocuments: AutomationStudioObjectDocuments,
    private readonly recordings: AutomationStudioRecordingStore,
    private readonly repositories: CanonicalAutomationStudioRepositories,
    private readonly facade: AutomationStudioFacadePorts,
    private readonly objectStore: AutomationStudioObjectStore | undefined,
    private readonly recordingStateIndexes: RecordingStateIndexStore | undefined
  ) {}

  async deleteRecordings(input: { projectId?: string | null; recordingIds?: string[] }): Promise<{ deletedRecordingIds: string[]; deletedProposalIds: string[] }> {
    const recordingIds = uniqueStrings((input.recordingIds ?? []).map((recordingId) => String(recordingId)).filter(Boolean));
    if (!recordingIds.length) return { deletedRecordingIds: [], deletedProposalIds: [] };
    if (!input.projectId || !this.projectPaths.root) {
      const results = await Promise.all(recordingIds.map((recordingId) => this.facade.deleteRecording({
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

  async collectLiveProjectObjectReferences(projectId: string): Promise<Set<string>> {
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
    const artifacts = await this.facade.listPipelineArtifacts(projectId);
    addAutomationStudioObjectSha256s(refs, artifacts, projectId);
    return refs;
  }

  async pruneUnreferencedProjectObjects(projectId: string): Promise<void> {
    if (!this.objectStore) return;
    const candidates = new Set(await this.objectStore.listProjectObjectSha256s(projectId));
    if (!candidates.size) return;
    const live = await this.collectLiveProjectObjectReferences(projectId);
    const orphaned = [...candidates].filter((sha256) => !live.has(sha256));
    if (orphaned.length) await this.objectStore.deleteProjectObjects(projectId, orphaned);
  }

  async readRecordingStateIndex(projectId: string, recordingId: string): Promise<RecordingStateIndex | null> {
    if (!this.recordingStateIndexes) return null;
    if (!await this.recordingStateIndexes.exists(projectId, recordingId)) return null;
    return await this.recordingStateIndexes.read(projectId, recordingId);
  }
}
