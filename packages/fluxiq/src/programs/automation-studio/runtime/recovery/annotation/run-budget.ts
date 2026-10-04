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
//
// The cost ceiling is the run cost ceiling, `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD`
// ($0.10 unless FLUXIQ_LLM_RUN_COST_CEILING_USD says otherwise;
// `../../llm/flow-execution-limits/run-cost-ceiling.ts`), whoever asked for
// the run. What the resolver, the Flow's configured
// `maxEstimatedCostUsdPerRun` or an unattended repair's authorization says may
// lower it and never raise it. A run a person asked for used to take the Flow's
// figure, else the resolver's $2 default total, up to a $2 recovery ceiling of
// its own.

import {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST,
  AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS,
  AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP,
  AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL,
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD,
  automationStudioLlmRunCostCeilingUsd,
  estimateAutomationStudioDeepSeekCostUsd,
  isAutomationStudioDeepSeekModel,
  resolveAutomationStudioLlmTokenLimits,
  type AutomationStudioLlmRunBudgetLimits,
  type AutomationStudioLlmTokenLimits
} from "../../llm/index.ts";


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

export type AutomationStudioRecoveryRunBudgetInput = {
  /** A run a person asked the model into, held to the run's own budget rather than the training settings'. */
  explicitRunBudget: boolean;
  /** What the provider resolver said, when it said anything beyond a provider. */
  resolution?: {
    maxCallsPerRun?: number | undefined;
    /** The whole run's token exposure, when the resolver states one. It caps
     * the pot however many calls the run makes. */
    maxTotalTokensPerRun?: number | undefined;
    tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
    maxEstimatedCostUsd?: number | undefined;
    maxTotalEstimatedCostUsd?: number | undefined;
  } | undefined;
  /** The training settings' token budget, when a person set one. */
  maxTokensPerRun?: number | undefined;
  /** The Flow's configured cost ceiling (`adaptationPolicySettings.maxEstimatedCostUsdPerRun`), when it has one. */
  policyMaxEstimatedCostUsdPerRun?: number | undefined;
  /**
   * What is left of a larger repair's purse, when this recovery is one part of
   * one (`../refuted-result/purse.ts`). It lowers the total like any other
   * limit here. A recovery with nothing left is refused before it gets this far
   * (`annotate.ts`), because a limit of zero is ignored here rather than trusted.
   */
  costLeftUsd?: number | undefined;
  /** The model the resolved provider calls, which prices one call's worst case. Absent or unpriced, Core's default model is. */
  model?: string | undefined;
  /**
   * The clock a reservation is priced by, in epoch milliseconds: DeepSeek bills
   * half outside its peak hours (`../../llm/deepseek/pricing.ts`), and a call is
   * held at the rate in force when it is held, as the build purse holds one
   * (t254). Absent, the wall clock.
   */
  now?: (() => number) | undefined;
};

export type AutomationStudioRecoveryRunBudget = {
  /** What the run's ledger is constructed with. Every field is set. */
  ledger: Required<AutomationStudioLlmRunBudgetLimits>;
  /** What one call may reserve against the purse before it knows what it spent,
   * priced when the budget was resolved. A ceiling: the harness reserves the
   * request's own measured size, priced by the provider, under it
   * (`../../llm/harness/run.ts`). At the window profile this ceiling is the
   * whole purse, and only that keeps it from binding. A call does not take
   * this figure: it takes `maxEstimatedCostUsdPerCallAt()`, read as the call is
   * made, because a recovery resolved off-peak can run into a peak window. */
  maxEstimatedCostUsdPerCall: number;
  /**
   * The same ceiling priced at the rate in force at `atMs` -- the budget's
   * clock now, when absent (t254). Every call reads it as it is made, so one
   * made at peak is held at the peak rate and one made off-peak at half of
   * it, whenever the recovery's budget was set. Only the worst-case term moves
   * with the clock; the even share, the resolver's per-call cost and the purse
   * bound it exactly as they bound `maxEstimatedCostUsdPerCall`.
   */
  maxEstimatedCostUsdPerCallAt(atMs?: number): number;
  /** The call count the resolver declared, when it declared one. Absent means
   * the ledger's count is only Core's backstop, and no stage should plan by it. */
  declaredCallsPerRun?: number;
};

/** The limits one recovery runs under. */
export function resolveAutomationStudioRecoveryRunBudget(input: AutomationStudioRecoveryRunBudgetInput): AutomationStudioRecoveryRunBudget {
  const resolution = input.resolution;
  // A resolver that says how many calls a run makes is taken at its word, and
  // failing at the budget names the reason. An intervention limit counts
  // interventions, not provider calls, and no longer stands in for one.
  const declaredCalls = positiveInteger(resolution?.maxCallsPerRun);
  const maxCallsPerRun = declaredCalls ?? AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP;
  // The purse is divided among exactly the calls the resolver declared. The
  // ledger reserves each call's share before it knows what it will spend, so a
  // share larger than purse / declared calls would refuse the last few calls on
  // cost while the run still had money.
  const costShares = declaredCalls ?? AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES;
  // The token pot is the per-call limit times the shares, lowered by a
  // `maxTokensPerRun` a person set or a resolver's whole-run exposure. There is
  // no smaller default of Core's own any more: it was 6,000 tokens per share
  // (144,000 for a recovery nobody asked for), which refused a whole page's
  // diagnosis outright. The run's cost purse is what bounds spending (2026-09-30).
  const tokenShares = input.explicitRunBudget ? costShares : Math.min(costShares, AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES);
  const tokenLimits = resolution?.tokenLimits;
  // A resolver that names no per-call limit gets the harness's own default, which
  // is the model's window (`../../llm/harness/token-limits.ts`); it was 10,000.
  const requestedTotalTokens = (tokenLimits?.maxTotalTokens ?? AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS.maxTotalTokens) * tokenShares;
  const maxTotalTokensPerRun = Math.max(1, Math.trunc(Math.min(
    AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST * tokenShares,
    positiveInteger(resolution?.maxTotalTokensPerRun) ?? Number.POSITIVE_INFINITY,
    input.explicitRunBudget
      ? requestedTotalTokens
      : Math.min(input.maxTokensPerRun ?? requestedTotalTokens, requestedTotalTokens)
  )));
  const maxOutputTokensPerRun = Math.max(1, Math.trunc(Math.min(maxTotalTokensPerRun, (tokenLimits?.maxOutputTokens ?? maxTotalTokensPerRun) * tokenShares)));
  // A resolver that gives a per-call cost and no total is multiplied into a
  // purse, which the run cost ceiling then lowers like any other.
  const requestedCost = resolution?.maxTotalEstimatedCostUsd ?? (typeof resolution?.maxEstimatedCostUsd === "number" && Number.isFinite(resolution.maxEstimatedCostUsd) && resolution.maxEstimatedCostUsd > 0 ? resolution.maxEstimatedCostUsd * costShares : undefined);
  // Whoever asked for the run: the ceiling, lowered by the resolver's total, by
  // the Flow's configured limit and by what a repair has left, and raised by none.
  const maxEstimatedCostUsdPerRun = automationStudioLlmRunCostCeilingUsd(requestedCost, input.policyMaxEstimatedCostUsdPerRun, input.costLeftUsd);
  // What one call reserves before it knows what it spent: its worst case --
  // the per-request token limits priced at the model's rates in force now, peak
  // or off-peak (t254), all input a cache miss -- and never less than an even share of the purse. The ledger
  // counts a call that reports more than it reserved as a budget breach
  // (`../../llm/run-budget.ts`), so a reservation below what a call can really
  // cost reads an ordinary call as a breach: an even share of the ceiling, then
  // $0.25, over 64 declared calls was $0.0039, and live repairs' $0.0041 and $0.0044 diagnoses
  // failed `run-munutuvf-6a1c548a` and `run-munv9eqy-1827b928` for it. The total
  // is still what binds: a call is admitted only while what was spent and what
  // is reserved leave room for this reservation, so a recovery stops at most one
  // worst-case call short of its purse, and never past it. A resolver's
  // per-call cost, when it names one, caps the reservation, and so does the
  // purse itself.
  //
  // The worst case is priced when each call is made, not once here: a
  // recovery resolved off-peak that ran into a peak window held its peak calls
  // at half their rate, and the ledger counted each one a breach (t254).
  const share = maxEstimatedCostUsdPerRun / costShares;
  const perCallCap = typeof resolution?.maxEstimatedCostUsd === "number" && Number.isFinite(resolution.maxEstimatedCostUsd) && resolution.maxEstimatedCostUsd > 0 ? resolution.maxEstimatedCostUsd : AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;
  const clock = input.now ?? Date.now;
  const model = input.model;
  // The one per-call cap a ledger enforces, rounded down to the billionth the
  // ledger rounds its running total to.
  const maxEstimatedCostUsdPerCallAt = (atMs: number = clock()): number => {
    const reservation = Math.min(maxEstimatedCostUsdPerRun, perCallCap, Math.max(share, worstCaseCallCostUsd(tokenLimits, model, atMs)));
    return Math.floor(reservation * 1_000_000_000) / 1_000_000_000;
  };
  return {
    ledger: { maxCallsPerRun, maxTotalTokensPerRun, maxOutputTokensPerRun, maxEstimatedCostUsdPerRun },
    maxEstimatedCostUsdPerCall: maxEstimatedCostUsdPerCallAt(),
    maxEstimatedCostUsdPerCallAt,
    ...(declaredCalls !== undefined ? { declaredCallsPerRun: declaredCalls } : {})
  };
}

/**
 * One call at the per-request token limits the resolver declared, every input
 * token a cache miss, at the model's rates in force at `atMs` -- half outside
 * peak hours -- through the one shared price (`estimateAutomationStudioDeepSeekCostUsd`).
 *
 * Nothing when it declared none. The harness's own default is then the model's
 * whole window (`../../llm/harness/token-limits.ts`, since 2026-09-30), a
 * request no call is expected to fill and one whose worst case is more than the
 * whole purse; reserving it would leave room for one call per recovery.
 * An even share of the purse is reserved instead, and the harness reserves each
 * call at its own measured size when the provider can price it.
 */
function worstCaseCallCostUsd(tokenLimits: Partial<AutomationStudioLlmTokenLimits> | undefined, model: string | undefined, atMs: number): number {
  if (!tokenLimits || Object.values(tokenLimits).every((value) => value === undefined)) return 0;
  const limits = resolveAutomationStudioLlmTokenLimits(tokenLimits).limits;
  const outputTokens = Math.min(limits.maxOutputTokens, AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST);
  const inputTokens = Math.max(0, Math.min(limits.maxInputTokens, limits.maxTotalTokens - outputTokens, AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST - outputTokens));
  return estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, isAutomationStudioDeepSeekModel(model) ? model : AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, atMs);
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.trunc(value) : undefined;
}
