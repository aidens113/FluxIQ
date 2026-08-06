import type { JsonObject } from "../../../core/index.ts";
import type { ActionEntry, DomainEventEntry, MarkerEntry, ObservationEntry, StateCheckpointEntry, StateDeltaEntry, TimelineBase, TimelineEntry } from "./timeline.ts";
import type { RecordingNote, RecordingSession } from "./recordings.ts";
import type { ActionChannelDescriptor, EnvironmentDescriptor, SourceDescriptor } from "./descriptors.ts";
import type { StateSnapshot } from "./state.ts";
import { diffStateSnapshots } from "./state-diff.ts";

export type CreateRecordingSessionInput = {
  recordingId: string;
  taskId?: string;
  startedAt?: number;
  environment?: Partial<EnvironmentDescriptor>;
  sources?: SourceDescriptor[];
  actionChannels?: ActionChannelDescriptor[];
  initialState: StateSnapshot;
  metadata?: JsonObject;
};

export type AppendRecordingEntryInput =
  | Omit<ActionEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<ActionEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<ObservationEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<ObservationEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<DomainEventEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<DomainEventEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>
  | Omit<MarkerEntry, "id" | "recordingId" | "timestamp" | "monotonicOffsetMs" | "sequence" | "sourceId"> & Partial<Pick<MarkerEntry, "id" | "timestamp" | "monotonicOffsetMs" | "sourceId">>;

export function createRecordingSession(input: CreateRecordingSessionInput): RecordingSession {
  const startedAt = input.startedAt ?? Date.now();
  const environment: EnvironmentDescriptor = {
    id: input.environment?.id ?? "environment.unspecified",
    label: input.environment?.label ?? "Unspecified environment",
    kind: input.environment?.kind ?? "unspecified",
    ...(input.environment?.domainId !== undefined ? { domainId: input.environment.domainId } : { domainId: null }),
    ...(input.environment?.capabilities !== undefined ? { capabilities: input.environment.capabilities } : {}),
    ...(input.environment?.metadata !== undefined ? { metadata: input.environment.metadata } : {})
  };
  return {
    schemaVersion: "0.1",
    recordingId: input.recordingId,
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    startedAt,
    environment,
    sources: input.sources?.length ? input.sources : [{ id: "source.host", kind: "event", label: "Host" }],
    actionChannels: input.actionChannels ?? [],
    initialState: input.initialState,
    timeline: [],
    notes: [],
    metadata: input.metadata ?? {}
  };
}

export function appendRecordingEntry(recording: RecordingSession, input: AppendRecordingEntryInput): RecordingSession {
  const timestamp = input.timestamp ?? Date.now();
  const sequence = nextTimelineSequence(recording);
  const entry = {
    ...input,
    id: uniqueTimelineEntryId(recording, input.id ?? `entry.${sequence}`),
    recordingId: recording.recordingId,
    timestamp,
    monotonicOffsetMs: input.monotonicOffsetMs ?? Math.max(0, timestamp - recording.startedAt),
    sequence,
    sourceId: input.sourceId ?? recording.sources[0]?.id ?? "source.host"
  } as TimelineEntry;
  return { ...recording, timeline: [...recording.timeline, entry] };
}

export function appendRecordingStateCheckpoint(recording: RecordingSession, state: StateSnapshot, input: Partial<Pick<StateCheckpointEntry, "id" | "timestamp" | "sourceId" | "metadata">> = {}): RecordingSession {
  const entry: StateCheckpointEntry = {
    ...baseAppendFields(recording, input),
    recordingId: recording.recordingId,
    sequence: nextTimelineSequence(recording),
    monotonicOffsetMs: 0,
    type: "state_checkpoint",
    state
  };
  return appendTimelineEntry(recording, entry);
}

export function appendRecordingStateDelta(recording: RecordingSession, previous: StateSnapshot, current: StateSnapshot, input: Partial<Pick<StateDeltaEntry, "id" | "timestamp" | "sourceId" | "metadata">> = {}): RecordingSession {
  const entry: StateDeltaEntry = {
    ...baseAppendFields(recording, input),
    recordingId: recording.recordingId,
    sequence: nextTimelineSequence(recording),
    monotonicOffsetMs: 0,
    type: "state_delta",
    deltas: diffStateSnapshots(previous, current)
  };
  return appendTimelineEntry(recording, entry);
}

export function appendRecordingNote(recording: RecordingSession, note: Omit<RecordingNote, "id" | "timestamp"> & Partial<Pick<RecordingNote, "id" | "timestamp">>): RecordingSession {
  const timestamp = note.timestamp ?? Date.now();
  const id = note.id ?? `note.${recording.notes.length + 1}`;
  const nextNote: RecordingNote = { ...note, id, timestamp };
  const withNote = { ...recording, notes: [...recording.notes, nextNote] };
  const entry: TimelineEntry = {
    ...baseAppendFields(withNote, { id: `entry.${id}`, timestamp }),
    recordingId: withNote.recordingId,
    sequence: nextTimelineSequence(withNote),
    monotonicOffsetMs: 0,
    type: "note",
    noteId: id
  };
  return appendTimelineEntry(withNote, entry);
}

export function finalizeRecordingSession(recording: RecordingSession, endedAt = Date.now()): RecordingSession {
  return { ...recording, endedAt: Math.max(endedAt, recording.startedAt) };
}

function appendTimelineEntry(recording: RecordingSession, entry: TimelineEntry): RecordingSession {
  const next = {
    ...entry,
    id: uniqueTimelineEntryId(recording, entry.id),
    recordingId: recording.recordingId,
    sequence: nextTimelineSequence(recording),
    monotonicOffsetMs: Math.max(0, entry.timestamp - recording.startedAt)
  };
  return { ...recording, timeline: [...recording.timeline, next] };
}

function baseAppendFields(recording: RecordingSession, input: Partial<{ id: string; timestamp: number; sourceId: string; metadata: JsonObject }>): Pick<TimelineBase, "id" | "timestamp" | "sourceId"> & Partial<Pick<TimelineBase, "metadata">> {
  const timestamp = input.timestamp ?? Date.now();
  return {
    id: uniqueTimelineEntryId(recording, input.id ?? `entry.${nextTimelineSequence(recording)}`),
    timestamp,
    sourceId: input.sourceId ?? recording.sources[0]?.id ?? "source.host",
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
  };
}

function nextTimelineSequence(recording: RecordingSession): number {
  return recording.timeline.reduce((max, entry) => Math.max(max, entry.sequence), -1) + 1;
}

function uniqueTimelineEntryId(recording: RecordingSession, preferredId: string): string {
  const existing = new Set(recording.timeline.map((entry) => entry.id));
  if (!existing.has(preferredId)) return preferredId;
  let suffix = 2;
  while (existing.has(`${preferredId}.${suffix}`)) suffix += 1;
  return `${preferredId}.${suffix}`;
}
