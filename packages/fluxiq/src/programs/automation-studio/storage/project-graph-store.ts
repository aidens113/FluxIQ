import { createHash } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../model/index.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { AutomationStudioProjectUnitOfWork, type AutomationStudioIdempotentMutationResult } from "./project-unit-of-work.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

export const AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE = 1000;
export const AUTOMATION_STUDIO_GRAPH_VIEWPORT_NODE_LIMIT = 500;

export type AutomationStudioGraphBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type AutomationStudioGraphNodeRecord = { nodeId: string; flowId: string; partitionId: string | null; definitionId: string; definitionVersion: string; label: string; description: string; x: number; y: number; width: number; height: number; zIndex: number; disabled: boolean; parameterValues: JsonObject; metadata: JsonObject; revision: number; createdAt: number; updatedAt: number; deletedAt: number | null };
export type AutomationStudioGraphEdgeRecord = { edgeId: string; flowId: string; sourceNodeId: string; targetNodeId: string; sourcePortId: string | null; targetPortId: string | null; label: string; metadata: JsonObject; revision: number; createdAt: number; updatedAt: number; deletedAt: number | null };
export type AutomationStudioGraphPartitionRecord = { partitionId: string; flowId: string; gridX: number; gridY: number; minX: number; minY: number; maxX: number; maxY: number; nodeCount: number; edgeCount: number; revision: number; updatedAt: number };
export type AutomationStudioGraphRevisionRecord = { revisionId: string; flowId: string; revisionNumber: number; parentRevision: number | null; authorId: string | null; source: string; operationCount: number; snapshotObjectId: string | null; digest: string; message: string; createdAt: number };
export type AutomationStudioGraphOperationRecord = { operationId: string; revisionId: string; ordinal: number; operationKind: string; entityKind: "node" | "edge" | "region"; entityId: string; before: unknown | null; after: unknown | null };
export type AutomationStudioGraphBoundaryEdge = AutomationStudioGraphEdgeRecord & { visibleNodeId: string; offscreenNodeId: string; side: "source" | "target" };
export type AutomationStudioGraphViewportPage = { flowId: string; graphRevision: number; bounds: AutomationStudioGraphBounds; nodes: AutomationStudioGraphNodeRecord[]; edges: AutomationStudioGraphEdgeRecord[]; boundaryEdges: AutomationStudioGraphBoundaryEdge[]; partitions: AutomationStudioGraphPartitionRecord[]; nextCursor: string | null; hasMore: boolean };
export type AutomationStudioGraphPatchOperation =
  | { op: "add_node"; node: Omit<AutomationStudioGraphNodeRecord, "partitionId" | "revision" | "createdAt" | "updatedAt" | "deletedAt"> }
  | { op: "move_node"; nodeId: string; x: number; y: number }
  | { op: "set_node_parameters"; nodeId: string; values: JsonObject }
  | { op: "delete_node"; nodeId: string }
  | { op: "add_edge"; edge: Omit<AutomationStudioGraphEdgeRecord, "revision" | "createdAt" | "updatedAt" | "deletedAt"> }
  | { op: "delete_edge"; edgeId: string };
export type AutomationStudioGraphPatchApplied = { status: "applied"; flowId: string; baseRevision: number; revisionNumber: number; rebased: boolean; changedEntities: Array<{ entityKind: string; entityId: string; revision: number }>; deletedIds: string[]; affectedPartitionIds: string[]; inverseOperations: AutomationStudioGraphPatchOperation[]; validationJobId: string | null };
export type AutomationStudioGraphPatchConflict = { status: "conflict"; flowId: string; baseRevision: number; currentRevision: number; conflictingEntityIds: string[]; currentEntities: { nodes: AutomationStudioGraphNodeRecord[]; edges: AutomationStudioGraphEdgeRecord[] } };
export type AutomationStudioGraphPatchResult = AutomationStudioGraphPatchApplied | AutomationStudioGraphPatchConflict;
export type AutomationStudioGraphCursorPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

export class AutomationStudioProjectGraphRepository {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}
  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectGraphRepository> {
    const lease = await input.pool.acquire(input.projectId);
    try { await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate(); return new AutomationStudioProjectGraphRepository(lease); }
    catch (error) { await lease.release(); throw error; }
  }
  close(): Promise<void> { return this.lease.release(); }
  get sql(): AutomationStudioSqlExecutor { return this.lease.database; }
  async getFlowRevision(flowId: string): Promise<number> { const row = await this.sql.get<{ graph_revision: number }>("select graph_revision from flows where flow_id = ?", [id(flowId, "flow")]); if (!row) throw new Error(`Unknown Flow: ${flowId}`); return row.graph_revision; }
  async upsertFlowFromArtifact(flow: AutomationStudioFlowArtifact, graphRevision = 1): Promise<void> {
    await this.sql.run(`insert into flows (flow_id, parent_flow_id, owning_subflow_id, name, description, scope_kind, scope_id, visibility, origin, source_mode, status, graph_revision, settings_revision, created_at_ms, updated_at_ms)
      values (?, null, null, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 1, ?, ?)
      on conflict(flow_id) do update set name = excluded.name, description = excluded.description, scope_kind = excluded.scope_kind, scope_id = excluded.scope_id, visibility = excluded.visibility, origin = excluded.origin, source_mode = excluded.source_mode, graph_revision = excluded.graph_revision, updated_at_ms = excluded.updated_at_ms`,
      [id(flow.flowId, "flow"), name(flow.name, "Flow"), flow.description ?? "", flow.scope.kind, flow.scope.kind === "domain" ? flow.scope.domainId : null, flow.visibility === "public" ? "project" : "private", flow.origin === "manual" ? "user" : flow.origin === "recorded" ? "recording" : "import", flow.source.mode, graphRevision, flow.createdAt, flow.updatedAt]);
  }
  async getNode(nodeId: string, sql: AutomationStudioSqlExecutor = this.sql): Promise<AutomationStudioGraphNodeRecord | null> { const row = await sql.get<NodeRow>("select * from graph_nodes where node_id = ?", [id(nodeId, "node")]); return row ? nodeFromRow(row) : null; }
  async getEdge(edgeId: string, sql: AutomationStudioSqlExecutor = this.sql): Promise<AutomationStudioGraphEdgeRecord | null> { const row = await sql.get<EdgeRow>("select * from graph_edges where edge_id = ?", [id(edgeId, "edge")]); return row ? edgeFromRow(row) : null; }
  async listNodesByIds(nodeIds: string[], sql: AutomationStudioSqlExecutor = this.sql): Promise<AutomationStudioGraphNodeRecord[]> { const ids = unique(nodeIds).map((value) => id(value, "node")); if (!ids.length) return []; const rows = await sql.all<NodeRow>(`select * from graph_nodes where node_id in (${q(ids.length)}) order by node_id`, ids); return rows.map(nodeFromRow); }
  async listEdgesByIds(edgeIds: string[], sql: AutomationStudioSqlExecutor = this.sql): Promise<AutomationStudioGraphEdgeRecord[]> { const ids = unique(edgeIds).map((value) => id(value, "edge")); if (!ids.length) return []; const rows = await sql.all<EdgeRow>(`select * from graph_edges where edge_id in (${q(ids.length)}) order by edge_id`, ids); return rows.map(edgeFromRow); }
  async searchNodes(input: { flowId: string; query: string; limit?: number }): Promise<AutomationStudioGraphNodeRecord[]> {
    if (!input.query.trim()) return [];
    const rows = await this.sql.all<NodeRow>(`select graph_nodes.* from graph_nodes_fts join graph_nodes on graph_nodes.node_id = graph_nodes_fts.node_id
      where graph_nodes_fts match ? and graph_nodes.flow_id = ? and graph_nodes.deleted_at_ms is null order by rank limit ?`, [input.query.trim(), id(input.flowId, "flow"), limit(input.limit)]);
    return rows.map(nodeFromRow);
  }
  async viewport(input: { flowId: string; bounds: AutomationStudioGraphBounds; limit?: number; cursor?: string | null; pinnedNodeIds?: string[] }): Promise<AutomationStudioGraphViewportPage> {
    const graphRevision = await this.getFlowRevision(input.flowId);
    const bounds = normalizeBounds(input.bounds);
    const pageLimit = Math.max(1, Math.min(AUTOMATION_STUDIO_GRAPH_VIEWPORT_NODE_LIMIT, Math.trunc(input.limit ?? AUTOMATION_STUDIO_GRAPH_VIEWPORT_NODE_LIMIT)));
    const cursor = decodeCursor<{ nodeId: string }>(input.cursor);
    const cursorClause = cursor ? " and graph_nodes.node_id > ?" : "";
    const rows = await this.sql.all<NodeRow>(`select graph_nodes.* from graph_node_bounds
      join graph_node_bounds_map on graph_node_bounds_map.bounds_id = graph_node_bounds.bounds_id
      join graph_nodes on graph_nodes.node_id = graph_node_bounds_map.node_id
      where graph_nodes.flow_id = ? and graph_nodes.deleted_at_ms is null and graph_node_bounds.min_x <= ? and graph_node_bounds.max_x >= ? and graph_node_bounds.min_y <= ? and graph_node_bounds.max_y >= ?${cursorClause}
      order by graph_nodes.node_id limit ?`, [id(input.flowId, "flow"), bounds.maxX, bounds.minX, bounds.maxY, bounds.minY, ...(cursor ? [cursor.nodeId] : []), pageLimit + 1]);
    const pageRows = rows.slice(0, pageLimit);
    const nodeMap = new Map(pageRows.map((row) => [row.node_id, nodeFromRow(row)]));
    for (const pinned of await this.listNodesByIds(input.pinnedNodeIds ?? [])) if (pinned.flowId === input.flowId && pinned.deletedAt === null) nodeMap.set(pinned.nodeId, pinned);
    const nodes = [...nodeMap.values()].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    const { edges, boundaryEdges } = await this.visibleEdges(input.flowId, nodes.map((node) => node.nodeId));
    const partitions = await this.listPartitionsByIds(unique(nodes.map((node) => node.partitionId).filter((value): value is string => Boolean(value))));
    const last = pageRows.at(-1);
    return { flowId: input.flowId, graphRevision, bounds, nodes, edges, boundaryEdges, partitions, hasMore: rows.length > pageLimit, nextCursor: rows.length > pageLimit && last ? encodeCursor({ nodeId: last.node_id }) : null };
  }
  async aggregates(input: { flowId: string; bounds: AutomationStudioGraphBounds; limit?: number }): Promise<Array<{ partitionId: string; bounds: AutomationStudioGraphBounds; nodeCount: number; edgeCount: number; revision: number }>> {
    const bounds = normalizeBounds(input.bounds);
    const rows = await this.sql.all<PartitionRow>("select * from graph_partitions where flow_id = ? and min_x <= ? and max_x >= ? and min_y <= ? and max_y >= ? order by grid_x, grid_y limit ?", [id(input.flowId, "flow"), bounds.maxX, bounds.minX, bounds.maxY, bounds.minY, limit(input.limit)]);
    return rows.map((row) => ({ partitionId: row.partition_id, bounds: { minX: row.min_x, minY: row.min_y, maxX: row.max_x, maxY: row.max_y }, nodeCount: row.node_count, edgeCount: row.edge_count, revision: row.revision }));
  }
  async revisions(input: { flowId: string; limit?: number; cursor?: string | null }): Promise<AutomationStudioGraphCursorPage<AutomationStudioGraphRevisionRecord>> {
    const pageLimit = limit(input.limit);
    const cursor = decodeCursor<{ revisionNumber: number; revisionId: string }>(input.cursor);
    const rows = await this.sql.all<RevisionRow>(`select * from graph_revisions where flow_id = ?${cursor ? " and (revision_number < ? or (revision_number = ? and revision_id < ?))" : ""} order by revision_number desc, revision_id desc limit ?`, [id(input.flowId, "flow"), ...(cursor ? [cursor.revisionNumber, cursor.revisionNumber, cursor.revisionId] : []), pageLimit + 1]);
    const items = rows.slice(0, pageLimit).map(revisionFromRow);
    const last = rows.slice(0, pageLimit).at(-1);
    return { items, hasMore: rows.length > pageLimit, nextCursor: rows.length > pageLimit && last ? encodeCursor({ revisionNumber: last.revision_number, revisionId: last.revision_id }) : null };
  }
  async operations(revisionId: string): Promise<AutomationStudioGraphOperationRecord[]> { const rows = await this.sql.all<OperationRow>("select * from graph_operations where revision_id = ? order by ordinal", [id(revisionId, "revision")]); return rows.map(operationFromRow); }
  async importMonolithicFlowGraph(flow: AutomationStudioFlowArtifact, input: { authorId?: string | null; changedAt?: number } = {}): Promise<{ status: "imported" | "already_imported"; revisionNumber: number; nodeCount: number; edgeCount: number; regionCount: number }> {
    const changedAt = input.changedAt ?? Date.now();
    const existing = await this.sql.get<{ revision_id: string }>("select revision_id from graph_revisions where flow_id = ? and revision_number = 1", [flow.flowId]);
    if (existing) return { status: "already_imported", revisionNumber: 1, nodeCount: flow.nodes.length, edgeCount: flow.edges.length, regionCount: flow.regions?.length ?? 0 };
    await this.upsertFlowFromArtifact({ ...flow, updatedAt: changedAt }, 1);
    let ordinal = 0;
    const revisionId = graphRevisionId(flow.flowId, 1);
    await insertRevision(this.sql, { flowId: flow.flowId, revisionNumber: 1, parentRevision: null, authorId: input.authorId ?? null, source: "legacy_import", operationCount: flow.nodes.length + flow.edges.length + (flow.regions?.length ?? 0), digest: digest({ nodes: flow.nodes, edges: flow.edges, regions: flow.regions ?? [] }), message: "Imported monolithic Flow graph", createdAt: changedAt });
    const touchedPartitions = new Set<string>();
    for (const node of flow.nodes) {
      const saved = await this.upsertNode(nodeRecordFromArtifact(flow.flowId, node, changedAt), changedAt, this.sql, false);
      if (saved.partitionId) touchedPartitions.add(saved.partitionId);
      await insertOperation(this.sql, { revisionId, ordinal: ordinal++, operationKind: "import_node", entityKind: "node", entityId: saved.nodeId, before: null, after: saved });
    }
    for (const edge of flow.edges) {
      const saved = await this.upsertEdge(edgeRecordFromArtifact(flow.flowId, edge, changedAt), changedAt, this.sql, false);
      await insertOperation(this.sql, { revisionId, ordinal: ordinal++, operationKind: "import_edge", entityKind: "edge", entityId: saved.edgeId, before: null, after: saved });
    }
    for (const region of flow.regions ?? []) {
      const bounds = boundsForRegion(region.nodeIds, flow.nodes);
      await this.upsertRegion({ regionId: region.id, flowId: flow.flowId, name: region.name, kind: region.kind, bounds: bounds as JsonObject, metadata: region.metadata ?? {} }, this.sql, false);
      await insertOperation(this.sql, { revisionId, ordinal: ordinal++, operationKind: "import_region", entityKind: "region", entityId: region.id, before: null, after: { regionId: region.id, bounds } });
    }
    await this.refreshPartitionCounts([...touchedPartitions], changedAt, this.sql);
    return { status: "imported", revisionNumber: 1, nodeCount: flow.nodes.length, edgeCount: flow.edges.length, regionCount: flow.regions?.length ?? 0 };
  }
  async applyPatch(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; flowId: string; baseRevision: number; mutationId: string; operations: AutomationStudioGraphPatchOperation[]; authorId?: string | null; message?: string; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<AutomationStudioGraphPatchResult>> {
    const unit = await AutomationStudioProjectUnitOfWork.open({ pool: input.pool, projectId: input.projectId });
    try {
      return await unit.runIdempotent({ mutationId: input.mutationId, operationKind: "graph.patch", ownerKind: "flow_graph", ownerId: input.flowId, request: { flowId: input.flowId, baseRevision: input.baseRevision, operations: input.operations, authorId: input.authorId ?? null, message: input.message ?? "" }, ...(input.changedAt === undefined ? {} : { changedAt: input.changedAt }) }, async (context) => {
        const flow = await context.sql.get<{ graph_revision: number }>("select graph_revision from flows where flow_id = ?", [id(input.flowId, "flow")]);
        if (!flow) throw new Error(`Unknown Flow: ${input.flowId}`);
        const touchedIds = touchedEntityIds(input.operations);
        if (flow.graph_revision !== input.baseRevision) {
          const conflicts = await changedEntitiesSince(context.sql, input.flowId, input.baseRevision, touchedIds);
          if (conflicts.length) return { status: "conflict", flowId: input.flowId, baseRevision: input.baseRevision, currentRevision: flow.graph_revision, conflictingEntityIds: conflicts, currentEntities: { nodes: await this.listNodesByIds(conflicts, context.sql), edges: await this.listEdgesByIds(conflicts, context.sql) } } satisfies AutomationStudioGraphPatchConflict;
        }
        const nextRevision = flow.graph_revision + 1;
        const revisionId = graphRevisionId(input.flowId, nextRevision);
        await insertRevision(context.sql, { flowId: input.flowId, revisionNumber: nextRevision, parentRevision: flow.graph_revision, authorId: input.authorId ?? null, source: "editor_patch", operationCount: input.operations.length, digest: digest({ baseRevision: input.baseRevision, operations: input.operations }), message: input.message ?? "", createdAt: context.changedAt });
        const changedEntities: AutomationStudioGraphPatchApplied["changedEntities"] = [];
        const deletedIds: string[] = [];
        const affectedPartitionIds = new Set<string>();
        const inverseOperations: AutomationStudioGraphPatchOperation[] = [];
        let ordinal = 0;
        for (const operation of input.operations) {
          const applied = await applyGraphOperation(context.sql, this, input.flowId, operation, nextRevision, context.changedAt);
          for (const partitionId of applied.affectedPartitionIds) affectedPartitionIds.add(partitionId);
          if (applied.deletedId) deletedIds.push(applied.deletedId);
          if (applied.changedEntity) changedEntities.push(applied.changedEntity);
          inverseOperations.unshift(applied.inverse);
          await insertOperation(context.sql, { revisionId, ordinal: ordinal++, operationKind: operation.op, entityKind: applied.entityKind, entityId: applied.entityId, before: applied.before, after: applied.after });
          await context.recordTouchedEntity({ entityKind: `graph_${applied.entityKind}`, entityId: applied.entityId, operation: applied.deletedId ? "delete" : applied.before ? "update" : "create", revision: nextRevision });
        }
        await this.refreshPartitionCounts([...affectedPartitionIds], context.changedAt, context.sql);
        await context.sql.run("update flows set graph_revision = ?, updated_at_ms = ? where flow_id = ?", [nextRevision, context.changedAt, input.flowId]);
        const validationJobId = await scheduleValidation(context.sql, input.flowId, nextRevision, context.changedAt);
        await context.recordChange({ entityKind: "flow_graph", entityId: input.flowId, operation: "update", revision: nextRevision });
        for (const partitionId of affectedPartitionIds) await context.recordTouchedEntity({ entityKind: "graph_partition", entityId: partitionId, operation: "touch" });
        return { status: "applied", flowId: input.flowId, baseRevision: input.baseRevision, revisionNumber: nextRevision, rebased: flow.graph_revision !== input.baseRevision, changedEntities, deletedIds, affectedPartitionIds: [...affectedPartitionIds].sort(), inverseOperations, validationJobId } satisfies AutomationStudioGraphPatchApplied;
      });
    } finally {
      await unit.close();
    }
  }
  async createSnapshot(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; flowId: string; revisionNumber?: number; changedAt?: number }): Promise<{ revisionNumber: number; objectId: string; sha256: string; byteCount: number }> {
    const revisionNumber = input.revisionNumber ?? await this.getFlowRevision(input.flowId);
    const snapshot = { schemaVersion: "automation-studio.graph-snapshot.v1", revisionNumber, ...(await this.exportSnapshotData(input.flowId)) };
    const content = await AutomationStudioProjectContentStore.open({ pool: input.pool, projectId: input.projectId });
    try {
      const written = await content.putJson({ value: snapshot, owner: { ownerKind: "flow_graph", ownerId: input.flowId, purpose: `snapshot.${revisionNumber}` }, transactionId: `graph-snapshot-${input.flowId}-${revisionNumber}`, createdAt: input.changedAt ?? Date.now() });
      await this.sql.run("update graph_revisions set snapshot_object_id = ? where flow_id = ? and revision_number = ?", [written.object.objectId, input.flowId, revisionNumber]);
      return { revisionNumber, objectId: written.object.objectId, sha256: written.object.sha256, byteCount: written.object.byteCount };
    } finally { await content.close(); }
  }
  async restoreSnapshot(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; flowId: string; snapshotSha256: string; mutationId: string; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<AutomationStudioGraphPatchResult>> {
    const content = await AutomationStudioProjectContentStore.open({ pool: input.pool, projectId: input.projectId });
    try {
      const asset = await content.readBytesBySha256(input.snapshotSha256);
      const snapshot = JSON.parse(asset.content.toString("utf8")) as { nodes?: AutomationStudioGraphNodeRecord[]; edges?: AutomationStudioGraphEdgeRecord[] };
      const operations: AutomationStudioGraphPatchOperation[] = [];
      const current = await this.exportSnapshotData(input.flowId);
      for (const edge of current.edges) if (!snapshot.edges?.some((item) => item.edgeId === edge.edgeId)) operations.push({ op: "delete_edge", edgeId: edge.edgeId });
      for (const node of current.nodes) if (!snapshot.nodes?.some((item) => item.nodeId === node.nodeId)) operations.push({ op: "delete_node", nodeId: node.nodeId });
      for (const node of snapshot.nodes ?? []) {
        const existing = current.nodes.find((item) => item.nodeId === node.nodeId);
        if (existing && (existing.x !== node.x || existing.y !== node.y)) operations.push({ op: "move_node", nodeId: node.nodeId, x: node.x, y: node.y });
        if (existing && JSON.stringify(existing.parameterValues) !== JSON.stringify(node.parameterValues)) operations.push({ op: "set_node_parameters", nodeId: node.nodeId, values: node.parameterValues });
      }
      for (const node of snapshot.nodes ?? []) if (!current.nodes.some((item) => item.nodeId === node.nodeId)) operations.push({ op: "add_node", node: stripNode(node) });
      for (const edge of snapshot.edges ?? []) if (!current.edges.some((item) => item.edgeId === edge.edgeId)) operations.push({ op: "add_edge", edge: stripEdge(edge) });
      return await this.applyPatch({ pool: input.pool, projectId: input.projectId, flowId: input.flowId, baseRevision: current.flow.graphRevision, mutationId: input.mutationId, operations, message: "Restore graph snapshot", ...(input.changedAt === undefined ? {} : { changedAt: input.changedAt }) });
    } finally { await content.close(); }
  }
  async exportSnapshotData(flowId: string): Promise<{ flow: { flowId: string; graphRevision: number }; nodes: AutomationStudioGraphNodeRecord[]; edges: AutomationStudioGraphEdgeRecord[]; partitions: AutomationStudioGraphPartitionRecord[] }> {
    const graphRevision = await this.getFlowRevision(flowId);
    const nodes = (await this.sql.all<NodeRow>("select * from graph_nodes where flow_id = ? and deleted_at_ms is null order by node_id", [flowId])).map(nodeFromRow);
    const edges = (await this.sql.all<EdgeRow>("select * from graph_edges where flow_id = ? and deleted_at_ms is null order by edge_id", [flowId])).map(edgeFromRow);
    const partitions = (await this.sql.all<PartitionRow>("select * from graph_partitions where flow_id = ? order by grid_x, grid_y", [flowId])).map(partitionFromRow);
    return { flow: { flowId, graphRevision }, nodes, edges, partitions };
  }
  async upsertNode(input: Omit<AutomationStudioGraphNodeRecord, "partitionId" | "revision" | "createdAt" | "updatedAt" | "deletedAt">, changedAt: number, sql: AutomationStudioSqlExecutor = this.sql, bumpRevision = true): Promise<AutomationStudioGraphNodeRecord> {
    const existing = await this.getNode(input.nodeId, sql);
    const partition = await ensurePartition(sql, input.flowId, input.x, input.y, changedAt);
    const revision = bumpRevision && existing ? existing.revision + 1 : 1;
    const values = [id(input.nodeId, "node"), id(input.flowId, "flow"), partition.partitionId, kind(input.definitionId, "definition"), input.definitionVersion.trim() || "legacy", input.label.trim() || input.nodeId, input.description, finite(input.x, "x"), finite(input.y, "y"), nonNegative(input.width, "width"), nonNegative(input.height, "height"), Math.trunc(input.zIndex), input.disabled ? 1 : 0, JSON.stringify(input.parameterValues ?? {}), JSON.stringify(input.metadata ?? {}), revision, existing?.createdAt ?? changedAt, changedAt];
    if (existing) {
      await sql.run("delete from graph_nodes where node_id = ?", [values[0]]);
      await sql.run("insert into graph_nodes (node_id, flow_id, partition_id, definition_id, definition_version, label, description, x, y, width, height, z_index, disabled, parameter_values_json, metadata_json, revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)", values);
    } else {
      await sql.run("insert into graph_nodes (node_id, flow_id, partition_id, definition_id, definition_version, label, description, x, y, width, height, z_index, disabled, parameter_values_json, metadata_json, revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)", values);
    }
    await sql.run("delete from graph_nodes_fts where node_id = ?", [input.nodeId]);
    await sql.run("insert into graph_nodes_fts (node_id, flow_id, label, description) values (?, ?, ?, ?)", [input.nodeId, input.flowId, input.label.trim() || input.nodeId, input.description]);
    if (existing?.partitionId) await refreshOnePartition(sql, existing.partitionId, changedAt);
    await refreshOnePartition(sql, partition.partitionId, changedAt);
    const saved = await this.getNode(input.nodeId, sql);
    if (!saved) throw new Error(`Node ${input.nodeId} was not persisted.`);
    return saved;
  }
  async upsertEdge(input: Omit<AutomationStudioGraphEdgeRecord, "revision" | "createdAt" | "updatedAt" | "deletedAt">, changedAt: number, sql: AutomationStudioSqlExecutor = this.sql, bumpRevision = true): Promise<AutomationStudioGraphEdgeRecord> {
    const existing = await this.getEdge(input.edgeId, sql);
    const source = await this.getNode(input.sourceNodeId, sql);
    const target = await this.getNode(input.targetNodeId, sql);
    if (!source || source.deletedAt !== null || source.flowId !== input.flowId) throw new Error(`Unknown source node: ${input.sourceNodeId}`);
    if (!target || target.deletedAt !== null || target.flowId !== input.flowId) throw new Error(`Unknown target node: ${input.targetNodeId}`);
    const revision = bumpRevision && existing ? existing.revision + 1 : 1;
    await sql.run(`insert into graph_edges (edge_id, flow_id, source_node_id, target_node_id, source_port_id, target_port_id, label, metadata_json, revision, created_at_ms, updated_at_ms, deleted_at_ms)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)
      on conflict(edge_id) do update set source_node_id = excluded.source_node_id, target_node_id = excluded.target_node_id, source_port_id = excluded.source_port_id, target_port_id = excluded.target_port_id, label = excluded.label, metadata_json = excluded.metadata_json, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms, deleted_at_ms = null`,
      [id(input.edgeId, "edge"), id(input.flowId, "flow"), id(input.sourceNodeId, "source node"), id(input.targetNodeId, "target node"), input.sourcePortId ?? null, input.targetPortId ?? null, input.label, JSON.stringify(input.metadata ?? {}), revision, existing?.createdAt ?? changedAt, changedAt]);
    await this.refreshPartitionCounts([source.partitionId, target.partitionId].filter((value): value is string => Boolean(value)), changedAt, sql);
    const saved = await this.getEdge(input.edgeId, sql);
    if (!saved) throw new Error(`Edge ${input.edgeId} was not persisted.`);
    return saved;
  }
  async upsertRegion(input: { regionId: string; flowId: string; name: string; kind: string; bounds: JsonObject; metadata: JsonObject }, sql: AutomationStudioSqlExecutor = this.sql, bumpRevision = true): Promise<void> {
    const existing = await sql.get<{ revision: number }>("select revision from flow_regions where region_id = ?", [id(input.regionId, "region")]);
    const bounds = boundsFromObject(input.bounds);
    const partition = await ensurePartition(sql, input.flowId, bounds.minX, bounds.minY, Date.now());
    await sql.run(`insert into flow_regions (region_id, flow_id, partition_id, name, kind, bounds_json, metadata_json, revision) values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(region_id) do update set partition_id = excluded.partition_id, name = excluded.name, kind = excluded.kind, bounds_json = excluded.bounds_json, metadata_json = excluded.metadata_json, revision = excluded.revision`,
      [id(input.regionId, "region"), id(input.flowId, "flow"), partition.partitionId, name(input.name, "Region"), kind(input.kind, "region kind"), JSON.stringify(input.bounds), JSON.stringify(input.metadata ?? {}), bumpRevision && existing ? existing.revision + 1 : 1]);
  }
  async refreshPartitionCounts(partitionIds: string[], changedAt: number, sql: AutomationStudioSqlExecutor = this.sql): Promise<void> { for (const partitionId of unique(partitionIds)) await refreshOnePartition(sql, partitionId, changedAt); }
  private async visibleEdges(flowId: string, nodeIds: string[]): Promise<{ edges: AutomationStudioGraphEdgeRecord[]; boundaryEdges: AutomationStudioGraphBoundaryEdge[] }> {
    if (!nodeIds.length) return { edges: [], boundaryEdges: [] };
    const visible = new Set(nodeIds);
    const rows = await this.sql.all<EdgeRow>(`select * from graph_edges where flow_id = ? and deleted_at_ms is null and (source_node_id in (${q(nodeIds.length)}) or target_node_id in (${q(nodeIds.length)})) order by edge_id limit 1000`, [flowId, ...nodeIds, ...nodeIds]);
    const edges: AutomationStudioGraphEdgeRecord[] = [];
    const boundaryEdges: AutomationStudioGraphBoundaryEdge[] = [];
    for (const row of rows) { const edge = edgeFromRow(row); const sourceVisible = visible.has(edge.sourceNodeId); const targetVisible = visible.has(edge.targetNodeId); if (sourceVisible && targetVisible) edges.push(edge); else if (sourceVisible) boundaryEdges.push({ ...edge, visibleNodeId: edge.sourceNodeId, offscreenNodeId: edge.targetNodeId, side: "target" }); else if (targetVisible) boundaryEdges.push({ ...edge, visibleNodeId: edge.targetNodeId, offscreenNodeId: edge.sourceNodeId, side: "source" }); }
    return { edges, boundaryEdges };
  }
  private async listPartitionsByIds(partitionIds: string[]): Promise<AutomationStudioGraphPartitionRecord[]> { if (!partitionIds.length) return []; const rows = await this.sql.all<PartitionRow>(`select * from graph_partitions where partition_id in (${q(partitionIds.length)}) order by grid_x, grid_y`, partitionIds); return rows.map(partitionFromRow); }
}

type NodeRow = { node_id: string; flow_id: string; partition_id: string | null; definition_id: string; definition_version: string; label: string; description: string; x: number; y: number; width: number; height: number; z_index: number; disabled: number; parameter_values_json: string; metadata_json: string; revision: number; created_at_ms: number; updated_at_ms: number; deleted_at_ms: number | null };
type EdgeRow = { edge_id: string; flow_id: string; source_node_id: string; target_node_id: string; source_port_id: string | null; target_port_id: string | null; label: string; metadata_json: string; revision: number; created_at_ms: number; updated_at_ms: number; deleted_at_ms: number | null };
type PartitionRow = { partition_id: string; flow_id: string; grid_x: number; grid_y: number; min_x: number; min_y: number; max_x: number; max_y: number; node_count: number; edge_count: number; revision: number; updated_at_ms: number };
type RevisionRow = { revision_id: string; flow_id: string; revision_number: number; parent_revision: number | null; author_id: string | null; source: string; operation_count: number; snapshot_object_id: string | null; digest: string; message: string; created_at_ms: number };
type OperationRow = { operation_id: string; revision_id: string; ordinal: number; operation_kind: string; entity_kind: "node" | "edge" | "region"; entity_id: string; before_json: string | null; after_json: string | null };

async function applyGraphOperation(sql: AutomationStudioSqlExecutor, store: AutomationStudioProjectGraphRepository, flowId: string, operation: AutomationStudioGraphPatchOperation, revision: number, changedAt: number) {
  if (operation.op === "add_node") { const saved = await store.upsertNode({ ...operation.node, flowId }, changedAt, sql); return { entityKind: "node" as const, entityId: saved.nodeId, before: null, after: saved, inverse: { op: "delete_node" as const, nodeId: saved.nodeId }, changedEntity: { entityKind: "node", entityId: saved.nodeId, revision }, affectedPartitionIds: [saved.partitionId].filter(Boolean) as string[] }; }
  if (operation.op === "move_node") { const before = await requiredNode(store, sql, operation.nodeId, flowId); const saved = await store.upsertNode({ ...stripNode(before), x: operation.x, y: operation.y }, changedAt, sql); return { entityKind: "node" as const, entityId: saved.nodeId, before, after: saved, inverse: { op: "move_node" as const, nodeId: before.nodeId, x: before.x, y: before.y }, changedEntity: { entityKind: "node", entityId: saved.nodeId, revision }, affectedPartitionIds: [before.partitionId, saved.partitionId].filter(Boolean) as string[] }; }
  if (operation.op === "set_node_parameters") { const before = await requiredNode(store, sql, operation.nodeId, flowId); const saved = await store.upsertNode({ ...stripNode(before), parameterValues: operation.values }, changedAt, sql); return { entityKind: "node" as const, entityId: saved.nodeId, before, after: saved, inverse: { op: "set_node_parameters" as const, nodeId: before.nodeId, values: before.parameterValues }, changedEntity: { entityKind: "node", entityId: saved.nodeId, revision }, affectedPartitionIds: [saved.partitionId].filter(Boolean) as string[] }; }
  if (operation.op === "delete_node") { const before = await requiredNode(store, sql, operation.nodeId, flowId); const connected = await sql.all<EdgeRow>("select * from graph_edges where flow_id = ? and deleted_at_ms is null and (source_node_id = ? or target_node_id = ?)", [flowId, before.nodeId, before.nodeId]); for (const edge of connected) await sql.run("update graph_edges set deleted_at_ms = ?, revision = revision + 1, updated_at_ms = ? where edge_id = ?", [changedAt, changedAt, edge.edge_id]); await sql.run("update graph_nodes set deleted_at_ms = ?, revision = revision + 1, updated_at_ms = ? where node_id = ?", [changedAt, changedAt, before.nodeId]); await sql.run("delete from graph_nodes_fts where node_id = ?", [before.nodeId]); return { entityKind: "node" as const, entityId: before.nodeId, before, after: null, inverse: { op: "add_node" as const, node: stripNode(before) }, deletedId: before.nodeId, changedEntity: { entityKind: "node", entityId: before.nodeId, revision }, affectedPartitionIds: [before.partitionId].filter(Boolean) as string[] }; }
  if (operation.op === "add_edge") { const saved = await store.upsertEdge({ ...operation.edge, flowId }, changedAt, sql); const source = await store.getNode(saved.sourceNodeId, sql); const target = await store.getNode(saved.targetNodeId, sql); return { entityKind: "edge" as const, entityId: saved.edgeId, before: null, after: saved, inverse: { op: "delete_edge" as const, edgeId: saved.edgeId }, changedEntity: { entityKind: "edge", entityId: saved.edgeId, revision }, affectedPartitionIds: [source?.partitionId, target?.partitionId].filter(Boolean) as string[] }; }
  const before = await requiredEdge(store, sql, operation.edgeId, flowId); await sql.run("update graph_edges set deleted_at_ms = ?, revision = revision + 1, updated_at_ms = ? where edge_id = ?", [changedAt, changedAt, before.edgeId]); return { entityKind: "edge" as const, entityId: before.edgeId, before, after: null, inverse: { op: "add_edge" as const, edge: stripEdge(before) }, deletedId: before.edgeId, changedEntity: { entityKind: "edge", entityId: before.edgeId, revision }, affectedPartitionIds: [] };
}

async function changedEntitiesSince(sql: AutomationStudioSqlExecutor, flowId: string, baseRevision: number, entityIds: Set<string>): Promise<string[]> {
  if (!entityIds.size) return [];
  const rows = await sql.all<{ entity_id: string }>(`select distinct graph_operations.entity_id from graph_operations join graph_revisions on graph_revisions.revision_id = graph_operations.revision_id where graph_revisions.flow_id = ? and graph_revisions.revision_number > ? and graph_operations.entity_id in (${q(entityIds.size)})`, [flowId, baseRevision, ...entityIds]);
  return rows.map((row) => row.entity_id).sort();
}

function touchedEntityIds(operations: AutomationStudioGraphPatchOperation[]): Set<string> {
  const ids = new Set<string>();
  for (const operation of operations) { if (operation.op === "add_node") ids.add(operation.node.nodeId); else if (operation.op === "add_edge") { ids.add(operation.edge.edgeId); ids.add(operation.edge.sourceNodeId); ids.add(operation.edge.targetNodeId); } else if ("nodeId" in operation) ids.add(operation.nodeId); else ids.add(operation.edgeId); }
  return ids;
}

async function requiredNode(store: AutomationStudioProjectGraphRepository, sql: AutomationStudioSqlExecutor, nodeId: string, flowId: string): Promise<AutomationStudioGraphNodeRecord> { const node = await store.getNode(nodeId, sql); if (!node || node.flowId !== flowId || node.deletedAt !== null) throw new Error(`Unknown node: ${nodeId}`); return node; }
async function requiredEdge(store: AutomationStudioProjectGraphRepository, sql: AutomationStudioSqlExecutor, edgeId: string, flowId: string): Promise<AutomationStudioGraphEdgeRecord> { const edge = await store.getEdge(edgeId, sql); if (!edge || edge.flowId !== flowId || edge.deletedAt !== null) throw new Error(`Unknown edge: ${edgeId}`); return edge; }

async function ensurePartition(sql: AutomationStudioSqlExecutor, flowId: string, x: number, y: number, changedAt: number): Promise<AutomationStudioGraphPartitionRecord> {
  const gridX = Math.floor(finite(x, "x") / AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE);
  const gridY = Math.floor(finite(y, "y") / AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE);
  const partitionId = graphPartitionId(flowId, gridX, gridY);
  const minX = gridX * AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE;
  const minY = gridY * AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE;
  await sql.run(`insert into graph_partitions (partition_id, flow_id, grid_x, grid_y, min_x, min_y, max_x, max_y, node_count, edge_count, revision, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?) on conflict(flow_id, grid_x, grid_y) do nothing`, [partitionId, flowId, gridX, gridY, minX, minY, minX + AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE, minY + AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE, changedAt]);
  const row = await sql.get<PartitionRow>("select * from graph_partitions where partition_id = ?", [partitionId]);
  if (!row) throw new Error(`Graph partition ${partitionId} was not persisted.`);
  return partitionFromRow(row);
}

async function refreshOnePartition(sql: AutomationStudioSqlExecutor, partitionId: string, changedAt: number): Promise<void> {
  await sql.run(`update graph_partitions set node_count = (select count(*) from graph_nodes where partition_id = ? and deleted_at_ms is null), edge_count = (select count(*) from graph_edges where deleted_at_ms is null and flow_id = graph_partitions.flow_id and (source_node_id in (select node_id from graph_nodes where partition_id = ? and deleted_at_ms is null) or target_node_id in (select node_id from graph_nodes where partition_id = ? and deleted_at_ms is null))), revision = revision + 1, updated_at_ms = ? where partition_id = ?`, [partitionId, partitionId, partitionId, changedAt, partitionId]);
}

async function insertRevision(sql: AutomationStudioSqlExecutor, input: { flowId: string; revisionNumber: number; parentRevision: number | null; authorId: string | null; source: string; operationCount: number; digest: string; message: string; createdAt: number }): Promise<void> {
  await sql.run("insert into graph_revisions (revision_id, flow_id, revision_number, parent_revision, author_id, source, operation_count, digest, message, created_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [graphRevisionId(input.flowId, input.revisionNumber), input.flowId, input.revisionNumber, input.parentRevision, input.authorId, input.source, input.operationCount, input.digest, input.message, input.createdAt]);
}

async function insertOperation(sql: AutomationStudioSqlExecutor, input: Omit<AutomationStudioGraphOperationRecord, "operationId">): Promise<void> {
  await sql.run("insert into graph_operations (operation_id, revision_id, ordinal, operation_kind, entity_kind, entity_id, before_json, after_json) values (?, ?, ?, ?, ?, ?, ?, ?)", [`${input.revisionId}:op:${input.ordinal}`, input.revisionId, input.ordinal, input.operationKind, input.entityKind, input.entityId, input.before === null ? null : JSON.stringify(input.before), input.after === null ? null : JSON.stringify(input.after)]);
}

async function scheduleValidation(sql: AutomationStudioSqlExecutor, flowId: string, revisionNumber: number, changedAt: number): Promise<string> { const jobId = `graph.validation:${flowId}:${revisionNumber}`; await sql.run("insert into background_jobs (job_id, kind, owner_kind, owner_id, status, priority, attempts, available_at_ms, created_at_ms, updated_at_ms) values (?, 'graph.validation.incremental', 'flow_graph', ?, 'pending', 50, 0, ?, ?, ?)", [jobId, flowId, changedAt, changedAt, changedAt]); return jobId; }

function nodeRecordFromArtifact(flowId: string, node: AutomationStudioFlowNode, now: number): Omit<AutomationStudioGraphNodeRecord, "partitionId" | "revision" | "createdAt" | "updatedAt" | "deletedAt"> & { createdAt: number; updatedAt: number } { return { nodeId: node.id, flowId, definitionId: node.definitionId, definitionVersion: node.definitionVersion ?? "legacy", label: node.label ?? node.id, description: node.description ?? "", x: node.position?.x ?? 0, y: node.position?.y ?? 0, width: typeof node.metadata?.width === "number" ? node.metadata.width : 240, height: typeof node.metadata?.height === "number" ? node.metadata.height : 96, zIndex: typeof node.metadata?.zIndex === "number" ? Math.trunc(node.metadata.zIndex) : 0, disabled: node.metadata?.disabled === true, parameterValues: node.parameterValues ?? {}, metadata: node.metadata ?? {}, createdAt: now, updatedAt: now }; }
function edgeRecordFromArtifact(flowId: string, edge: AutomationStudioFlowEdge, now: number): Omit<AutomationStudioGraphEdgeRecord, "revision" | "createdAt" | "updatedAt" | "deletedAt"> & { createdAt: number; updatedAt: number } { return { edgeId: edge.id, flowId, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, sourcePortId: edge.sourcePortId ?? null, targetPortId: edge.targetPortId ?? null, label: edge.label ?? "", metadata: edge.metadata ?? {}, createdAt: now, updatedAt: now }; }

function nodeFromRow(row: NodeRow): AutomationStudioGraphNodeRecord { return { nodeId: row.node_id, flowId: row.flow_id, partitionId: row.partition_id, definitionId: row.definition_id, definitionVersion: row.definition_version, label: row.label, description: row.description, x: row.x, y: row.y, width: row.width, height: row.height, zIndex: row.z_index, disabled: row.disabled === 1, parameterValues: objectJson(row.parameter_values_json), metadata: objectJson(row.metadata_json), revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, deletedAt: row.deleted_at_ms }; }
function edgeFromRow(row: EdgeRow): AutomationStudioGraphEdgeRecord { return { edgeId: row.edge_id, flowId: row.flow_id, sourceNodeId: row.source_node_id, targetNodeId: row.target_node_id, sourcePortId: row.source_port_id, targetPortId: row.target_port_id, label: row.label, metadata: objectJson(row.metadata_json), revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, deletedAt: row.deleted_at_ms }; }
function partitionFromRow(row: PartitionRow): AutomationStudioGraphPartitionRecord { return { partitionId: row.partition_id, flowId: row.flow_id, gridX: row.grid_x, gridY: row.grid_y, minX: row.min_x, minY: row.min_y, maxX: row.max_x, maxY: row.max_y, nodeCount: row.node_count, edgeCount: row.edge_count, revision: row.revision, updatedAt: row.updated_at_ms }; }
function revisionFromRow(row: RevisionRow): AutomationStudioGraphRevisionRecord { return { revisionId: row.revision_id, flowId: row.flow_id, revisionNumber: row.revision_number, parentRevision: row.parent_revision, authorId: row.author_id, source: row.source, operationCount: row.operation_count, snapshotObjectId: row.snapshot_object_id, digest: row.digest, message: row.message, createdAt: row.created_at_ms }; }
function operationFromRow(row: OperationRow): AutomationStudioGraphOperationRecord { return { operationId: row.operation_id, revisionId: row.revision_id, ordinal: row.ordinal, operationKind: row.operation_kind, entityKind: row.entity_kind, entityId: row.entity_id, before: row.before_json ? JSON.parse(row.before_json) : null, after: row.after_json ? JSON.parse(row.after_json) : null }; }

function stripNode(node: AutomationStudioGraphNodeRecord): Omit<AutomationStudioGraphNodeRecord, "partitionId" | "revision" | "createdAt" | "updatedAt" | "deletedAt"> { return { nodeId: node.nodeId, flowId: node.flowId, definitionId: node.definitionId, definitionVersion: node.definitionVersion, label: node.label, description: node.description, x: node.x, y: node.y, width: node.width, height: node.height, zIndex: node.zIndex, disabled: node.disabled, parameterValues: node.parameterValues, metadata: node.metadata }; }
function stripEdge(edge: AutomationStudioGraphEdgeRecord): Omit<AutomationStudioGraphEdgeRecord, "revision" | "createdAt" | "updatedAt" | "deletedAt"> { return { edgeId: edge.edgeId, flowId: edge.flowId, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, sourcePortId: edge.sourcePortId, targetPortId: edge.targetPortId, label: edge.label, metadata: edge.metadata }; }
function boundsForRegion(nodeIds: string[], nodes: AutomationStudioFlowNode[]): AutomationStudioGraphBounds { const selected = nodes.filter((node) => nodeIds.includes(node.id)); if (!selected.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }; const xs = selected.map((node) => node.position?.x ?? 0); const ys = selected.map((node) => node.position?.y ?? 0); return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs) + 240, maxY: Math.max(...ys) + 96 }; }
function boundsFromObject(value: JsonObject): AutomationStudioGraphBounds { const minX = typeof value.minX === "number" ? value.minX : 0; const minY = typeof value.minY === "number" ? value.minY : 0; const maxX = typeof value.maxX === "number" ? value.maxX : minX; const maxY = typeof value.maxY === "number" ? value.maxY : minY; return normalizeBounds({ minX, minY, maxX, maxY }); }
function normalizeBounds(bounds: AutomationStudioGraphBounds): AutomationStudioGraphBounds { return { minX: Math.min(bounds.minX, bounds.maxX), minY: Math.min(bounds.minY, bounds.maxY), maxX: Math.max(bounds.minX, bounds.maxX), maxY: Math.max(bounds.minY, bounds.maxY) }; }
function graphPartitionId(flowId: string, gridX: number, gridY: number): string { return `${id(flowId, "flow")}:partition:${Math.trunc(gridX)}:${Math.trunc(gridY)}`; }
function graphRevisionId(flowId: string, revisionNumber: number): string { return `${id(flowId, "flow")}:revision:${Math.trunc(revisionNumber)}`; }
function objectJson(value: string): JsonObject { const parsed = JSON.parse(value) as unknown; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {}; }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T>(value: string | null | undefined): T | null { if (!value) return null; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new Error("Invalid Automation Studio graph cursor."); } }
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function q(count: number): string { return Array.from({ length: count }, () => "?").join(", "); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function limit(value?: number): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 100))); }
function finite(value: number, label: string): number { if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`); return value; }
function nonNegative(value: number, label: string): number { const normalized = finite(value, label); if (normalized < 0) throw new Error(`${label} must be non-negative.`); return normalized; }
function id(value: string, label: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${label} ID.`); return normalized; }
function kind(value: string, label: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${label}.`); return normalized; }
function name(value: string, label: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 200) throw new Error(`${label} name is required.`); return normalized; }
