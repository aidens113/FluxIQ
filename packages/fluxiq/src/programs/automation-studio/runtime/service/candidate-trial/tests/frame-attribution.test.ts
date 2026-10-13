import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioCandidateFrameEvidence } from "../frame-evidence.ts";
import { automationStudioTrialLearnedPaces } from "../learned-paces.ts";

function fixture() {
  const artifact = (id: string, key: string) => ({ ...createBlankAutomationStudioFlowArtifact({ projectId: "project", flowId: id, name: key, now: 1 }), metadata: { parentFlowId: "parent", parentSubflowId: key, subflowGraph: true, bootstrapSymbolicKey: key } });
  const main = artifact("graph.main", "main");
  const first = artifact("graph.first", "first");
  const second = artifact("graph.second", "second");
  first.nodes = [{ id: "first.value", definitionId: "test.act", metadata: { bootstrapSymbolicKey: "value", declaredConsequences: ["modify_existing"] } }];
  second.nodes = [{ id: "second.value", definitionId: "test.act", metadata: { bootstrapSymbolicKey: "value", declaredConsequences: ["modify_existing"] } }];
  const call = (id: string, graph: typeof first, paceMs: number): AutomationStudioNodeAttemptTrace => ({
    attemptId: id, nodeId: id, definitionId: "builtin.control.call-subflow", status: "succeeded", startedAt: 1, inputs: {}, outputs: {}, effects: [],
    subflowTarget: { subflowId: graph.metadata.parentSubflowId, graphFlowId: graph.flowId, graphRevision: null },
    childTrace: { status: "succeeded", startedAt: 1, values: {}, effects: [], attempts: [{ attemptId: "child", nodeId: graph.nodes[0]!.id, definitionId: "test.act", status: "succeeded", startedAt: 1, inputs: {}, outputs: {}, effects: [] }],
      pace: [{ nodeId: graph.nodes[0]!.id, paceMs, learnedMs: paceMs, raisedCount: 1, waitedMs: 0 }] }
  });
  const trace: AutomationStudioGraphExecutionTrace = { status: "succeeded", startedAt: 1, values: {}, effects: [], attempts: [call("one", first, 200), call("two", second, 100), call("three", first, 300)] };
  return { main, first, second, trace };
}

describe("called candidate graph attribution", () => {
  it("maps child declarations by their owned graph and ignores a foreign graph with a matching target id", () => {
    const { main, first, second, trace } = fixture();
    const found = automationStudioCandidateFrameEvidence(trace.attempts, main, [first, second]);
    expect(found.graph?.nodes.map((node) => node.id)).toEqual(["first.value", "second.value"]);
    expect(found.frames).toHaveLength(3);
    first.metadata.parentFlowId = "foreign";
    expect(automationStudioCandidateFrameEvidence(trace.attempts, main, [first, second]).graph?.nodes.map((node) => node.id)).toEqual(["second.value"]);
  });

  it("keeps repeated local node keys in different helpers distinct and retains each helper's maximum learned pace", () => {
    const { main, first, second, trace } = fixture();
    expect(automationStudioTrialLearnedPaces(trace, main, [first, second])).toEqual([
      { subflowKey: "first", nodeKey: "value", paceMs: 300 },
      { subflowKey: "second", nodeKey: "value", paceMs: 100 }
    ]);
  });
});
