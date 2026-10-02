import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioNodeAttemptTrace } from "../index.ts";
import { recoveryBudgetState } from "../recovery-budget.ts";

// Live run `run-munv53gt-a0e6f545`: a re-authored Flow pressed a store's
// one-time "Continue shopping" check, optional by its graph (both `success` and
// `failed` lead into one Merge). The re-run's session had already passed the
// check, so the press's target was absent. Two retries spent the default subflow
// recovery budget of two, the third failure lost the authored `failed` route,
// the ladder fell to its model rung, and the run stopped before the extract.

/** The recovery budget a Flow created with Core's defaults runs under (`model/flows.ts`). */
const DEFAULT_RECOVERY_BUDGET = { maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 2, maxReroutesPerRun: 2 };

const optionalPressFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.optional-press",
  ownerKind: "routine",
  ownerId: "routine.test",
  name: "Optional press",
  createdAt: 1,
  updatedAt: 1,
  nodes: [
    { id: "search", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "search" } } },
    { id: "check", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "soft-check" } } },
    { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
    { id: "read", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "results" } } }
  ],
  edges: [
    { id: "search.check", sourceNodeId: "search", sourcePortId: "success", targetNodeId: "check", targetPortId: "in" },
    // The build's order: failure first, as the assembler writes an optional step.
    { id: "check.failed", sourceNodeId: "check", sourcePortId: "failed", targetNodeId: "join", targetPortId: "in" },
    { id: "check.success", sourceNodeId: "check", sourcePortId: "success", targetNodeId: "join", targetPortId: "branches" },
    { id: "join.read", sourceNodeId: "join", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" }
  ]
};

/** The check's target is absent, as a host reports it: retryable, after its own absorbed waits. */
const checkAbsent: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => JSON.stringify(effect.payload ?? null).includes("soft-check")
  ? { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } }
  : { status: "success", route: "success", outputs: { ok: true } };

function run(options: Partial<AutomationStudioGraphExecutionOptions> = {}) {
  return runAutomationStudioGraph(optionalPressFlow, {
    effectDispatcher: checkAbsent,
    recoveryBudget: DEFAULT_RECOVERY_BUDGET,
    delay: async () => undefined,
    ...options
  });
}

function decisionKind(attempt: AutomationStudioNodeAttemptTrace | undefined) {
  return attempt?.recoveryDecision?.selected?.kind;
}

/** The dispatches whose payload names `elementId`, counted, around a dispatcher. */
function counting(dispatcher: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>, elementId: string) {
  const counter = { calls: 0 };
  const counted: typeof dispatcher = (effect, context) => {
    if (JSON.stringify(effect.payload ?? null).includes(elementId)) counter.calls += 1;
    return dispatcher(effect, context);
  };
  return { counter, dispatcher: counted };
}

/** The check fails some other way than its target being absent. */
const checkFails = (category: "action_failed" | "target_ambiguous"): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> => (effect) => JSON.stringify(effect.payload ?? null).includes("soft-check")
  ? { status: "failed", route: "failed", message: "The press did nothing.", failure: { category, code: `web.test.${category}`, retryable: true, stage: "execution" } }
  : { status: "success", route: "success", outputs: { ok: true } };

// The rule (user, 2026-10-02): an absent sometimes-present step is skipped by
// observing the page, never reported as a failure -- no recovery, no retries.
describe("an optional press whose target is absent, under the default recovery budget", () => {
  it("skips the press after one dispatch and follows its failed route through the Merge, with no recovery", async () => {
    const { counter, dispatcher } = counting(checkAbsent, "soft-check");
    const trace = await run({ effectDispatcher: dispatcher });

    expect(trace.status).toBe("succeeded");
    expect(counter.calls).toBe(1);
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["search", "check", "join", "read"]);
    const check = trace.attempts[1]!;
    expect(check).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } });
    expect(check).not.toHaveProperty("recoveryDecision");
    expect(check).not.toHaveProperty("failure");
    expect(check).not.toHaveProperty("fault");
    expect(trace.defence).toBeUndefined();
  });

  it("still follows the failed route when the subflow budget allows only one recovery", async () => {
    const trace = await run({ recoveryBudget: { ...DEFAULT_RECOVERY_BUDGET, maxRecoveryAttemptsPerSubflow: 1 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.at(-1)?.nodeId).toBe("read");
  });

  it("skips it even when the Flow sets the subflow budget to zero: a skip is not a recovery", async () => {
    const trace = await run({ recoveryBudget: { ...DEFAULT_RECOVERY_BUDGET, maxRecoveryAttemptsPerSubflow: 0 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["search", "check", "join", "read"]);
    expect(trace.attempts[1]).not.toHaveProperty("recoveryDecision");
  });
});

describe("a failure the skip does not cover keeps the recovery ladder", () => {
  it("retries a straight-line press whose target is absent: a step that is always there did fail", async () => {
    const straight: AutomationStudioFlowDocument = {
      ...optionalPressFlow,
      nodes: optionalPressFlow.nodes.filter((node) => node.id !== "join"),
      edges: [
        { id: "search.check", sourceNodeId: "search", sourcePortId: "success", targetNodeId: "check", targetPortId: "in" },
        { id: "check.read", sourceNodeId: "check", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" }
      ]
    };
    const { counter, dispatcher } = counting(checkAbsent, "soft-check");
    const trace = await runAutomationStudioGraph(straight, { effectDispatcher: dispatcher, recoveryBudget: DEFAULT_RECOVERY_BUDGET, delay: async () => undefined });

    const checks = trace.attempts.filter((attempt) => attempt.nodeId === "check");
    expect(counter.calls).toBe(3);
    expect(checks.slice(0, 2).map(decisionKind)).toEqual(["retry_node", "retry_node"]);
    expect(checks.every((attempt) => attempt.skipped === undefined && attempt.status === "failed")).toBe(true);
    // The retry record still points at the attempt it followed.
    expect(checks[1]?.retry?.previousAttemptId).toBe(checks[0]?.attemptId);
  });

  // The ladder as it was: an action that ran and failed is retried; an ambiguous
  // target is not retryable and goes straight to the authored failed route.
  it.each([
    ["action_failed", ["retry_node", "retry_node", "deterministic_path"]],
    ["target_ambiguous", ["deterministic_path"]]
  ] as const)("takes the ladder for an optional press that failed with %s", async (category, decisions) => {
    const trace = await run({ effectDispatcher: checkFails(category) });

    expect(trace.status).toBe("succeeded");
    const checks = trace.attempts.filter((attempt) => attempt.nodeId === "check");
    expect(checks.map(decisionKind)).toEqual(decisions);
    expect(checks.at(-1)?.recoveryDecision?.selected).toMatchObject({ edgeId: "check.failed", targetNodeId: "join" });
    expect(checks.every((attempt) => attempt.skipped === undefined && attempt.status === "failed")).toBe(true);
  });

  it("gives an optional press that failed some other way no failed route when the subflow budget is zero", async () => {
    const trace = await run({ effectDispatcher: checkFails("action_failed"), recoveryBudget: { ...DEFAULT_RECOVERY_BUDGET, maxRecoveryAttemptsPerSubflow: 0 } });

    expect(trace.status).toBe("failed");
    expect(trace.attempts.at(-1)?.recoveryDecision?.candidates.map((candidate) => candidate.kind)).not.toContain("deterministic_path");
  });
});

describe("what the recovery budgets count", () => {
  const attempt = (nodeId: string, kind: string | undefined, index: number): AutomationStudioNodeAttemptTrace => ({
    attemptId: `${nodeId}.attempt.${index}`,
    nodeId,
    definitionId: "builtin.policy.action",
    startedAt: index,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    ...(kind ? { recoveryDecision: { lookup: { nodeId, definitionId: "builtin.policy.action", attemptId: `${nodeId}.attempt.${index}`, comparisonStatus: "unknown" }, candidates: [], selected: { kind: kind as never, priority: 1, label: kind, reason: kind } } } : {})
  });

  it("does not count a node sending itself round again, by any ladder rung, as a recovery", () => {
    const attempts = [
      attempt("check", "retry_node", 1),
      attempt("check", "await_recorded_state", 2),
      attempt("check", "clear_interference", 3),
      attempt("check", "skip_satisfied_node", 4),
      attempt("check", undefined, 5)
    ];

    expect(recoveryBudgetState(attempts, 4, "check", undefined)).toEqual({ failedAttemptsForAction: 4, recoveryAttemptsForSubflow: 0, reroutesForRun: 0, llmAttemptsForRun: 0 });
  });

  it("counts a followed failed route, a reroute and the model's rung", () => {
    const attempts = [
      attempt("a", "deterministic_path", 1),
      attempt("b", "reroute", 2),
      attempt("c", "llm_diagnosis", 3),
      attempt("d", undefined, 4)
    ];

    expect(recoveryBudgetState(attempts, 3, "d", undefined)).toMatchObject({ recoveryAttemptsForSubflow: 3, reroutesForRun: 2, llmAttemptsForRun: 1 });
  });
});

describe("attempt numbering in a run that continues under the same id", () => {
  it("numbers from one when the run records nothing before it", async () => {
    const trace = await run();

    expect(trace.attempts.map((entry) => entry.attemptId)).toEqual(["search.attempt.1", "check.attempt.2", "join.attempt.3", "read.attempt.4"]);
  });

  it("numbers after the attempts already recorded, so no id repeats one the first pass wrote", async () => {
    const trace = await run({ priorAttemptCount: 6 });

    expect(trace.attempts.map((entry) => entry.attemptId)).toEqual(["search.attempt.7", "check.attempt.8", "join.attempt.9", "read.attempt.10"]);
  });

  it("numbers a retried attempt after the one it followed", async () => {
    const trace = await run({ effectDispatcher: checkFails("action_failed"), priorAttemptCount: 6 });

    expect(trace.attempts.slice(0, 4).map((entry) => entry.attemptId)).toEqual(["search.attempt.7", "check.attempt.8", "check.attempt.9", "check.attempt.10"]);
    expect(trace.attempts[2]?.retry?.previousAttemptId).toBe("check.attempt.8");
  });
});
