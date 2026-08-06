import type { RecordingSession } from "../model/index.ts";
import { safeSegment } from "../../_shared/storage.ts";
import type { PolicyProposalArtifact } from "./policy-model.ts";

export type PipelineIndex = {
  pipelines: { pipelineId: string; recordingId: string; taskId?: string; updatedAt: number }[];
  normalizationReviews: { reviewId: string; generatedAt: number; recordingId?: string }[];
  miningRuns: { miningRunId: string; generatedAt: number; recordingId?: string }[];
  evidenceFacts: { factId: string; generatedAt: number; recordingId?: string }[];
  evidenceObservations: { observationId: string; generatedAt: number; recordingId?: string }[];
  stateActionCorrelations: { correlationId: string; generatedAt: number; recordingId?: string }[];
  evidenceClaims: { claimId: string; generatedAt: number; recordingId?: string }[];
  learnedTaskModels: { learnedTaskModelId: string; generatedAt: number; recordingId?: string }[];
  policyProposals: { proposalId: string; generatedAt: number; status: PolicyProposalArtifact["status"]; recordingId?: string }[];
  replayResults: { replayId: string; generatedAt: number; recordingId?: string }[];
};

export type PipelineArtifactKind = Exclude<keyof PipelineIndex, "pipelines">;

export type RecordingPipelineDocument = {
  schemaVersion: "0.1";
  pipelineId: string;
  recordingId: string;
  taskId?: string;
  status: "ready" | "processing" | "complete";
  createdAt: number;
  updatedAt: number;
  artifacts: {
    normalizedTimelineIds: string[];
    normalizationReviewIds: string[];
    miningRunIds: string[];
    evidenceFactIds: string[];
    evidenceObservationIds: string[];
    stateActionCorrelationIds: string[];
    evidenceClaimIds: string[];
    learnedTaskModelIds: string[];
    policyProposalIds: string[];
    replayResultIds: string[];
  };
};

export function emptyPipelineIndex(): PipelineIndex {
  return { pipelines: [], normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [], stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: [] };
}

export function upsertPipelineIndex(index: PipelineIndex, kind: PipelineArtifactKind, id: string, generatedAt: number, status?: unknown, recordingId?: string): PipelineIndex {
  const item = kind === "normalizationReviews"
    ? { reviewId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
    : kind === "miningRuns"
      ? { miningRunId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
      : kind === "evidenceFacts"
        ? { factId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
        : kind === "evidenceObservations"
          ? { observationId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
          : kind === "stateActionCorrelations"
            ? { correlationId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
            : kind === "evidenceClaims"
              ? { claimId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
              : kind === "learnedTaskModels"
                ? { learnedTaskModelId: id, generatedAt, ...(recordingId ? { recordingId } : {}) }
                : kind === "policyProposals"
                  ? { proposalId: id, generatedAt, status: status === "approved" ? "approved" as const : "proposed" as const, ...(recordingId ? { recordingId } : {}) }
                  : { replayId: id, generatedAt, ...(recordingId ? { recordingId } : {}) };
  const key = pipelineIndexKey(kind);
  const items = (index[kind] ?? []) as Array<Record<string, unknown> & { generatedAt: number }>;
  const nextItems = [item, ...items.filter((candidate) => candidate[key] !== id)]
    .sort((left, right) => right.generatedAt - left.generatedAt);
  return { ...emptyPipelineIndex(), ...index, [kind]: nextItems } as PipelineIndex;
}

export function pipelineIndexKey(kind: PipelineArtifactKind): string {
  if (kind === "normalizationReviews") return "reviewId";
  if (kind === "miningRuns") return "miningRunId";
  if (kind === "evidenceFacts") return "factId";
  if (kind === "evidenceObservations") return "observationId";
  if (kind === "stateActionCorrelations") return "correlationId";
  if (kind === "evidenceClaims") return "claimId";
  if (kind === "learnedTaskModels") return "learnedTaskModelId";
  if (kind === "policyProposals") return "proposalId";
  return "replayId";
}

export function recordingPipelineId(recordingId: string): string {
  return `pipeline.${safeSegment(recordingId)}`;
}

export function createRecordingPipelineDocument(recording: Pick<RecordingSession, "recordingId" | "taskId" | "startedAt">): RecordingPipelineDocument {
  return {
    schemaVersion: "0.1",
    pipelineId: recordingPipelineId(recording.recordingId),
    recordingId: recording.recordingId,
    ...(recording.taskId !== undefined ? { taskId: recording.taskId } : {}),
    status: "ready",
    createdAt: recording.startedAt,
    updatedAt: Date.now(),
    artifacts: emptyRecordingPipelineArtifacts()
  };
}

export function emptyRecordingPipelineArtifacts(): RecordingPipelineDocument["artifacts"] {
  return {
    normalizedTimelineIds: [], normalizationReviewIds: [], miningRunIds: [], evidenceFactIds: [],
    evidenceObservationIds: [], stateActionCorrelationIds: [], evidenceClaimIds: [], learnedTaskModelIds: [],
    policyProposalIds: [], replayResultIds: []
  };
}

export function addRecordingPipelineArtifactId(pipeline: RecordingPipelineDocument, kind: PipelineArtifactKind, id: string): RecordingPipelineDocument {
  const key = kind === "normalizationReviews" ? "normalizationReviewIds"
    : kind === "miningRuns" ? "miningRunIds"
      : kind === "evidenceFacts" ? "evidenceFactIds"
        : kind === "evidenceObservations" ? "evidenceObservationIds"
          : kind === "stateActionCorrelations" ? "stateActionCorrelationIds"
            : kind === "evidenceClaims" ? "evidenceClaimIds"
              : kind === "learnedTaskModels" ? "learnedTaskModelIds"
                : kind === "policyProposals" ? "policyProposalIds" : "replayResultIds";
  return {
    ...pipeline,
    status: kind === "replayResults" || kind === "policyProposals" ? "complete" : "processing",
    updatedAt: Date.now(),
    artifacts: { ...pipeline.artifacts, [key]: uniqueStrings([id, ...(pipeline.artifacts[key] ?? [])]) }
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
