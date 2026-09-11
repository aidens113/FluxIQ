import type { NormalizationOptions } from "../../normalization/index.ts";
import type { AppendRecordingEntryInput, CreateRecordingSessionInput, RecordingDomainDefinition, RecordingDomainEventInput, StateSnapshot } from "../../model/index.ts";

export type RecordingProjectRequest = {
  projectId?: string | null;
  summaries?: boolean;
  limit?: number;
  offset?: number;
};

export type CreateRecordingRequest = RecordingProjectRequest & CreateRecordingSessionInput;

export type AppendRecordingEntryRequest = RecordingProjectRequest & {
  recordingId: string;
  entry: AppendRecordingEntryInput;
};

export type UpdateRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  name?: unknown;
  archived?: unknown;
};

export type DeleteRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
};

export type DeleteRecordingsRequest = RecordingProjectRequest & {
  recordingIds: string[];
};

export type GetRecordingEntryStateRequest = {
  projectId: string;
  recordingId: string;
  entryId?: string;
  actionId?: string;
  stateSnapshotId?: string;
  includeState?: boolean;
};

export type GetStateSnapshotRequest = {
  projectId: string;
  recordingId: string;
  stateSnapshotId: string;
  includeState?: boolean;
};

export type RepairRecordingStateIndexRequest = {
  projectId: string;
  recordingId: string;
  mode: "dry_run" | "write";
};

export type GetProposalRequest = RecordingProjectRequest & {
  proposalId: string;
  kind?: "policy" | "recording_flow" | "auto";
};

export type AppendRecordingNoteRequest = RecordingProjectRequest & {
  recordingId: string;
  text?: unknown;
  linkedEntryIds?: unknown;
  startOffsetMs?: unknown;
  endOffsetMs?: unknown;
};

export type AppendRecordingMarkerRequest = RecordingProjectRequest & {
  recordingId: string;
  label?: unknown;
  monotonicOffsetMs?: unknown;
  linkedEntryId?: unknown;
};

export type ListRecordingDomainsResponse = {
  domains: RecordingDomainDefinition[];
};

export type ValidateRecordingDomainEventRequest = RecordingDomainEventInput;

export type AppendRecordingDomainEventRequest = RecordingDomainEventInput;

export type FinalizeRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  endedAt?: number;
};

export type ProcessFinalizedRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  force?: boolean;
};

export type NormalizeRecordingRequest = RecordingProjectRequest & {
  recordingId: string;
  options?: NormalizationOptions;
};

export type RecordingIdProjectRequest = RecordingProjectRequest & {
  recordingId: string;
};

export type NormalizedTimelineProjectRequest = RecordingProjectRequest & {
  normalizedTimelineId: string;
};

export type MineRecordingEvidenceRequest = RecordingProjectRequest & {
  recordingId?: string;
  normalizedTimelineId?: string;
};

export type InspectStateDiffRequest = {
  previous: StateSnapshot;
  current: StateSnapshot;
  includeStable?: boolean;
};
