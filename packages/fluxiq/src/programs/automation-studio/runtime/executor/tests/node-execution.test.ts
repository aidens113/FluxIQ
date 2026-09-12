import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { runAutomationStudioGraph } from "../index.ts";

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.dispatch-failure",
  ownerKind: "task",
  ownerId: "task.dispatch-failure",
  name: "Dispatch failure",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" } } }],
  edges: []
};
const matched = { status: "matched", candidateCount: 1, minimumConfidence: 0.5, candidateId: "confirm", confidence: 1 } as const;

describe("effect dispatch results in the attempt trace", () => {
  it("carries a failed dispatcher's failure record, message, and target resolution onto the attempt", async () => {
    const failure = { category: "timeout", code: "web.action.timed_out", retryable: true } as const;
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false }, message: "The client did not answer.", failure, targetResolution: matched })
    });

    expect(trace.attempts[0]).toMatchObject({ status: "failed", outputs: { ok: false }, message: "The client did not answer.", failure, targetResolution: matched });
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("timeout");
  });

  it("keeps a successful dispatcher's target resolution", async () => {
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true }, targetResolution: matched })
    });

    expect(trace.attempts[0]).toMatchObject({ status: "succeeded", targetResolution: matched });
    expect(trace.attempts[0]).not.toHaveProperty("failure");
  });

  it("leaves dispatcher results without the new fields unchanged", async () => {
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false } })
    });

    expect(trace.attempts[0]).not.toHaveProperty("failure");
    expect(trace.attempts[0]).not.toHaveProperty("targetResolution");
    expect(trace.attempts[0]).not.toHaveProperty("message");
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("action_failed");
  });
});

const conditions = [{ path: "cart.items", operator: "exists" }];
const expectationFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.expectation",
  ownerKind: "task",
  ownerId: "task.expectation",
  name: "Expectation",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "check", definitionId: "builtin.policy.expectation", parameterValues: { conditions, mode: "all", timeoutMs: 250 } }],
  edges: []
};

describe("the host expectation evaluator", () => {
  it("routes the expectation node to failed when the bound evaluator rejects", async () => {
    const asked: unknown[] = [];
    const trace = await runAutomationStudioGraph(expectationFlow, {
      hostRuntime: {
        capabilities: ["expectation-evaluation"],
        expectationEvaluator: (...args) => {
          asked.push(args);
          return { passed: false, message: "The cart stayed empty.", checkedConditionCount: 1 };
        }
      }
    });

    expect(trace.attempts[0]).toMatchObject({
      status: "failed",
      route: "failed",
      outputs: { passed: false, failed: true },
      message: "The cart stayed empty.",
      failure: { category: "expected_state_missing", code: "core.policy.expectation_rejected", retryable: true, stage: "verification" }
    });
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("missing_expected_state");
    expect(asked).toEqual([[conditions, "all", 250, { source: "policy_node", nodeId: "check", attemptId: "check.attempt.1" }]]);
  });

  it("leaves a host that binds no evaluator exactly as it was", async () => {
    const trace = await runAutomationStudioGraph(expectationFlow, { hostRuntime: { capabilities: ["state-snapshot"] } });
    const unbound = await runAutomationStudioGraph(expectationFlow, {});

    for (const attempt of [trace.attempts[0], unbound.attempts[0]]) {
      expect(attempt).toMatchObject({ status: "succeeded", route: "passed", outputs: { passed: true, failed: false } });
      expect(attempt).not.toHaveProperty("failure");
      expect(attempt?.transitionComparison?.status).toBe("matched");
    }
  });

  it("asks the evaluator once, not again through the transition comparison, when it accepts", async () => {
    let calls = 0;
    const trace = await runAutomationStudioGraph(expectationFlow, {
      hostRuntime: {
        capabilities: ["expectation-evaluation"],
        expectationEvaluator: () => {
          calls += 1;
          return { passed: true };
        }
      }
    });

    expect(calls).toBe(1);
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("matched");
  });

  it("evaluates another node's expected state against the host's current snapshot", async () => {
    const asked: unknown[] = [];
    const stateFlow: AutomationStudioFlowDocument = {
      ...expectationFlow,
      flowId: "flow.expected-state",
      nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", expectedState: { conditions, mode: "any", timeoutMs: 400 } } }]
    };
    const trace = await runAutomationStudioGraph(stateFlow, {
      effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true } }),
      hostRuntime: {
        capabilities: ["expectation-evaluation", "state-snapshot"],
        captureStateSnapshot: () => ({ stateSnapshotId: "snap.1", stateRef: "state://cart/1", capturedAt: 5 }),
        expectationEvaluator: (...args) => {
          asked.push(args);
          return { passed: false, checkedConditionCount: 3 };
        }
      }
    });

    expect(trace.attempts[0]?.status).toBe("succeeded");
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("missing_expected_state");
    expect(trace.attempts[0]?.transitionComparison?.diffSummary.stateCheckCount).toBe(3);
    expect(asked).toEqual([[conditions, "any", 400, { source: "transition_comparison", nodeId: "output", attemptId: "output.attempt.1", stateRef: "state://cart/1" }]]);
  });
});
