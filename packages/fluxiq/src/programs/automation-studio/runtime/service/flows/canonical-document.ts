import type { AutomationStudioFlowArtifact, AutomationStudioFlowDocument } from "../../../model/index.ts";

// A Flow artifact read as the canonical Flow document the policy projector
// and the runtime both expect. Shared: proposal approval projects a policy
// onto it, and the runtime session methods on the facade execute it.
export function canonicalFlowDocument(flow: AutomationStudioFlowArtifact): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: flow.flowId,
    ownerKind: "policy",
    ownerId: flow.flowId,
    name: flow.name,
    ...(flow.description ? { description: flow.description } : {}),
    nodes: structuredClone(flow.nodes),
    edges: structuredClone(flow.edges),
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    metadata: { canonicalFlow: true }
  };
}
