// The limits one evidence-guided Flow Bootstrap runs its loop under.
//
// The loop used to be capped at `min(calls, 8)` iterations with a default of
// four, and seven tool calls, and after that at the grant's call count: 26
// decisions by default, which the Week 2 realistic builds reached while still
// making progress and ended `evidence_iteration_limit` with no Flow written
// (`run-mubs2sme-75efe4a4`, `run-mubri4yg-10d01258`). The standing decision is
// that a build iterates while it makes progress and stops on a bound that
// means something. So the loop is now handed the run's own bounds as its
// `budget` -- the grant's token budget and cost ceiling, and a deadline inside
// the grant's run lease -- and works out from what it has actually spent how
// many decisions it has left, tells the model so on every decision, and offers
// its last one only completion (`runtime/llm/loop-budget.ts`). Under
// those sit the loop's no-progress checks. The call count is only the
// backstop: the grant's own count, configured by whoever issued it, since the
// grant mints exactly that many calls, or the loop's ceiling when none is
// declared.
//
// This module does arithmetic only. From `runtime/llm/` it reads the harness's
// token constants and resolver; `llm/execution-grants.ts` would close a cycle
// through the provider factory, so the two grant numbers used here are written
// out and pinned by tests.
//
// `maxEvidenceContextBytes` was 8,000, and the loop sizes each observation at
// that figure less 512, so one observation could fill the window and leave 512
// bytes for everything that came after it. It did: a live build's page
// observation was 7,120 bytes of an 8,000-byte window, and the second small
// tool result after it pushed the page out. The decision that writes the Flow
// is never the first one, so the evidence the Flow has to be written from was
// gone by the time it was written, every run. `AUTOMATION_STUDIO_EVIDENCE_
// CONTEXT_BYTES` is sized instead for what a window has to hold at once: two
// observations at a domain's largest packet, and the smaller results beside
// them. It is far below a request's token ceiling -- the live builds spent
// about 7,000 input tokens of the 48,000 their grant allowed -- so what bounds
// a build stays the grant's cost, tokens and calls rather than this.
//
// `maxEvidenceBytes`, the total a build may gather, was 64,000. A realistic
// page costs 5 to 20 KB, so builds on the realistic sites ended
// `evidence_limit` after ten to fifteen calls, before any Flow was written,
// with money and tokens left (`run-mubpn1ga-8ae8fdc5`: 63,982 bytes, fourteen
// calls), and the tool offered what was left of the total was handed a few
// dozen bytes and threw, which the build reported as a tool failure. The window
// each decision is shown is what bounds a request, and the loop now keeps it
// whole whatever the total (`runtime/llm/context-window.ts`), so the
// total is the loop's own ceiling: a backstop no build reaches before its
// calls, cost or tokens do.

import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST, resolveAutomationStudioLlmTokenLimits, type AutomationStudioLlmTokenLimits } from "../llm/harness/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudget } from "../llm/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS } from "./evidence-loop.ts";

/**
 * The most tokens one Flow Bootstrap can record in its accounting: the largest
 * whole-run token budget a grant accepts, since the grant charges every call
 * against that budget and refuses the one that would exceed it.
 *
 * A grant's `maxTotalTokensPerRun` may be at most its calls times its per-call
 * limit (`llm/execution-grants.ts`, `preflight`), so the largest is the grant's
 * call backstop, 64 (`AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS`, written
 * out -- see above), at the per-request ceiling. It used to be read off the
 * loop's iteration ceiling, which happens to be the same number; the budget is
 * what bounds what a build records, so the budget is what it is read off now.
 * A test pins it to the grant's numbers.
 *
 * The recorded totals used to be held to 50,000 -- the ceiling on a single
 * request -- while an iterating build adds up every call it made, and a build
 * that legitimately spent more was refused after the provider had been paid.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS = 64 * AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST;

/**
 * How long a build's exploration may run: the grant's run lease less a minute.
 *
 * A claimed grant lives `AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS`,
 * 600,000 ms, from its claim (written out -- see above; a test pins it), and a
 * call after that is refused. The exploration's clock ends a minute before, so
 * the plan check, the build's reading of its instructions and persisting the
 * proposal still fall inside the lease.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS = 540_000;

/**
 * How much evidence one decision may carry.
 *
 * Room for two observations at the largest packet a domain may return, and the
 * smaller tool results and feedback entries beside them, so an observation is
 * never squeezed out by what followed it. The loop offers each tool this
 * figure less 512 bytes; a domain that caps its own packets lower keeps its own
 * cap, which is what the web domain does.
 */
export const AUTOMATION_STUDIO_EVIDENCE_CONTEXT_BYTES = 24_000;

export type AutomationStudioFlowBootstrapEvidenceLoopLimits = {
  /** Handed to the evidence loop as they are. */
  loop: {
    minToolCalls: number;
    /** The backstop: the grant's call count, or the loop's ceiling. */
    maxIterations: number;
    maxToolCalls: number;
    maxEvidenceBytes: number;
    maxEvidenceContextBytes: number;
    /** The bounds that decide: the grant's token budget and cost ceiling, and the deadline. */
    budget: AutomationStudioLlmEvidenceLoopBudget;
  };
  /**
   * What one decision may reserve against the grant's cost total. A grant
   * commits each call's reservation, not what it spent, so a share any larger
   * than the total divided by the calls would have the grant refuse the last
   * calls on cost while the run still had money. Absent when the resolution
   * named no cost at all.
   */
  maxEstimatedCostUsdPerCall?: number;
  /**
   * Unusable decisions in a row after which the exploration stops. Each one
   * still spends one of the loop's iterations, so the budget keeps binding
   * underneath; this is the guard that stops a loop whose replies stay bad.
   */
  maxConsecutiveUnusableDecisions: number;
};

/** The loop limits, budget and per-decision cost for one evidence-guided bootstrap. */
export function automationStudioFlowBootstrapEvidenceLoopLimits(resolution: {
  maxCallsPerRun?: number | undefined;
  maxEstimatedCostUsd?: number | undefined;
  maxTotalEstimatedCostUsd?: number | undefined;
  maxTotalTokensPerRun?: number | undefined;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
}): AutomationStudioFlowBootstrapEvidenceLoopLimits {
  const ceiling = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS;
  const declared = positive(resolution.maxCallsPerRun) ? Math.trunc(resolution.maxCallsPerRun) : undefined;
  const maxIterations = Math.min(declared ?? ceiling.maxIterations, ceiling.maxIterations);
  // One more tool call than decisions: the loop's first observation is a tool
  // call made before any decision, and the last decision completes. So tool
  // calls never bind before the call count does.
  const maxToolCalls = Math.min(maxIterations + 1, ceiling.maxToolCalls);
  const perCall = resolution.maxEstimatedCostUsd;
  const total = resolution.maxTotalEstimatedCostUsd;
  const share = total === undefined ? undefined : Math.floor((total / maxIterations) * 1_000_000_000) / 1_000_000_000;
  const maxEstimatedCostUsdPerCall = share === undefined ? perCall : Math.min(perCall ?? share, share);
  // The most one decision may use, which the grant sets aside before each call.
  const tokens = resolveAutomationStudioLlmTokenLimits(resolution.tokenLimits).limits;
  const budget: AutomationStudioLlmEvidenceLoopBudget = {
    ...(positive(resolution.maxTotalTokensPerRun) ? { maxTotalTokens: resolution.maxTotalTokensPerRun, maxTokensPerDecision: Math.min(tokens.maxTotalTokens, tokens.maxInputTokens + tokens.maxOutputTokens) } : {}),
    ...(typeof total === "number" && Number.isFinite(total) && total > 0 ? { maxCostUsd: total } : {}),
    maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS
  };
  return {
    loop: { minToolCalls: 1, maxIterations, maxToolCalls, maxEvidenceBytes: ceiling.maxEvidenceBytes, maxEvidenceContextBytes: AUTOMATION_STUDIO_EVIDENCE_CONTEXT_BYTES, budget },
    ...(maxEstimatedCostUsdPerCall !== undefined ? { maxEstimatedCostUsdPerCall } : {}),
    maxConsecutiveUnusableDecisions: Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS, maxIterations)
  };
}

function positive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1;
}
