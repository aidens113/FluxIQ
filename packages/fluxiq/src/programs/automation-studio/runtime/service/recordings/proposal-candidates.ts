import { randomUUID } from "node:crypto";
import type { IoRegistry } from "../../../../../io/index.ts";
import { safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { RecordingFlowActionCandidate, RecordingFlowProposalArtifact } from "../../recording-flow-proposal.ts";
import { uniqueStrings } from "../collections.ts";
import { recordingFlowActionCandidate as normalizeCandidate, type RecordingCandidateInput } from "../../../../../runtime/recording/mapping/index.ts";
import { recordingCandidateNodeRecipe, recordingCandidateEdgeRecipe } from "../../../../../flows/executable/recording/index.ts";

export { recordingMapperCalls, recordingCandidateGapTracker } from "../../../../../runtime/recording/mapping/index.ts";
export { recordingCandidateRecordedGapMetadata, recordingCandidateStateLinkMetadata } from "../../../../../flows/executable/recording/index.ts";

/** The legacy entry retains Studio's candidate-ID allocator. */
export function recordingFlowActionCandidate(io: IoRegistry, input: Omit<RecordingCandidateInput, "nextCandidateId">): RecordingFlowActionCandidate {
  return normalizeCandidate(io, { ...input, nextCandidateId: (actionEntryId) => `candidate.${safeSegment(actionEntryId)}.${randomUUID()}` });
}

/** Artifact identity, collision handling and editor placement stay with Studio. */
export function appendRecordingProposalToFlow(flow: AutomationStudioFlowArtifact, proposal: RecordingFlowProposalArtifact): AutomationStudioFlowArtifact {
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const nodes = proposal.candidates.map((candidate, index) => {
    let id = `recorded.${safeSegment(candidate.candidateId)}`;
    let suffix = 2;
    while (nodeIds.has(id)) id = `recorded.${safeSegment(candidate.candidateId)}.${suffix++}`;
    nodeIds.add(id);
    const { metadata, ...recipe } = recordingCandidateNodeRecipe(proposal, candidate);
    return { id, ...recipe, position: { x: 120 + index * 340, y: 240 }, metadata };
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `recorded-edge.${safeSegment(proposal.proposalId)}.${index + 1}`,
    ...recordingCandidateEdgeRecipe(proposal.proposalId, nodes[index]!.id, node.id)
  }));
  return { ...flow, nodes: [...flow.nodes, ...nodes], edges: [...flow.edges, ...edges], metadata: { ...(flow.metadata ?? {}), recordingProposalIds: uniqueStrings([...(Array.isArray(flow.metadata?.recordingProposalIds) ? flow.metadata.recordingProposalIds.map(String) : []), proposal.proposalId]) } };
}
