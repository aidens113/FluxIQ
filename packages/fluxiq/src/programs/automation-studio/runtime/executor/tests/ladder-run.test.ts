import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

const TIMEOUT_FAILURE = { category: "timeout" as const, code: "web.action.timeout", retryable: true, stage: "execution" as const };
const BLOCKED_FAILURE = { category: "unexpected_state" as const, code: "web.action.blocked_by_dialog", retryable: false, stage: "execution" as const };

function actionNode(id: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}, metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}`, ...parameterValues }, ...(metadata ? { metadata } : {}) };
}

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"] = []): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.ladder", ownerKind: "routine", ownerId: "routine.test", name: "Ladder", createdAt: 1, updatedAt: 1, nodes, edges };
}

/** Every run here records the waits instead of spending them, so a backoff costs no wall clock. */
function runWith(flow: AutomationStudioFlowDocument, options: Partial<AutomationStudioGraphExecutionOptions>, waits: number[]): Promise<AutomationStudioGraphExecutionTrace> {
  return runAutomationStudioGraph(flow, { delay: async (ms) => { waits.push(ms); }, ...options });
}

/** Fails one output and lets every other one through, so a run can go on past the node under test. */
function onlyFails(outputId: string, failure: AutomationNodeExecutionResult["failure"], dispatches: string[]): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  return (effect) => {
    const dispatched = String((effect.payload as { outputId?: unknown } | undefined)?.outputId ?? "");
    dispatches.push(dispatched);
    return dispatched === outputId
      ? { status: "failed", route: "failed", outputs: {}, message: "The action failed.", ...(failure ? { failure } : {}) }
      : { status: "success", route: "success", outputs: { ok: true } };
  };
}

function failingDispatcher(failure: AutomationNodeExecutionResult["failure"], succeedFrom = Number.POSITIVE_INFINITY, dispatches: string[] = []): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  return (effect) => {
    const outputId = String((effect.payload as { outputId?: unknown } | undefined)?.outputId ?? "");
    dispatches.push(outputId);
    return dispatches.length >= succeedFrom
      ? { status: "success", route: "success", outputs: { ok: true } }
      : { status: "failed", route: "failed", outputs: {}, message: "The action failed.", ...(failure ? { failure } : {}) };
  };
}

describe("a node that fails is attempted again", () => {
  it("attempts three times by default, waiting 250 ms then 1 s, with no one opting in", async () => {
    const dispatches: string[] = [];
    const waits: number[] = [];
    const trace = await runWith(flowOf([actionNode("act")]), { effectDispatcher: failingDispatcher(TIMEOUT_FAILURE, Number.POSITIVE_INFINITY, dispatches) }, waits);

    expect(dispatches).toEqual(["output.act", "output.act", "output.act"]);
    expect(waits).toEqual([250, 1_000]);
    expect(trace.attempts).toHaveLength(3);
    expect(trace.attempts[0]).not.toHaveProperty("retry");
    expect(trace.attempts[1]?.retry).toMatchObject({ attemptNumber: 2, maxAttempts: 3, backoffMs: 250, rung: "retry_node", previousAttemptId: "act.attempt.1" });
    expect(trace.attempts[2]?.retry).toMatchObject({ attemptNumber: 3, backoffMs: 1_000, previousAttemptId: "act.attempt.2" });
    expect(trace.status).toBe("failed");
  });

  it("carries on down the success route as soon as an attempt works", async () => {
    const dispatches: string[] = [];
    const flow = flowOf([actionNode("act"), actionNode("after")], [{ id: "e", sourceNodeId: "act", targetNodeId: "after", sourcePortId: "success" }]);
    const trace = await runWith(flow, { effectDispatcher: failingDispatcher(TIMEOUT_FAILURE, 3, dispatches) }, []);

    expect(dispatches).toEqual(["output.act", "output.act", "output.act", "output.after"]);
    expect(trace.status).toBe("succeeded");
  });

  it("attempts a failure the record calls non-retryable exactly once", async () => {
    const dispatches: string[] = [];
    const waits: number[] = [];
    const trace = await runWith(flowOf([actionNode("act")]), { effectDispatcher: failingDispatcher(BLOCKED_FAILURE, Number.POSITIVE_INFINITY, dispatches) }, waits);

    expect(dispatches).toEqual(["output.act"]);
    expect(waits).toEqual([]);
    expect(trace.attempts).toHaveLength(1);
  });

  it("spends the allowance a node declares for itself", async () => {
    const dispatches: string[] = [];
    const waits: number[] = [];
    const flow = flowOf([actionNode("act", { retry: { maxAttempts: 2, backoffMs: 7 } })]);
    await runWith(flow, { effectDispatcher: failingDispatcher(TIMEOUT_FAILURE, Number.POSITIVE_INFINITY, dispatches) }, waits);

    expect(dispatches).toHaveLength(2);
    expect(waits).toEqual([7]);
  });
});

describe("the ladder consumes each rung it runs", () => {
  it("leaves the model as the last candidate standing once the deterministic rungs are spent", async () => {
    const trace = await runWith(flowOf([actionNode("act")]), { effectDispatcher: failingDispatcher(TIMEOUT_FAILURE) }, []);
    const last = trace.attempts[trace.attempts.length - 1];

    // Every candidate on this list that is not the model's tells the adaptive
    // classifier a deterministic answer exists and suppresses escalation, so
    // the spent rungs have to be gone.
    expect(last?.recoveryDecision?.candidates.map((candidate) => candidate.kind)).toEqual(["llm_diagnosis"]);
    expect(last?.recoveryDecision?.selected?.kind).toBe("llm_diagnosis");
    expect(trace.message).toBe("Recovery ladder reached LLM diagnosis fallback before a configured provider was invoked.");
  });

  it("offers the retry rung while attempts are left, and the failed route once they are not", async () => {
    const flow = flowOf([actionNode("act"), actionNode("handler")], [{ id: "e", sourceNodeId: "act", targetNodeId: "handler", sourcePortId: "failed" }]);
    const dispatches: string[] = [];
    const trace = await runWith(flow, { allowLlmDiagnosis: false, effectDispatcher: failingDispatcher(TIMEOUT_FAILURE, 4, dispatches) }, []);

    expect(trace.attempts[0]?.recoveryDecision?.selected?.kind).toBe("retry_node");
    expect(trace.attempts[2]?.recoveryDecision?.selected?.kind).toBe("deterministic_path");
    expect(dispatches).toEqual(["output.act", "output.act", "output.act", "output.handler"]);
    expect(trace.status).toBe("succeeded");
  });
});

describe("the recorded state the run reads", () => {
  it("waits for the state a node expects to find, up to the ceiling its recorded gap sets", async () => {
    const asked: Array<{ timeoutMs: number; nodeId?: string }> = [];
    const flow = flowOf([actionNode("act", { readyState: { conditions: [{ path: "page.ready" }] } }, { recordedGapMs: 5_000 })]);
    const trace = await runWith(flow, {
      effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }),
      hostRuntime: {
        capabilities: ["expectation-evaluation"],
        expectationEvaluator: (_conditions, _mode, timeoutMs, context) => { asked.push({ timeoutMs, ...(context.nodeId ? { nodeId: context.nodeId } : {}) }); return { passed: true, checkedConditionCount: 1 }; }
      }
    }, []);

    expect(asked).toEqual([{ timeoutMs: 10_000, nodeId: "act" }]);
    expect(trace.attempts[0]?.readiness).toMatchObject({ ceilingMs: 10_000, satisfied: true, checkedConditionCount: 1 });
  });

  it("attempts the node anyway when the state never arrives, and marks it rather than failing it", async () => {
    const flow = flowOf([actionNode("act", { readyState: { conditions: [{ path: "page.ready" }] } })]);
    const trace = await runWith(flow, {
      effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }),
      hostRuntime: { capabilities: ["expectation-evaluation"], expectationEvaluator: () => ({ passed: false, checkedConditionCount: 1, message: "Not ready." }) }
    }, []);

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.readiness).toMatchObject({ ceilingMs: 2_000, satisfied: false, message: "Not ready." });
  });

  it("carries the recorded state link onto the attempt, which nothing read before", async () => {
    const flow = flowOf([actionNode("act", {}, { stateLink: { recordingId: "rec.1", actionEntryId: "entry.2", stateSnapshotId: "snap.2", stateRef: "state://page/2" } })]);
    const trace = await runWith(flow, { effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }) }, []);

    expect(trace.attempts[0]?.recordedState).toEqual({ recordingId: "rec.1", actionEntryId: "entry.2", stateSnapshotId: "snap.2", stateRef: "state://page/2" });
  });

  it("skips a node whose recorded state already holds instead of repeating the action", async () => {
    const dispatches: string[] = [];
    const flow = flowOf(
      [actionNode("act", { expectedState: { conditions: [{ path: "order.placed" }] } }), actionNode("after")],
      [{ id: "e", sourceNodeId: "act", targetNodeId: "after", sourcePortId: "success" }]
    );
    const trace = await runWith(flow, {
      effectDispatcher: onlyFails("output.act", BLOCKED_FAILURE, dispatches),
      hostRuntime: { capabilities: ["expectation-evaluation"], expectationEvaluator: () => ({ passed: true, checkedConditionCount: 1 }) }
    }, []);

    // One dispatch of the failing node, then the run carries on: the state it
    // was to produce already holds, so repeating the action is how a double
    // submit happens.
    expect(dispatches).toEqual(["output.act", "output.after"]);
    expect(trace.attempts[0]).toMatchObject({ status: "failed" });
    expect(trace.attempts[0]?.transitionComparison?.metadata).toMatchObject({ expectationSatisfiedAfterFailure: true });
    expect(trace.status).toBe("succeeded");
  });

  it("runs the Flow's own interference node, then attempts again", async () => {
    const dispatches: string[] = [];
    const flow = flowOf([actionNode("act"), actionNode("dismiss", {}, { clearsInterference: true })]);
    const trace = await runWith(flow, { startNodeId: "act", effectDispatcher: failingDispatcher(TIMEOUT_FAILURE, 3, dispatches), allowLlmDiagnosis: false }, []);

    expect(dispatches.slice(0, 3)).toEqual(["output.act", "output.dismiss", "output.act"]);
    expect(trace.attempts[1]?.nodeId).toBe("dismiss");
    expect(trace.attempts[0]?.recoveryDecision?.selected?.kind).not.toBe("clear_interference");
    expect(trace.attempts[0]?.recoveryDecision?.metadata?.ladderConsumed).toContain("clear_interference");
  });
});
