import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import {
  type AutomationStudioGraphPatchOperation,
  type AutomationStudioGraphPatchResult,
  type AutomationStudioProjectDatabasePool,
  AutomationStudioProjectGraphRepository
} from "../../../storage/index.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import { flowNodeFromGraphRecord } from "./mapping.ts";
import type { AutomationStudioFlowWriter } from "./writer.ts";

// Incremental graph edits against the per-project SQL graph, and the canonical
// Flow document rewritten from the snapshot that results. A Flow still holding
// its own graph is imported on first patch; an orchestration Flow is refused,
// because its Nodes live in the Subflow graphs it routes to.
export class AutomationStudioFlowGraphPatch {
  constructor(
    private readonly projects: AutomationStudioProjectStore,
    private readonly flowWriter: AutomationStudioFlowWriter,
    private readonly facade: AutomationStudioFacadePorts,
    private readonly projectDatabasePool: AutomationStudioProjectDatabasePool | undefined
  ) {}

  async applyFlowGraphPatch(input: {
    projectId: string;
    flowId: string;
    baseRevision: number;
    mutationId: string;
    operations: AutomationStudioGraphPatchOperation[];
    authorId?: string | null;
    message?: string;
  }): Promise<{
    result: AutomationStudioGraphPatchResult;
    replayed: boolean;
    flow?: AutomationStudioFlowArtifact & { graphRevision: number };
  }> {
    await this.projects.findProject(input.projectId);
    if (!this.projectDatabasePool) throw new Error("Project graph storage is unavailable.");
    const canonical = await this.facade.getFlow(input.projectId, input.flowId);
    await this.assertFlowGraphMutationAllowed(input.projectId, canonical);
    const graph = await AutomationStudioProjectGraphRepository.open({
      pool: this.projectDatabasePool,
      projectId: input.projectId
    });
    try {
      const revisions = await graph.revisions({ flowId: input.flowId, limit: 1 });
      if (!revisions.items.length) await graph.importMonolithicFlowGraph(canonical);
      const applied = await graph.applyPatch({
        pool: this.projectDatabasePool,
        projectId: input.projectId,
        flowId: input.flowId,
        baseRevision: input.baseRevision,
        mutationId: input.mutationId,
        operations: input.operations,
        ...(input.authorId === undefined ? {} : { authorId: input.authorId }),
        ...(input.message ? { message: input.message } : {})
      });
      if (applied.response.status === "conflict") {
        return { result: applied.response, replayed: applied.replayed };
      }
      const snapshot = await graph.exportSnapshotData(input.flowId);
      const nextFlow: AutomationStudioFlowArtifact = {
        ...canonical,
        nodes: snapshot.nodes.map(flowNodeFromGraphRecord),
        edges: snapshot.edges.map((edge) => ({
          id: edge.edgeId,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          ...(edge.sourcePortId ? { sourcePortId: edge.sourcePortId } : {}),
          ...(edge.targetPortId ? { targetPortId: edge.targetPortId } : {}),
          ...(edge.label ? { label: edge.label } : {}),
          metadata: edge.metadata
        })),
        metadata: {
          ...(canonical.metadata ?? {}),
          graphRevision: applied.response.revisionNumber
        }
      };
      const saved = await this.flowWriter.saveFlowInternal({ projectId: input.projectId, flow: nextFlow }, false);
      return {
        result: applied.response,
        replayed: applied.replayed,
        flow: { ...saved, graphRevision: applied.response.revisionNumber }
      };
    } finally {
      await graph.close();
    }
  }

  async assertFlowGraphMutationAllowed(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void> {
    const kind = this.flowWriter.persistedFlowRepresentation(flow);
    if (kind === "legacy_single_graph") return;
    if (kind === "orchestration") throw new Error("Top-level orchestration Flows cannot own Nodes or edges; apply graph patches to a Subflow graph Flow instead.");
    await this.flowWriter.assertOwnedSubflowGraph(projectId, flow);
  }
}
