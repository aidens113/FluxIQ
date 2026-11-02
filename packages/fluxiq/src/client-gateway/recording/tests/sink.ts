import type { RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingSink, RecordingAddress } from "../../../runtime/recording/sink/index.ts";
import { createRecordingSession, appendRecordingEntry, finalizeRecordingSession, RecordingDomainRegistry, processRecordingDomainEvent } from "../../../runtime/recording/index.ts";

/** A real shared session in memory; capture never receives a Studio service. */
export class MemoryRecordingSink<TTarget, TEvidence> implements RecordingSink<TTarget, TEvidence> {
  readonly recordings = new Map<string, RecordingSession<TTarget, TEvidence>>();
  readonly creates: Parameters<RecordingSink<TTarget, TEvidence>["create"]>[0][] = [];
  readonly batches: Parameters<RecordingSink<TTarget, TEvidence>["appendBatch"]>[0][] = [];
  readonly finalizations: Parameters<RecordingSink<TTarget, TEvidence>["finalize"]>[0][] = [];
  readonly domains = new RecordingDomainRegistry<TTarget, TEvidence>();
  appendError: unknown;
  readError: unknown;

  at(projectId: string | null | undefined, recordingId: string): RecordingSession<TTarget, TEvidence> {
    const recording = this.recordings.get(this.key({ ...(projectId !== undefined ? { projectId } : {}), recordingId }));
    if (!recording) throw new Error("test.recording_not_found");
    return recording;
  }
  async create(input: Parameters<RecordingSink<TTarget, TEvidence>["create"]>[0]) {
    this.creates.push(input);
    const recording = createRecordingSession<TTarget, TEvidence>(input);
    this.store(input, recording);
    return recording;
  }
  async append(input: Parameters<RecordingSink<TTarget, TEvidence>["append"]>[0]) {
    if (this.appendError !== undefined) throw this.appendError;
    const recording = this.writable(input);
    const next = appendRecordingEntry(recording, input.entry);
    this.store(input, next);
    return next;
  }
  async appendBatch(input: Parameters<RecordingSink<TTarget, TEvidence>["appendBatch"]>[0]) {
    this.batches.push(input);
    if (this.appendError !== undefined) throw this.appendError;
    let recording = this.writable(input);
    for (const entry of input.entries) recording = appendRecordingEntry(recording, entry);
    this.store(input, recording);
    return recording;
  }
  async appendDomain(input: Parameters<RecordingSink<TTarget, TEvidence>["appendDomain"]>[0]) {
    if (this.appendError !== undefined) throw this.appendError;
    const result = await processRecordingDomainEvent(this.domains, this.writable(input), input);
    this.store(input, result.recording);
    return result;
  }
  async finalize(input: Parameters<RecordingSink<TTarget, TEvidence>["finalize"]>[0]) {
    this.finalizations.push(input);
    const recording = finalizeRecordingSession(this.at(input.projectId, input.recordingId), input.endedAt);
    this.store(input, recording);
    return recording;
  }
  async read(input: RecordingAddress): ReturnType<RecordingSink<TTarget, TEvidence>["read"]> {
    if (this.readError !== undefined) return { kind: "unavailable", cause: this.readError };
    const recording = this.recordings.get(this.key(input));
    return recording ? { kind: "recording", recording } : { kind: "unavailable", cause: new Error("test.recording_not_found") };
  }
  private writable(input: RecordingAddress) {
    const recording = this.at(input.projectId, input.recordingId);
    if (recording.endedAt !== undefined) throw new Error("test.recording_finalized");
    return recording;
  }
  private store(input: RecordingAddress, recording: RecordingSession<TTarget, TEvidence>) {
    this.recordings.set(this.key(input), recording);
  }
  private key(input: RecordingAddress): string { return JSON.stringify([input.projectId ?? null, input.recordingId]); }
}
