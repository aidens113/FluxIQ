import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../model/index.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectGraphRepository, type AutomationStudioGraphEdgeRecord, type AutomationStudioGraphNodeRecord, type AutomationStudioGraphPatchOperation, type AutomationStudioGraphPatchResult } from "../graph-store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-graph-store-test");

describe("AutomationStudioProjectGraphRepository", () => {
  beforeEach(async () => { await rm(rootDir, { recursive: true, force: true }); await mkdir(rootDir, { recursive: true }); });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("imports monolithic Flow graphs into revision 1 rows and indexed viewports", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.graph" });
    const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.graph", projectId: "project.graph", name: "Graph", now: 1 });
    flow.nodes = [
      { id: "node.a", definitionId: "builtin.start", label: "Start", position: { x: 0, y: 0 }, parameterValues: { a: 1 } },
      { id: "node.b", definitionId: "builtin.step", label: "Step", position: { x: 300, y: 0 } },
      { id: "node.c", definitionId: "builtin.far", label: "Far", position: { x: 5000, y: 0 } }
    ];
    flow.edges = [
      { id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b" },
      { id: "edge.ac", sourceNodeId: "node.a", targetNodeId: "node.c" }
    ];
    flow.regions = [{ id: "region.main", name: "Main", kind: "deterministic", nodeIds: ["node.a", "node.b"], entryPorts: [], exitPorts: [] }];
    await expect(graph.importMonolithicFlowGraph(flow, { changedAt: 10 })).resolves.toMatchObject({ status: "imported", revisionNumber: 1, nodeCount: 3, edgeCount: 2, regionCount: 1 });
    await expect(graph.importMonolithicFlowGraph(flow, { changedAt: 11 })).resolves.toMatchObject({ status: "already_imported" });
    const viewport = await graph.viewport({ flowId: "flow.graph", bounds: { minX: -10, minY: -10, maxX: 1000, maxY: 300 }, limit: 10 });
    expect(viewport.nodes.map((node) => node.nodeId)).toEqual(["node.a", "node.b"]);
    expect(viewport.edges.map((edge) => edge.edgeId)).toEqual(["edge.ab"]);
    expect(viewport.boundaryEdges.map((edge) => edge.edgeId)).toEqual(["edge.ac"]);
    await expect(graph.searchNodes({ flowId: "flow.graph", query: "Start" })).resolves.toHaveLength(1);
    await expect(graph.revisions({ flowId: "flow.graph" })).resolves.toMatchObject({ items: [{ revisionNumber: 1, operationCount: 6 }] });
    await graph.close();
    await pool.closeAll();
  });

  it("applies idempotent patches, records inverses, schedules validation, and rebases non-overlapping stale edits", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.patch" });
    const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.patch", projectId: "project.patch", name: "Patch", now: 1 });
    flow.nodes = [
      { id: "node.a", definitionId: "builtin.start", position: { x: 0, y: 0 } },
      { id: "node.b", definitionId: "builtin.step", position: { x: 200, y: 0 } }
    ];
    flow.edges = [{ id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b" }];
    await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
    const moved = await graph.applyPatch({ pool, projectId: "project.patch", flowId: "flow.patch", baseRevision: 1, mutationId: "mutation.move", operations: [{ op: "move_node", nodeId: "node.a", x: 1200, y: 50 }], changedAt: 2 });
    expect(moved.response).toMatchObject({ status: "applied", revisionNumber: 2, inverseOperations: [{ op: "move_node", nodeId: "node.a", x: 0, y: 0 }] });
    await expect(graph.applyPatch({ pool, projectId: "project.patch", flowId: "flow.patch", baseRevision: 1, mutationId: "mutation.move", operations: [{ op: "move_node", nodeId: "node.a", x: 1200, y: 50 }], changedAt: 99 })).resolves.toMatchObject({ replayed: true, response: { status: "applied", revisionNumber: 2 } });
    const rebased = await graph.applyPatch({ pool, projectId: "project.patch", flowId: "flow.patch", baseRevision: 1, mutationId: "mutation.params", operations: [{ op: "set_node_parameters", nodeId: "node.b", values: { ok: true } }], changedAt: 3 });
    expect(rebased.response).toMatchObject({ status: "applied", revisionNumber: 3, rebased: true });
    const job = await graph.sql.get<{ status: string }>("select status from background_jobs where job_id = ?", ["graph.validation:flow.patch:3"]);
    expect(job?.status).toBe("pending");
    const history = await graph.revisions({ flowId: "flow.patch", limit: 2 });
    expect(history.items.map((revision) => revision.revisionNumber)).toEqual([3, 2]);
    expect(history.hasMore).toBe(true);
    await graph.close();
    await pool.closeAll();
  });

  it("returns overlap conflicts and can snapshot and restore through immutable objects", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.snapshot" });
    const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.snapshot", projectId: "project.snapshot", name: "Snapshot", now: 1 });
    flow.nodes = [{ id: "node.a", definitionId: "builtin.start", position: { x: 0, y: 0 } }];
    await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
    const snapshot = await graph.createSnapshot({ pool, projectId: "project.snapshot", flowId: "flow.snapshot", changedAt: 2 });
    await graph.applyPatch({ pool, projectId: "project.snapshot", flowId: "flow.snapshot", baseRevision: 1, mutationId: "mutation.first", operations: [{ op: "move_node", nodeId: "node.a", x: 100, y: 0 }], changedAt: 3 });
    const conflict = await graph.applyPatch({ pool, projectId: "project.snapshot", flowId: "flow.snapshot", baseRevision: 1, mutationId: "mutation.conflict", operations: [{ op: "move_node", nodeId: "node.a", x: 200, y: 0 }], changedAt: 4 });
    expect(conflict.response).toMatchObject({ status: "conflict", conflictingEntityIds: ["node.a"] });
    const restored = await graph.restoreSnapshot({ pool, projectId: "project.snapshot", flowId: "flow.snapshot", snapshotSha256: snapshot.sha256, mutationId: "mutation.restore", changedAt: 5 });
    expect(restored.response.status).toBe("applied");
    await expect(graph.getNode("node.a")).resolves.toMatchObject({ x: 0 });
    await graph.close();
    await pool.closeAll();
  });
  it("rehomes globally identified nodes and edges when a graph patch targets another flow", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.rehome" });
    const legacy = createBlankAutomationStudioFlowArtifact({ flowId: "flow.legacy", projectId: "project.rehome", name: "Legacy", now: 1 });
    legacy.nodes = [
      { id: "node.a", definitionId: "builtin.start", position: { x: 0, y: 0 } },
      { id: "node.b", definitionId: "builtin.step", position: { x: 200, y: 0 } }
    ];
    legacy.edges = [{ id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b" }];
    await graph.importMonolithicFlowGraph(legacy, { changedAt: 1 });
    const target = createBlankAutomationStudioFlowArtifact({ flowId: "flow.subflow-graph", projectId: "project.rehome", name: "Subflow graph", now: 2 });
    await graph.upsertFlowFromArtifact(target, 1);

    const moved = await graph.applyPatch({
      pool,
      projectId: "project.rehome",
      flowId: target.flowId,
      baseRevision: 1,
      mutationId: "mutation.rehome",
      operations: [
        { op: "add_node", node: { nodeId: "node.a", flowId: target.flowId, definitionId: "builtin.start", definitionVersion: "legacy", label: "Start", description: "", x: 0, y: 0, width: 240, height: 120, zIndex: 0, disabled: false, parameterValues: {}, metadata: {} } },
        { op: "add_node", node: { nodeId: "node.b", flowId: target.flowId, definitionId: "builtin.step", definitionVersion: "legacy", label: "Step", description: "", x: 200, y: 0, width: 240, height: 120, zIndex: 0, disabled: false, parameterValues: {}, metadata: {} } },
        { op: "add_edge", edge: { edgeId: "edge.ab", flowId: target.flowId, sourceNodeId: "node.a", targetNodeId: "node.b", sourcePortId: null, targetPortId: null, label: "", metadata: {} } }
      ],
      changedAt: 3
    });

    expect(moved.response).toMatchObject({ status: "applied", revisionNumber: 2 });
    const targetSnapshot = await graph.exportSnapshotData(target.flowId);
    expect(targetSnapshot.nodes.map((node) => node.nodeId)).toEqual(["node.a", "node.b"]);
    expect(targetSnapshot.edges).toMatchObject([{ edgeId: "edge.ab", flowId: target.flowId, sourceNodeId: "node.a", targetNodeId: "node.b" }]);
    const oldSnapshot = await graph.exportSnapshotData(legacy.flowId);
    expect(oldSnapshot.nodes).toEqual([]);
    expect(oldSnapshot.edges).toEqual([]);
    await expect(graph.aggregates({ flowId: target.flowId, bounds: { minX: -1, minY: -1, maxX: 1000, maxY: 1000 } })).resolves.toMatchObject([{ nodeCount: 2, edgeCount: 1 }]);
    await expect(graph.aggregates({ flowId: legacy.flowId, bounds: { minX: -1, minY: -1, maxX: 1000, maxY: 1000 } })).resolves.toMatchObject([{ nodeCount: 0, edgeCount: 0 }]);
    await graph.close();
    await pool.closeAll();
  });

  it("restores the whole graph, cascaded edges included, when a node deletion is rolled back through its inverse", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.rollback" });
    try {
      const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.rollback", projectId: "project.rollback", name: "Rollback", now: 1 });
      flow.nodes = [
        { id: "node.a", definitionId: "builtin.start", label: "Start", position: { x: 0, y: 0 } },
        { id: "node.b", definitionId: "builtin.step", label: "Step", description: "middle", position: { x: 200, y: 0 }, parameterValues: { retries: 2 } },
        { id: "node.c", definitionId: "builtin.end", label: "End", position: { x: 400, y: 0 } }
      ];
      flow.edges = [
        { id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b", sourcePortId: "success", targetPortId: "in", label: "inbound" },
        { id: "edge.bc", sourceNodeId: "node.b", targetNodeId: "node.c", label: "outbound", metadata: { weight: 3 } }
      ];
      await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
      const original = await graph.exportSnapshotData("flow.rollback");
      expect(shape(original)).toEqual({ nodes: ["node.a", "node.b", "node.c"], edges: ["edge.ab:node.a->node.b:inbound", "edge.bc:node.b->node.c:outbound"] });

      const deleted = await graph.applyPatch({ pool, projectId: "project.rollback", flowId: "flow.rollback", baseRevision: 1, mutationId: "mutation.delete", operations: [{ op: "delete_node", nodeId: "node.b" }], changedAt: 2 });
      const applied = appliedPatch(deleted.response);
      expect(shape(await graph.exportSnapshotData("flow.rollback"))).toEqual({ nodes: ["node.a", "node.c"], edges: [] });

      const rolledBack = await graph.applyPatch({ pool, projectId: "project.rollback", flowId: "flow.rollback", baseRevision: applied.revisionNumber, mutationId: "mutation.rollback", operations: applied.inverseOperations, changedAt: 3 });
      expect(rolledBack.response.status).toBe("applied");
      expect(durable(await graph.exportSnapshotData("flow.rollback"))).toEqual(durable(original));
      expect((await graph.searchNodes({ flowId: "flow.rollback", query: "Step" })).map((node) => node.nodeId)).toEqual(["node.b"]);

      expect([...applied.deletedIds].sort()).toEqual(["edge.ab", "edge.bc", "node.b"]);
      expect(applied.inverseOperations.map((operation) => operation.op)).toEqual(["add_node", "add_edge", "add_edge"]);
      const recorded = await graph.operations(`flow.rollback:revision:${applied.revisionNumber}`);
      expect(recorded.map((operation) => `${operation.operationKind}:${operation.entityId}`)).toEqual(["delete_node:node.b", "delete_edge:edge.ab", "delete_edge:edge.bc"]);
    } finally {
      await graph.close();
      await pool.closeAll();
    }
  });

  it("conflicts rather than throwing when a stale patch touches an edge a node deletion cascaded away", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.cascade-conflict" });
    try {
      const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.cascade", projectId: "project.cascade-conflict", name: "Cascade", now: 1 });
      flow.nodes = [
        { id: "node.a", definitionId: "builtin.start", position: { x: 0, y: 0 } },
        { id: "node.b", definitionId: "builtin.step", position: { x: 200, y: 0 } }
      ];
      flow.edges = [{ id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b" }];
      await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
      await graph.applyPatch({ pool, projectId: "project.cascade-conflict", flowId: "flow.cascade", baseRevision: 1, mutationId: "mutation.cascade", operations: [{ op: "delete_node", nodeId: "node.b" }], changedAt: 2 });
      const stale = await graph.applyPatch({ pool, projectId: "project.cascade-conflict", flowId: "flow.cascade", baseRevision: 1, mutationId: "mutation.stale", operations: [{ op: "delete_edge", edgeId: "edge.ab" }], changedAt: 3 });
      expect(stale.response).toMatchObject({ status: "conflict", conflictingEntityIds: ["edge.ab"] });
    } finally {
      await graph.close();
      await pool.closeAll();
    }
  });

  it("records an inverse that restores the prior entity when add_node or add_edge overwrites a live one", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.overwrite" });
    try {
      const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.overwrite", projectId: "project.overwrite", name: "Overwrite", now: 1 });
      flow.nodes = [
        { id: "node.a", definitionId: "builtin.start", label: "Start", position: { x: 0, y: 0 } },
        { id: "node.b", definitionId: "builtin.step", label: "Step", position: { x: 200, y: 0 } }
      ];
      flow.edges = [{ id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b", label: "first" }];
      await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
      const original = await graph.exportSnapshotData("flow.overwrite");

      const overwritten = await graph.applyPatch({
        pool, projectId: "project.overwrite", flowId: "flow.overwrite", baseRevision: 1, mutationId: "mutation.overwrite",
        operations: [
          { op: "add_node", node: { nodeId: "node.b", flowId: "flow.overwrite", definitionId: "builtin.other", definitionVersion: "2", label: "Replaced", description: "new", x: 900, y: 900, width: 240, height: 96, zIndex: 0, disabled: true, parameterValues: { changed: true }, metadata: {} } },
          { op: "add_edge", edge: { edgeId: "edge.ab", flowId: "flow.overwrite", sourceNodeId: "node.a", targetNodeId: "node.b", sourcePortId: "out", targetPortId: "in", label: "second", metadata: {} } }
        ],
        changedAt: 2
      });
      const applied = appliedPatch(overwritten.response);
      expect(applied.inverseOperations.map((operation) => operation.op)).toEqual(["add_edge", "add_node"]);

      const rolledBack = await graph.applyPatch({ pool, projectId: "project.overwrite", flowId: "flow.overwrite", baseRevision: applied.revisionNumber, mutationId: "mutation.overwrite.rollback", operations: applied.inverseOperations, changedAt: 3 });
      expect(rolledBack.response.status).toBe("applied");
      const restored = await graph.exportSnapshotData("flow.overwrite");
      expect(shape(restored)).toEqual(shape(original));
      expect(restored.nodes.map((node) => ({ id: node.nodeId, definitionId: node.definitionId, label: node.label, x: node.x, y: node.y, disabled: node.disabled }))).toEqual(original.nodes.map((node) => ({ id: node.nodeId, definitionId: node.definitionId, label: node.label, x: node.x, y: node.y, disabled: node.disabled })));
      expect(restored.edges.map((edge) => ({ id: edge.edgeId, sourcePortId: edge.sourcePortId, targetPortId: edge.targetPortId }))).toEqual([{ id: "edge.ab", sourcePortId: null, targetPortId: null }]);
    } finally {
      await graph.close();
      await pool.closeAll();
    }
  });

  it("restores the graph exactly for every patch operation's inverse", async () => {
    const cases: Array<{ name: string; operations: (flowId: string) => AutomationStudioGraphPatchOperation[] }> = [
      { name: "move_node", operations: () => [{ op: "move_node", nodeId: "node.b", x: 7_000, y: 7_000 }] },
      { name: "set_node_parameters", operations: () => [{ op: "set_node_parameters", nodeId: "node.b", values: { retries: 9, mode: "fast" } }] },
      { name: "delete_edge", operations: () => [{ op: "delete_edge", edgeId: "edge.ab" }] },
      { name: "add_node", operations: (flowId) => [{ op: "add_node", node: { nodeId: "node.new", flowId, definitionId: "builtin.new", definitionVersion: "1", label: "New", description: "", x: 900, y: 0, width: 240, height: 96, zIndex: 0, disabled: false, parameterValues: {}, metadata: {} } }] },
      { name: "add_edge", operations: (flowId) => [{ op: "add_edge", edge: { edgeId: "edge.ac", flowId, sourceNodeId: "node.a", targetNodeId: "node.c", sourcePortId: null, targetPortId: null, label: "skip", metadata: {} } }] },
      { name: "delete_node with inbound, outbound, and self-loop edges", operations: () => [{ op: "delete_node", nodeId: "node.b" }] },
      { name: "a batch that moves, deletes an edge, and deletes a node", operations: () => [{ op: "move_node", nodeId: "node.a", x: 50, y: 50 }, { op: "delete_edge", edgeId: "edge.cd" }, { op: "delete_node", nodeId: "node.c" }] },
      { name: "deleting both endpoints of an edge", operations: () => [{ op: "delete_node", nodeId: "node.c" }, { op: "delete_node", nodeId: "node.d" }] }
    ];
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.inverse" });
    try {
      for (const [index, testCase] of cases.entries()) {
        const flowId = `flow.inverse.${index}`;
        const flow = createBlankAutomationStudioFlowArtifact({ flowId, projectId: "project.inverse", name: `Inverse ${index}`, now: 1 });
        flow.nodes = [
          { id: "node.a", definitionId: "builtin.start", label: "Start", position: { x: 0, y: 0 } },
          { id: "node.b", definitionId: "builtin.step", label: "Step", description: "middle", position: { x: 200, y: 0 }, parameterValues: { retries: 2 } },
          { id: "node.c", definitionId: "builtin.end", label: "End", position: { x: 400, y: 0 } },
          { id: "node.d", definitionId: "builtin.far", label: "Far", position: { x: 2_500, y: 2_500 } }
        ];
        flow.edges = [
          { id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b", sourcePortId: "success", targetPortId: "in", label: "inbound" },
          { id: "edge.bb", sourceNodeId: "node.b", targetNodeId: "node.b", label: "loop" },
          { id: "edge.bc", sourceNodeId: "node.b", targetNodeId: "node.c", label: "outbound", metadata: { weight: 3 } },
          { id: "edge.cd", sourceNodeId: "node.c", targetNodeId: "node.d", label: "far" }
        ];
        await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
        const original = await graph.exportSnapshotData(flowId);

        const applied = appliedPatch((await graph.applyPatch({ pool, projectId: "project.inverse", flowId, baseRevision: 1, mutationId: `mutation.${index}`, operations: testCase.operations(flowId), changedAt: 2 })).response);
        expect(durable(await graph.exportSnapshotData(flowId)), `${testCase.name} should change the graph`).not.toEqual(durable(original));

        const rolledBack = await graph.applyPatch({ pool, projectId: "project.inverse", flowId, baseRevision: applied.revisionNumber, mutationId: `mutation.${index}.rollback`, operations: applied.inverseOperations, changedAt: 3 });
        expect(rolledBack.response.status, `${testCase.name} rollback should apply`).toBe("applied");
        expect(durable(await graph.exportSnapshotData(flowId)), `${testCase.name} rollback should restore the graph`).toEqual(durable(original));
      }
    } finally {
      await graph.close();
      await pool.closeAll();
    }
  });

  it("restores every field a snapshot captured, not only position and parameters", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.fidelity" });
    try {
      const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.fidelity", projectId: "project.fidelity", name: "Fidelity", now: 1 });
      flow.nodes = [
        { id: "node.a", definitionId: "builtin.start", label: "Start", description: "entry", position: { x: 0, y: 0 } },
        { id: "node.b", definitionId: "builtin.step", label: "Step", position: { x: 200, y: 0 } }
      ];
      flow.edges = [{ id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b", sourcePortId: "success", targetPortId: "in", label: "first", metadata: { weight: 1 } }];
      await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
      const original = await graph.exportSnapshotData("flow.fidelity");
      const snapshot = await graph.createSnapshot({ pool, projectId: "project.fidelity", flowId: "flow.fidelity", changedAt: 2 });

      await graph.applyPatch({
        pool, projectId: "project.fidelity", flowId: "flow.fidelity", baseRevision: 1, mutationId: "mutation.drift",
        operations: [
          { op: "add_node", node: { nodeId: "node.a", flowId: "flow.fidelity", definitionId: "builtin.other", definitionVersion: "9", label: "Renamed", description: "drifted", x: 0, y: 0, width: 400, height: 200, zIndex: 5, disabled: true, parameterValues: {}, metadata: { drifted: true } } },
          { op: "add_edge", edge: { edgeId: "edge.ab", flowId: "flow.fidelity", sourceNodeId: "node.a", targetNodeId: "node.b", sourcePortId: "failure", targetPortId: "alt", label: "second", metadata: { weight: 99 } } }
        ],
        changedAt: 3
      });
      expect(durable(await graph.exportSnapshotData("flow.fidelity"))).not.toEqual(durable(original));

      const restored = await graph.restoreSnapshot({ pool, projectId: "project.fidelity", flowId: "flow.fidelity", snapshotSha256: snapshot.sha256, mutationId: "mutation.restore", changedAt: 4 });
      expect(restored.response.status).toBe("applied");
      expect(durable(await graph.exportSnapshotData("flow.fidelity"))).toEqual(durable(original));
    } finally {
      await graph.close();
      await pool.closeAll();
    }
  });
});

function appliedPatch(result: AutomationStudioGraphPatchResult): Extract<AutomationStudioGraphPatchResult, { status: "applied" }> {
  if (result.status !== "applied") throw new Error(`Expected an applied graph patch, received ${result.status}.`);
  return result;
}

function shape(snapshot: { nodes: Array<{ nodeId: string }>; edges: Array<{ edgeId: string; sourceNodeId: string; targetNodeId: string; label: string }> }): { nodes: string[]; edges: string[] } {
  return { nodes: snapshot.nodes.map((node) => node.nodeId).sort(), edges: snapshot.edges.map((edge) => `${edge.edgeId}:${edge.sourceNodeId}->${edge.targetNodeId}:${edge.label}`).sort() };
}

function durable(snapshot: { nodes: AutomationStudioGraphNodeRecord[]; edges: AutomationStudioGraphEdgeRecord[] }): { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> } {
  return { nodes: snapshot.nodes.map(withoutVolatileFields), edges: snapshot.edges.map(withoutVolatileFields) };
}

function withoutVolatileFields(record: AutomationStudioGraphNodeRecord | AutomationStudioGraphEdgeRecord): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== "revision" && key !== "updatedAt"));
}
