import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../model/index.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectGraphRepository, type AutomationStudioGraphEdgeRecord, type AutomationStudioGraphNodeRecord, type AutomationStudioGraphPatchOperation, type AutomationStudioGraphPatchResult } from "../graph-store.ts";

// Its own directory per case: a fixed path under the working directory was
// shared by every run of this file in the checkout, so two runs at once
// deleted and overwrote each other's data.
let rootDir = "";

describe("AutomationStudioProjectGraphRepository", () => {
  beforeEach(async () => { rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-project-graph-store-test-")); });
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
      { name: "set_node_metadata", operations: () => [{ op: "set_node_metadata", nodeId: "node.b", metadata: { adaptationIds: ["adaptation.one"] } }] },
      { name: "set_node_metadata replacing existing metadata", operations: () => [{ op: "set_node_metadata", nodeId: "node.c", metadata: { note: "replaced" } }] },
      { name: "parameters then metadata on the same node", operations: () => [{ op: "set_node_parameters", nodeId: "node.b", values: { retries: 3 } }, { op: "set_node_metadata", nodeId: "node.b", metadata: { adaptationIds: ["adaptation.two"] } }] },
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
          { id: "node.c", definitionId: "builtin.end", label: "End", position: { x: 400, y: 0 }, metadata: { adaptationIds: ["adaptation.earlier"], note: "kept" } },
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

  it("replaces only a node's metadata with set_node_metadata and records the prior metadata as its inverse", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.metadata" });
    try {
      const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.metadata", projectId: "project.metadata", name: "Metadata", now: 1 });
      flow.nodes = [
        { id: "node.a", definitionId: "builtin.step", label: "Step", position: { x: 10, y: 20 }, parameterValues: { target: "#old" }, metadata: { width: 300, bootstrapAdaptationId: "bootstrap.one" } },
        { id: "node.b", definitionId: "builtin.step", label: "Other", position: { x: 200, y: 0 }, metadata: { untouched: true } }
      ];
      await graph.importMonolithicFlowGraph(flow, { changedAt: 1 });
      const before = await graph.getNode("node.a");

      const stamped = { width: 300, bootstrapAdaptationId: "bootstrap.one", adaptationIds: ["bootstrap.one", "adaptation.repair"] };
      const applied = appliedPatch((await graph.applyPatch({ pool, projectId: "project.metadata", flowId: "flow.metadata", baseRevision: 1, mutationId: "mutation.metadata", operations: [{ op: "set_node_metadata", nodeId: "node.a", metadata: stamped }], changedAt: 2 })).response);

      expect(applied.inverseOperations).toEqual([{ op: "set_node_metadata", nodeId: "node.a", metadata: { width: 300, bootstrapAdaptationId: "bootstrap.one" } }]);
      expect(applied.changedEntities).toEqual([{ entityKind: "node", entityId: "node.a", revision: 2 }]);
      const after = await graph.getNode("node.a");
      expect(after?.metadata).toEqual(stamped);
      const withoutMetadata = (node: AutomationStudioGraphNodeRecord | null) => Object.fromEntries(Object.entries(node ?? {}).filter(([key]) => key !== "metadata" && key !== "revision" && key !== "updatedAt"));
      expect(withoutMetadata(after)).toEqual(withoutMetadata(before));
      await expect(graph.getNode("node.b")).resolves.toMatchObject({ metadata: { untouched: true }, revision: 1 });
      const operations = await graph.operations(`flow.metadata:revision:${applied.revisionNumber}`);
      expect(operations).toMatchObject([{ operationKind: "set_node_metadata", entityKind: "node", entityId: "node.a", before: { metadata: before!.metadata }, after: { metadata: stamped } }]);

      await expect(graph.applyPatch({ pool, projectId: "project.metadata", flowId: "flow.metadata", baseRevision: 2, mutationId: "mutation.missing", operations: [{ op: "set_node_metadata", nodeId: "node.missing", metadata: {} }], changedAt: 3 })).rejects.toThrow(/Unknown node/);
      for (const [index, metadata] of [null, [], "text", 7].entries()) {
        await expect(graph.applyPatch({ pool, projectId: "project.metadata", flowId: "flow.metadata", baseRevision: 2, mutationId: `mutation.malformed.${index}`, operations: [{ op: "set_node_metadata", nodeId: "node.a", metadata: metadata as never }], changedAt: 3 })).rejects.toThrow(/metadata must be a JSON object/);
      }
      await expect(graph.getFlowRevision("flow.metadata")).resolves.toBe(2);
      await expect(graph.getNode("node.a")).resolves.toMatchObject({ metadata: stamped });
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

function artifact() {
  const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.atomic", projectId: "project.atomic", name: "Imported", now: 1 });
  flow.nodes = [{ id: "node.a", definitionId: "builtin.start", label: "Alpha", position: { x: 0, y: 0 } }, { id: "node.b", definitionId: "builtin.step", label: "Beta", position: { x: 300, y: 0 } }];
  flow.edges = [{ id: "edge.ab", sourceNodeId: "node.a", targetNodeId: "node.b" }];
  flow.regions = [{ id: "region.main", name: "Main", kind: "deterministic", nodeIds: ["node.a", "node.b"], entryPorts: [], exitPorts: [] }];
  return flow;
}
const tables = ["graph_revisions", "graph_operations", "graph_nodes", "graph_edges", "flow_regions", "graph_partitions", "graph_nodes_fts", "graph_node_bounds_map", "graph_node_bounds"];
async function counts(graph: AutomationStudioProjectGraphRepository) {
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, (await graph.sql.get<{ count: number }>(`select count(*) as count from ${table}`))!.count])));
}
async function complete(graph: AutomationStudioProjectGraphRepository) {
  expect(await counts(graph)).toEqual({ graph_revisions: 1, graph_operations: 4, graph_nodes: 2, graph_edges: 1, flow_regions: 1, graph_partitions: 1, graph_nodes_fts: 2, graph_node_bounds_map: 2, graph_node_bounds: 2 });
  expect(await graph.getFlowRevision("flow.atomic")).toBe(1);
  expect(await graph.searchNodes({ flowId: "flow.atomic", query: "Alpha" })).toHaveLength(1);
  const page = await graph.viewport({ flowId: "flow.atomic", bounds: { minX: -10, minY: -10, maxX: 1000, maxY: 300 } });
  expect(page.nodes.map(node => node.nodeId)).toEqual(["node.a", "node.b"]);
  expect(page.edges.map(edge => edge.edgeId)).toEqual(["edge.ab"]);
}
async function fixture(operation: (root: string, open: () => Promise<AutomationStudioProjectGraphRepository>, closeOwners: () => Promise<void>) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "graph-import-atomicity-"));
  const owners: { pool: AutomationStudioProjectDatabasePool; graph: AutomationStudioProjectGraphRepository }[] = [];
  const closeOwners = async () => { for (const owner of owners.splice(0)) { await owner.graph.close(); await owner.pool.closeAll(); } };
  try {
    await operation(root, async () => {
      const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
      const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.atomic" });
      owners.push({ pool, graph }); return graph;
    }, closeOwners);
  } finally {
    await closeOwners();
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("graph-import-atomicity-")) throw new Error("Refusing cleanup outside owned graph-import fixture.");
    await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}
const failures = [
  ["revision", "before insert on graph_revisions"],
  ["node", "before insert on graph_nodes when new.node_id = 'node.b'"],
  ["edge", "before insert on graph_edges"],
  ["region", "before insert on flow_regions"],
  ["operation", "before insert on graph_operations when new.ordinal = 1"],
  ["partition", "before update of node_count on graph_partitions when new.node_count > 0"]
] as const;

describe("real SQLite monolithic graph import atomicity", () => {
  it.each(failures)("rolls back %s failure including indexed rows; reopen retry imports complete graph", async (_phase, trigger) => fixture(async (_root, open, closeOwners) => {
    let graph = await open();
    await graph.sql.run(`create trigger injected_import_failure ${trigger} begin select raise(abort, 'injected import failure'); end`);
    await expect(graph.importMonolithicFlowGraph(artifact(), { changedAt: 10 })).rejects.toThrow("injected import failure");
    expect(await counts(graph)).toEqual(Object.fromEntries(tables.map(table => [table, 0])));
    expect(await graph.sql.get("select count(*) as count from flows")).toEqual({ count: 0 });
    await closeOwners(); graph = await open();
    expect(await counts(graph)).toEqual(Object.fromEntries(tables.map(table => [table, 0])));
    await graph.sql.run("drop trigger injected_import_failure");
    expect(await graph.importMonolithicFlowGraph(artifact(), { changedAt: 11 })).toMatchObject({ status: "imported", nodeCount: 2, edgeCount: 1, regionCount: 1 });
    await complete(graph);
  }));
  it("restores existing Flow metadata/revision after import fails", async () => fixture(async (_root, open) => {
    const graph = await open(), before = artifact(); before.name = "Original";
    await graph.upsertFlowFromArtifact(before, 7);
    await graph.sql.run("create trigger injected_import_failure before insert on graph_nodes when new.node_id = 'node.b' begin select raise(abort, 'injected import failure'); end");
    await expect(graph.importMonolithicFlowGraph(artifact(), { changedAt: 10 })).rejects.toThrow("injected import failure");
    expect(await graph.sql.get("select name, graph_revision, updated_at_ms from flows where flow_id = 'flow.atomic'")).toEqual({ name: "Original", graph_revision: 7, updated_at_ms: 1 });
    expect(await counts(graph)).toEqual(Object.fromEntries(tables.map(table => [table, 0])));
  }));
  it("serializes same-Flow import decisions across independent SQLite owners", async () => fixture(async (_root, open) => {
    const first = await open(), second = await open();
    const results = await Promise.all([first.importMonolithicFlowGraph(artifact(), { changedAt: 10 }), second.importMonolithicFlowGraph(artifact(), { changedAt: 11 })]);
    expect(results.map(result => result.status).sort()).toEqual(["already_imported", "imported"]);
    await complete(first); await complete(second);
  }));
  it("a lost COMMIT acknowledgement reopens as complete already-imported rather than claiming rollback", async () => fixture(async (root, open, closeOwners) => {
    let graph = await open();
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    // A second owner does not expose the importer's connection; use its own
    // repository below so the real transaction is intercepted, never replaced.
    const intercepted = await AutomationStudioProjectGraphRepository.open({ pool, projectId: "project.atomic" });
    const lease = await pool.acquire("project.atomic");
    const transact = lease.database.transaction.bind(lease.database);
    const spy = vi.spyOn(lease.database, "transaction").mockImplementationOnce(async operation => { await transact(operation); throw new Error("lost commit acknowledgement"); });
    try { await expect(intercepted.importMonolithicFlowGraph(artifact(), { changedAt: 10 })).rejects.toThrow("lost commit acknowledgement"); }
    finally { spy.mockRestore(); await intercepted.close(); await lease.release(); await pool.closeAll(); }
    await closeOwners(); graph = await open();
    await complete(graph);
    expect(await graph.importMonolithicFlowGraph(artifact(), { changedAt: 11 })).toMatchObject({ status: "already_imported" });
    await complete(graph);
  }));
});
