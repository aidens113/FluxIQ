import type { AppendRecordingEntryInput, CreateRecordingSessionInput, RecordingDomainEventInput, RecordingDomainEventProcessingResult, RecordingSession } from "@fluxiq/contracts/recording";
import type { RecordingAddress } from "./address.ts";
import type { RecordingReadOutcome } from "./read-outcome.ts";

/** Storage and authorization remain with the program supplying this original sink. */
export interface RecordingSink<TTarget, TEvidence> {
  create(input: CreateRecordingSessionInput<TTarget, TEvidence> & { projectId?: string | null; domainId?: string | null }): Promise<RecordingSession<TTarget, TEvidence>>;
  append(input: RecordingAddress & { entry: AppendRecordingEntryInput<TTarget, TEvidence> }): Promise<RecordingSession<TTarget, TEvidence>>;
  appendBatch(input: RecordingAddress & { entries: AppendRecordingEntryInput<TTarget, TEvidence>[] }): Promise<RecordingSession<TTarget, TEvidence>>;
  appendDomain(input: RecordingDomainEventInput): Promise<RecordingDomainEventProcessingResult<TTarget, TEvidence>>;
  finalize(input: RecordingAddress & { endedAt?: number }): Promise<RecordingSession<TTarget, TEvidence>>;
  read(input: RecordingAddress): Promise<RecordingReadOutcome<TTarget, TEvidence>>;
}
