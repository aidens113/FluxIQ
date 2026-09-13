import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import { assertAutomationStudioCompiledPlan, compileAutomationStudioPlan, runAutomationStudioCompiledPlan, type AutomationStudioCompiledPlanEdge, type AutomationStudioCompiledPlanNode } from "../compiled-plan.ts";
import { runAutomationStudioGraph } from "../executor.ts";

describe("Automation Studio graph executor", () => {
  it("passes state-bound parameters to a custom node through the normal parameter values", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.state-parameter",
      ownerKind: "routine",
      ownerId: "routine.state-parameter",
      name: "State parameter",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "custom", definitionId: "importer.custom-output", parameterValues: { message: { $state: { path: "runtime.message", fallback: "manual" } } } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
      ],
      edges: [{ id: "custom.end", sourceNodeId: "custom", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
    };
    let receivedMessage: unknown;

    const trace = await runAutomationStudioGraph(flow, {
      inputs: { runtime: { message: "from state" } },
      nativeNodeExecutor: async ({ node }) => {
        receivedMessage = node.parameterValues?.message;
        return { result: { status: "success", route: "success", outputs: {} } };
      }
    });

    expect(trace.status).toBe("succeeded");
    expect(receivedMessage).toBe("from state");
  });

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

  it("routes the Start node through its advertised next port", async () => {
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.start-next",
      ownerKind: "routine",
      ownerId: "routine.test",
      name: "Start next compatibility",
      createdAt: 1,
      updatedAt: 1,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
      ],
      edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "next", targetNodeId: "end", targetPortId: "in" }]
    };

    const trace = await runAutomationStudioGraph(flow);

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "end"]);
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

// A compiled plan's `startNodeId`, chosen by the rule a graph run uses, and the
// run of that plan. The compiler sorts a plan's nodes by id for its digest, and a
// recorded node's id carries an unpadded timeline number, so the sorted list can
// put `entry.10` ahead of `entry.2`: a start taken from it would be a later
// action. (These rows are here, not in a `compiled-plan.test.ts`, because this
// directory is at its source-file limit.)

function planNode(id: string, definitionId = "builtin.policy.action"): AutomationStudioCompiledPlanNode {
  return { id, definitionId, definitionVersion: "1.0.0", label: id, parameterValues: { outputId: "click", parameters: {} }, metadata: {} };
}

function planEdge(sourceNodeId: string, targetNodeId: string): AutomationStudioCompiledPlanEdge {
  return { id: `${sourceNodeId}->${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "ready", label: "", metadata: {} };
}

function compilePlan(nodes: AutomationStudioCompiledPlanNode[], edges: AutomationStudioCompiledPlanEdge[]) {
  return compileAutomationStudioPlan({ projectId: "project.start-node", flowId: "flow.start-node", flowRevision: 1, graphRevision: 1, settingsRevision: 1, compiledAt: 1, nodes, edges });
}

/** Twelve recorded node ids at timeline entries 2 to 13, in chain order. */
const recordedPlanChain = Array.from({ length: 12 }, (_, index) => `recorded.candidate.entry.${index + 2}.4f1c2d3e-0000-4000-8000-${String(index + 2).padStart(12, "0")}`);

describe("a compiled plan's start node", () => {
  it("is the root of a twelve-node recorded chain, though the plan lists a later node first, and a run of the plan begins there", async () => {
    const chain = recordedPlanChain;
    const plan = compilePlan([...chain].reverse().map((id) => planNode(id)), chain.slice(1).map((id, index) => planEdge(chain[index]!, id)));
    // The precondition: the compiled node list begins at entry.10.
    expect(plan.nodes[0]?.id).toBe(chain[8]);
    expect(plan.startNodeId).toBe(chain[0]);
    const trace = await runAutomationStudioCompiledPlan(plan, { effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }) });
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(chain);
  });

  it("is the Start node a plan declares, wherever the id sort lists it", () => {
    const plan = compilePlan([planNode("zz.start", "builtin.control.start"), planNode("aa.work")], [planEdge("zz.start", "aa.work")]);
    expect(plan.nodes[0]?.id).toBe("aa.work");
    expect(plan.startNodeId).toBe("zz.start");
  });

  it("is null when several nodes have no edge into them, the plan still verifies, and a run of it refuses before any node runs", async () => {
    const plan = compilePlan(["chain-b.1", "chain-a.2", "chain-b.2", "chain-a.1"].map((id) => planNode(id)), [planEdge("chain-a.1", "chain-a.2"), planEdge("chain-b.1", "chain-b.2")]);
    expect(plan.startNodeId).toBeNull();
    expect(() => assertAutomationStudioCompiledPlan(plan)).not.toThrow();
    let dispatched = 0;
    const trace = await runAutomationStudioCompiledPlan(plan, {
      effectDispatcher: () => {
        dispatched += 1;
        return { status: "success", route: "success", outputs: {} };
      }
    });
    expect(trace.status).toBe("failed");
    expect(trace.attempts).toEqual([]);
    expect(dispatched).toBe(0);
    expect(trace.message).toContain("2 nodes have no edge into them (chain-a.1, chain-b.1)");
  });

  it("is null when every node has an edge into it from another", () => {
    const plan = compilePlan(["loop.a", "loop.b", "loop.c"].map((id) => planNode(id)), [planEdge("loop.a", "loop.b"), planEdge("loop.b", "loop.c"), planEdge("loop.c", "loop.a")]);
    expect(plan.startNodeId).toBeNull();
  });
});
