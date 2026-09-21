// The limits one evidence-guided Flow Bootstrap runs its loop under.
//
// The loop used to be capped at `min(calls, 8)` iterations with a default of
// four, and seven tool calls. That was the same fixed call count the recovery
// path shed: a bootstrap that was still finding things out stopped at eight
// decisions whatever it had left to spend. Its bound is now the provider
// resolution's own call count -- a grant mints exactly that many -- or the
// loop's hard ceiling when nothing is declared, and underneath it the bounds
// that are meant to decide: the grant's token and cost totals, which it
// enforces on every call, and the loop's own no-progress checks (a repeated
// request, or re-observing without a change in between, ends the loop).
//
// This module does arithmetic only and imports nothing from `runtime/llm/`,
// which reads this directory's values.
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

import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST } from "../llm/harness/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS } from "./evidence-loop.ts";

/**
 * The most tokens one Flow Bootstrap can record in its accounting: every call
 * the loop may make, each at the per-request ceiling.
 *
 * The recorded totals used to be held to 50,000 -- the ceiling on a single
 * request -- while an iterating build adds up every call it made. A build whose
 * grant allowed, say, 100,000 tokens and legitimately used 60,000 was then
 * refused after the provider had been paid for all of it, as a generic
 * validation failure. This bound is at least any grant's
 * `maxTotalTokensPerRun` (its calls times its per-call limit, neither of which
 * can exceed the numbers here), and a test pins it to both, so the grant stays
 * the thing that enforces the budget.
 *
 * `50_000` is `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`,
 * written out because this directory may not read from `runtime/llm/`.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST;

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
    maxIterations: number;
    maxToolCalls: number;
    maxEvidenceBytes: number;
    maxEvidenceContextBytes: number;
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
   * still spends one of the loop's iterations, so the grant's call count keeps
   * binding underneath; this is the guard that stops a loop whose replies stay
   * bad long before that count does.
   */
  maxConsecutiveUnusableDecisions: number;
};

/** The loop limits and per-decision cost for one evidence-guided bootstrap. */
export function automationStudioFlowBootstrapEvidenceLoopLimits(resolution: {
  maxCallsPerRun?: number | undefined;
  maxEstimatedCostUsd?: number | undefined;
  maxTotalEstimatedCostUsd?: number | undefined;
}): AutomationStudioFlowBootstrapEvidenceLoopLimits {
  const ceiling = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS;
  const declared = typeof resolution.maxCallsPerRun === "number" && Number.isFinite(resolution.maxCallsPerRun) && resolution.maxCallsPerRun >= 1
    ? Math.trunc(resolution.maxCallsPerRun)
    : undefined;
  const maxIterations = Math.min(declared ?? ceiling.maxIterations, ceiling.maxIterations);
  // One more tool call than decisions: the loop's first observation is a tool
  // call made before any decision, and the last decision completes. So tool
  // calls never bind before the call count does.
  const maxToolCalls = Math.min(maxIterations + 1, ceiling.maxToolCalls);
  const perCall = resolution.maxEstimatedCostUsd;
  const total = resolution.maxTotalEstimatedCostUsd;
  const share = total === undefined ? undefined : Math.floor((total / maxIterations) * 1_000_000_000) / 1_000_000_000;
  const maxEstimatedCostUsdPerCall = share === undefined ? perCall : Math.min(perCall ?? share, share);
  return {
    loop: { minToolCalls: 1, maxIterations, maxToolCalls, maxEvidenceBytes: 64_000, maxEvidenceContextBytes: AUTOMATION_STUDIO_EVIDENCE_CONTEXT_BYTES },
    ...(maxEstimatedCostUsdPerCall !== undefined ? { maxEstimatedCostUsdPerCall } : {}),
    maxConsecutiveUnusableDecisions: Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS, maxIterations)
  };
}
