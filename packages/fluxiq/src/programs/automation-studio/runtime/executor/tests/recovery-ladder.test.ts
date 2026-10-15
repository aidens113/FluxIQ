import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioNodeAttemptTrace } from "../index.ts";

const NODE_MESSAGE = "Synthetic target was not found.";
const LLM_FALLBACK_MESSAGE = "Recovery ladder reached LLM diagnosis fallback before a configured provider was invoked.";

// One action whose dispatch fails with a message and a structured failure. With no
// failure edge, the ladder is all that stands between that failure and the run's end.
const failingFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.ladder-llm-setting",
  ownerKind: "routine",
  ownerId: "routine.test",
  name: "Ladder LLM setting",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "act", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "missing" } } }],
  edges: []
};

const recoverableFlow: AutomationStudioFlowDocument = {
  ...failingFlow,
  flowId: "flow.ladder-llm-setting-recoverable",
  nodes: [
    ...failingFlow.nodes,
    { id: "recover", definitionId: "builtin.policy.recovery", parameterValues: { strategy: "retry" } },
    { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
  ],
  edges: [
    { id: "act.recover", sourceNodeId: "act", sourcePortId: "failed", targetNodeId: "recover", targetPortId: "failure" },
    { id: "recover.end", sourceNodeId: "recover", sourcePortId: "recovered", targetNodeId: "end", targetPortId: "in" }
  ]
};

function run(flow: AutomationStudioFlowDocument, options: Partial<AutomationStudioGraphExecutionOptions> = {}) {
  return runAutomationStudioGraph(flow, {
    effectDispatcher: () => ({ status: "failed", route: "failed", message: NODE_MESSAGE, failure: { category: "target_not_found", code: "test.target.not_found", retryable: false } }),
    ...options
  });
}

/** The failed attempt as its node produced it, before the ladder decided anything. */
function nodeFailure(attempt: AutomationStudioNodeAttemptTrace | undefined) {
  return { nodeId: attempt?.nodeId, status: attempt?.status, route: attempt?.route, message: attempt?.message, failure: attempt?.failure, comparison: attempt?.transitionComparison?.status };
}

function candidateKinds(attempt: AutomationStudioNodeAttemptTrace | undefined) {
  return attempt?.recoveryDecision?.candidates.map((candidate) => candidate.kind);
}

describe("the recovery ladder and the run's LLM setting", () => {
  it("offers no LLM rung when the LLM is off, and the run fails with the node's own failure", async () => {
    const off = await run(failingFlow, { allowLlmDiagnosis: false });
    const on = await run(failingFlow, { allowLlmDiagnosis: true });
    const decision = off.attempts[0]?.recoveryDecision;

    expect(candidateKinds(off.attempts[0])).toEqual([]);
    expect(decision?.selected).toBeUndefined();
    // A disabled LLM is not reported as a spent budget.
    expect(decision?.metadata).not.toHaveProperty("budgetExhausted");
    expect(off.status).toBe("failed");
    expect(off.attempts).toHaveLength(1);
    // The failure is the node's, and the same as with the LLM on; only the ladder's stop differs.
    expect(nodeFailure(off.attempts[0])).toEqual({ nodeId: "act", status: "failed", route: "failed", message: NODE_MESSAGE, failure: { category: "target_not_found", code: "test.target.not_found", retryable: false }, comparison: expect.any(String) });
    expect(nodeFailure(off.attempts[0])).toEqual(nodeFailure(on.attempts[0]));
    expect(off.message).toBe(NODE_MESSAGE);
  });

  it("keeps the deterministic rungs when the LLM is off", async () => {
    const trace = await run(recoverableFlow, { allowLlmDiagnosis: false });

    expect(trace.status).toBe("succeeded");
    expect(candidateKinds(trace.attempts[0])).toEqual(["deterministic_path", "reroute"]);
    expect(trace.attempts[0]?.recoveryDecision?.selected).toMatchObject({ kind: "deterministic_path", edgeId: "act.recover", targetNodeId: "recover" });
  });

  it("offers the LLM rung when the LLM is on", async () => {
    const trace = await run(failingFlow, { allowLlmDiagnosis: true });

    expect(trace.status).toBe("failed");
    expect(candidateKinds(trace.attempts[0])).toEqual(["llm_diagnosis"]);
    expect(trace.attempts[0]?.recoveryDecision?.selected).toMatchObject({ kind: "llm_diagnosis" });
    expect(trace.message).toBe(LLM_FALLBACK_MESSAGE);
  });

  it("offers the LLM rung when the option is absent, as before the option existed", async () => {
    const failing = await run(failingFlow);
    const recoverable = await run(recoverableFlow);

    expect(candidateKinds(failing.attempts[0])).toEqual(["llm_diagnosis"]);
    expect(failing.message).toBe(LLM_FALLBACK_MESSAGE);
    expect(candidateKinds(recoverable.attempts[0])).toEqual(["deterministic_path", "reroute", "llm_diagnosis"]);
  });

  it("still lets a spent LLM budget remove the rung when the LLM is on", async () => {
    const trace = await run(failingFlow, { allowLlmDiagnosis: true, recoveryBudget: { maxAdaptationOrLlmAttemptsPerRun: 0 } });

    expect(candidateKinds(trace.attempts[0])).toEqual([]);
    expect(trace.message).toBe("Recovery budget exhausted: max adaptation/LLM attempts per run.");
  });
});

// The ladder marks the candidate that goes on past an optional step
// (`optionalStepWayOn`), so a reader of the run tells the Flow's own way on from
// a failed route without reading the label (t643): the Lab once read such a
// bypassed step as the run's failure.
describe("the mark on an optional step's way on", () => {
  const step = (id: string) => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}`, parameters: { elementId: id } } });
  const end = { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } };
  const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
  const dispatched: string[] = [];
  const runBannerFails = (flow: AutomationStudioFlowDocument) => runAutomationStudioGraph(flow, {
    allowLlmDiagnosis: false,
    effectDispatcher: (effect) => {
      const outputId = String((effect.payload as { outputId?: unknown } | undefined)?.outputId ?? "");
      dispatched.push(outputId);
      return outputId === "output.banner"
        ? { status: "failed", route: "failed", outputs: {}, message: "Synthetic banner was not found.", failure: { category: "target_not_found", code: "test.target.not_found", retryable: false, stage: "dispatch" } }
        : { status: "success", route: "success", outputs: { ok: true } };
    }
  });

  it("is set on the selected candidate when a failed optional step goes on to its Merge", async () => {
    dispatched.length = 0;
    const trace = await runBannerFails({
      ...failingFlow,
      nodes: [step("banner"), { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } }, step("next"), end],
      edges: [edge("banner", "failed", "join"), edge("banner", "success", "join", "branches"), edge("join", "success", "next"), edge("next", "success", "end")]
    });
    expect(dispatched).toEqual(["output.banner", "output.next"]);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.find((attempt) => attempt.nodeId === "banner")?.status).toBe("failed");
    expect(trace.attempts.find((attempt) => attempt.nodeId === "banner")?.recoveryDecision?.selected).toMatchObject({ kind: "deterministic_path", targetNodeId: "join", optionalStepWayOn: true });
  });

  it("is absent on a plain failed route, which is not the optional rule", async () => {
    dispatched.length = 0;
    const trace = await runBannerFails({
      ...failingFlow,
      nodes: [step("banner"), step("fallback"), end],
      edges: [edge("banner", "failed", "fallback"), edge("banner", "success", "end"), edge("fallback", "success", "end")]
    });
    expect(dispatched).toEqual(["output.banner", "output.fallback"]);
    const selected = trace.attempts.find((attempt) => attempt.nodeId === "banner")?.recoveryDecision?.selected;
    expect(selected).toMatchObject({ kind: "deterministic_path", targetNodeId: "fallback" });
    expect(selected?.optionalStepWayOn).toBeUndefined();
  });
});
