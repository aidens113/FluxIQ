// Keeping the patch's share while the exploration spends.
//
// A recovery pays for its diagnosis, its exploration and its patch out of one
// run budget, and the patch comes last. Once calls stopped being a small fixed
// number, an exploration that kept learning could spend the run down to
// nothing -- the last call, or the last tokens, or the last cents -- and the
// patch was then refused, so a recovery that had found exactly what was wrong
// proposed nothing. That is the one outcome the loop exists to avoid.
//
// So before the exploration starts, the patch's share is set aside: one call,
// and that call's worst case in tokens and money, held as a reservation on the
// run's own ledger. The exploration's decisions are refused by the ledger, on
// the ordinary named codes, as soon as they would eat into it, and the hold is
// handed back unspent the moment the exploration ends. When a call count was
// declared, the exploration's own call ceiling is also lowered to what remains
// after the patch, so the usual ending is the exploration's own named limit.

import {
  resolveAutomationStudioLlmTokenLimits,
  type AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioLlmTokenLimits
} from "../../llm/index.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS,
  resolveAutomationStudioExplorationBudget,
  type AutomationStudioExplorationBudget
} from "../exploration-budget.ts";

export type AutomationStudioRecoveryPatchReserve = {
  /** The exploration's budget with the patch's call already taken off. Absent
   * when no call count was declared, so the exploration keeps its defaults. */
  explorationBudget?: AutomationStudioExplorationBudget;
  /** Hand the held share back, just before the patch spends it. Safe to call more than once. */
  release(): void;
};

/** Set the patch's share aside on the run's ledger, before the exploration starts. */
export function holdAutomationStudioRecoveryPatchReserve(input: {
  runBudget: AutomationStudioLlmRunBudgetLedger;
  runId: string;
  /** The call count the resolver declared, when it declared one. */
  declaredCallsPerRun?: number | undefined;
  /** The limits the patch request will be made with. */
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
  /** What the patch request will reserve against the purse. */
  maxEstimatedCostUsd: number;
}): AutomationStudioRecoveryPatchReserve {
  const limits = resolveAutomationStudioLlmTokenLimits(input.tokenLimits).limits;
  const hold = input.runBudget.reserve({
    runId: input.runId,
    requestId: "recovery.patch-reserve",
    estimatedInputTokens: limits.maxInputTokens,
    maxOutputTokens: limits.maxOutputTokens,
    maxEstimatedCostUsd: input.maxEstimatedCostUsd
  });
  // A hold the run cannot afford is not taken: the run cannot pay for the
  // patch either, and the exploration will be refused on the same numbers.
  const release = hold.ok ? () => hold.lease.release() : () => undefined;
  if (input.declaredCallsPerRun === undefined) return { release };
  // Declared calls minus those already made minus the patch's. Clamped to at
  // least one by the resolver; a hold that leaves no call makes the ledger
  // refuse that one, so the exploration still ends on a named limit.
  const remaining = input.declaredCallsPerRun - input.runBudget.snapshot(input.runId).calls - 1;
  return {
    release,
    explorationBudget: resolveAutomationStudioExplorationBudget({
      maxProviderCalls: remaining,
      // An action follows each decision but the last, plus a first look, so
      // actions are raised with the calls rather than binding before them.
      maxActions: Math.max(AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxActions, remaining + 1)
    })
  };
}
