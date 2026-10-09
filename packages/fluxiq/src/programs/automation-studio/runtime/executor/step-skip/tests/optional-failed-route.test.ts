import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioNodeAttemptTrace, type AutomationStudioRecoveryCandidateKind } from "../../index.ts";
import { recoveryBudgetState } from "../../recovery-budget.ts";

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
    // The first attempt and the default's three retries (t355).
    expect(counter.calls).toBe(4);
    expect(checks.slice(0, 3).map(decisionKind)).toEqual(["retry_node", "retry_node", "retry_node"]);
    expect(checks.every((attempt) => attempt.skipped === undefined && attempt.status === "failed")).toBe(true);
    // The retry record still points at the attempt it followed.
    expect(checks[1]?.retry?.previousAttemptId).toBe(checks[0]?.attemptId);
  });

  // The ladder as it was: an action that ran and failed is retried; an ambiguous
  // target is not retryable and goes straight to the authored failed route.
  it.each([
    ["action_failed", ["retry_node", "retry_node", "retry_node", "deterministic_path"]],
    ["target_ambiguous", ["deterministic_path"]]
  ] as const)("takes the ladder for an optional press that failed with %s", async (category, decisions) => {
    const trace = await run({ effectDispatcher: checkFails(category) });

    expect(trace.status).toBe("succeeded");
    const checks = trace.attempts.filter((attempt) => attempt.nodeId === "check");
    expect(checks.map(decisionKind)).toEqual(decisions);
    expect(checks.at(-1)?.recoveryDecision?.selected).toMatchObject({ edgeId: "check.failed", targetNodeId: "join" });
    expect(checks.every((attempt) => attempt.skipped === undefined && attempt.status === "failed")).toBe(true);
  });

  // t371: an optional step's way on is no recovery, so a budget of zero no
  // longer withholds it. Until then this press stopped the run.
  it("still takes an optional press's way on when it failed some other way and the subflow budget is zero", async () => {
    const trace = await run({ effectDispatcher: checkFails("action_failed"), recoveryBudget: { ...DEFAULT_RECOVERY_BUDGET, maxRecoveryAttemptsPerSubflow: 0, maxReroutesPerRun: 0 } });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.at(-1)?.nodeId).toBe("read");
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "check").at(-1)?.recoveryDecision?.selected).toMatchObject({ kind: "deterministic_path", edgeId: "check.failed" });
  });
});

describe("what the recovery budgets count", () => {
  const attempt = (nodeId: string, kind: AutomationStudioRecoveryCandidateKind | undefined, index: number): AutomationStudioNodeAttemptTrace => ({
    attemptId: `${nodeId}.attempt.${index}`,
    nodeId,
    definitionId: "builtin.policy.action",
    startedAt: index,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    ...(kind ? { recoveryDecision: { lookup: { nodeId, definitionId: "builtin.policy.action", attemptId: `${nodeId}.attempt.${index}`, comparisonStatus: "unknown" }, candidates: [], selected: { kind, priority: 1, label: kind, reason: kind } } } : {})
  });

  it("does not count a node sending itself round again, by any ladder rung, as a recovery", () => {
    const attempts = [
      attempt("check", "retry_node", 1),
      attempt("check", "await_recorded_state", 2),
      attempt("check", "clear_interference", 3),
      attempt("check", "skip_satisfied_node", 4),
      attempt("check", undefined, 5)
    ];

    expect(recoveryBudgetState(attempts, 4, "check", undefined, optionalPressFlow)).toEqual({ failedAttemptsForAction: 4, recoveryAttemptsForSubflow: 0, reroutesForRun: 0, llmAttemptsForRun: 0 });
  });

  it("counts a followed failed route, a reroute and the model's rung", () => {
    const attempts = [
      attempt("a", "deterministic_path", 1),
      attempt("b", "reroute", 2),
      attempt("c", "llm_diagnosis", 3),
      attempt("d", undefined, 4)
    ];

    expect(recoveryBudgetState(attempts, 3, "d", undefined, optionalPressFlow)).toMatchObject({ recoveryAttemptsForSubflow: 3, reroutesForRun: 2, llmAttemptsForRun: 1 });
  });

  // t371: going on past an optional step is the Flow's own path, so it is not
  // counted; any other followed route of the same node still is.
  it("does not count going on past an optional step, and still counts another route from it", () => {
    const along = (index: number, edgeId: string): AutomationStudioNodeAttemptTrace => {
      const base = attempt("check", "deterministic_path", index);
      return { ...base, recoveryDecision: { ...base.recoveryDecision!, selected: { ...base.recoveryDecision!.selected!, edgeId } } };
    };
    const attempts = [along(1, "check.failed"), along(2, "check.failed"), along(3, "check.elsewhere"), attempt("read", undefined, 4)];

    expect(recoveryBudgetState(attempts, 3, "read", undefined, optionalPressFlow)).toMatchObject({ recoveryAttemptsForSubflow: 1, reroutesForRun: 1 });
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

// t371: a saved Flow's playback goes on past every optional step that cannot
// be done, whatever stopped it, without spending the recovery or reroute budget
// that real failures need (t368's report, "Playback parity"). Until then only an
// absent target was exempt, and a timed-out or not-actionable optional step took
// its way on as a recovery: under the default subflow budget of two, the third
// such step stopped a playback whose trial had passed.

type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;

/** How each step that cannot be done fails, as the web domain reports it (`domain/src/runtime/failure/codes.ts`). */
const ABSENT = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } as const;
const TIMEOUT = { category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution" } as const;
const NOT_ACTIONABLE = { category: "unexpected_state", code: "web.target.not_actionable", retryable: false, stage: "execution" } as const;
type Failure = typeof ABSENT | typeof TIMEOUT | typeof NOT_ACTIONABLE;

const press = (id: string, elementId: string, extra: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode => ({
  id,
  definitionId: "builtin.policy.action",
  ...extra,
  parameterValues: { outputId: "activate-element", parameters: { elementId } }
});
const merge = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } });
const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.optional-playback", ownerKind: "routine", ownerId: "routine.test", name: "Optional playback", createdAt: 1, updatedAt: 1, nodes, edges };
}

/**
 * search, then three optional steps -- a banner whose button is absent, a
 * notice wait that times out, a consent button that is covered -- each in the
 * optional shape the assembler writes (`failed` and `success` into one Merge),
 * then `tail`'s nodes and edges after the last Merge.
 */
function threeOptionalSteps(tail: { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowDocument["edges"]; first: string }): AutomationStudioFlowDocument {
  const nodes: AutomationStudioFlowNode[] = [press("search", "search")];
  const edges: AutomationStudioFlowDocument["edges"] = [];
  let previous = "search";
  for (const [id, elementId] of [["banner", "banner-absent"], ["notice", "notice-timeout"], ["consent", "consent-covered"]] as const) {
    nodes.push(press(id, elementId), merge(`${id}-join`));
    edges.push(edge(previous, "success", id), edge(id, "failed", `${id}-join`), edge(id, "success", `${id}-join`, "branches"));
    previous = `${id}-join`;
  }
  edges.push(edge(previous, "success", tail.first));
  return flowOf([...nodes, ...tail.nodes], [...edges, ...tail.edges]);
}

/** Fails each dispatch whose payload names a key of `failures` that way; every other dispatch succeeds. */
function dispatcher(failures: Record<string, Failure>, calls: string[] = []): Dispatcher {
  return (effect) => {
    const payload = JSON.stringify(effect.payload ?? null);
    const key = Object.keys(failures).find((candidate) => payload.includes(candidate));
    calls.push(key ?? "other");
    return key
      ? { status: "failed", route: "failed", message: `${key} could not be done.`, failure: { ...failures[key]! } }
      : { status: "success", route: "success", outputs: { ok: true } };
  };
}

const OPTIONAL_FAILURES = { "banner-absent": ABSENT, "notice-timeout": TIMEOUT, "consent-covered": NOT_ACTIONABLE };

function last(attempts: AutomationStudioNodeAttemptTrace[], nodeId: string): AutomationStudioNodeAttemptTrace | undefined {
  return attempts.filter((attempt) => attempt.nodeId === nodeId).at(-1);
}

describe("a playback with three optional steps that each cannot be done", () => {
  const readTail = { nodes: [press("read", "results")], edges: [], first: "read" };

  it.each([
    ["the default budget", DEFAULT_RECOVERY_BUDGET],
    ["a budget of zero", { maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 0, maxReroutesPerRun: 0 }]
  ] as const)("goes on past every one, absent, timed out and not actionable, to the end, under %s", async (_case, recoveryBudget) => {
    const trace = await runAutomationStudioGraph(threeOptionalSteps(readTail), { effectDispatcher: dispatcher(OPTIONAL_FAILURES), recoveryBudget, delay: async () => undefined });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.at(-1)?.nodeId).toBe("read");
    // The absent banner is skipped on sight; the other two take their way on after the ladder.
    expect(last(trace.attempts, "banner")).toMatchObject({ skipped: { reason: "target_absent" } });
    for (const id of ["notice", "consent"]) {
      expect(last(trace.attempts, id)?.recoveryDecision?.selected).toMatchObject({ kind: "deterministic_path", edgeId: `${id}.failed`, targetNodeId: `${id}-join` });
    }
  });

  it("keeps each step's own retries: the timed-out wait is tried again, the covered button is not", async () => {
    const calls: string[] = [];
    await runAutomationStudioGraph(threeOptionalSteps(readTail), { effectDispatcher: dispatcher(OPTIONAL_FAILURES, calls), recoveryBudget: DEFAULT_RECOVERY_BUDGET, delay: async () => undefined });

    expect(calls.filter((call) => call === "banner-absent")).toHaveLength(1);
    expect(calls.filter((call) => call === "notice-timeout")).toHaveLength(4);
    expect(calls.filter((call) => call === "consent-covered")).toHaveLength(1);
  });
});

describe("a real failure after the optional steps", () => {
  // pay fails and has a written failed branch into fix; then pay-again fails
  // with one of its own. Neither is optional: their failed routes do not
  // join their success routes at a Merge.
  const realTail = {
    first: "pay",
    nodes: [press("pay", "pay-covered"), press("fix", "fix"), press("pay-again", "pay-again-covered"), press("fix-again", "fix-again"), press("read", "results")],
    edges: [
      edge("pay", "success", "pay-again"), edge("pay", "failed", "fix"), edge("fix", "success", "pay-again"),
      edge("pay-again", "success", "read"), edge("pay-again", "failed", "fix-again"), edge("fix-again", "success", "read")
    ]
  };
  const failures = { ...OPTIONAL_FAILURES, "pay-covered": NOT_ACTIONABLE, "pay-again-covered": NOT_ACTIONABLE };

  it("still has the whole budget: its written failed route is taken after three optional steps under the default budget", async () => {
    const trace = await runAutomationStudioGraph(threeOptionalSteps(realTail), { effectDispatcher: dispatcher(failures), recoveryBudget: DEFAULT_RECOVERY_BUDGET, delay: async () => undefined });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId).slice(-5)).toEqual(["pay", "fix", "pay-again", "fix-again", "read"]);
    expect(last(trace.attempts, "pay")?.recoveryDecision?.metadata?.budgetState).toMatchObject({ recoveryAttemptsForSubflow: 0, reroutesForRun: 0 });
  });

  it("spends the bounded budget and stops once it is gone", async () => {
    const recoveryBudget = { maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 1, maxReroutesPerRun: 1 };
    const trace = await runAutomationStudioGraph(threeOptionalSteps(realTail), { effectDispatcher: dispatcher(failures), recoveryBudget, delay: async () => undefined });

    expect(trace.status).toBe("failed");
    expect(trace.currentNodeId).toBe("pay-again");
    expect(last(trace.attempts, "pay")?.recoveryDecision?.selected).toMatchObject({ kind: "deterministic_path", edgeId: "pay.failed" });
    const stopped = last(trace.attempts, "pay-again")?.recoveryDecision;
    expect(stopped?.metadata?.budgetExhausted).toBeDefined();
    expect(stopped?.candidates.map((candidate) => candidate.kind)).not.toContain("deterministic_path");
    expect(trace.attempts.some((attempt) => attempt.nodeId === "fix-again")).toBe(false);
  });
});

describe("a sometimes-present step without the optional shape", () => {
  it("goes on along its success route when it times out, even under a budget of zero", async () => {
    const flow = flowOf(
      [press("search", "search"), press("popup", "popup-timeout", { metadata: { sometimesPresent: true } }), press("read", "results")],
      [edge("search", "success", "popup"), edge("popup", "success", "read")]
    );
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: dispatcher({ "popup-timeout": TIMEOUT }),
      recoveryBudget: { maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 0, maxReroutesPerRun: 0 },
      delay: async () => undefined
    });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.at(-1)?.nodeId).toBe("read");
    expect(last(trace.attempts, "popup")?.recoveryDecision?.selected).toMatchObject({ kind: "deterministic_path", edgeId: "popup.success", targetNodeId: "read" });
  });
});
