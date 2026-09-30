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

describe("an optional press whose target is absent, under the default recovery budget", () => {
  it("retries the press, then follows its failed route through the Merge to the node after it", async () => {
    const trace = await run();

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["search", "check", "check", "check", "join", "read"]);
    const checks = trace.attempts.filter((attempt) => attempt.nodeId === "check");
    expect(checks.map(decisionKind)).toEqual(["retry_node", "retry_node", "deterministic_path"]);
    expect(checks[2]?.recoveryDecision?.selected).toMatchObject({ edgeId: "check.failed", targetNodeId: "join" });
    expect(checks[2]?.recoveryDecision?.metadata).not.toHaveProperty("budgetExhausted");
  });

  it("still follows the failed route when the subflow budget allows no recovery beyond the node's own retries", async () => {
    // One recovery per subflow: the retries must not be what spends it.
    const trace = await run({ recoveryBudget: { ...DEFAULT_RECOVERY_BUDGET, maxRecoveryAttemptsPerSubflow: 1 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.at(-1)?.nodeId).toBe("read");
  });

  it("gives the failed route no budget at all when the Flow sets the subflow budget to zero", async () => {
    const trace = await run({ recoveryBudget: { ...DEFAULT_RECOVERY_BUDGET, maxRecoveryAttemptsPerSubflow: 0 } });

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

    expect(trace.attempts.map((entry) => entry.attemptId)).toEqual([
      "search.attempt.1", "check.attempt.2", "check.attempt.3", "check.attempt.4", "join.attempt.5", "read.attempt.6"
    ]);
  });

  it("numbers after the attempts already recorded, so no id repeats one the first pass wrote", async () => {
    const trace = await run({ priorAttemptCount: 6 });

    expect(trace.attempts.map((entry) => entry.attemptId)).toEqual([
      "search.attempt.7", "check.attempt.8", "check.attempt.9", "check.attempt.10", "join.attempt.11", "read.attempt.12"
    ]);
    // The retry record still points at the attempt it followed.
    expect(trace.attempts[2]?.retry?.previousAttemptId).toBe("check.attempt.8");
  });
});
