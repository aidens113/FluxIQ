import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../model/index.ts";
import { runAutomationStudioGraph } from "./executor.ts";

describe("Automation Studio graph executor", () => {
  it("runs built-in nodes, follows named routes, and records attempts/effects", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.test",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime test",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0 } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.sum", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "sum", targetPortId: "in" },
        { id: "sum.end", sourceNodeId: "sum", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    };

    const trace = await runAutomationStudioGraph(flow, { inputs: { left: 2, right: 5 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "sum", "end"]);
    expect(trace.values.result).toBe(7);
  });

  it("records host state refs and passes host context to native nodes", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.host-boundary",
      ownerKind: "routine",
      ownerId: "routine.host",
      name: "Host boundary",
      createdAt: 1,
      updatedAt: 1,
      nodes: [{ id: "native", definitionId: "host.action", parameterValues: { target: { selector: "#submit" } }, metadata: { externalSideEffect: true } }],
      edges: []
    };
    const seenHostContexts: any[] = [];
    const trace = await runAutomationStudioGraph(flow, {
      hostRuntime: {
        capabilities: ["action-dispatch", "state-snapshot", "state-diff"],
        captureStateSnapshot: ({ attemptId, point }) => ({ stateSnapshotId: `${attemptId}.${point}`, stateRef: `state://${attemptId}/${point}`, capturedAt: point === "before_action" ? 10 : 20, summary: { point } }),
        inspectStateDiff: ({ before, after }) => ({ before: before?.stateSnapshotId ?? "", after: after?.stateSnapshotId ?? "", changed: true })
      },
      nativeNodeExecutor: async ({ hostContext }) => {
        seenHostContexts.push(hostContext);
        return { result: { status: "success", route: "success", outputs: { done: true }, effects: [] } };
      }
    });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]).toMatchObject({
      hostCapabilities: ["action-dispatch", "state-diff", "state-snapshot"],
      stateRefs: {
        beforeAction: { stateRef: "state://native.attempt.1/before_action" },
        afterAction: { stateRef: "state://native.attempt.1/after_action" },
        stateDiff: { changed: true }
      }
    });
    expect(seenHostContexts[0]).toMatchObject({
      capabilityIds: ["action-dispatch", "state-diff", "state-snapshot"],
      sideEffectClass: "external",
      target: { selector: "#submit" },
      currentStateRef: { stateRef: "state://native.attempt.1/before_action" }
    });
  });

  it("fails instead of reporting success when a non-terminal node has no matching route edge", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.route-mismatch",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime route mismatch",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0 } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
      ],
      edges: [
        { id: "start.sum", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "sum", targetPortId: "in" },
        { id: "sum.end", sourceNodeId: "sum", sourcePortId: "done", targetNodeId: "end", targetPortId: "in" }
      ]
    };

    const trace = await runAutomationStudioGraph(flow, { inputs: { left: 2, right: 5 } });

    expect(trace.status).toBe("failed");
    expect(trace.currentNodeId).toBe("sum");
    expect(trace.message).toContain("no matching outgoing edge");
    expect(trace.message).toContain("done");
  });

  it("requires an explicit End node for successful terminal completion", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.explicit-end",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime explicit end",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
      ],
      edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
    };

    const trace = await runAutomationStudioGraph(flow);

    expect(trace.status).toBe("succeeded");
    expect(trace.currentNodeId).toBe("end");
  });

  it("fails when a non-terminal node ends early with unvisited nodes remaining", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.early-stop",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime early stop",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "after", definitionId: "builtin.math.add", parameterValues: { precision: 0 } }
      ],
      edges: []
    };

    const trace = await runAutomationStudioGraph(flow);

    expect(trace.status).toBe("failed");
    expect(trace.currentNodeId).toBe("start");
    expect(trace.message).toContain("without an outgoing edge");
  });

  it("records transition comparisons for matched action attempts", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.comparison",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime comparison",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "sum", definitionId: "builtin.math.add", parameterValues: { precision: 0, expectedOutputs: { result: 7 } } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
      ],
      edges: [
        { id: "start.sum", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "sum", targetPortId: "in" },
        { id: "sum.end", sourceNodeId: "sum", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    };

    const trace = await runAutomationStudioGraph(flow, { inputs: { left: 2, right: 5 } });
    const sumAttempt = trace.attempts.find((attempt) => attempt.nodeId === "sum");

    expect(sumAttempt?.transitionComparison).toMatchObject({
      status: "matched",
      expected: { expectedOutputs: { result: 7 } },
      actual: { outputs: { result: 7 } },
      diffSummary: { routeMatched: true, statusMatched: true }
    });
  });

  it("normalizes failed, waiting, timeout, and missing-state comparisons", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.comparison-statuses",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime comparison statuses",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "divide", definitionId: "builtin.math.divide", parameterValues: {} },
        { id: "wait", definitionId: "builtin.timing.wait", parameterValues: { durationMs: 100 } },
        { id: "expect", definitionId: "builtin.policy.expectation", parameterValues: { expectedOutputs: { missing: true }, conditions: [{ path: "ready" }] } },
        { id: "timeout", definitionId: "unknown.timeout", parameterValues: {} }
      ],
      edges: []
    };

    const failed = await runAutomationStudioGraph(flow, { startNodeId: "divide", inputs: { numerator: 1, denominator: 0 } });
    const waiting = await runAutomationStudioGraph(flow, { startNodeId: "wait" });
    const missing = await runAutomationStudioGraph(flow, { startNodeId: "expect" });
    const timeout = await runAutomationStudioGraph(flow, {
      startNodeId: "timeout",
      nativeNodeExecutor: async ({ node }) => ({
        result: {
          status: "failed",
          route: "timeout",
          outputs: {},
          effects: []
        },
        logs: [{ level: "error", message: `Node ${node.id} timed out.` }]
      })
    });

    expect(failed.attempts[0]?.transitionComparison?.status).toBe("action_failed");
    expect(waiting.attempts[0]?.transitionComparison?.status).toBe("tolerated");
    expect(missing.attempts[0]?.transitionComparison?.status).toBe("missing_expected_state");
    expect(timeout.attempts[0]?.transitionComparison?.status).toBe("timeout");
  });

  it("records deterministic recovery decisions before LLM diagnosis fallback", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.recovery",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime recovery",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "divide", definitionId: "builtin.math.divide", parameterValues: {} },
        { id: "recover", definitionId: "builtin.policy.recovery", parameterValues: { strategy: "retry" } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
      ],
      edges: [
        { id: "divide.recover", sourceNodeId: "divide", sourcePortId: "failed", targetNodeId: "recover", targetPortId: "failure" },
        { id: "recover.end", sourceNodeId: "recover", sourcePortId: "recovered", targetNodeId: "end", targetPortId: "in" }
      ]
    };

    const trace = await runAutomationStudioGraph(flow, { inputs: { numerator: 1, denominator: 0 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.recoveryDecision?.candidates.map((candidate) => candidate.kind)).toEqual([
      "deterministic_path",
      "reroute",
      "llm_diagnosis"
    ]);
    expect(trace.attempts[0]?.recoveryDecision?.selected).toMatchObject({
      kind: "deterministic_path",
      edgeId: "divide.recover",
      targetNodeId: "recover"
    });
  });

  it("stops the recovery ladder when retry and escalation budgets are exhausted", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.recovery-budget",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Runtime recovery budget",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "divide", definitionId: "builtin.math.divide", parameterValues: {} },
        { id: "recover", definitionId: "builtin.policy.recovery", parameterValues: { strategy: "retry" } }
      ],
      edges: [
        { id: "divide.recover", sourceNodeId: "divide", sourcePortId: "failed", targetNodeId: "recover", targetPortId: "failure" }
      ]
    };

    const trace = await runAutomationStudioGraph(flow, {
      inputs: { numerator: 1, denominator: 0 },
      recoveryBudget: {
        maxRetriesPerAction: 0,
        maxRecoveryAttemptsPerSubflow: 0,
        maxReroutesPerRun: 0,
        maxAdaptationOrLlmAttemptsPerRun: 0
      }
    });

    expect(trace.status).toBe("failed");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["divide"]);
    expect(trace.message).toContain("Recovery budget exhausted");
    expect(trace.attempts[0]?.recoveryDecision?.selected).toBeUndefined();
    expect(trace.attempts[0]?.recoveryDecision?.candidates).toEqual([]);
  });
});
