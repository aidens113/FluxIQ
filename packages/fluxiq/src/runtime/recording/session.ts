import type { JsonObject } from "../../core/index.ts";
import type { EvidenceReference, ActionEntry, DomainEventEntry, MarkerEntry, ObservationEntry, StateCheckpointEntry, StateDeltaEntry, TimelineBase, TimelineEntry, RecordingNote, RecordingSession, CreateRecordingSessionInput, AppendRecordingEntryInput, ActionChannelDescriptor, EnvironmentDescriptor, SourceDescriptor } from "@fluxiq/contracts/recording";
import type { StateSnapshot } from "@fluxiq/contracts/state";
import { diffStateSnapshots } from "../state/index.ts";
export function createRecordingSession<TTarget = unknown, TEvidence = EvidenceReference>(input: CreateRecordingSessionInput<TTarget, TEvidence>): RecordingSession<TTarget, TEvidence> {
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
    ...(input.description !== undefined ? { description: input.description } : {}),
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

export function appendRecordingEntry<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, input: AppendRecordingEntryInput<TTarget, TEvidence>): RecordingSession<TTarget, TEvidence> {
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
  } as TimelineEntry<TTarget, TEvidence>;
  return { ...recording, timeline: [...recording.timeline, entry] };
}

export function appendRecordingStateCheckpoint<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, state: StateSnapshot, input: Partial<Pick<StateCheckpointEntry, "id" | "timestamp" | "sourceId" | "metadata">> = {}): RecordingSession<TTarget, TEvidence> {
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

export function appendRecordingStateDelta<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, previous: StateSnapshot, current: StateSnapshot, input: Partial<Pick<StateDeltaEntry, "id" | "timestamp" | "sourceId" | "metadata">> = {}): RecordingSession<TTarget, TEvidence> {
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

export function appendRecordingNote<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, note: Omit<RecordingNote, "id" | "timestamp"> & Partial<Pick<RecordingNote, "id" | "timestamp">>): RecordingSession<TTarget, TEvidence> {
  const timestamp = note.timestamp ?? Date.now();
  const id = note.id ?? `note.${recording.notes.length + 1}`;
  const nextNote: RecordingNote = { ...note, id, timestamp };
  const withNote = { ...recording, notes: [...recording.notes, nextNote] };
  const entry: TimelineEntry<TTarget, TEvidence> = {
    ...baseAppendFields(withNote, { id: `entry.${id}`, timestamp }),
    recordingId: withNote.recordingId,
    sequence: nextTimelineSequence(withNote),
    monotonicOffsetMs: 0,
    type: "note",
    noteId: id
  };
  return appendTimelineEntry(withNote, entry);
}

export function finalizeRecordingSession<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, endedAt = Date.now()): RecordingSession<TTarget, TEvidence> {
  return { ...recording, endedAt: Math.max(endedAt, recording.startedAt) };
}

function appendTimelineEntry<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, entry: TimelineEntry<TTarget, TEvidence>): RecordingSession<TTarget, TEvidence> {
  const next = {
    ...entry,
    id: uniqueTimelineEntryId(recording, entry.id),
    recordingId: recording.recordingId,
    sequence: nextTimelineSequence(recording),
    monotonicOffsetMs: Math.max(0, entry.timestamp - recording.startedAt)
  };
  return { ...recording, timeline: [...recording.timeline, next] };
}

function baseAppendFields<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, input: Partial<{ id: string; timestamp: number; sourceId: string; metadata: JsonObject }>): Pick<TimelineBase, "id" | "timestamp" | "sourceId"> & Partial<Pick<TimelineBase, "metadata">> {
  const timestamp = input.timestamp ?? Date.now();
  return {
    id: uniqueTimelineEntryId(recording, input.id ?? `entry.${nextTimelineSequence(recording)}`),
    timestamp,
    sourceId: input.sourceId ?? recording.sources[0]?.id ?? "source.host",
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
  };
}

function nextTimelineSequence<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>): number {
  return recording.timeline.reduce((max, entry) => Math.max(max, entry.sequence), -1) + 1;
}

function uniqueTimelineEntryId<TTarget = unknown, TEvidence = EvidenceReference>(recording: RecordingSession<TTarget, TEvidence>, preferredId: string): string {
  const existing = new Set(recording.timeline.map((entry) => entry.id));
  if (!existing.has(preferredId)) return preferredId;
  let suffix = 2;
  while (existing.has(`${preferredId}.${suffix}`)) suffix += 1;
  return `${preferredId}.${suffix}`;
}
