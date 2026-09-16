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

import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "./evidence-loop.ts";

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
    loop: { minToolCalls: 1, maxIterations, maxToolCalls, maxEvidenceBytes: 64_000, maxEvidenceContextBytes: 8_000 },
    ...(maxEstimatedCostUsdPerCall !== undefined ? { maxEstimatedCostUsdPerCall } : {})
  };
}
