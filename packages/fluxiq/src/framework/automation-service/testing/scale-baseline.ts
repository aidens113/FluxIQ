import { performance } from "node:perf_hooks";
import {
  automationStudioScaleGraphEdgeBatch,
  automationStudioScaleGraphNodeBatch,
  automationStudioScaleRunBatch,
  automationStudioScaleRuntimeEventBatch,
  scaleProfile,
  type AutomationStudioScaleProfile
} from "./scale-fixtures.ts";

export const AUTOMATION_STUDIO_BASELINE_NODE_COUNTS = [1_000, 10_000, 100_000] as const;

export type AutomationStudioBaselineOperation =
  | "project-open"
  | "graph-open"
  | "node-move"
  | "save"
  | "run-list"
  | "event-page";

export type AutomationStudioScaleBaseline = {
  schemaVersion: "0.1";
  architecture: "legacy-whole-document";
  nodeCount: number;
  edgeCount: number;
  runCount: number;
  eventCount: number;
  graphBytes: number;
  measurements: Record<AutomationStudioBaselineOperation, { elapsedMs: number; resultCount: number; responseBytes: number }>;
};

/**
 * Reproduces the current whole-document costs without depending on wall-clock I/O.
 * It is intentionally not an optimized implementation: each operation models the
 * complete parse/map/stringify or scan/sort performed by the legacy data shape.
 */
export function measureAutomationStudioLegacyBaseline(nodeCount: number): AutomationStudioScaleBaseline {
  const normalizedNodeCount = Math.max(1, Math.trunc(nodeCount));
  const edgeCount = Math.max(1, Math.trunc(normalizedNodeCount * 2.5));
  const profile = baselineProfile(normalizedNodeCount, edgeCount);
  const nodes = materialize(profile.nodesPerGraph, (start, count) =>
    automationStudioScaleGraphNodeBatch(profile, "flow.baseline", { start, count, maxBatchSize: count })
  );
  const edges = materialize(profile.edgesPerGraph, (start, count) =>
    automationStudioScaleGraphEdgeBatch(profile, "flow.baseline", { start, count, maxBatchSize: count })
  );
  const graphJson = JSON.stringify({ flowId: "flow.baseline", nodes, edges });
  const runs = automationStudioScaleRunBatch(profile, { count: profile.runs, maxBatchSize: profile.runs });
  const events = automationStudioScaleRuntimeEventBatch(profile, 0, { count: profile.eventsPerRun, maxBatchSize: profile.eventsPerRun });
  const projectJson = JSON.stringify({
    project: { projectId: "project.baseline", name: "Scale baseline" },
    flows: [{ flowId: "flow.baseline", name: "Scale graph", nodes, edges }]
  });

  const projectOpen = timed(() => JSON.parse(projectJson) as { flows: Array<{ nodes: unknown[] }> }, (value) => value.flows[0]?.nodes.length ?? 0);
  const graphOpen = timed(() => JSON.parse(graphJson) as { nodes: Array<{ nodeId: string }> }, (value) => value.nodes.length);
  const nodeMove = timed(
    () => nodes.map((node, index) => index === Math.floor(nodes.length / 2) ? { ...node, x: node.x + 10, y: node.y + 10 } : node),
    (value) => value.length
  );
  const save = timed(() => JSON.stringify({ flowId: "flow.baseline", nodes, edges }), (value) => value.length, true);
  const runList = timed(
    () => [...runs].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 50),
    (value) => value.length
  );
  const eventsJson = JSON.stringify(events);
  const eventPage = timed(
    () => (JSON.parse(eventsJson) as typeof events).sort((left, right) => left.sequence - right.sequence).slice(-50),
    (value) => value.length
  );

  return {
    schemaVersion: "0.1",
    architecture: "legacy-whole-document",
    nodeCount: normalizedNodeCount,
    edgeCount,
    runCount: runs.length,
    eventCount: events.length,
    graphBytes: Buffer.byteLength(graphJson),
    measurements: {
      "project-open": projectOpen,
      "graph-open": graphOpen,
      "node-move": nodeMove,
      save,
      "run-list": runList,
      "event-page": eventPage
    }
  };
}

function baselineProfile(nodes: number, edges: number): AutomationStudioScaleProfile {
  return scaleProfile({
    projects: 1,
    flows: 1,
    subflows: 0,
    nodes,
    edges,
    nodesPerGraph: nodes,
    edgesPerGraph: edges,
    instructions: 0,
    runs: Math.min(nodes, 100_000),
    eventsPerRun: Math.min(nodes, 100_000),
    recordings: 0,
    eventsPerRecording: 0,
    assets: 0
  });
}

function materialize<T>(total: number, page: (start: number, count: number) => T[]): T[] {
  const output: T[] = [];
  for (let start = 0; start < total; start += 100_000) {
    output.push(...page(start, Math.min(100_000, total - start)));
  }
  return output;
}

function timed<T>(operation: () => T, resultCount: (value: T) => number, stringResult = false) {
  const startedAt = performance.now();
  const value = operation();
  const elapsedMs = performance.now() - startedAt;
  const responseBytes = stringResult && typeof value === "string" ? Buffer.byteLength(value) : Buffer.byteLength(JSON.stringify(value));
  return { elapsedMs: round(elapsedMs), resultCount: resultCount(value), responseBytes };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
