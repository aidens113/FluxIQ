// Keeping the patch's share while the exploration spends.
//
// A recovery pays for its diagnosis, its exploration and its patch out of one
// run budget, and the patch comes last. Once calls stopped being a small fixed
// number, an exploration that kept learning could spend the run down to
// nothing -- the last call, or the last tokens, or the last cents -- and the
// patch was then refused, so a recovery that had found exactly what was wrong
// proposed nothing. That is the one outcome the loop exists to avoid.
//
// So before the exploration starts, the share of every call that comes after it
// is set aside: each call, and that call's worst case in tokens and money, held
// as its own reservation on the run's own ledger. The exploration's decisions
// are refused by the ledger, on the ordinary named codes, as soon as they would
// eat into it, and the holds are handed back unspent the moment the exploration
// ends. One reservation per call keeps each call's price held: two calls held
// as one reservation were priced as one, and left the exploration money that
// belonged to the patch. No count of calls bounds the run (t1056); only money does.
//
// The exploration has no call or action allowance of its own any more (t1057):
// it spends the purse until the purse can pay only for what was held, and ends
// there `budget_exhausted` on the purse's own code. Until t1057 a declared call
// count also lowered the exploration's own call ceiling to what remained after
// the patch, which ended it on `provider_call_limit` instead.
//
// A held call is sized on the largest call this run has already made -- the
// diagnosis, which carried the same failure evidence and context the patch
// will -- and priced as the provider prices a request, never above the call's
// cost ceiling. It used to be the per-request token limit, which is now the
// model's whole window (992,000 tokens): one held call was the whole purse
// (then $0.25), so the hold was never affordable and the patch lost its protection.

import {
  resolveAutomationStudioLlmTokenLimits,
  type AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioLlmTokenLimits
} from "../../../llm/index.ts";

export type AutomationStudioRecoveryPatchReserve = {
  /** Hand the held shares back, just before the patch spends them. Safe to call more than once. */
  release(): void;
};

/** Set the share of each call after the exploration aside on the run's ledger, before the exploration starts. */
export function holdAutomationStudioRecoveryPatchReserve(input: {
  runBudget: AutomationStudioLlmRunBudgetLedger;
  runId: string;
  /** The limits the patch request will be made with. */
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
  /** What the patch request will reserve against the purse. */
  maxEstimatedCostUsd: number;
  /**
   * How many calls come after the exploration, when more than the patch's one.
   *
   * A recovery that will re-plan after looking makes two: the re-plan, then the
   * patch it may ask for. Holding one call's share for two calls is the same
   * defect this file exists to prevent, one call further along -- an exploration
   * that kept learning would leave the re-plan affordable and the patch not, so
   * a run that looked, changed its mind, and knew what to repair would propose
   * nothing. Absent means one.
   */
  reservedCalls?: number | undefined;
  /** Prices one held call, as the provider prices a request (`AutomationStudioLlmProvider.estimateCostUsd`). */
  estimateCostUsd?: ((tokens: { inputTokens: number; outputTokens: number }) => number) | undefined;
}): AutomationStudioRecoveryPatchReserve {
  const reservedCalls = Math.max(1, Math.floor(input.reservedCalls ?? 1));
  const limits = resolveAutomationStudioLlmTokenLimits(input.tokenLimits).limits;
  const made = input.runBudget.callRecords(input.runId).calls.map((call) => call.charged.inputTokens);
  const heldInputTokens = made.length ? Math.min(limits.maxInputTokens, Math.max(...made)) : limits.maxInputTokens;
  const heldCost = heldCostUsd(input.estimateCostUsd, heldInputTokens, limits.maxOutputTokens, input.maxEstimatedCostUsd);
  const leases: Array<{ release(): void }> = [];
  for (let call = 1; call <= reservedCalls; call += 1) {
    const hold = input.runBudget.reserve({
      runId: input.runId,
      requestId: reservedCalls === 1 ? "recovery.patch-reserve" : `recovery.patch-reserve.${call}`,
      estimatedInputTokens: heldInputTokens,
      maxOutputTokens: limits.maxOutputTokens,
      maxEstimatedCostUsd: heldCost
    });
    if (hold.ok) {
      leases.push(hold.lease);
      continue;
    }
    // A hold the run cannot afford is not taken, nor any part of it: the run
    // cannot pay for every call after the exploration either, and the
    // exploration will be refused on the same numbers.
    for (const lease of leases) lease.release();
    return { release: () => undefined };
  }
  return { release: () => { for (const lease of leases.splice(0)) lease.release(); } };
}

function heldCostUsd(price: ((tokens: { inputTokens: number; outputTokens: number }) => number) | undefined, inputTokens: number, outputTokens: number, ceilingUsd: number): number {
  let priced: number | undefined;
  try {
    priced = price?.({ inputTokens, outputTokens });
  } catch {
    priced = undefined;
  }
  return typeof priced === "number" && Number.isFinite(priced) && priced > 0 ? Math.min(ceilingUsd, priced) : ceilingUsd;
}
