import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../model/index.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectGraphRepository } from "./project-graph-store.ts";

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
});
