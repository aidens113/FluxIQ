import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { NormalizedTimeline } from "../../../normalization/index.ts";
import type { CanonicalAutomationStudioRepositories } from "../../../storage/index.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import type { AutomationStudioProjectPaths, AutomationStudioRecordingPaths } from "../paths/index.ts";
import { RecordingProjectMirror } from "./mirror.ts";

/** Project index/file ownership, independent of the global normalized-ID mirror. */
export class RecordingProjectNormalizations {
  private readonly mirror: RecordingProjectMirror<NormalizedTimeline>;

  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly recordingPaths: AutomationStudioRecordingPaths,
    private readonly indexes: AutomationStudioServiceIndexes,
    private readonly repository: CanonicalAutomationStudioRepositories["normalizedTimelines"]
  ) {
    this.mirror = new RecordingProjectMirror(repository, timeline => timeline.normalizedTimelineId);
  }

  async put(timeline: NormalizedTimeline, projectId?: string | null): Promise<NormalizedTimeline> {
    return await this.mirror.put(timeline, { ...(projectId !== undefined ? { projectId } : {}) });
  }

  async list(projectId: string): Promise<NormalizedTimeline[]> {
    if (!this.paths.root) {
      const timelines: NormalizedTimeline[] = [];
      for (const item of await this.repository.list()) {
        const timeline = await this.mirror.readOwned(item.normalizedTimelineId, projectId);
        if (timeline) timelines.push(timeline);
      }
      return timelines;
    }
    const index = await this.indexes.readRecordingIndex(projectId);
    const timelines: NormalizedTimeline[] = [];
    for (const item of index.normalizedTimelines ?? []) timelines.push(await this.get(projectId, item.normalizedTimelineId));
    return timelines;
  }

  async get(projectId: string, normalizedTimelineId: string): Promise<NormalizedTimeline> {
    if (!this.paths.root) {
      const existing = await this.mirror.readOwned(normalizedTimelineId, projectId);
      if (existing) return existing;
      throw new Error(`Unknown normalized timeline for project ${projectId}: ${normalizedTimelineId}`);
    }
    const index = await this.indexes.readRecordingIndex(projectId);
    const item = (index.normalizedTimelines ?? []).find(candidate => candidate.normalizedTimelineId === normalizedTimelineId);
    if (!item) throw new Error(`Unknown normalized timeline for project ${projectId}: ${normalizedTimelineId}`);
    const stored = await new ProgramJsonStore<JsonObject>(this.recordingPaths.recordingDerivedFile(projectId, item.recordingId, "normalization", "timelines", `${safeSegment(normalizedTimelineId)}.json`), () => ({})).read();
    const timeline = stored.normalizedTimeline as unknown as NormalizedTimeline | undefined;
    if (!timeline?.normalizedTimelineId) throw new Error(`Normalized timeline is missing: ${normalizedTimelineId}`);
    if (timeline.normalizedTimelineId !== normalizedTimelineId || timeline.recordingId !== item.recordingId) throw new Error("Normalized timeline storage identity conflict.");
    return await this.mirror.put(timeline, { projectId, loaded: true });
  }

  async deleteForRecordings(projectId: string, recordingIds: ReadonlySet<string>): Promise<void> {
    for (const timeline of await this.repository.list()) {
      if (timeline.metadata?.projectId === projectId && recordingIds.has(timeline.recordingId)) await this.mirror.delete(timeline.normalizedTimelineId, projectId);
    }
  }
}
