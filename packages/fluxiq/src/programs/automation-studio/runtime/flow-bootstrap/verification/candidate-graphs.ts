import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioSubflowGraphSource } from "../../executor/frames/index.ts";
import type { AutomationStudioBootstrapTopology } from "../index.ts";

/** The exact detached topology's owned sibling graphs; no durable or caller-source fallback. */
export function automationStudioCandidateGraphSource(topology: AutomationStudioBootstrapTopology, parent: AutomationStudioFlowArtifact, fresh: () => Promise<boolean>): AutomationStudioSubflowGraphSource {
  const entries = structuredClone(topology.subflows);
  const owner = structuredClone(parent);
  const load: AutomationStudioSubflowGraphSource["load"] = async (subflowId) => {
    if (!await fresh()) return undefined;
    const entry = entries.find((candidate) => candidate.subflow.subflowId === subflowId);
    if (!entry) return undefined;
    const { subflow } = entry;
    const artifact = structuredClone(entry.graphFlow);
    if (subflow.projectId !== owner.projectId || subflow.flowId !== owner.flowId || artifact.projectId !== owner.projectId
      || artifact.flowId !== subflow.graphFlowId || artifact.metadata?.parentFlowId !== owner.flowId
      || artifact.metadata?.parentSubflowId !== subflowId || artifact.metadata?.subflowGraph !== true) return undefined;
    if (owner.executionDefaults) artifact.executionDefaults = structuredClone(owner.executionDefaults);
    return {
      subflowId, graphRevision: null, artifact,
      graph: { schemaVersion: "0.1", flowId: artifact.flowId, ownerKind: "routine", ownerId: artifact.flowId, name: artifact.name,
        nodes: artifact.nodes, edges: artifact.edges, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt,
        ...(artifact.metadata ? { metadata: artifact.metadata } : {}) }
    };
  };
  return { load, recovery: async () => {
    const recovery = entries.find((entry) => entry.subflow.role === "recovery");
    return recovery ? load(recovery.subflow.subflowId) : undefined;
  } };
}
