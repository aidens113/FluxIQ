import { performance } from "node:perf_hooks";
import { createBlankAutomationStudioFlowArtifact } from "../model/index.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectGraphRepository } from "../storage/index.ts";
import { automationStudioScaleGraphEdgeBatch, automationStudioScaleGraphNodeBatch, scaleProfile } from "./scale-fixtures.ts";

export type AutomationStudioGraphStoreBenchmark = {
  schemaVersion: "0.1";
  architecture: "sql-graph-partitions";
  nodeCount: number;
  edgeCount: number;
  measurements: Record<"import" | "viewport" | "move" | "connect" | "delete" | "search", { elapsedMs: number; resultCount: number; responseBytes: number }>;
};

export async function measureAutomationStudioGraphStoreBenchmark(input: { rootDir: string; projectId?: string; flowId?: string; nodeCount: number; edgeCount?: number }): Promise<AutomationStudioGraphStoreBenchmark> {
  const nodeCount = Math.max(1, Math.trunc(input.nodeCount));
  const edgeCount = Math.max(0, Math.trunc(input.edgeCount ?? nodeCount * 2.5));
  const projectId = input.projectId ?? "project.graph-benchmark";
  const flowId = input.flowId ?? "flow.graph-benchmark";
  const profile = scaleProfile({ projects: 1, flows: 1, subflows: 0, nodes: nodeCount, edges: edgeCount, nodesPerGraph: nodeCount, edgesPerGraph: edgeCount, instructions: 0, runs: 0, eventsPerRun: 0, recordings: 0, eventsPerRecording: 0, assets: 0 });
  const flow = createBlankAutomationStudioFlowArtifact({ projectId, flowId, name: "Graph benchmark", now: 1 });
  flow.nodes = automationStudioScaleGraphNodeBatch(profile, flowId, { count: nodeCount, maxBatchSize: nodeCount }).map((node) => ({ id: node.nodeId, definitionId: node.definitionId, label: node.label, position: { x: node.x, y: node.y }, parameterValues: node.parameterValues }));
  flow.edges = automationStudioScaleGraphEdgeBatch(profile, flowId, { count: edgeCount, maxBatchSize: edgeCount }).map((edge) => ({ id: edge.edgeId, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, sourcePortId: edge.sourcePortId, targetPortId: edge.targetPortId }));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: input.rootDir });
  const graph = await AutomationStudioProjectGraphRepository.open({ pool, projectId });
  try {
    const imported = await timedAsync(async () => graph.importMonolithicFlowGraph(flow, { changedAt: 1 }), (value) => value.nodeCount + value.edgeCount);
    const viewport = await timedAsync(async () => graph.viewport({ flowId, bounds: { minX: 0, minY: 0, maxX: 4_000, maxY: 2_000 }, limit: 200 }), (value) => value.nodes.length + value.edges.length + value.boundaryEdges.length);
    const move = await timedAsync(async () => graph.applyPatch({ pool, projectId, flowId, baseRevision: await graph.getFlowRevision(flowId), mutationId: "benchmark.move", operations: [{ op: "move_node", nodeId: "node.scale.0000000001", x: 7_500, y: 7_500 }], changedAt: 2 }), (value) => value.response.status === "applied" ? value.response.changedEntities.length : 0);
    const connect = await timedAsync(async () => graph.applyPatch({ pool, projectId, flowId, baseRevision: await graph.getFlowRevision(flowId), mutationId: "benchmark.connect", operations: [{ op: "add_edge", edge: { edgeId: "edge.benchmark.new", flowId, sourceNodeId: "node.scale.0000000000", targetNodeId: "node.scale.0000000001", sourcePortId: "success", targetPortId: "in", label: "Benchmark", metadata: {} } }], changedAt: 3 }), (value) => value.response.status === "applied" ? value.response.changedEntities.length : 0);
    const deleted = await timedAsync(async () => graph.applyPatch({ pool, projectId, flowId, baseRevision: await graph.getFlowRevision(flowId), mutationId: "benchmark.delete", operations: [{ op: "delete_edge", edgeId: "edge.benchmark.new" }], changedAt: 4 }), (value) => value.response.status === "applied" ? value.response.deletedIds.length : 0);
    const search = await timedAsync(async () => graph.searchNodes({ flowId, query: "Node", limit: 50 }), (value) => value.length);
    return { schemaVersion: "0.1", architecture: "sql-graph-partitions", nodeCount, edgeCount, measurements: { import: imported, viewport, move, connect, delete: deleted, search } };
  } finally {
    await graph.close();
    await pool.closeAll();
  }
}

async function timedAsync<T>(operation: () => Promise<T>, resultCount: (value: T) => number): Promise<{ elapsedMs: number; resultCount: number; responseBytes: number }> {
  const startedAt = performance.now();
  const value = await operation();
  return { elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100, resultCount: resultCount(value), responseBytes: Buffer.byteLength(JSON.stringify(value)) };
}
