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
// the endings that get confused are different members here:
//
// - `evidence_gathered` -- it ran and produced something observed.
// - `no_evidence_found` -- it ran to a clean end and produced nothing.
// - `budget_exhausted` -- the purse or the clock stopped it before it could answer.
// - `no_progress` -- the loop ended on its own repeat handling.
//
// **No count ends an exploration (t1057).** There were four more stops: an
// allowance of actions, one of provider calls, the third attempt of one action
// and the second refusal (`action_limit`, `provider_call_limit`, `repeat_window`,
// `refusal_limit`, and the refusal kinds as stop reasons, which made
// `unsafe_action_blocked`). The user's rule (2026-11-24: "THERE SHOULDNT BE ANY
// ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING") removed
// them: a repeat or a refusal is told to the model, loop detection and the
// model's own loop decision follow, and only the answer, the purse, the clock or
// a person ends it. What a refusal was is still classified
// (`AUTOMATION_STUDIO_EXPLORATION_REFUSALS`), as evidence, never as an ending.
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

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioLlmRunBudgetDiagnostic } from "../../llm/index.ts";

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
  /** The purse or the clock stopped it: the run's money, tokens or declared calls, or the time left. Never a count of the exploration's own (t1057). */
  "budget_exhausted",
  /** The evidence loop ended on its own repeat handling: the model's own loop decision, or a loop with nothing left to offer. Never a count (t1049, t1057). */
  "no_progress",
  /** It cannot proceed without a person. */
  "user_intervention_required",
  /** Something outside the exploration stopped it. Neither a limit nor a fault. */
  "cancelled",
  /** It broke: a malformed decision, an unknown option, a tool that threw. */
  "failed"
] as const);

export type AutomationStudioExplorationOutcome = (typeof AUTOMATION_STUDIO_EXPLORATION_OUTCOMES)[number];

/**
 * Why the exploration's own ledger closed it, in Core's own words: its clock, or
 * a request only a person can answer. Never a count (t1057).
 *
 * A stop reason is finer than an outcome on purpose. Both `wall_clock_expired`
 * and `recovery_deadline_expired` are `budget_exhausted`, but only one of them
 * means the whole recovery ran out of time rather than this one exploration,
 * and a report that could not say which would send somebody to raise the wrong
 * limit. The purse's own endings arrive in the run budget's codes
 * (`AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET`).
 */
export const AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS = Object.freeze([
  "wall_clock_expired",
  "recovery_deadline_expired",
  "operator_approval_required"
] as const);

export type AutomationStudioExplorationStopReason = (typeof AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS)[number];

/** Each stop reason's outcome. Exhaustive, so a new reason must be classified here. */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON: Readonly<Record<AutomationStudioExplorationStopReason, AutomationStudioExplorationOutcome>> = Object.freeze({
  wall_clock_expired: "budget_exhausted",
  recovery_deadline_expired: "budget_exhausted",
  operator_approval_required: "user_intervention_required"
});

/**
 * What kind of refusal an action met, in Core's own words: the domain's reading
 * of its own refusal code (`AutomationStudioExplorationRefusalClassifier`), or a
 * person's no from the permission gate.
 *
 * Evidence, never an ending (t1057). The model is shown the refusal itself, as
 * the action's result, and decides what to try instead; the ledger counts what
 * was refused and how, and a classified refusal is a step that did not happen
 * for a reduction. Before t1057 the second refusal ended the exploration
 * `unsafe_action_blocked`.
 */
export const AUTOMATION_STUDIO_EXPLORATION_REFUSALS = Object.freeze([
  "destructive_action_refused",
  "out_of_scope_refused"
] as const);

export type AutomationStudioExplorationRefusal = (typeof AUTOMATION_STUDIO_EXPLORATION_REFUSALS)[number];

/**
 * Each evidence-loop failure code's outcome.
 *
 * The split that matters is three ways now, not two: the loop's own size limits
 * are `budget_exhausted`, its repeat handling is `no_progress` -- a loop that
 * ended on the model's own loop decision did not run out of anything -- and everything
 * meaning the loop could not be driven correctly is `failed`. The runner hands
 * the loop loop detection's signal (`runtime-exploration.ts`), so the loop's own
 * counts of turns, calls and repeats end nothing; the rows are kept because the
 * table is over the loop's whole vocabulary. `cancelled` is here for completeness only -- the
 * runner aborts the loop itself whenever its clock or a request ends it, so it knows the real
 * reason and never falls through to this row.
 */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE: Readonly<Record<AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioExplorationOutcome>> = Object.freeze({
  "llm_evidence_loop.invalid_configuration": "failed",
  "llm_evidence_loop.invalid_decision": "failed",
  "llm_evidence_loop.unknown_tool": "failed",
  "llm_evidence_loop.duplicate_call": "failed",
  "llm_evidence_loop.duplicate_tool_request": "no_progress",
  "llm_evidence_loop.repeat_without_progress": "no_progress",
  "llm_evidence_loop.tool_failed": "failed",
  "llm_evidence_loop.evidence_limit": "budget_exhausted",
  "llm_evidence_loop.iteration_limit": "budget_exhausted",
  "llm_evidence_loop.cancelled": "cancelled",
  "llm_evidence_loop.provider_unavailable": "failed"
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
