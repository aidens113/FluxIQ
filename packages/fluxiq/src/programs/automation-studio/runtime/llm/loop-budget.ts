// What an evidence loop has left to spend, and what the model is told of it.
//
// A build used to stop at a call count: 26 decisions, whatever it had left, and
// with the evidence total no longer binding, realistic builds on the Week 2
// sites walked filters and pages right up to that count and ended
// `evidence_iteration_limit` without writing a Flow (`run-mubs2sme-75efe4a4`,
// `run-mubri4yg-10d01258`). Nothing had told the model that its decisions were
// running out, so it never planned to finish. The count was also the wrong
// bound: the standing decision is that a loop iterates while it makes progress
// and stops on a guard that means something -- the run's cost, its token
// budget, its deadline, or the no-progress guard -- with a call count only a
// far-away backstop.
//
// So a loop given a budget works out, before every decision, how many more
// decisions each bound leaves it, from what it has actually spent, and the
// smallest of them is what it has left. The model is told, in closed numbers,
// as the newest evidence entry. When one decision is left it is offered only
// completion: the build ends by writing its result from what it has, not by
// running into a limit mid-exploration.
//
// Tokens are read from each decision's reported usage. A decision the caller
// could not use reports none, so it is counted at the loop's average; and one
// decision's worth is held back for calls the loop cannot see that spend the
// same run budget, such as the build's one reading of its instructions.
//
// **Cost is counted, never enforced, here (t234).** The purse
// (`./build-purse/purse.ts`, held through `./evidence-loop/cost-purse.ts`) is
// the only cost authority: before each decision is sent its own worst case is
// priced from its request, and one the purse cannot pay for is never sent --
// the only way a loop ends on cost. The cost count reads that same purse --
// what is spent, the earlier builds of the same Flow creation included, and
// what is in flight -- holds nothing back, and is never less than one: it tells
// the model what is left and when to wrap up, and leaves the deciding to the
// purse. It used to hold back an extra average decision and count to zero on
// its own, and `run-muqbzu32-8691a65e` stopped with $0.0738 of $0.10 spent and
// a next decision of $0.0245 at worst that the purse would have paid for.
//
// **What judging needs is not the exploration's to spend (t254).** A build
// with a judge keeps its judging pair back from every decision
// (`./build-purse/purse.ts`, `keepBackForJudging`), and the count takes it out
// of what is left: the model is told what exploration may still spend, and
// reaches its wrap-up while the decision that finishes and the judging after
// it are both still paid for. `run-murzln6g` was told of $0.0111 it could not
// have spent on a repair and judged.
//
// **The last decisions are for finishing, not only the very last one.** The
// last decision used to be the only one offered completion alone, so a
// completion refused on it had no turn left to be corrected:
// `run-mulxsbyy-d4d4c7a1` was refused on its forced final decision and ended
// with nothing. From `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS`
// decisions left, the loop stops offering new tools and offers completion and
// amendments, so a refusal still has two decisions to be answered in -- one to
// amend what it names, one to finish again -- before the last.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudgetBound } from "./evidence-loop/index.ts";

/**
 * Decisions left from which the loop offers only completion and amendments:
 * the wrap-up. Three, so a completion refused on the first of them has one
 * decision to amend and one to finish again.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS = 3;

/** The bounds a loop is given, each optional. */
export type AutomationStudioLlmEvidenceLoopBudget = {
  /** The run's whole token budget. */
  maxTotalTokens?: number;
  /** The most one decision may use. The run's budget refuses a call once less than this is left. */
  maxTokensPerDecision?: number;
  /** The run's cost ceiling, held against what decisions report having spent. */
  maxCostUsd?: number;
  /** How long the loop may run from its start. */
  maxDurationMs?: number;
  /** The clock; `Date.now` when absent. */
  now?: () => number;
};

/** What the loop has spent so far. */
export type AutomationStudioLlmEvidenceLoopSpending = {
  /** Decisions asked for, usable or not. */
  decisions: number;
  /** Decisions whose usage was reported and counted below. */
  reportedDecisions: number;
  totalTokens: number;
  estimatedCostUsd: number;
  elapsedMs: number;
  /**
   * The worst case of the last decision sent, priced from its request
   * (`./build-purse/`): every input token uncached, its reply at its reserve.
   * Each request carries everything before it, so the next costs at least this
   * at worst. The next decision is reserved at this or the average, whichever
   * is larger, and the rest are counted at the average: the average alone said
   * three decisions were left on `run-mup2u8o3-6697c4be` when the next one
   * alone could cost $0.15, and this alone for every decision withdrew tools
   * with $0.09 left on `run-muq3uozx-3153564b` when calls cost $0.003.
   */
  nextDecisionCostUsd?: number;
  /**
   * The purse the loop's decisions are held against, read before this
   * decision: the cost count reads it rather than the loop's own figures, so
   * what earlier builds of the same Flow creation spent, what calls in
   * flight are held at and what is kept back for judging the Flow
   * (`keptBackUsd`, t254) count, and nothing else is held back. Absent, the
   * count reads `maxCostUsd` and `estimatedCostUsd`.
   */
  purse?: { ceilingUsd: number; spentUsd: number; pendingUsd: number; keptBackUsd?: number };
};

/** What is left, this decision included. Only the bounds the budget names appear. */
export type AutomationStudioLlmEvidenceLoopRemaining = {
  decisionsLeft: number;
  /**
   * The bound that left the fewest decisions, and so the one that ends the
   * loop if nothing changes -- unless it is cost, which never ends a loop on
   * its count: the purse does, by refusing a decision. Recorded on an
   * exhausted loop so a reader need not work out from the trace which of
   * tokens and time it was (`./evidence-loop/exhaustion.ts`). Never shown to
   * the model.
   */
  limitedBy: AutomationStudioLlmEvidenceLoopBudgetBound;
  tokensLeft?: number;
  costLeftUsd?: number;
  secondsLeft?: number;
};

/** Floating-point slack, as the purse allows, so money for exactly one worst case counts it. */
const COST_EPSILON_USD = 1e-9;

/** The evidence entry the remaining budget is shown under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID = "core.budget";

const BUDGET_INSTRUCTION = "What this exploration has left, this decision included. Plan to complete while it is enough: running out ends the exploration without a result.";
const FINAL_INSTRUCTION = "This is your last decision, so only complete is offered: write the result now from the evidence you have.";
const WRAP_UP_INSTRUCTION = "Only a few decisions are left, so new tools are no longer offered: complete now from the draft you have. If completing is refused, amend the draft as the refusal says and complete again.";

/** How many decisions each bound still allows, and the smallest of them with `decisionsLeft` from the iteration backstop. */
export function automationStudioLlmEvidenceLoopRemaining(budget: AutomationStudioLlmEvidenceLoopBudget, spent: AutomationStudioLlmEvidenceLoopSpending, iterationsLeft: number): AutomationStudioLlmEvidenceLoopRemaining {
  const unreported = Math.max(0, spent.decisions - spent.reportedDecisions);
  const averageTokens = spent.reportedDecisions ? spent.totalTokens / spent.reportedDecisions : budget.maxTokensPerDecision ?? 0;
  const averageCost = spent.reportedDecisions ? spent.estimatedCostUsd / spent.reportedDecisions : 0;
  const counts: Array<[AutomationStudioLlmEvidenceLoopBudgetBound, number]> = [["iterations", iterationsLeft]];
  const remaining: Omit<AutomationStudioLlmEvidenceLoopRemaining, "decisionsLeft" | "limitedBy"> = {};
  if (budget.maxTotalTokens !== undefined) {
    // Unreported decisions at the average, and one more held back.
    const tokensLeft = budget.maxTotalTokens - spent.totalTokens - (unreported + 1) * averageTokens;
    const perDecision = budget.maxTokensPerDecision ?? averageTokens;
    counts.push(["tokens", tokensLeft < perDecision ? 0 : 1 + Math.floor((tokensLeft - perDecision) / Math.max(1, averageTokens))]);
    remaining.tokensLeft = Math.max(0, Math.floor(tokensLeft));
  }
  if (budget.maxCostUsd !== undefined || spent.purse) {
    // What the purse has left for decisions: its ceiling less what is spent,
    // what is in flight and what is kept back for judging, with nothing else
    // held back. Without one, the loop's own figures.
    const costLeft = spent.purse
      ? spent.purse.ceilingUsd - spent.purse.spentUsd - spent.purse.pendingUsd - (spent.purse.keptBackUsd ?? 0)
      : budget.maxCostUsd! - spent.estimatedCostUsd - unreported * averageCost;
    // As the token bound counts: the next decision is reserved at its worst
    // case, once, and those after it at what decisions have actually cost.
    // Counting every one at the worst case withdrew tools with $0.09 left when
    // calls cost a tenth of it (`run-muq3uozx-3153564b`). Before anything is
    // reported, the worst case is the only price known.
    const worstCase = Math.max(averageCost, spent.nextDecisionCostUsd !== undefined && Number.isFinite(spent.nextDecisionCostUsd) ? spent.nextDecisionCostUsd : 0);
    const perDecision = spent.reportedDecisions ? averageCost : worstCase;
    const counted = costLeft <= 0 || costLeft + COST_EPSILON_USD < worstCase ? 0 : perDecision > 0 ? 1 + Math.floor((costLeft - worstCase + COST_EPSILON_USD) / perDecision) : iterationsLeft;
    // Never none: the decision is sent and the purse decides. At one, the loop
    // offers only completion; it does not end there (`./evidence-loop.ts`).
    counts.push(["cost", Math.max(1, counted)]);
    remaining.costLeftUsd = Math.max(0, Math.floor(costLeft * 10_000) / 10_000);
  }
  if (budget.maxDurationMs !== undefined) {
    const msLeft = budget.maxDurationMs - spent.elapsedMs;
    const averageMs = spent.decisions ? spent.elapsedMs / spent.decisions : 0;
    counts.push(["duration", msLeft <= 0 ? 0 : averageMs > 0 ? Math.floor(msLeft / averageMs) : iterationsLeft]);
    remaining.secondsLeft = Math.max(0, Math.floor(msLeft / 1_000));
  }
  // The first of the smallest, so the backstop is named only when it is the
  // bound that binds and no budget ties it.
  const [limitedBy, fewest] = counts.reduce((least, entry) => entry[1] < least[1] ? entry : least);
  return { decisionsLeft: Math.max(0, fewest), limitedBy, ...remaining };
}

/** The entry the model reads its remaining budget from: closed numbers and Core's words. */
export function automationStudioLlmEvidenceBudgetEntry(
  iteration: number,
  remaining: AutomationStudioLlmEvidenceLoopRemaining,
  /** Whether the loop is withholding new tools this decision; absent, read from what is left. */
  wrappingUp = remaining.decisionsLeft <= AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_WRAP_UP_DECISIONS
): { callId: string; toolId: string; value: JsonObject } {
  const { limitedBy: _limitedBy, ...shown } = remaining;
  return {
    callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID}.${iteration}`,
    toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID,
    value: {
      code: "llm_evidence_loop.budget",
      ...shown,
      instruction: remaining.decisionsLeft <= 1 ? FINAL_INSTRUCTION : wrappingUp ? WRAP_UP_INSTRUCTION : BUDGET_INSTRUCTION
    }
  };
}

/** Whether every bound given is a finite number a loop can count down from. */
export function automationStudioLlmEvidenceLoopBudgetValid(budget: AutomationStudioLlmEvidenceLoopBudget): boolean {
  const bounds = [budget.maxTotalTokens, budget.maxTokensPerDecision, budget.maxCostUsd, budget.maxDurationMs];
  return bounds.every((bound) => bound === undefined || (typeof bound === "number" && Number.isFinite(bound) && bound > 0))
    && (budget.now === undefined || typeof budget.now === "function");
}
