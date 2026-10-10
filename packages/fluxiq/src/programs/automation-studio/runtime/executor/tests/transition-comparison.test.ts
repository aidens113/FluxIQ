import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES, type AutomationStudioAdaptiveFailureClass } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { compareAutomationStudioTransition, runAutomationStudioGraph, type AutomationStudioNodeAttemptTrace, type AutomationStudioTransitionComparisonStatus } from "../index.ts";
import { attemptWithHostExpectationEvaluation } from "../transition-comparison.ts";

const node: AutomationStudioFlowNode = { id: "click", definitionId: "builtin.policy.action", parameterValues: {} };

describe("compareAutomationStudioTransition", () => {
  it("reads a failed attempt's structured failure before matching text", () => {
    expect(compare(failedAttempt({ failure: failure("timeout"), message: "The client did not answer." }))).toBe("timeout");
    expect(compare(failedAttempt({ failure: failure("target_not_found"), message: "Request timed out." }))).toBe("target_not_found");
  });

  it("maps every failure category to a comparison status", () => {
    const expected: Record<AutomationStudioAdaptiveFailureClass, AutomationStudioTransitionComparisonStatus> = {
      action_failed: "action_failed",
      expected_state_missing: "missing_expected_state",
      unexpected_state: "unexpected_state",
      timeout: "timeout",
      blocked_by_capability_or_policy: "blocked",
      missing_router_or_subflow_target: "action_failed",
      graph_validation_or_unknown_node: "action_failed",
      external_side_effect_denied: "blocked",
      ambiguous_or_unknown: "action_failed",
      target_not_found: "target_not_found",
      target_ambiguous: "target_ambiguous",
      navigation_unexpected: "unexpected_state",
      output_not_observed: "missing_expected_state",
      page_changed: "unexpected_state",
      auth_required: "blocked",
      user_intervention_required: "blocked"
    };
    expect(Object.keys(expected).sort()).toEqual([...AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES].sort());
    for (const category of AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES) {
      expect(compare(failedAttempt({ failure: failure(category) }))).toBe(expected[category]);
    }
  });

  it("falls back to route and message text for attempts without a failure record", () => {
    expect(compare(failedAttempt({ message: "Client action timed out after 5000ms." }))).toBe("timeout");
    expect(compare(failedAttempt({ message: "The client did not answer." }))).toBe("action_failed");
  });

  it("uses the failure record only for failed attempts", () => {
    expect(compare(failedAttempt({ status: "waiting", failure: failure("timeout") }))).toBe("blocked");
  });

  it("takes the host's verdict on expected state over counting its keys", () => {
    const stateNode: AutomationStudioFlowNode = { id: "click", definitionId: "builtin.policy.action", parameterValues: { expectedState: { conditions: [{ path: "cart.items" }] } } };
    const succeeded = failedAttempt({ status: "succeeded", route: "success", effects: [{ type: "policy.output.dispatch" }] });

    expect(compareAutomationStudioTransition(stateNode, succeeded).status).toBe("matched");
    const rejected = compareAutomationStudioTransition(stateNode, succeeded, { passed: false, message: "The cart stayed empty.", checkedConditionCount: 2 });
    expect(rejected.status).toBe("missing_expected_state");
    expect(rejected.message).toBe("The cart stayed empty.");
    expect(rejected.diffSummary.stateCheckCount).toBe(2);
    expect(compareAutomationStudioTransition(stateNode, succeeded, { passed: true }).status).toBe("matched");
  });

  // A held in-run repair is validated only on a comparison the host judged
  // (`service/runtime-adaptation/held-fix-validation.ts`).
  it("marks a comparison the host judged, and never one read off the route", () => {
    const stateNode: AutomationStudioFlowNode = { id: "click", definitionId: "builtin.policy.action", parameterValues: { expectedState: { conditions: [{ path: "cart.items" }] } } };
    const succeeded = failedAttempt({ status: "succeeded", route: "success", effects: [{ type: "policy.output.dispatch" }] });

    expect(compareAutomationStudioTransition(stateNode, succeeded, { passed: true }).metadata).toEqual({ hostEvaluated: true });
    expect(compareAutomationStudioTransition(stateNode, succeeded).metadata).toBeUndefined();
  });

  it("reads the category from the rejecting evaluator's own failure record", () => {
    const stateNode: AutomationStudioFlowNode = { id: "click", definitionId: "builtin.policy.action", parameterValues: { expectedState: { conditions: [] } } };
    const succeeded = failedAttempt({ status: "succeeded", route: "success", effects: [{ type: "policy.output.dispatch" }] });

    expect(compareAutomationStudioTransition(stateNode, succeeded, { passed: false, failure: failure("navigation_unexpected") }).status).toBe("unexpected_state");
  });

  it("keeps the route fallback for expected state when no evaluator answered", () => {
    const stateNode: AutomationStudioFlowNode = { id: "check", definitionId: "builtin.policy.expectation", parameterValues: { conditions: [{ path: "cart.items" }] } };
    const routedFailed = failedAttempt({ status: "succeeded", route: "passed", outputs: { failed: true }, effects: [{ type: "policy.expectation.checked" }] });

    expect(compareAutomationStudioTransition(stateNode, routedFailed).status).toBe("missing_expected_state");
  });

  it("explains the target statuses with the attempt message or a default", () => {
    expect(compareAutomationStudioTransition(node, failedAttempt({ failure: failure("target_ambiguous") })).message).toBe("More than one candidate matched the action target.");
    expect(compareAutomationStudioTransition(node, failedAttempt({ failure: failure("target_not_found"), message: "No element matched #save." })).message).toBe("No element matched #save.");
  });
});

describe("the host check after a succeeded action", () => {
  it("does not ask the host about an expected state with no keys, and the run goes on", async () => {
    // The host rejects whatever it is asked. A one-key state shows it is bound
    // and asked, so the empty state going unasked is not a vacuous pass.
    // Twice, not once: a rejection is re-checked before the failure record is
    // built, so a state arriving a moment late is not minted as a mismatch.
    const keyed = await runWithRejectingHost({ conditions: [{ path: "cart.items" }] });
    expect(keyed.asked).toHaveLength(2);
    expect(keyed.trace.attempts[0]?.status).toBe("failed");

    const empty = await runWithRejectingHost({});
    expect(empty.asked).toEqual([]);
    expect(empty.trace.status).toBe("succeeded");
    expect(empty.trace.attempts[0]).toMatchObject({ status: "succeeded", route: "success" });
    expect(empty.trace.attempts[0]).not.toHaveProperty("failure");
    expect(empty.trace.attempts[0]?.transitionComparison).toMatchObject({ status: "matched", diffSummary: { stateCheckCount: 0 } });
    expect(empty.dispatched).toEqual(["activate-element", "read-cart"]);
  });
});

// t413: a step's own `done when:` is stored as `{ facts: [...] }` and judged
// through the batched fact check, never the expectation evaluator.
describe("an expected state of page facts", () => {
  const factsNode: AutomationStudioFlowNode = { id: "click", definitionId: "builtin.policy.action", parameterValues: { expectedState: { facts: [{ fact: "exists", op: "exists", target: { locator: "#saved" } }] } } };
  const succeeded = failedAttempt({ status: "succeeded", route: "success", effects: [{ type: "policy.output.dispatch" }] });
  const judged = async (answer: "true" | "false" | "unknown", attempt = succeeded) => {
    const reads: number[] = [];
    let expectationAsks = 0;
    const result = await attemptWithHostExpectationEvaluation(factsNode, { ...attempt, transitionComparison: compareAutomationStudioTransition(factsNode, attempt) }, {
      delay: async (ms) => {
        reads.push(ms);
      },
      hostRuntime: {
        capabilities: [],
        expectationEvaluator: () => {
          expectationAsks += 1;
          return { passed: true };
        },
        factEvaluator: (conditions) => conditions.map(() => ({ result: answer, capturedAt: 1 }))
      }
    });
    return { result, waits: reads, expectationAsks };
  };

  it("rejects a succeeded attempt only once the facts are still false at the end of its wait ceiling", async () => {
    const { result, waits, expectationAsks } = await judged("false");
    expect(result).toMatchObject({ status: "failed", route: "failed", failure: { category: "expected_state_missing" }, transitionComparison: { status: "missing_expected_state", metadata: { hostEvaluated: true } } });
    expect(waits.reduce((sum, ms) => sum + ms, 0)).toBe(2_000);
    expect(expectationAsks).toBe(0);
  });

  it("accepts on facts that hold, and leaves the attempt as it was on facts the host could not settle", async () => {
    expect((await judged("true")).result.transitionComparison).toMatchObject({ status: "matched", metadata: { hostEvaluated: true } });
    const unsettled = await judged("unknown");
    expect(unsettled.result.status).toBe("succeeded");
    expect(unsettled.result.transitionComparison?.metadata).toBeUndefined();
  });

  it("records beside a failed attempt that its facts hold, without waiting, so the ladder can skip it", async () => {
    const { result, waits } = await judged("true", failedAttempt());
    expect(result.status).toBe("failed");
    expect(result.transitionComparison?.metadata).toMatchObject({ expectationSatisfiedAfterFailure: true, expectationCheckedConditionCount: 1 });
    expect(waits).toEqual([]);
  });
});

describe("a lasting act rejected by its expected state after it answered success", () => {
  // t413: found after acting, so never made again -- no effect check, no retry -- and the run ends as a failure,
  // not as Outcome uncertain. Before, the rejection reached the effect check, which read the same rejection as
  // "did not land" and pressed again.
  it("is dispatched once, and nothing after it runs", async () => {
    const dispatched: unknown[] = [];
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1", flowId: "flow.lasting-rejected", ownerKind: "task", ownerId: "task.lasting-rejected", name: "Lasting rejected", createdAt: 1, updatedAt: 1,
      nodes: [
        { id: "click", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", expectedState: { conditions: [{ path: "cart.items" }] } }, metadata: { declaredConsequences: ["modify_existing"] } },
        { id: "after", definitionId: "builtin.policy.action", parameterValues: { outputId: "read-cart" } }
      ],
      edges: [{ id: "edge.click.after", sourceNodeId: "click", targetNodeId: "after", sourcePortId: "success" }]
    };
    const trace = await runAutomationStudioGraph(flow, {
      delay: async () => undefined,
      effectDispatcher: (effect) => {
        dispatched.push((effect.payload as { outputId?: unknown } | undefined)?.outputId);
        return { status: "success", route: "success", outputs: { ok: true } };
      },
      hostRuntime: { capabilities: ["expectation-evaluation"], expectationEvaluator: () => ({ passed: false, checkedConditionCount: 1 }) }
    });

    expect(dispatched).toEqual(["activate-element"]);
    expect(trace.status).toBe("failed");
    expect(trace.message ?? "").not.toMatch(/^Outcome uncertain/u);
    expect(trace.attempts[0]).toMatchObject({ status: "failed", failure: { code: "core.policy.expectation_rejected", stage: "verification" } });
    expect(trace.attempts[0]?.effectCheck).toBeUndefined();
  });
});

// A click carrying `expectedState`, then a second output on `success`, run
// against a host whose evaluator rejects whatever it is asked.
async function runWithRejectingHost(expectedState: JsonObject) {
  const asked: unknown[] = [];
  const dispatched: unknown[] = [];
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1",
    flowId: "flow.host-check",
    ownerKind: "task",
    ownerId: "task.host-check",
    name: "Host check",
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { id: "click", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", expectedState } },
      { id: "after", definitionId: "builtin.policy.action", parameterValues: { outputId: "read-cart" } }
    ],
    edges: [{ id: "edge.click.after", sourceNodeId: "click", targetNodeId: "after", sourcePortId: "success" }]
  };
  const trace = await runAutomationStudioGraph(flow, {
    effectDispatcher: (effect) => {
      dispatched.push((effect.payload as { outputId?: unknown } | undefined)?.outputId);
      return { status: "success", route: "success", outputs: { ok: true } };
    },
    hostRuntime: {
      capabilities: ["expectation-evaluation"],
      expectationEvaluator: (...args) => {
        asked.push(args);
        return { passed: false, message: "The host rejected the state." };
      }
    }
  });
  return { trace, asked, dispatched };
}

function compare(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioTransitionComparisonStatus {
  return compareAutomationStudioTransition(node, attempt).status;
}

function failure(category: AutomationStudioAdaptiveFailureClass) {
  return { category, code: `test.${category}`, retryable: false };
}

function failedAttempt(overrides: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "click.attempt.1",
    nodeId: "click",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    ...overrides
  };
}
