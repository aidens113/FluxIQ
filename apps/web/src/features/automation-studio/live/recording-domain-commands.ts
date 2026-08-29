import {
  addAutomationRecordingMarker,
  addAutomationRecordingNote,
  createAutomationRecording,
  deleteAutomationRecording,
  deleteAutomationRecordings,
  finalizeAutomationRecording,
  normalizeAutomationRecording,
  updateAutomationRecording,
  type AutomationRecordingCleanup,
  type AutomationRecordingCleanupTransaction,
  type AutomationRecordingCommandOutcome
} from "../recordings/commands";
import type { AutomationProjectApi } from "../project/project-api";
import type { AutomationProjectDataPlatform } from "../sync/useAutomationProjectDataPlatform";
import type { JsonObject } from "../../programs/program-api";
import type { AutomationLiveCommandScopeController } from "./command-scope";

function recordingFailure<T>(message: string): AutomationRecordingCommandOutcome<T> {
  return { status: "failure", code: "PROJECT_REQUIRED", error: message };
}

export class AutomationLiveRecordingCommands {
  constructor(
    private readonly api: AutomationProjectApi,
    private readonly data: AutomationProjectDataPlatform,
    private readonly scopes: AutomationLiveCommandScopeController
  ) {}

  create<TRecording>(input: {
    recordingId: string;
    taskId: string;
    authorizationPin: string;
    environment: JsonObject;
    initialState: JsonObject;
    metadata?: JsonObject;
  }) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(recordingFailure<{ recording: TRecording; recordingId: string }>("Open a project before creating a Recording."));
    return createAutomationRecording<TRecording>({ scope, ...input, signal: this.scopes.signal() }, this.capabilities());
  }

  finalize<TRecording>(recordingId: string, authorizationPin: string) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(recordingFailure<{ recording: TRecording; recordingId: string }>("Open a project before finalizing a Recording."));
    return finalizeAutomationRecording<TRecording>({ scope, recordingId, authorizationPin, signal: this.scopes.signal() }, this.capabilities());
  }

  normalize<TTimeline, TReview = unknown>(recordingId: string) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(recordingFailure<{ timeline: TTimeline; review: TReview | null; reviewError: string | null; recordingId: string }>("Open a project before normalizing a Recording."));
    return normalizeAutomationRecording<TTimeline, TReview>({ scope, recordingId, signal: this.scopes.signal() }, this.capabilities());
  }

  update<TRecording>(recordingId: string, changes: JsonObject, authorizationPin: string) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(recordingFailure<{ recording: TRecording | null; recordingId: string }>("Open a project before updating a Recording."));
    return updateAutomationRecording<TRecording>({ scope, recordingId, changes, authorizationPin, signal: this.scopes.signal() }, this.capabilities());
  }

  delete(recordingId: string, authorizationPin: string, transaction: AutomationRecordingCleanupTransaction) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(recordingFailure<AutomationRecordingCleanup>("Open a project before deleting a Recording."));
    return deleteAutomationRecording({ scope, recordingId, authorizationPin, signal: this.scopes.signal() }, {
      ...this.capabilities(),
      cleanup: transaction
    });
  }

  deleteMany(recordingIds: readonly string[], authorizationPin: string, transaction: AutomationRecordingCleanupTransaction) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(recordingFailure<AutomationRecordingCleanup>("Open a project before deleting Recordings."));
    return deleteAutomationRecordings({ scope, recordingIds, authorizationPin, signal: this.scopes.signal() }, {
      ...this.capabilities(),
      cleanup: transaction
    });
  }

  addNote<TRecording>(recordingId: string, text: string, authorizationPin: string, linkedEntryId?: string) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(recordingFailure<{ recording: TRecording | null; recordingId: string }>("Open a project before adding a Recording note."));
    return addAutomationRecordingNote<TRecording>({
      scope,
      recordingId,
      text,
      authorizationPin,
      ...(linkedEntryId ? { linkedEntryId } : {}),
      signal: this.scopes.signal()
    }, this.capabilities());
  }

  addMarker<TRecording>(recordingId: string, label: string, authorizationPin: string, linkedEntryId?: string, monotonicOffsetMs?: number) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(recordingFailure<{ recording: TRecording | null; recordingId: string }>("Open a project before adding a Recording marker."));
    return addAutomationRecordingMarker<TRecording>({
      scope,
      recordingId,
      label,
      authorizationPin,
      ...(linkedEntryId ? { linkedEntryId } : {}),
      ...(monotonicOffsetMs !== undefined ? { monotonicOffsetMs } : {}),
      signal: this.scopes.signal()
    }, this.capabilities());
  }

  async loadDetail<TRecording>(recordingId: string): Promise<TRecording | null> {
    const scope = this.scopes.current();
    if (!scope) return null;
    try {
      const value = await this.data.readThrough<TRecording>({
        scope: "recording",
        projectId: scope.projectId,
        resourceId: recordingId,
        maxAgeMs: 60_000,
        load: async (signal) => {
          const response = await this.api.post<{ recording?: TRecording }>("get-recording", {
            projectId: scope.projectId,
            recordingId
          }, { signal });
          if (!response.ok || !response.payload?.recording) throw new Error(response.error ?? "Recording could not be loaded.");
          return response.payload.recording;
        }
      });
      return this.scopes.isCurrent(scope) ? value ?? null : null;
    } catch {
      return null;
    }
  }

  async loadLatestTimeline<TTimeline extends { normalizedTimelineId?: string; recordingId?: string; generatedAt?: number }>(recordingId: string): Promise<TTimeline | null> {
    const scope = this.scopes.current();
    if (!scope) return null;
    try {
      const value = await this.data.readThrough<TTimeline | null>({
        scope: "timeline",
        projectId: scope.projectId,
        resourceId: recordingId,
        maxAgeMs: 60_000,
        load: async (signal) => {
          const summaries = await this.api.post<{ normalizedTimelines?: TTimeline[] }>("list-normalized-timeline-summaries", {
            projectId: scope.projectId
          }, { signal });
          if (!summaries.ok) throw new Error(summaries.error ?? "Timeline summaries could not be loaded.");
          const summary = [...(summaries.payload?.normalizedTimelines ?? [])]
            .filter((timeline) => timeline.recordingId === recordingId)
            .sort((left, right) => Number(right.generatedAt ?? 0) - Number(left.generatedAt ?? 0))[0];
          if (!summary?.normalizedTimelineId) return null;
          const detail = await this.api.post<{ normalizedTimeline?: TTimeline }>("get-normalized-timeline", {
            projectId: scope.projectId,
            normalizedTimelineId: summary.normalizedTimelineId
          }, { signal });
          if (!detail.ok) throw new Error(detail.error ?? "Timeline could not be loaded.");
          return detail.payload?.normalizedTimeline ?? null;
        }
      });
      return this.scopes.isCurrent(scope) ? value ?? null : null;
    } catch {
      return null;
    }
  }

  private capabilities() {
    return {
      api: this.api,
      isCurrent: (candidate: { projectId: string; generation: number }) => this.scopes.isCurrent(candidate)
    };
  }
}
