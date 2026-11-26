// The limits one evidence-guided Flow Bootstrap runs its loop under.
//
// The loop used to be capped at `min(calls, 8)` iterations with a default of
// four, and seven tool calls, and after that at a declared call count: 26
// decisions by default, which the Week 2 realistic builds reached while still
// making progress and ended `evidence_iteration_limit` with no Flow written
// (`run-mubs2sme-75efe4a4`, `run-mubri4yg-10d01258`). The standing decision is
// that a build iterates while it makes progress and stops on a bound that
// means something. So the loop is handed the run's own bounds as its `budget`
// -- the resolver's token budget, the run's cost ceiling (the run cost
// ceiling, $0.10 by default, lowered by the resolver's total or the Flow's configured
// `maxEstimatedCostUsdPerRun` and never raised by either), and a deadline --
// and works out from what it has actually spent how many
// decisions it has left, tells the model so on every decision, and offers its
// last one only completion (`runtime/llm/loop-budget.ts`).
//
// **No count of calls bounds a build (t1056).** The resolver's `maxCallsPerRun`
// was the loop's backstop and a count the whole build, repairs included, was
// held to, and a build that circled ended "at its limit of 12 model calls" with
// money left (t1049's continuation test). A purse is dollars, never a count of
// calls (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT
// THAT RANDOMLY JUST RESETS EVERYTHING"), so the count is no longer read here:
// a build ends with its result, its purse, its tokens or its clock.
//
// The cost ceiling is enforced by the purse, from each decision's worst case:
// no decision is sent that it could not pay for, and the loop ends
// `llm_evidence_loop.iteration_limit` with `bound: "budget"` and
// `budgetBound: "cost"`.
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

import { resolveAutomationStudioLlmTokenLimits, type AutomationStudioLlmTokenLimits } from "../llm/harness/index.ts";
import { automationStudioLlmRunCostCeilingUsd, type AutomationStudioLlmEvidenceLoopBudget } from "../llm/index.ts";

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
    /** The bounds that decide: the run's token budget and cost ceiling, and the deadline. */
    budget: AutomationStudioLlmEvidenceLoopBudget;
  };
};

/**
 * The loop limits and budget for one evidence-guided bootstrap.
 *
 * `flowMaxEstimatedCostUsdPerRun` is the Flow's configured spend limit
 * (`adaptationPolicySettings.maxEstimatedCostUsdPerRun`). The build's total is
 * the run cost ceiling (`AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD`, $0.10 by default), lowered by that limit and by the resolver's own
 * total where either is a positive number, and never raised by them.
 */
export function automationStudioFlowBootstrapEvidenceLoopLimits(resolution: {
  maxTotalEstimatedCostUsd?: number | undefined;
  maxTotalTokensPerRun?: number | undefined;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
}, flowMaxEstimatedCostUsdPerRun?: number): AutomationStudioFlowBootstrapEvidenceLoopLimits {
  const maxCostUsd = automationStudioLlmRunCostCeilingUsd(resolution.maxTotalEstimatedCostUsd, flowMaxEstimatedCostUsdPerRun);
  // The most one decision may use, set aside before each call.
  const tokens = resolveAutomationStudioLlmTokenLimits(resolution.tokenLimits).limits;
  const budget: AutomationStudioLlmEvidenceLoopBudget = {
    ...(positive(resolution.maxTotalTokensPerRun) ? { maxTotalTokens: resolution.maxTotalTokensPerRun, maxTokensPerDecision: Math.min(tokens.maxTotalTokens, tokens.maxInputTokens + tokens.maxOutputTokens) } : {}),
    maxCostUsd,
    maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS
  };
  return { loop: { minToolCalls: 1, budget } };
}

function positive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1;
}
