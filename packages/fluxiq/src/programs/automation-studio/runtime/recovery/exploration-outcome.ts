// Every way an exploration can end, as a closed set, and the exhaustive tables
// that decide which one a given ending is.
//
// Exploration used to end in whatever vocabulary the thing that stopped it
// happened to speak: an evidence-loop failure code, a run-budget diagnostic, a
// free-text ladder message, or nothing at all. Nothing named the endings, so
// nothing could tell them apart, and the confusion this plan keeps finding is
// the worst of them -- an exploration that ran out of budget, one that was
// refused, and one that simply found nothing were all recorded as the same
// absence of a result, which then read downstream as "there was nothing to
// find".
//
// Three separate defects this month were a failure recorded as an absence, so
// the four endings that get confused are four different members here:
//
// - `evidence_gathered` -- it ran and produced something observed.
// - `no_evidence_found` -- it ran to a clean end and produced nothing.
// - `budget_exhausted` -- a limit stopped it before it could answer.
// - `unsafe_action_blocked` -- a refusal stopped it.
//
// **Success is constructible only from observed evidence.** That is Phase D's
// rule applied here: `automationStudioExplorationCompletionOutcome` returns
// `evidence_gathered` only when an action actually returned evidence and the
// completion actually carries something. A loop that completed immediately, or
// completed with an empty result, or only ever collected refusals, is
// `no_evidence_found` -- which is a fact, where "success" would be a claim.
//
// **The tables are `Record`s over the source vocabulary, not lookups with a
// fallback.** A fallback is how an unnamed ending becomes silent: a code added
// to the evidence loop tomorrow would quietly land in whatever the default was.
// Written as an exhaustive `Record`, the same addition is a compile error in
// this file, which is where the decision belongs.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioLlmRunBudgetDiagnostic } from "../llm/index.ts";

/**
 * The only endings there are. An exploration that ended for a reason outside
 * this list is not possible: the runner has one exit and it classifies through
 * these tables.
 */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOMES = Object.freeze([
  /** It ran, and an action it took returned evidence that the completion used. */
  "evidence_gathered",
  /** It ran to a clean end and produced nothing usable. Not a failure, not a success. */
  "no_evidence_found",
  /** A limit -- time, actions, provider calls, evidence, repetition -- stopped it. */
  "budget_exhausted",
  /** Something it tried to do was refused as unsafe or out of scope. */
  "unsafe_action_blocked",
  /** It cannot proceed without a person. */
  "user_intervention_required",
  /** Something outside the exploration stopped it. Neither a limit nor a fault. */
  "cancelled",
  /** It broke: a malformed decision, an unknown option, a tool that threw. */
  "failed"
] as const);

export type AutomationStudioExplorationOutcome = (typeof AUTOMATION_STUDIO_EXPLORATION_OUTCOMES)[number];

/**
 * Why the budget closed an exploration, in Core's own words.
 *
 * A stop reason is finer than an outcome on purpose. Both `wall_clock_expired`
 * and `recovery_deadline_expired` are `budget_exhausted`, but only one of them
 * means the whole recovery ran out of time rather than this one exploration,
 * and a report that could not say which would send somebody to raise the wrong
 * limit.
 */
export const AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS = Object.freeze([
  "wall_clock_expired",
  "recovery_deadline_expired",
  "action_limit",
  "provider_call_limit",
  "repeat_window",
  "destructive_action_refused",
  "out_of_scope_refused",
  "refusal_limit",
  "operator_approval_required"
] as const);

export type AutomationStudioExplorationStopReason = (typeof AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS)[number];

/** Each stop reason's outcome. Exhaustive, so a new reason must be classified here. */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON: Readonly<Record<AutomationStudioExplorationStopReason, AutomationStudioExplorationOutcome>> = Object.freeze({
  wall_clock_expired: "budget_exhausted",
  recovery_deadline_expired: "budget_exhausted",
  action_limit: "budget_exhausted",
  provider_call_limit: "budget_exhausted",
  // Trying the same thing forever is a budget being spent, not a fault: the
  // repeat window is what stops it, and it stops it the way a clock does.
  repeat_window: "budget_exhausted",
  destructive_action_refused: "unsafe_action_blocked",
  out_of_scope_refused: "unsafe_action_blocked",
  refusal_limit: "unsafe_action_blocked",
  operator_approval_required: "user_intervention_required"
});

/**
 * Each evidence-loop failure code's outcome.
 *
 * The split that matters: the loop's own limits and its repeat detection are
 * `budget_exhausted`, and everything meaning the loop could not be driven
 * correctly is `failed`. `cancelled` is here for completeness only -- the
 * runner aborts the loop itself whenever a limit fires, so it knows the real
 * reason and never falls through to this row.
 */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE: Readonly<Record<AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioExplorationOutcome>> = Object.freeze({
  "llm_evidence_loop.invalid_configuration": "failed",
  "llm_evidence_loop.invalid_decision": "failed",
  "llm_evidence_loop.unknown_tool": "failed",
  "llm_evidence_loop.duplicate_call": "failed",
  "llm_evidence_loop.duplicate_tool_request": "budget_exhausted",
  "llm_evidence_loop.repeat_without_progress": "budget_exhausted",
  "llm_evidence_loop.tool_failed": "failed",
  "llm_evidence_loop.evidence_limit": "budget_exhausted",
  "llm_evidence_loop.iteration_limit": "budget_exhausted",
  "llm_evidence_loop.cancelled": "cancelled"
});

/** Each run-budget diagnostic's outcome, for an exploration refused before it starts. */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET: Readonly<Record<AutomationStudioLlmRunBudgetDiagnostic["code"], AutomationStudioExplorationOutcome>> = Object.freeze({
  "llm_budget.run_call_limit": "budget_exhausted",
  "llm_budget.run_total_limit": "budget_exhausted",
  "llm_budget.run_output_limit": "budget_exhausted",
  "llm_budget.run_cost_limit": "budget_exhausted",
  "llm_budget.duplicate_request": "failed",
  "llm_budget.invalid_reservation": "failed"
});

export function isAutomationStudioExplorationOutcome(value: unknown): value is AutomationStudioExplorationOutcome {
  return typeof value === "string" && (AUTOMATION_STUDIO_EXPLORATION_OUTCOMES as readonly string[]).includes(value);
}

/**
 * What a loop that ended cleanly actually produced.
 *
 * This is the one place `evidence_gathered` can be constructed, and it takes
 * three things to construct it: an action that returned evidence rather than a
 * refusal, bytes that action actually carried, and a completion that says
 * something. Miss any of them and the answer is `no_evidence_found`.
 *
 * Reading it the other way round is the point. A model that completes on its
 * first turn having called nothing has not explored; a model whose every call
 * was refused has gathered nothing; a completion of `{}` carries no finding.
 * Each of those used to arrive downstream as an exploration that "found nothing
 * wrong", which is a claim none of them supports.
 */
export function automationStudioExplorationCompletionOutcome(input: {
  observedActions: number;
  evidenceBytes: number;
  result: JsonObject;
}): Extract<AutomationStudioExplorationOutcome, "evidence_gathered" | "no_evidence_found"> {
  const gathered = input.observedActions > 0 && input.evidenceBytes > 0 && Object.keys(input.result).length > 0;
  return gathered ? "evidence_gathered" : "no_evidence_found";
}
