import { describe, expect, it } from "vitest";
import { defaultAutomationStudioFlowSettingsMetadata, type AutomationStudioFlowDocument, type AutomationStudioFlowNode } from "../../../model/index.ts";
import {
  AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY,
  AUTOMATION_STUDIO_READINESS_CAP_MS,
  AUTOMATION_STUDIO_READINESS_FLOOR_MS,
  automationStudioAttemptIsRetryable,
  automationStudioNodeReadinessState,
  automationStudioNodeRetryPolicy,
  automationStudioReadinessCeilingMs,
  automationStudioRecordedState,
  automationStudioRetryBackoffMs,
  type AutomationStudioNodeAttemptTrace
} from "../index.ts";

const node: AutomationStudioFlowNode = { id: "act", definitionId: "builtin.policy.action" };

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"] = [], metadata?: AutomationStudioFlowDocument["metadata"]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.retry", ownerKind: "routine", ownerId: "routine.test", name: "Retry", createdAt: 1, updatedAt: 1, nodes, edges, ...(metadata ? { metadata } : {}) };
}

function attemptWith(failure: AutomationStudioNodeAttemptTrace["failure"]): AutomationStudioNodeAttemptTrace {
  return { attemptId: "act.attempt.1", nodeId: "act", definitionId: "builtin.policy.action", startedAt: 1, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], ...(failure ? { failure } : {}) };
}

describe("the retry policy a node runs under", () => {
  it("is the first attempt and three retries, at 250 ms, 1 s and 2 s, by default, because retries are not opt-in (user rule, 2026-10-07)", () => {
    expect(automationStudioNodeRetryPolicy(flowOf([node]), node, {})).toEqual(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY);
    expect(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.maxAttempts).toBe(4);
    expect([...AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.backoffMs]).toEqual([250, 1_000, 2_000]);
  });

  it("is what a new Flow's settings default to, so the two numbers cannot drift apart", () => {
    const training = defaultAutomationStudioFlowSettingsMetadata().trainingModeSettings as { recoveryBudget: { maxRetriesPerAction: number } };
    expect(training.recoveryBudget.maxRetriesPerAction).toBe(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY.maxAttempts - 1);
  });

  it("takes the node's own declaration over the Flow's, and the Flow's over the run's, above the default", () => {
    const declared: AutomationStudioFlowNode = { ...node, parameterValues: { retry: { maxAttempts: 6, backoffMs: [10, 20] } } };
    const flow = flowOf([declared], [], { retry: { maxAttempts: 5, backoffMs: 99 } });

    expect(automationStudioNodeRetryPolicy(flow, declared, { retryPolicy: { maxAttempts: 7, backoffMs: [1] } })).toEqual({ maxAttempts: 6, backoffMs: [10, 20] });
    expect(automationStudioNodeRetryPolicy(flow, node, { retryPolicy: { maxAttempts: 7, backoffMs: [1] } })).toEqual({ maxAttempts: 5, backoffMs: [99, 99, 99, 99] });
    expect(automationStudioNodeRetryPolicy(flowOf([node]), node, { retryPolicy: { maxAttempts: 7, backoffMs: [1] } })).toEqual({ maxAttempts: 7, backoffMs: [1] });
  });

  it("never runs a node below the default: a declaration, a run's policy or an allowance asking for fewer gets the default's attempts", () => {
    const fewer: AutomationStudioFlowNode = { ...node, parameterValues: { retry: { maxAttempts: 1, backoffMs: [10] } } };
    expect(automationStudioNodeRetryPolicy(flowOf([fewer]), fewer, {})).toEqual({ maxAttempts: 4, backoffMs: [10] });
    expect(automationStudioNodeRetryPolicy(flowOf([node]), node, { retryPolicy: { maxAttempts: 1, backoffMs: [] } }).maxAttempts).toBe(4);
    // A candidate trial passed both of these until t355, and ran every step once.
    expect(automationStudioNodeRetryPolicy(flowOf([node]), node, { retryPolicy: { maxAttempts: 1, backoffMs: [] }, recoveryBudget: { maxRetriesPerAction: 0 } }).maxAttempts).toBe(4);
    // Settings stored at the old default of two retries.
    expect(automationStudioNodeRetryPolicy(flowOf([node]), node, { recoveryBudget: { maxRetriesPerAction: 2 } }).maxAttempts).toBe(4);
  });

  it("is capped by maxRetriesPerAction above the default, which is the allowance its name claims", () => {
    const many: AutomationStudioFlowNode = { ...node, parameterValues: { retry: { maxAttempts: 9, backoffMs: [10] } } };
    expect(automationStudioNodeRetryPolicy(flowOf([many]), many, { recoveryBudget: { maxRetriesPerAction: 5 } }).maxAttempts).toBe(6);
    expect(automationStudioNodeRetryPolicy(flowOf([many]), many, { recoveryBudget: { maxRetriesPerAction: 1 } }).maxAttempts).toBe(4);
    // A cap above what the policy asks for changes nothing.
    expect(automationStudioNodeRetryPolicy(flowOf([node]), node, { recoveryBudget: { maxRetriesPerAction: 9 } }).maxAttempts).toBe(4);
  });

  it("reads a Retry node's parameters for the branch its success port feeds, which retried nothing before", () => {
    const retry: AutomationStudioFlowNode = { id: "guard", definitionId: "builtin.timing.retry", parameterValues: { attempts: 4, delayMs: 100, backoff: "exponential" } };
    const second: AutomationStudioFlowNode = { id: "second", definitionId: "builtin.policy.action" };
    const outside: AutomationStudioFlowNode = { id: "outside", definitionId: "builtin.policy.action" };
    const flow = flowOf([retry, node, second, outside], [
      { id: "e1", sourceNodeId: "guard", targetNodeId: "act", sourcePortId: "success" },
      { id: "e2", sourceNodeId: "act", targetNodeId: "second", sourcePortId: "success" },
      // `outside` is reached from elsewhere as well, so the branch stops before it.
      { id: "e3", sourceNodeId: "second", targetNodeId: "outside", sourcePortId: "success" },
      { id: "e4", sourceNodeId: "guard", targetNodeId: "outside", sourcePortId: "failed" }
    ]);

    expect(automationStudioNodeRetryPolicy(flow, node, {})).toEqual({ maxAttempts: 4, backoffMs: [100, 200, 400] });
    expect(automationStudioNodeRetryPolicy(flow, second, {})).toEqual({ maxAttempts: 4, backoffMs: [100, 200, 400] });
    expect(automationStudioNodeRetryPolicy(flow, outside, {})).toEqual(AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY);
  });

  it("reads the wait before each attempt, repeating the last entry", () => {
    const policy = { maxAttempts: 5, backoffMs: [10, 20] };

    expect(automationStudioRetryBackoffMs(policy, 1)).toBe(0);
    expect(automationStudioRetryBackoffMs(policy, 2)).toBe(10);
    expect(automationStudioRetryBackoffMs(policy, 3)).toBe(20);
    expect(automationStudioRetryBackoffMs(policy, 4)).toBe(20);
  });
});

describe("whether an attempt may be dispatched again", () => {
  it("asks the failure record's retryable flag, which no runtime decision read before", () => {
    expect(automationStudioAttemptIsRetryable(attemptWith({ category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution" }))).toBe(true);
    expect(automationStudioAttemptIsRetryable(attemptWith({ category: "unexpected_state", code: "web.action.blocked_by_dialog", retryable: false, stage: "execution" }))).toBe(false);
  });

  it("does not re-dispatch an action that already ran, whatever the record says", () => {
    // An action demoted by the check that followed it already took effect;
    // dispatching it again is how a double submit happens. The state checker
    // answers this, not the retry loop.
    expect(automationStudioAttemptIsRetryable(attemptWith({ category: "output_not_observed", code: "web.validation.output_not_observed", retryable: true, stage: "verification" }))).toBe(false);
    expect(automationStudioAttemptIsRetryable(attemptWith({ category: "navigation_unexpected", code: "web.navigation.unexpected", retryable: true, stage: "confirmation" }))).toBe(false);
  });

  it("does not guess without a structured record", () => {
    expect(automationStudioAttemptIsRetryable(attemptWith(undefined))).toBe(false);
  });
});

describe("the recorded state a node carries", () => {
  it("reads the state link every recording proposal writes and no execution path read", () => {
    const recorded: AutomationStudioFlowNode = {
      ...node,
      metadata: {
        stateLink: { recordingId: "rec.1", actionEntryId: "entry.4", stateSnapshotId: "snap.4", stateRef: "state://page/4", screenshotRef: "shot://4" },
        stateSnapshotId: "snap.4",
        stateRef: "state://page/4",
        screenshotRef: "shot://4",
        recordedGapMs: 900
      }
    };

    expect(automationStudioRecordedState(recorded)).toEqual({
      recordingId: "rec.1",
      actionEntryId: "entry.4",
      stateSnapshotId: "snap.4",
      stateRef: "state://page/4",
      screenshotRef: "shot://4",
      recordedGapMs: 900
    });
    expect(automationStudioRecordedState(node)).toEqual({});
  });

  it("turns a recorded gap into a wait ceiling of twice the gap, floored and capped", () => {
    expect(automationStudioReadinessCeilingMs(900)).toBe(1_800 < AUTOMATION_STUDIO_READINESS_FLOOR_MS ? AUTOMATION_STUDIO_READINESS_FLOOR_MS : 2_000);
    expect(automationStudioReadinessCeilingMs(50)).toBe(AUTOMATION_STUDIO_READINESS_FLOOR_MS);
    expect(automationStudioReadinessCeilingMs(90_000)).toBe(AUTOMATION_STUDIO_READINESS_CAP_MS);
    expect(automationStudioReadinessCeilingMs(5_000)).toBe(10_000);
    expect(automationStudioReadinessCeilingMs(undefined)).toBe(AUTOMATION_STUDIO_READINESS_FLOOR_MS);
  });

  it("reads the pre-state a node declares, and never its expected post-state", () => {
    const ready: AutomationStudioFlowNode = { ...node, parameterValues: { readyState: { conditions: [{ path: "cart" }] }, expectedState: { conditions: [{ path: "receipt" }] } } };

    expect(automationStudioNodeReadinessState(ready)).toEqual({ conditions: [{ path: "cart" }] });
    expect(automationStudioNodeReadinessState({ ...node, parameterValues: { expectedState: { conditions: [] } } })).toBeUndefined();
    expect(automationStudioNodeReadinessState({ ...node, parameterValues: { readyState: {} } })).toBeUndefined();
  });
});
