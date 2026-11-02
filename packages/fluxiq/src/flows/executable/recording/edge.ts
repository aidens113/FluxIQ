/** Connection semantics of successive recorded actions; callers own edge identity. */
export function recordingCandidateEdgeRecipe(proposalId: string, sourceNodeId: string, targetNodeId: string) {
  return { sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "ready", metadata: { recordingProposalId: proposalId } };
}
