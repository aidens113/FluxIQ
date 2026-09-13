import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationNodeExpectationEvaluation } from "../../../nodes/index.ts";
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

});

// Another node's expected state, checked by the host after its action
// succeeded. The Flow goes on to a second output on `success`, so a rejection
// that left the attempt succeeded would dispatch it.
const authRequired = { category: "auth_required", code: "web.auth.required", retryable: false, stage: "verification", expected: "the cart holds an item", actual: "the page is a sign-in form" } as const;
const coreRejection = { category: "expected_state_missing", code: "core.policy.expectation_rejected", retryable: true, stage: "verification" };

function expectedStateFlow(parameters: Record<string, string> = {}): AutomationStudioFlowDocument {
  return {
    ...expectationFlow,
    flowId: "flow.expected-state",
    nodes: [
      { id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", expectedState: { conditions, mode: "any", timeoutMs: 400 }, ...parameters } },
      { id: "after", definitionId: "builtin.policy.action", parameterValues: { outputId: "read-cart" } }
    ],
    edges: [{ id: "edge.output.after", sourceNodeId: "output", targetNodeId: "after", sourcePortId: "success" }]
  };
}

async function runExpectedState(run: { verdict?: AutomationNodeExpectationEvaluation; dispatchFails?: boolean; parameters?: Record<string, string> }) {
  const dispatched: unknown[] = [];
  const asked: unknown[] = [];
  const { verdict } = run;
  const trace = await runAutomationStudioGraph(expectedStateFlow(run.parameters), {
    effectDispatcher: (effect) => {
      const outputId = (effect.payload as { outputId?: unknown } | undefined)?.outputId;
      dispatched.push(outputId);
      return run.dispatchFails && outputId === "activate-element"
        ? { status: "failed", route: "failed", outputs: { ok: false }, message: "The click failed." }
        : { status: "success", route: "success", outputs: { ok: true } };
    },
    hostRuntime: {
      capabilities: ["expectation-evaluation", "state-snapshot"],
      captureStateSnapshot: () => ({ stateSnapshotId: "snap.1", stateRef: "state://cart/1", capturedAt: 5 }),
      ...(verdict ? { expectationEvaluator: (...args: unknown[]) => { asked.push(args); return verdict; } } : {})
    }
  });
  return { trace, dispatched, asked };
}

describe("a rejected expected state fails the attempt", () => {
  it("fails the attempt with the host's record and message, fails the run, and dispatches nothing after it", async () => {
    const { trace, dispatched, asked } = await runExpectedState({ verdict: { passed: false, message: "The cart stayed empty.", checkedConditionCount: 3, failure: authRequired } });

    expect(trace.status).toBe("failed");
    expect(trace.attempts).toHaveLength(1);
    expect(trace.attempts[0]).toMatchObject({ status: "failed", route: "failed", message: "The cart stayed empty." });
    expect(trace.attempts[0]?.failure).toEqual(authRequired);
    expect(trace.attempts[0]?.transitionComparison).toMatchObject({ status: "blocked", diffSummary: { stateCheckCount: 3 } });
    expect(dispatched).toEqual(["activate-element"]);
    expect(asked).toEqual([[conditions, "any", 400, { source: "transition_comparison", nodeId: "output", attemptId: "output.attempt.1", stateRef: "state://cart/1" }]]);
  });

  it("gives Core's expected_state_missing record when the host rejects without one", async () => {
    const { trace, dispatched } = await runExpectedState({ verdict: { passed: false, checkedConditionCount: 3 } });

    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]).toMatchObject({ status: "failed", route: "failed", message: "The host reported that the expected state does not hold." });
    expect(trace.attempts[0]?.failure).toEqual(coreRejection);
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("missing_expected_state");
    expect(dispatched).toEqual(["activate-element"]);
  });

  it("gives Core's record, and its comparison status, in place of a host record that does not parse", async () => {
    // auth_required is never retryable, so this record contradicts itself.
    const { trace } = await runExpectedState({ verdict: { passed: false, failure: { ...authRequired, retryable: true } } });

    expect(trace.attempts[0]?.failure).toEqual(coreRejection);
    expect(trace.attempts[0]?.transitionComparison?.status).toBe("missing_expected_state");
  });

  it("changes nothing when the host accepts", async () => {
    const accepted = await runExpectedState({ verdict: { passed: true, checkedConditionCount: 3 } });
    const unbound = await runExpectedState({});

    for (const { trace, dispatched } of [accepted, unbound]) {
      expect(trace.status).toBe("succeeded");
      expect(trace.attempts[0]).toMatchObject({ status: "succeeded", route: "success", outputs: { ok: true } });
      expect(trace.attempts[0]).not.toHaveProperty("failure");
      expect(trace.attempts[0]).not.toHaveProperty("message");
      expect(dispatched).toEqual(["activate-element", "read-cart"]);
    }
    expect(accepted.trace.attempts[0]?.transitionComparison).toMatchObject({ status: "matched", diffSummary: { stateCheckCount: 3 } });
  });

  it("routes a rejection exactly as a failed dispatch, failureRoute included", async () => {
    // No failure reads an action's failureRoute today: a failed attempt is routed
    // on its own route. A rejection must route the way a failed dispatch carrying
    // the same parameter routes, whatever that way is.
    const parameters = { failureRoute: "success" };
    const rejected = await runExpectedState({ verdict: { passed: false, failure: authRequired }, parameters });
    const dispatchFailed = await runExpectedState({ dispatchFails: true, parameters });
    const routing = ({ trace, dispatched }: Awaited<ReturnType<typeof runExpectedState>>) => ({
      runStatus: trace.status,
      runMessage: trace.message,
      attempts: trace.attempts.length,
      status: trace.attempts[0]?.status,
      route: trace.attempts[0]?.route,
      recovery: trace.attempts[0]?.recoveryDecision?.selected,
      dispatched
    });

    expect(rejected.trace.attempts[0]?.status).toBe("failed");
    expect(routing(rejected)).toEqual(routing(dispatchFailed));
  });
});
