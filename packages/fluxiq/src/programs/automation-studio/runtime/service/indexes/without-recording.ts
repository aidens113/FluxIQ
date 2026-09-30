import type { PipelineArtifactKind, PipelineIndex } from "../../pipeline-model.ts";

/**
 * The project's pipeline index with a deleted recording taken out of it.
 *
 * A row goes when it names the recording, or when its artifact is one of the
 * recording's (`artifactIds`), which catches rows written before the index
 * carried a `recordingId`. The pipeline rows carry no artifact id, so only the
 * recording decides them. Both the object-store and the physical deletion
 * paths prune with this, so the two cannot drift on what a recording owns.
 */
export function pipelineIndexWithoutRecording(index: Partial<PipelineIndex>, recordingId: string, artifactIds: Record<PipelineArtifactKind, Set<string>>): PipelineIndex {
  const kept = (item: { recordingId?: string }, kind: PipelineArtifactKind, id: string) => item.recordingId !== recordingId && !artifactIds[kind].has(id);
  return {
    pipelines: (index.pipelines ?? []).filter((item) => item.recordingId !== recordingId),
    normalizationReviews: (index.normalizationReviews ?? []).filter((item) => kept(item, "normalizationReviews", item.reviewId)),
    miningRuns: (index.miningRuns ?? []).filter((item) => kept(item, "miningRuns", item.miningRunId)),
    evidenceFacts: (index.evidenceFacts ?? []).filter((item) => kept(item, "evidenceFacts", item.factId)),
    evidenceObservations: (index.evidenceObservations ?? []).filter((item) => kept(item, "evidenceObservations", item.observationId)),
    stateActionCorrelations: (index.stateActionCorrelations ?? []).filter((item) => kept(item, "stateActionCorrelations", item.correlationId)),
    evidenceClaims: (index.evidenceClaims ?? []).filter((item) => kept(item, "evidenceClaims", item.claimId)),
    learnedTaskModels: (index.learnedTaskModels ?? []).filter((item) => kept(item, "learnedTaskModels", item.learnedTaskModelId)),
    policyProposals: (index.policyProposals ?? []).filter((item) => kept(item, "policyProposals", item.proposalId)),
    recordingFlowProposals: (index.recordingFlowProposals ?? []).filter((item) => kept(item, "recordingFlowProposals", item.proposalId)),
    replayResults: (index.replayResults ?? []).filter((item) => kept(item, "replayResults", item.replayId))
  };
}
