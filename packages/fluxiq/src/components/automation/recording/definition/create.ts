import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../../definitions.ts";
import type { RecordingFlowActionCandidate } from "../../importer/recording-mapper/index.ts";
import type { RecordingCandidateDefinitionContext } from "../context.ts";
import { recordingCandidateParameters } from "../parameters.ts";
import { recordingProposalDefinitionId } from "./id.ts";
import { recordingCandidateRecordedGapMetadata, recordingCandidateStateLinkMetadata } from "../../../../flows/executable/recording/metadata/index.ts";

export function recordingCandidateDefinition(proposal: RecordingCandidateDefinitionContext, candidate: RecordingFlowActionCandidate, visibility: "private" | "public"): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: recordingProposalDefinitionId(proposal.proposalId, candidate.candidateId),
    version: "1.0.0",
    label: candidate.label ?? candidate.outputId,
    description: candidate.description ?? `Reviewed recording-derived action for ${candidate.outputId}.`,
    category: "recording-derived",
    source: { kind: "recording", proposalId: proposal.proposalId, mapperId: proposal.mapper.id },
    availability: proposal.domainId ? { kind: "domain", domainId: proposal.domainId } : { kind: "global" },
    capabilities: { executable: true, recordable: true, retryable: true },
    outputAction: { fixedOutputId: candidate.outputId },
    inputs: [{ id: "ready", label: "Ready", valueType: "any", role: "control" }],
    // The same records port the policy action declares (K3). A later node can
    // only be wired to a port the definition declares, because an author draws
    // from the definition while materialization into the policy action happens
    // at run and read time; without it a recorded extraction's rows are saved
    // but reach nothing.
    outputs: [
      { id: "success", label: "Success", valueType: "any", role: "success" },
      { id: "failed", label: "Failed", valueType: "any", role: "failure" },
      { id: "records", label: "Records", valueType: "array", role: "data" }
    ],
    parameters: recordingCandidateParameters(candidate),
    icon: "wand-sparkles",
    metadata: {
      visibility,
      candidateId: candidate.candidateId,
      outputId: candidate.outputId,
      parameters: candidate.parameters,
      ...(candidate.expectedConfirmation ? { expectedConfirmation: candidate.expectedConfirmation } : {}),
      ...(candidate.recordOutput ? { recordOutput: structuredClone(candidate.recordOutput) as unknown as JsonObject } : {}),
      ...(candidate.timeoutMs !== undefined ? { timeoutMs: candidate.timeoutMs } : {}),
      evidence: candidate.evidence,
      sourceObservationIds: candidate.sourceObservationIds,
      ...recordingCandidateStateLinkMetadata(candidate),
      ...recordingCandidateRecordedGapMetadata(candidate),
      policyStateEligible: false
    }
  };
}
