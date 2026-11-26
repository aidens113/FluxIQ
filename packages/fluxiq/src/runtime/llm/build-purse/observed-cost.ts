import { automationStudioLlmCurrentBuildPurse, automationStudioLlmCurrentFlowPurse, type AutomationStudioLlmBuildPurse } from "../../agents/budget/index.ts";
import type { AutomationStudioLlmUsageSummary } from "../../models/contracts/index.ts";

// The most a call on a purse has reported costing, as Studio's hold sees it (t1056).
//
// The purse keeps the same figure for its own rule on an unpriced call (`agents/budget/settlement-ledger.ts`,
// `largestReportedUsd`), but only for a call it was handed no price for. Studio now hands every call a price
// (`./priced.ts`), so it keeps the figure itself: the most any settled call on the purses it was held on reported, and
// apart from that the most a judge's call reported, which is what judging is held at (`agents/budget/judging-reserve.ts`
// holds the judging kept back at the largest judge call priced, never at a decision).

type Observed = { any: number; judge: number };

/** The most a settled call reported costing, per purse. A purse that is gone takes its figures with it. */
const largest = new WeakMap<AutomationStudioLlmBuildPurse, Observed>();

export const automationStudioLlmBuildPurseObservedCost = Object.freeze({
  /** The purses a call made now is held on: the build's and the Flow's, each with the purses it was carved from. */
  inScope(): readonly AutomationStudioLlmBuildPurse[] {
    const purses = new Set<AutomationStudioLlmBuildPurse>();
    for (const start of [automationStudioLlmCurrentBuildPurse(), automationStudioLlmCurrentFlowPurse()]) {
      for (let purse = start; purse; purse = purse.parent) purses.add(purse);
    }
    return [...purses];
  },
  /** The most a settled call on any of `purses` reported costing -- any call, or a judge's -- or nothing before one has. */
  of(purses: readonly AutomationStudioLlmBuildPurse[], kind: keyof Observed): number {
    return purses.reduce((most, purse) => Math.max(most, largest.get(purse)?.[kind] ?? 0), 0);
  },
  /** Record what a call settled on `purses` reported costing, where it reported a cost; `judge` when it was a judge's. */
  note(purses: readonly AutomationStudioLlmBuildPurse[], usage: AutomationStudioLlmUsageSummary | undefined, judge: boolean): void {
    const reported = usage?.estimatedCostUsd;
    if (typeof reported !== "number" || !Number.isFinite(reported) || reported <= 0) return;
    for (const purse of purses) {
      const seen = largest.get(purse) ?? { any: 0, judge: 0 };
      largest.set(purse, { any: Math.max(seen.any, reported), judge: judge ? Math.max(seen.judge, reported) : seen.judge });
    }
  }
});
