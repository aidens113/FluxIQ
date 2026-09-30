// The limits one evidence-guided Flow Bootstrap runs its loop under.
//
// The loop used to be capped at `min(calls, 8)` iterations with a default of
// four, and seven tool calls, and after that at a declared call count: 26
// decisions by default, which the Week 2 realistic builds reached while still
// making progress and ended `evidence_iteration_limit` with no Flow written
// (`run-mubs2sme-75efe4a4`, `run-mubri4yg-10d01258`). The standing decision is
// that a build iterates while it makes progress and stops on a bound that
// means something. So the loop is handed the run's own bounds as its `budget`
// -- the resolver's token budget, the run's cost ceiling (the $0.25 run cost
// ceiling, lowered by the resolver's total or the Flow's configured
// `maxEstimatedCostUsdPerRun` and never raised by either), and a deadline --
// and works out from what it has actually spent how many
// decisions it has left, tells the model so on every decision, and offers its
// last one only completion (`runtime/llm/loop-budget.ts`). Under those sit the
// loop's no-progress checks. The call count is only the backstop: the
// resolver's declared count, or the loop's ceiling when none is declared.
//
// The cost ceiling is enforced there, from each decision's reported cost: no
// decision is asked for once what was spent leaves no room for another at the
// running average (the first is always asked for, having nothing to average),
// and the loop ends `llm_evidence_loop.iteration_limit` with `bound: "budget"`
// and `budgetBound: "cost"`. A build has no ledger, so a per-call cost on its
// requests was never checked against anything; the even share of the total it
// used to carry only restated the total, and is gone.
//
// This module does arithmetic only. From `runtime/llm/` it reads the harness's
// token constants and the run cost ceiling.
//
// There is no byte limit on evidence here any more. `maxEvidenceContextBytes`
// (24,000, `AUTOMATION_STUDIO_EVIDENCE_CONTEXT_BYTES`) held what one decision
// was shown, and `maxEvidenceBytes` (1 MiB) what a build gathered; both are
// gone (2026-09-30). The model is shown every evidence entry in full, and the
// only bound on a request is the model's context window, enforced loudly
// before a request is sent (`runtime/llm/context-window.ts`).

import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST, resolveAutomationStudioLlmTokenLimits, type AutomationStudioLlmTokenLimits } from "../llm/harness/index.ts";
import { automationStudioLlmRunCostCeilingUsd, type AutomationStudioLlmEvidenceLoopBudget } from "../llm/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "./evidence-loop.ts";

/**
 * The most tokens one Flow Bootstrap can record in its accounting: 64 calls --
 * the run-call backstop -- at the per-request ceiling.
 *
 * The recorded totals used to be held to 50,000 -- the ceiling on a single
 * request -- while an iterating build adds up every call it made, and a build
 * that legitimately spent more was refused after the provider had been paid.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS = 64 * AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST;

/**
 * How long a build's exploration may run: nine minutes, so the plan check, the
 * build's reading of its instructions and persisting the proposal still finish
 * inside ten.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS = 540_000;

export type AutomationStudioFlowBootstrapEvidenceLoopLimits = {
  /** Handed to the evidence loop as they are. */
  loop: {
    minToolCalls: number;
    /** The backstop: the resolver's declared call count, or the loop's ceiling. */
    maxIterations: number;
    maxToolCalls: number;
    /** The bounds that decide: the run's token budget and cost ceiling, and the deadline. */
    budget: AutomationStudioLlmEvidenceLoopBudget;
  };
  /**
   * Unusable decisions in a row after which the exploration stops. Each one
   * still spends one of the loop's iterations, so the budget keeps binding
   * underneath; this is the guard that stops a loop whose replies stay bad.
   */
  maxConsecutiveUnusableDecisions: number;
};

/**
 * The loop limits and budget for one evidence-guided bootstrap.
 *
 * `flowMaxEstimatedCostUsdPerRun` is the Flow's configured spend limit
 * (`adaptationPolicySettings.maxEstimatedCostUsdPerRun`). The build's total is
 * the run cost ceiling, $0.25, lowered by that limit and by the resolver's own
 * total where either is a positive number, and never raised by them.
 */
export function automationStudioFlowBootstrapEvidenceLoopLimits(resolution: {
  maxCallsPerRun?: number | undefined;
  maxTotalEstimatedCostUsd?: number | undefined;
  maxTotalTokensPerRun?: number | undefined;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
}, flowMaxEstimatedCostUsdPerRun?: number): AutomationStudioFlowBootstrapEvidenceLoopLimits {
  const ceiling = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS;
  const declared = positive(resolution.maxCallsPerRun) ? Math.trunc(resolution.maxCallsPerRun) : undefined;
  const maxIterations = Math.min(declared ?? ceiling.maxIterations, ceiling.maxIterations);
  // One more tool call than decisions: the loop's first observation is a tool
  // call made before any decision, and the last decision completes. So tool
  // calls never bind before the call count does.
  const maxToolCalls = Math.min(maxIterations + 1, ceiling.maxToolCalls);
  const maxCostUsd = automationStudioLlmRunCostCeilingUsd(resolution.maxTotalEstimatedCostUsd, flowMaxEstimatedCostUsdPerRun);
  // The most one decision may use, set aside before each call.
  const tokens = resolveAutomationStudioLlmTokenLimits(resolution.tokenLimits).limits;
  const budget: AutomationStudioLlmEvidenceLoopBudget = {
    ...(positive(resolution.maxTotalTokensPerRun) ? { maxTotalTokens: resolution.maxTotalTokensPerRun, maxTokensPerDecision: Math.min(tokens.maxTotalTokens, tokens.maxInputTokens + tokens.maxOutputTokens) } : {}),
    maxCostUsd,
    maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS
  };
  return {
    loop: { minToolCalls: 1, maxIterations, maxToolCalls, budget },
    // Three was this number until 2026-09-22, and three ended builds that were
    // working: it is the loop's no-progress guard as well as its unusable-reply
    // guard, and a build that meets a setback, looks again and tries another way
    // has taken two steps that gathered nothing new while doing exactly the right
    // thing. What bounds a build is what it spends -- its cost, its tokens and
    // the run's deadline, all of which this function hands the loop as
    // its budget. This is only the stop for a build that has started repeating
    // itself and will not stop on its own.
    maxConsecutiveUnusableDecisions: Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, maxIterations)
  };
}

function positive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1;
}
