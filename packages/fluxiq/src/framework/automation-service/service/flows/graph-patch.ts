import type { AutomationStudioFlowArtifact } from "../../../../flows/authoring/model/index.ts";
import {
  type AutomationStudioGraphPatchOperation,
  type AutomationStudioGraphPatchResult,
  type AutomationStudioProjectDatabasePool,
  AutomationStudioProjectContentStore,
  AutomationStudioProjectGraphRepository
} from "../../../persistence/automation/index.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import { graphRevisionEntry, type AutomationStudioGraphRevisionEntry } from "./graph-revision-entry.ts";
import { flowEdgeFromGraphRecord, flowNodeFromGraphRecord } from "./mapping.ts";
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
    /** Who made the change, recorded in the history: `assistant_patch`, `fluxiq_repair`, or the default `editor_patch`. */
    source?: string;
    message?: string;
  }): Promise<{
    result: AutomationStudioGraphPatchResult;
    replayed: boolean;
    flow?: AutomationStudioFlowArtifact & { graphRevision: number };
  }> {
    await this.projects.requireProject(input.projectId);
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
      await this.keepRestorePoint(graph, input.projectId, input.flowId);
      const applied = await graph.applyPatch({
        pool: this.projectDatabasePool,
        projectId: input.projectId,
        flowId: input.flowId,
        baseRevision: input.baseRevision,
        mutationId: input.mutationId,
        operations: input.operations,
        ...(input.authorId === undefined ? {} : { authorId: input.authorId }),
        ...(input.source ? { source: input.source } : {}),
        ...(input.message ? { message: input.message } : {})
      });
      if (applied.response.status === "conflict") {
        return { result: applied.response, replayed: applied.replayed };
      }
      const flow = await this.rewriteCanonicalFlow(graph, input.projectId, canonical, applied.response.revisionNumber);
      return { result: applied.response, replayed: applied.replayed, flow };
    } finally {
      await graph.close();
    }
  }

  /** The saved versions of a Flow, newest first, each with who made it and its message. */
  async listFlowGraphRevisions(input: { projectId: string; flowId: string; limit?: number; cursor?: string | null }): Promise<{ revisions: AutomationStudioGraphRevisionEntry[]; hasMore: boolean; nextCursor: string | null }> {
    await this.projects.requireProject(input.projectId);
    if (!this.projectDatabasePool) throw new Error("Project graph storage is unavailable.");
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.projectDatabasePool, projectId: input.projectId });
    try {
      const page = await graph.revisions({ flowId: input.flowId, ...(input.limit === undefined ? {} : { limit: input.limit }), ...(input.cursor ? { cursor: input.cursor } : {}) });
      const revisions: AutomationStudioGraphRevisionEntry[] = [];
      for (const item of page.items) {
        const row = item.snapshotObjectId ? await graph.sql.get<{ sha256: string }>("select sha256 from objects where object_id = ?", [item.snapshotObjectId]) : undefined;
        revisions.push(graphRevisionEntry(item, row?.sha256 ?? null));
      }
      return { revisions, hasMore: page.hasMore, nextCursor: page.nextCursor };
    } finally {
      await graph.close();
    }
  }

  /**
   * The Flow's graph as it stands, or as it stood at `revision` when that version was kept (every replaced version is).
   * `graph` is absent when that version was not kept. `updatedAt` is when the current version was saved.
   */
  async readFlowGraph(input: { projectId: string; flowId: string; revision?: number }): Promise<{ currentRevision: number; updatedAt: number; graph?: { flowId: string; nodes: AutomationStudioFlowArtifact["nodes"]; edges: AutomationStudioFlowArtifact["edges"] } }> {
    await this.projects.requireProject(input.projectId);
    if (!this.projectDatabasePool) throw new Error("Project graph storage is unavailable.");
    const canonical = await this.facade.getFlow(input.projectId, input.flowId);
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.projectDatabasePool, projectId: input.projectId });
    try {
      if (!(await graph.revisions({ flowId: input.flowId, limit: 1 })).items.length) await graph.importMonolithicFlowGraph(canonical);
      const latest = (await graph.revisions({ flowId: input.flowId, limit: 1 })).items[0];
      const currentRevision = await graph.getFlowRevision(input.flowId);
      const updatedAt = latest?.createdAt ?? canonical.updatedAt;
      if (input.revision === undefined || input.revision === currentRevision) {
        const snapshot = await graph.exportSnapshotData(input.flowId);
        return { currentRevision, updatedAt, graph: { flowId: input.flowId, nodes: snapshot.nodes.map(flowNodeFromGraphRecord), edges: snapshot.edges.map(flowEdgeFromGraphRecord) } };
      }
      const kept = await graph.revisions({ flowId: input.flowId, limit: Math.max(1, currentRevision - input.revision + 1) });
      const at = kept.items.find((item) => item.revisionNumber === input.revision);
      const row = at?.snapshotObjectId ? await graph.sql.get<{ sha256: string }>("select sha256 from objects where object_id = ?", [at.snapshotObjectId]) : undefined;
      if (!row) return { currentRevision, updatedAt };
      const content = await AutomationStudioProjectContentStore.open({ pool: this.projectDatabasePool, projectId: input.projectId });
      try {
        const kept = JSON.parse((await content.readBytesBySha256(row.sha256)).content.toString("utf8")) as { nodes?: Parameters<typeof flowNodeFromGraphRecord>[0][]; edges?: Parameters<typeof flowEdgeFromGraphRecord>[0][] };
        return { currentRevision, updatedAt, graph: { flowId: input.flowId, nodes: (kept.nodes ?? []).map(flowNodeFromGraphRecord), edges: (kept.edges ?? []).map(flowEdgeFromGraphRecord) } };
      } finally {
        await content.close();
      }
    } finally {
      await graph.close();
    }
  }

  /** Saves the Flow as it stands now so it can be restored later. */
  async createFlowGraphSnapshot(input: { projectId: string; flowId: string; revisionNumber?: number }): Promise<{ revisionNumber: number; snapshotSha256: string; byteCount: number }> {
    await this.projects.requireProject(input.projectId);
    if (!this.projectDatabasePool) throw new Error("Project graph storage is unavailable.");
    const canonical = await this.facade.getFlow(input.projectId, input.flowId);
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.projectDatabasePool, projectId: input.projectId });
    try {
      if (!(await graph.revisions({ flowId: input.flowId, limit: 1 })).items.length) await graph.importMonolithicFlowGraph(canonical);
      const current = await graph.getFlowRevision(input.flowId);
      if (input.revisionNumber !== undefined && input.revisionNumber !== current) throw new Error(`Only the Flow as it is now (version ${current}) can be saved as a restore point.`);
      const written = await graph.createSnapshot({ pool: this.projectDatabasePool, projectId: input.projectId, flowId: input.flowId, revisionNumber: current });
      return { revisionNumber: written.revisionNumber, snapshotSha256: written.sha256, byteCount: written.byteCount };
    } finally {
      await graph.close();
    }
  }

  /** Puts a saved version back as a new version; the history keeps every version, including the ones it replaces. */
  async restoreFlowGraphSnapshot(input: { projectId: string; flowId: string; snapshotSha256: string; mutationId: string; authorId?: string | null; message?: string }): Promise<{ result: AutomationStudioGraphPatchResult; replayed: boolean; flow?: AutomationStudioFlowArtifact & { graphRevision: number } }> {
    await this.projects.requireProject(input.projectId);
    if (!this.projectDatabasePool) throw new Error("Project graph storage is unavailable.");
    const canonical = await this.facade.getFlow(input.projectId, input.flowId);
    await this.assertFlowGraphMutationAllowed(input.projectId, canonical);
    const graph = await AutomationStudioProjectGraphRepository.open({ pool: this.projectDatabasePool, projectId: input.projectId });
    try {
      if (!(await graph.revisions({ flowId: input.flowId, limit: 1 })).items.length) await graph.importMonolithicFlowGraph(canonical);
      await this.keepRestorePoint(graph, input.projectId, input.flowId);
      const restored = await graph.restoreSnapshot({ pool: this.projectDatabasePool, projectId: input.projectId, flowId: input.flowId, snapshotSha256: input.snapshotSha256, mutationId: input.mutationId, ...(input.authorId === undefined ? {} : { authorId: input.authorId }), message: input.message || "Restored an earlier version" });
      if (restored.response.status === "conflict") return { result: restored.response, replayed: restored.replayed };
      return { result: restored.response, replayed: restored.replayed, flow: await this.rewriteCanonicalFlow(graph, input.projectId, canonical, restored.response.revisionNumber) };
    } finally {
      await graph.close();
    }
  }

  /**
   * Keeps the Flow as it stands, once per version, before a change replaces it, so every earlier version stays restorable.
   * A failure here is not allowed to stop the edit, so it is swallowed; that version just has no restore point.
   */
  private async keepRestorePoint(graph: AutomationStudioProjectGraphRepository, projectId: string, flowId: string): Promise<void> {
    if (!this.projectDatabasePool) return;
    try {
      const latest = (await graph.revisions({ flowId, limit: 1 })).items[0];
      if (latest && !latest.snapshotObjectId) await graph.createSnapshot({ pool: this.projectDatabasePool, projectId, flowId, revisionNumber: latest.revisionNumber });
    } catch { /* best-effort: history must never block an edit */ }
  }

  /** Rewrites the canonical Flow document from the graph as it now stands. */
  private async rewriteCanonicalFlow(graph: AutomationStudioProjectGraphRepository, projectId: string, canonical: AutomationStudioFlowArtifact, revisionNumber: number): Promise<AutomationStudioFlowArtifact & { graphRevision: number }> {
    const snapshot = await graph.exportSnapshotData(canonical.flowId);
    const nextFlow: AutomationStudioFlowArtifact = {
      ...canonical,
      nodes: snapshot.nodes.map(flowNodeFromGraphRecord),
      edges: snapshot.edges.map(flowEdgeFromGraphRecord),
      metadata: { ...(canonical.metadata ?? {}), graphRevision: revisionNumber }
    };
    const saved = await this.flowWriter.saveFlowInternal({ projectId, flow: nextFlow }, false);
    return { ...saved, graphRevision: revisionNumber };
  }

  async assertFlowGraphMutationAllowed(projectId: string, flow: AutomationStudioFlowArtifact): Promise<void> {
    const kind = this.flowWriter.persistedFlowRepresentation(flow);
    if (kind === "legacy_single_graph") return;
    if (kind === "orchestration") throw new Error("Top-level orchestration Flows cannot own Nodes or edges; apply graph patches to a Subflow graph Flow instead.");
    await this.flowWriter.assertOwnedSubflowGraph(projectId, flow);
  }
}
