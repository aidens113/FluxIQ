// How much one recovery may spend, worked out once from what a person and a
// provider resolver said.
//
// This used to be twenty lines inside the recovery path, and the number that
// governed them was a call count set per mode: one for `diagnosis_only`, two
// for `diagnose_and_adapt`, otherwise the smaller of the intervention limits and
// two. That count starved every recovery that needed to look at anything -- the
// diagnosis and the patch spent both calls and the exploration was refused
// before it began -- and the token pot and cost purse were both multiples of
// it, so widening one meant widening the others by accident.
//
// A recovery is now bounded by its cost ceiling, its token budget, its clock and
// whether it is still getting anywhere. The last two live in the exploration
// ledger. The first two are sized here, and the call count survives only as a
// runaway backstop.

import {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD,
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST,
  AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP,
  type AutomationStudioLlmRunBudgetLimits,
  type AutomationStudioLlmTokenLimits
} from "../../llm/index.ts";

/** Core's default token pot, per share of the run. It used to be the literal
 * 12_000, written when a run meant two calls, so 6_000 is that number per call
 * unchanged. A `maxTokensPerRun` a person sets still binds exactly as written. */
export const AUTOMATION_STUDIO_RECOVERY_DEFAULT_TOKENS_PER_SHARE = 6_000;

/**
 * How many shares a recovery's token pot and cost purse are sized and divided
 * into. **Not a call limit.**
 *
 * Two numbers still have to be chosen: how big the default token pot is, and
 * how much of the cost purse one call may reserve before it knows what it will
 * spend. Both are sized as "enough for this many ordinary calls". A call is
 * reserved at its share and charged what it actually used, so a run whose calls
 * come in under their share -- nearly all of them, because the share covers a
 * worst-case request -- makes more calls than this, not fewer. Only a run whose
 * every call spends its full worst case stops here, and it stops on tokens or
 * money, reported as such.
 *
 * Twenty-four is a diagnosis, a patch and a couple of dozen evidence decisions.
 */
export const AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES = 24;

/**
 * The most one recovery may be estimated to cost, whoever authorised it.
 *
 * Without a grant the purse is the policy's and at most $0.25, which this does
 * not touch. With a grant it is the grant's own total, and this is the ceiling
 * over a resolver that gives a per-call cost and no total -- which would
 * otherwise be multiplied by the shares into a purse nobody chose.
 */
export const AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN = 2;

export type AutomationStudioRecoveryRunBudgetInput = {
  /** A grant that carries its own budget, rather than the training settings'. */
  explicitGrantBudget: boolean;
  /** What the provider resolver said, when it said anything beyond a provider. */
  resolution?: {
    maxCallsPerRun?: number | undefined;
    /** The whole run's token exposure, when the resolver was issued for one.
     * It caps the pot however many calls are authorised. */
    maxTotalTokensPerRun?: number | undefined;
    tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
    maxEstimatedCostUsd?: number | undefined;
    maxTotalEstimatedCostUsd?: number | undefined;
  } | undefined;
  /** The training settings' token budget, when a person set one. */
  maxTokensPerRun?: number | undefined;
  /** The adaptation policy's cost ceiling, when it has one. */
  policyMaxEstimatedCostUsdPerRun?: number | undefined;
};

export type AutomationStudioRecoveryRunBudget = {
  /** What the run's ledger is constructed with. Every field is set. */
  ledger: Required<AutomationStudioLlmRunBudgetLimits>;
  /** What one call may reserve against the purse before it knows what it spent. */
  maxEstimatedCostUsdPerCall: number;
  /** The call count the resolver declared, when it declared one. Absent means
   * the ledger's count is only Core's backstop, and no stage should plan by it. */
  declaredCallsPerRun?: number;
};

/** The limits one recovery runs under. */
export function resolveAutomationStudioRecoveryRunBudget(input: AutomationStudioRecoveryRunBudgetInput): AutomationStudioRecoveryRunBudget {
  const resolution = input.resolution;
  // A resolver that says how many calls it will authorise is taken at its word
  // -- a grant mints exactly that many, so a call past it would fail anyway,
  // and failing at the budget names the reason. An intervention limit counts
  // interventions, not provider calls, and no longer stands in for one.
  const declaredCalls = positiveInteger(resolution?.maxCallsPerRun);
  const maxCallsPerRun = declaredCalls ?? AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP;
  // The purse is divided among exactly the calls that will be paid for. A
  // grant commits each call's *reservation* against its own total, not what the
  // call went on to spend, so if an authorised call's share were larger than
  // purse / authorised calls, the grant would refuse the last few calls on
  // cost -- unnamed, and revoking itself -- while the run still had money.
  const costShares = declaredCalls ?? AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES;
  // A grant's token pot is what the person confirmed when it was issued: the
  // per-call limit times the calls. Without one, the default shares size it.
  const tokenShares = input.explicitGrantBudget ? costShares : Math.min(costShares, AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES);
  const tokenLimits = resolution?.tokenLimits;
  const requestedTotalTokens = (tokenLimits?.maxTotalTokens ?? 10_000) * tokenShares;
  const maxTotalTokensPerRun = Math.max(1, Math.trunc(Math.min(
    AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST * tokenShares,
    positiveInteger(resolution?.maxTotalTokensPerRun) ?? Number.POSITIVE_INFINITY,
    input.explicitGrantBudget
      ? requestedTotalTokens
      : Math.min(input.maxTokensPerRun ?? AUTOMATION_STUDIO_RECOVERY_DEFAULT_TOKENS_PER_SHARE * tokenShares, requestedTotalTokens)
  )));
  const maxOutputTokensPerRun = Math.max(1, Math.trunc(Math.min(maxTotalTokensPerRun, (tokenLimits?.maxOutputTokens ?? maxTotalTokensPerRun) * tokenShares)));
  const requestedCost = resolution?.maxTotalEstimatedCostUsd ?? (resolution?.maxEstimatedCostUsd ?? 0.25) * costShares;
  const maxEstimatedCostUsdPerRun = Math.min(
    AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN,
    input.explicitGrantBudget
      ? Math.min(AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD, requestedCost)
      : Math.min(0.25, input.policyMaxEstimatedCostUsdPerRun ?? 0.25, requestedCost)
  );
  return {
    ledger: { maxCallsPerRun, maxTotalTokensPerRun, maxOutputTokensPerRun, maxEstimatedCostUsdPerRun },
    // Rounded down to the billionth the grant rounds its running total to, so
    // every authorised call's reservation still fits on the last call.
    maxEstimatedCostUsdPerCall: Math.floor((maxEstimatedCostUsdPerRun / costShares) * 1_000_000_000) / 1_000_000_000,
    ...(declaredCalls !== undefined ? { declaredCallsPerRun: declaredCalls } : {})
  };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.trunc(value) : undefined;
}
