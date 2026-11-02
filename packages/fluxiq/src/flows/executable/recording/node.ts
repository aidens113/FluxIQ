import type { RecordingFlowActionCandidate } from "../../../components/automation/importer/recording-mapper/index.ts";
import type { RecordingRecipeContext } from "./context.ts";
import { recordingCandidateExecutionParameters } from "./parameters.ts";
import { recordingCandidateRecordedGapMetadata, recordingCandidateStateLinkMetadata } from "./metadata/index.ts";

/** The executable node body, independent of artifact IDs and editor placement. */
export function recordingCandidateNodeRecipe(proposal: RecordingRecipeContext, candidate: RecordingFlowActionCandidate) {
  return {
    definitionId: "builtin.policy.action",
    label: candidate.label ?? candidate.outputId,
    ...(candidate.description ? { description: candidate.description } : {}),
    parameterValues: recordingCandidateExecutionParameters(candidate),
    metadata: {
      recordingProposalId: proposal.proposalId,
      recordingCandidateId: candidate.candidateId,
      mapperId: proposal.mapper.id,
      mapperVersion: proposal.mapper.version,
      actionEntryId: candidate.actionEntryId,
      timelineEntryId: candidate.actionEntryId,
      ...recordingCandidateStateLinkMetadata(candidate),
      ...recordingCandidateRecordedGapMetadata(candidate),
      sourceObservationIds: candidate.sourceObservationIds,
      evidence: candidate.evidence,
      rawEvidenceImmutable: true,
      manualProvenance: []
    }
  };
}
