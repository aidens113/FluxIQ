import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";

// The empty base a recording proposal replaces a primary Subflow with, and the
// check that refuses to discard hand-edited behavior.

export function recordingProposalReplacementBase(flow: AutomationStudioFlowArtifact): AutomationStudioFlowArtifact {
  const generatedNodes = flow.nodes.every((node) => typeof node.metadata?.recordingProposalId === "string"
    && (!Array.isArray(node.metadata.manualProvenance) || node.metadata.manualProvenance.length === 0));
  const generatedEdges = flow.edges.every((edge) => typeof edge.metadata?.recordingProposalId === "string");
  if ((flow.nodes.length || flow.edges.length) && (!generatedNodes || !generatedEdges)) {
    throw new Error("Replacing a primary Subflow is allowed only when its graph is empty or entirely unedited recording-derived behavior.");
  }
  return {
    ...flow,
    nodes: [],
    edges: [],
    metadata: { ...(flow.metadata ?? {}), recordingProposalIds: [] }
  };
}
