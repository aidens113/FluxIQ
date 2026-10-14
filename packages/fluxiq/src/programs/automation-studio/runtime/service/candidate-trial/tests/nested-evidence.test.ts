import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioCandidateTrialLandedActs } from "../landed-acts.ts";
import { automationStudioTrialExecutedSteps } from "../executed-steps.ts";
import { automationStudioCandidateTrialSummary } from "../summary.ts";

function nested() {
  const graph = createBlankAutomationStudioFlowArtifact({ projectId: "project", flowId: "graph", name: "Detached graph", now: 1 });
  graph.nodes = [
    { id: "call", definitionId: "builtin.control.call-subflow" },
    { id: "act", definitionId: "test.act", label: "Change one item", metadata: { declaredConsequences: ["modify_existing"] } }
  ];
  const child = (status: "succeeded" | "failed", frame: string): AutomationStudioNodeAttemptTrace => ({ attemptId: "child.1", nodeId: "act", definitionId: "test.act", status, startedAt: 2, inputs: {}, outputs: {}, effects: [], framePath: ["root", frame] });
  const calls: AutomationStudioNodeAttemptTrace[] = ["first", "second"].map((frame) => ({
    attemptId: frame, nodeId: "call", definitionId: "builtin.control.call-subflow", status: "succeeded", startedAt: 1, inputs: {}, outputs: {}, effects: [],
    subflowTarget: { subflowId: "part", graphFlowId: "graph.part", graphRevision: null },
    childTrace: { status: "succeeded", startedAt: 2, values: {}, effects: [], attempts: [child("succeeded", frame)] }
  }));
  const trace: AutomationStudioGraphExecutionTrace = { status: "succeeded", startedAt: 1, values: {}, effects: [], attempts: calls };
  return { graph, trace };
}

describe("candidate trial child evidence", () => {
  it("retains each successful lasting child act exactly once for reset", () => {
    const { graph, trace } = nested();
    const acts = automationStudioCandidateTrialLandedActs(trace, graph);
    expect(acts).toHaveLength(2);
    expect(acts.map((act) => act.step)).toEqual([2, 4]);
    expect(acts.every((act) => act.consequences.includes("modify_existing"))).toBe(true);
  });

  it("keeps repeated child invocations distinct even when their local attempt and node IDs repeat", () => {
    const { trace } = nested();
    const steps = automationStudioTrialExecutedSteps(trace.attempts);
    expect(steps).toHaveLength(4);
    expect(new Set(steps.map((step) => step.attempt.attemptId)).size).toBe(4);
  });

  it("judges a child's read once without treating the call's forwarded result as a second extraction", async () => {
    const { graph, trace } = nested();
    trace.attempts = trace.attempts.slice(0, 1);
    trace.attempts[0]!.childTrace!.attempts[0]!.definitionId = "unit.read";
    graph.nodes[1] = { id: "act", definitionId: "unit.read", parameterValues: { fields: { name: { kind: "text" } }, raw_payload: "withheld unit content" } };
    const metadata = { extraction: { recordCount: 2, pagesRead: 1, truncated: false, fieldNames: ["name"], missingFields: [] } };
    const actionAttempts: AutomationStudioFlowRunActionAttemptRecord[] = [
      { attemptId: "first", nodeId: "call", definitionId: "builtin.control.call-subflow", order: 0, status: "succeeded", startedAt: 1, subflowTarget: trace.attempts[0]!.subflowTarget!, metadata },
      { attemptId: "first:child.1", parentAttemptId: "first", nodeId: "act", definitionId: "unit.read", order: 1, status: "succeeded", startedAt: 2, metadata }
    ];
    const summary = await automationStudioCandidateTrialSummary({ graph, trace, recordSets: [], actionAttempts, deniedEvidenceKeys: ["raw_payload"] });
    expect(summary.reads).toHaveLength(1);
    expect(summary.reads?.[0]).toMatchObject({ nodeId: "act", kept: 2, pagesRead: 1 });
    expect(summary.flowShape.find((node) => node.nodeId === "act")?.parameters).not.toHaveProperty("raw_payload");
    expect(summary.totalRecordCount).toBe(0);
  });
});
