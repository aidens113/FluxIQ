import type { JsonObject } from "../../../../../core/index.ts";
import type { RecordingSession } from "../../../model/index.ts";
import type { RecordingSummaryItem } from "./contracts.ts";

// Projections of a recording session: its listing summary, the timeline-free
// session a summary listing stores, and the timestamps both read.

export function recordingSummaryFromSession(recording: RecordingSession, projectId: string): RecordingSummaryItem {
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

export function summaryRecordingSession(recording: RecordingSession): RecordingSession {
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

export function recordingUpdatedAt(recording: RecordingSession): number {
  return Math.max(recording.endedAt ?? 0, latestTimelineTimestamp(recording), recording.startedAt);
}

export function countRecordingEntryTypes(entries: RecordingSession["timeline"]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => `${type}: ${count}`).join(", ") || "no entries";
}

function stringMetadataValue(metadata: JsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
