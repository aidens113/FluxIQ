import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, createCallFlowNode, createPublishedFlowSnapshot, type AutomationStudioFlowArtifact, type AutomationStudioFlowNode, type AutomationStudioFlowSubflow } from "../../../../model/index.ts";
import { automationNodeStateBinding } from "../../../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { automationStudioRunFlowVersions } from "../../../flow-version/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../index.ts";
import { automationStudioBindRouterSubflowFrame } from "../subflow-frame.ts";

const PARENT_FLOW = "flow.orchestration";

function subflowGraph(flowId: string, subflowId: string, nodes: AutomationStudioFlowNode[], extra: Partial<AutomationStudioFlowArtifact> = {}): AutomationStudioFlowArtifact {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.${node.id}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }));
  return { ...createBlankAutomationStudioFlowArtifact({ flowId, projectId: "project", name: flowId, now: 1 }), nodes, edges, metadata: { subflowGraph: true, parentFlowId: PARENT_FLOW, parentSubflowId: subflowId, graphRevision: 7 }, ...extra };
}

function record(subflowId: string, graphFlowId: string, extra: Partial<AutomationStudioFlowSubflow> = {}): AutomationStudioFlowSubflow {
  return { schemaVersion: "0.1", subflowId, flowId: PARENT_FLOW, projectId: "project", name: subflowId, role: "primary", status: "active", graphFlowId, createdAt: 1, updatedAt: 1, ...extra } as AutomationStudioFlowSubflow;
}

// The selected Subflow reads the input its mapping fills, then calls a sibling, which hands back a total.
const selected = subflowGraph("graph.search", "search", [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "term", definitionId: "builtin.data.constant", parameterValues: { value: automationNodeStateBinding("searchTerm", "unmapped") } },
  { id: "count", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "tally", outputs: { "sum.value": "total" } } }
]);
const tally = subflowGraph("graph.tally", "tally", [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "sum", definitionId: "builtin.data.constant", parameterValues: { value: 12 } }
], { interface: { inputs: [], outputs: [{ id: "value", name: "value", valueType: { kind: "number" } }] } });
// A graph a stale record points at, owned by another Subflow.
const foreign = subflowGraph("graph.foreign", "someone-else", [{ id: "start", definitionId: "builtin.control.start" }]);

const graphs: Record<string, AutomationStudioFlowArtifact> = { [selected.flowId]: selected, [tally.flowId]: tally, [foreign.flowId]: foreign };
const records = [
  record("search", selected.flowId, { inputMapping: [{ flowInputId: "query", subflowInputId: "searchTerm" }], outputMapping: [{ subflowOutputId: "total", flowOutputId: "resultCount" }] }),
  record("tally", tally.flowId),
  record("stale", foreign.flowId),
  record("cleanup", tally.flowId, { role: "recovery" })
];

function bind(graphOptions: AutomationStudioGraphExecutionOptions, loads: string[] = []) {
  return automationStudioBindRouterSubflowFrame({
    graphOptions, selected: records[0], selectedIsOwned: true, subflows: records, parentFlowId: PARENT_FLOW,
    loadGraph: async (graphFlowId) => {
      loads.push(graphFlowId);
      return graphs[graphFlowId];
    },
    representationOf: (graph) => graph.metadata?.subflowGraph === true ? "subflow_graph" : "legacy_single_graph"
  });
}

describe("the Router-selected Subflow as the run's first frame", () => {
  it("applies the record's input mapping, runs a called sibling, and exposes the output mapping", async () => {
    const graphOptions: AutomationStudioGraphExecutionOptions = { inputs: { query: "lamps" } };
    const frame = bind(graphOptions);
    expect(graphOptions.inputs).toEqual({ query: "lamps", searchTerm: "lamps" });
    expect(graphOptions.currentSubflowId).toBe("search");

    let executed: AutomationStudioGraphExecutionTrace | undefined;
    const trace = frame.withOutputs(await runCanonicalAutomationStudioFlow(selected, [], graphOptions, [], (run) => { executed = run; }));

    expect(trace.status).toBe("succeeded");
    expect(executed?.attempts.find((attempt) => attempt.nodeId === "term")?.outputs.value).toBe("lamps");
    // The declared output comes back under its own id, the bound one under the key the call names.
    expect(executed?.values.value).toBe(12);
    expect(trace.values.total).toBe(12);
    expect(trace.values.resultCount).toBe(12);
    const count = trace.attempts.find((attempt) => attempt.nodeId === "count")!;
    expect(count.subflowTarget).toEqual({ subflowId: "tally", graphFlowId: "graph.tally", graphRevision: 7 });
    expect(trace.attempts[0]?.framePath).toEqual(["invocation-1"]);
    expect(count.childTrace?.attempts[0]?.framePath).toEqual(["invocation-1", "invocation-2"]);
  });

  it("names every called Subflow graph in the run's version set", async () => {
    const graphOptions: AutomationStudioGraphExecutionOptions = { inputs: { query: "lamps" } };
    const frame = bind(graphOptions);
    const trace = await runCanonicalAutomationStudioFlow(selected, [], graphOptions);
    expect(automationStudioRunFlowVersions([{ graphFlowId: PARENT_FLOW, revision: 2 }, { graphFlowId: selected.flowId, revision: 7, subflowId: "search" }, ...frame.calledVersions(trace)])).toEqual([
      { graphFlowId: PARENT_FLOW, revision: 2 },
      { graphFlowId: "graph.search", revision: 7, subflowId: "search" },
      { graphFlowId: "graph.tally", revision: 7, subflowId: "tally" }
    ]);
  });

  it("offers only graphs that prove they belong to this Flow and Subflow, each read once", async () => {
    const loads: string[] = [];
    const graphOptions: AutomationStudioGraphExecutionOptions = {};
    bind(graphOptions, loads);
    const source = graphOptions.subflowGraphs!;
    expect(await source.load("stale")).toBeUndefined();
    expect(await source.load("nobody")).toBeUndefined();
    const first = await source.load("tally");
    expect(first).toMatchObject({ subflowId: "tally", graphRevision: 7, graph: { flowId: "graph.tally" }, artifact: tally });
    expect(await source.load("tally")).toBe(first);
    expect(loads).toEqual(["graph.foreign", "graph.tally"]);
    // The recovery-role record points at a graph owned by another Subflow, so it is refused too.
    expect(await source.recovery?.()).toBeUndefined();
  });

  it("binds nothing when no owned Subflow was selected", () => {
    const graphOptions: AutomationStudioGraphExecutionOptions = { inputs: { query: "lamps" } };
    const frame = automationStudioBindRouterSubflowFrame({ graphOptions, selected: records[0], selectedIsOwned: false, subflows: records, parentFlowId: PARENT_FLOW, loadGraph: async () => undefined, representationOf: () => undefined });
    expect(graphOptions).toEqual({ inputs: { query: "lamps" } });
    const trace: AutomationStudioGraphExecutionTrace = { status: "succeeded", startedAt: 1, attempts: [], values: { total: 1 }, effects: [] };
    expect(frame.withOutputs(trace)).toBe(trace);
    expect(frame.calledVersions(trace)).toEqual([]);
  });

  it("frames a Call Flow child too, as a frame of no Subflow", async () => {
    const child = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.child", projectId: "project", name: "Child", now: 1 }), nodes: [{ id: "start", definitionId: "builtin.control.start" }] };
    const snapshot = createPublishedFlowSnapshot(child, "1.0.0", 2);
    const parent = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent", projectId: "project", name: "Parent", now: 1 }), nodes: [createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } } })] };
    const trace = await runCanonicalAutomationStudioFlow(parent, [snapshot], {});
    expect(trace.attempts[0]?.framePath).toEqual(["invocation-1"]);
    expect(trace.attempts[0]?.childTrace?.attempts[0]?.framePath).toEqual(["invocation-1", "invocation-2"]);
  });
});
