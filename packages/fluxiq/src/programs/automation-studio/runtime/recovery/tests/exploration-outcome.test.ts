import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE,
  AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET,
  AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON,
  AUTOMATION_STUDIO_EXPLORATION_OUTCOMES,
  AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS,
  automationStudioExplorationCompletionOutcome,
  isAutomationStudioExplorationOutcome
} from "../exploration-outcome.ts";

// The vocabulary itself. The runner proves the endings reach these values; this
// proves the values are a closed, exhaustive, non-overlapping set in the first
// place -- because a table with a hole in it is how an unnamed ending goes
// silent, and a table whose rows all say the same thing is how four different
// endings become one.
describe("exploration outcomes", () => {
  it("is a closed set, with the four confusable endings as four different members", () => {
    expect([...AUTOMATION_STUDIO_EXPLORATION_OUTCOMES]).toEqual([
      "evidence_gathered",
      "no_evidence_found",
      "budget_exhausted",
      "unsafe_action_blocked",
      "user_intervention_required",
      "cancelled",
      "failed"
    ]);
    // Ran out of budget, found nothing, was refused, succeeded: four values.
    expect(new Set(["budget_exhausted", "no_evidence_found", "unsafe_action_blocked", "evidence_gathered"]).size).toBe(4);
    expect(new Set(AUTOMATION_STUDIO_EXPLORATION_OUTCOMES).size).toBe(AUTOMATION_STUDIO_EXPLORATION_OUTCOMES.length);
    expect(isAutomationStudioExplorationOutcome("budget_exhausted")).toBe(true);
    expect(isAutomationStudioExplorationOutcome("recovered")).toBe(false);
  });

  // The type already forces every key to be present. This catches the other
  // half: a key present with a value that is not an outcome at all, which a
  // widened type or a hand-edited literal could introduce.
  it.each([
    ["stop reasons", AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON, [...AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS]],
    ["evidence-loop failures", AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE, [
      "llm_evidence_loop.invalid_configuration",
      "llm_evidence_loop.invalid_decision",
      "llm_evidence_loop.unknown_tool",
      "llm_evidence_loop.duplicate_call",
      "llm_evidence_loop.duplicate_tool_request",
      "llm_evidence_loop.repeat_without_progress",
      "llm_evidence_loop.tool_failed",
      "llm_evidence_loop.evidence_limit",
      "llm_evidence_loop.iteration_limit",
      "llm_evidence_loop.cancelled"
    ]],
    ["run-budget diagnostics", AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET, [
      "llm_budget.run_call_limit",
      "llm_budget.run_total_limit",
      "llm_budget.run_output_limit",
      "llm_budget.run_cost_limit",
      "llm_budget.duplicate_request",
      "llm_budget.invalid_reservation"
    ]]
  ])("maps every %s code to a named outcome and nothing else", (_label, table, keys) => {
    expect(Object.keys(table).sort()).toEqual([...keys].sort());
    for (const value of Object.values(table)) expect(isAutomationStudioExplorationOutcome(value)).toBe(true);
  });

  // The scoping report named this exact mutation: map `iteration_limit` to
  // `failed`. A test that only checked the table was total would not have
  // caught it -- and the first run of this suite proved that, because it did
  // not. A limit reached is not a fault, and reporting it as one sends somebody
  // looking for a bug instead of raising a budget.
  it.each([
    ["llm_evidence_loop.iteration_limit", "budget_exhausted"],
    ["llm_evidence_loop.evidence_limit", "budget_exhausted"],
    ["llm_evidence_loop.duplicate_tool_request", "budget_exhausted"],
    ["llm_evidence_loop.repeat_without_progress", "budget_exhausted"],
    ["llm_evidence_loop.invalid_configuration", "failed"],
    ["llm_evidence_loop.invalid_decision", "failed"],
    ["llm_evidence_loop.unknown_tool", "failed"],
    ["llm_evidence_loop.duplicate_call", "failed"],
    ["llm_evidence_loop.tool_failed", "failed"],
    ["llm_evidence_loop.cancelled", "cancelled"]
  ] as const)("reads %s as %s", (code, outcome) => {
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE[code]).toBe(outcome);
  });

  it.each([
    ["llm_budget.run_call_limit", "budget_exhausted"],
    ["llm_budget.run_total_limit", "budget_exhausted"],
    ["llm_budget.run_output_limit", "budget_exhausted"],
    ["llm_budget.run_cost_limit", "budget_exhausted"],
    ["llm_budget.duplicate_request", "failed"],
    ["llm_budget.invalid_reservation", "failed"]
  ] as const)("reads %s as %s", (code, outcome) => {
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET[code]).toBe(outcome);
  });

  // The distinction the plan asked for in so many words: the same outcome, and
  // two different pieces of advice about which limit to raise.
  it("keeps this exploration's clock and the whole recovery's clock as separate reasons", () => {
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.wall_clock_expired).toBe("budget_exhausted");
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.recovery_deadline_expired).toBe("budget_exhausted");
    expect(AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS).toContain("wall_clock_expired");
    expect(AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS).toContain("recovery_deadline_expired");
  });

  // A refusal is not a budget, and being stopped is not being empty. If these
  // ever agreed, the runner could report one where it meant the other and no
  // test above would notice.
  it("gives budget limits, refusals and a person's decision three different outcomes", () => {
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.action_limit).toBe("budget_exhausted");
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.repeat_window).toBe("budget_exhausted");
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.destructive_action_refused).toBe("unsafe_action_blocked");
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.out_of_scope_refused).toBe("unsafe_action_blocked");
    expect(AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.operator_approval_required).toBe("user_intervention_required");
    expect(new Set([
      AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.action_limit,
      AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.destructive_action_refused,
      AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON.operator_approval_required
    ]).size).toBe(3);
  });

  // Phase D's rule, at this layer: success is constructible only from something
  // observed. Each of the three negative rows is a shape that used to arrive
  // downstream as "nothing was wrong".
  it.each([
    ["an action returned evidence and the completion said something", { observedActions: 1, evidenceBytes: 120, result: { finding: "x" } }, "evidence_gathered"],
    ["nothing was called at all", { observedActions: 0, evidenceBytes: 0, result: { finding: "x" } }, "no_evidence_found"],
    ["every call was refused", { observedActions: 0, evidenceBytes: 80, result: { finding: "x" } }, "no_evidence_found"],
    ["the completion carried nothing", { observedActions: 2, evidenceBytes: 400, result: {} }, "no_evidence_found"],
    ["evidence was claimed with no bytes behind it", { observedActions: 1, evidenceBytes: 0, result: { finding: "x" } }, "no_evidence_found"]
  ])("calls a clean ending %s %s", (_label, input, expected) => {
    expect(automationStudioExplorationCompletionOutcome(input)).toBe(expected);
  });
});
