import type { ExecutableFlow } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../flows/authoring/model/index.ts";
import { automationStudioPinOfSubflowId, type AutomationStudioSubflowGraphSource } from "../../../../engine/automation/frames/index.ts";
import type { AutomationStudioBootstrapTopology } from "../index.ts";

export type AutomationStudioCandidateGraphSource = AutomationStudioSubflowGraphSource & {
  /** Only exact artifact objects produced by this trusted source retain Studio context. */
  artifactFor(artifact: ExecutableFlow | undefined): AutomationStudioFlowArtifact | undefined;
  /** The saved parts' versions this source handed out, for attributing what their frames did. */
  pinnedGraphs(): AutomationStudioFlowArtifact[];
};

/**
 * The exact detached topology's owned sibling graphs, with no durable or caller-source fallback for them.
 * `library` is asked only for a pin (`engine/automation/frames/part-pin.ts`), and what it answers runs only
 * when it proves it is that version made a graph of this Flow's run, exactly as a real run's source proves it.
 */
export function automationStudioCandidateGraphSource(topology: AutomationStudioBootstrapTopology, parent: AutomationStudioFlowArtifact, fresh: () => Promise<boolean>, library?: Pick<AutomationStudioSubflowGraphSource, "load" | "pinRefusal">): AutomationStudioCandidateGraphSource {
  const entries = structuredClone(topology.subflows);
  const owner = structuredClone(parent);
  const artifacts = new WeakMap<ExecutableFlow, AutomationStudioFlowArtifact>();
  const pinned = new Map<string, AutomationStudioFlowArtifact>();
  const loadPinned: AutomationStudioSubflowGraphSource["load"] = async (subflowId) => {
    const pin = automationStudioPinOfSubflowId(subflowId);
    const target = pin ? await library?.load(subflowId) : undefined;
    const found = target?.artifact as AutomationStudioFlowArtifact | undefined;
    const named = found?.metadata?.projectPart as { partId?: unknown; version?: unknown } | undefined;
    if (!pin || !target || !found || found.projectId !== owner.projectId || found.metadata?.parentFlowId !== owner.flowId
      || found.metadata?.parentSubflowId !== subflowId || found.metadata?.subflowGraph !== true || named?.partId !== pin.partId || named?.version !== pin.version) return undefined;
    const artifact = structuredClone(found);
    if (owner.executionDefaults) artifact.executionDefaults = structuredClone(owner.executionDefaults);
    artifacts.set(artifact, artifact);
    pinned.set(subflowId, artifact);
    return { ...target, artifact };
  };
  const load: AutomationStudioSubflowGraphSource["load"] = async (subflowId) => {
    if (!await fresh()) return undefined;
    const entry = entries.find((candidate) => candidate.subflow.subflowId === subflowId);
    if (!entry) return await loadPinned(subflowId);
    const { subflow } = entry;
    const artifact = structuredClone(entry.graphFlow);
    if (subflow.projectId !== owner.projectId || subflow.flowId !== owner.flowId || artifact.projectId !== owner.projectId
      || artifact.flowId !== subflow.graphFlowId || artifact.metadata?.parentFlowId !== owner.flowId
      || artifact.metadata?.parentSubflowId !== subflowId || artifact.metadata?.subflowGraph !== true) return undefined;
    if (owner.executionDefaults) artifact.executionDefaults = structuredClone(owner.executionDefaults);
    artifacts.set(artifact, artifact);
    return {
      subflowId, graphRevision: null, artifact,
      graph: { schemaVersion: "0.1", flowId: artifact.flowId, ownerKind: "routine", ownerId: artifact.flowId, name: artifact.name,
        nodes: artifact.nodes, edges: artifact.edges, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt,
        ...(artifact.metadata ? { metadata: artifact.metadata } : {}) }
    };
  };
  return { load, artifactFor: artifact => artifact ? artifacts.get(artifact) : undefined, pinnedGraphs: () => [...pinned.values()], pinRefusal: async (pin) => await library?.pinRefusal?.(pin), recovery: async () => {
    const recovery = entries.find((entry) => entry.subflow.role === "recovery");
    return recovery ? load(recovery.subflow.subflowId) : undefined;
  } };
}
