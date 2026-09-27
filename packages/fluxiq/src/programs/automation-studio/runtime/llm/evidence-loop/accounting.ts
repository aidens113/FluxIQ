// What a loop spent, and the two operations that keep it: an empty one to start
// from, and one decision's usage added in.
//
// Both were private to the coordinator, and the whole of what it did with them
// was call one at the top and one per decision. Kept together here because a
// figure and the arithmetic that fills it are one thing: a member added to the
// accounting without a line in `automationStudioLlmEvidenceLoopAddUsage` is a
// figure that stays zero for every run.

import type { AutomationStudioLlmUsageSummary } from "../harness.ts";

export type AutomationStudioLlmEvidenceLoopAccounting = {
  iterations: number;
  toolCalls: number;
  evidenceBytes: number;
  inputTokens: number;
  /**
   * How much of `inputTokens` the provider served from its own context cache,
   * where it reported the split. Every decision of a loop re-sends the same
   * constant prefix, so this is what says whether that prefix is being reused
   * or read again and charged again; zero means it was never reported, which
   * reads the same as never hit and is priced the same way.
   *
   * Optional, so that a caller assembling a zero accounting of its own -- there
   * are several, in both repositories -- is not broken by a figure it has
   * nothing to say about. The loop always writes it.
   */
  cacheHitInputTokens?: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

/** A loop's accounting before it has spent anything. */
export function automationStudioLlmEvidenceLoopEmptyAccounting(): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

/** One decision's usage added in, or nothing when the provider reported none. */
export function automationStudioLlmEvidenceLoopAddUsage(accounting: AutomationStudioLlmEvidenceLoopAccounting, usage?: AutomationStudioLlmUsageSummary): void {
  if (!usage) return;
  accounting.inputTokens += usage.inputTokens ?? 0;
  accounting.cacheHitInputTokens = (accounting.cacheHitInputTokens ?? 0) + (usage.cacheHitInputTokens ?? 0);
  accounting.outputTokens += usage.outputTokens ?? 0;
  accounting.totalTokens += usage.totalTokens ?? ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0));
  accounting.estimatedCostUsd += usage.estimatedCostUsd ?? 0;
}
