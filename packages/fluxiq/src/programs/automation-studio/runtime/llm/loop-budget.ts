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
// Spending is read from each decision's reported usage. A decision the caller
// could not use reports none, so it is counted at the loop's average; and one
// decision's worth is held back for calls the loop cannot see that spend the
// same grant, such as the build's one reading of its instructions.

import type { JsonObject } from "../../../../core/index.ts";

/** The bounds a loop is given, each optional. */
export type AutomationStudioLlmEvidenceLoopBudget = {
  /** The run's whole token budget, as the grant holds it. */
  maxTotalTokens?: number;
  /** The most one decision may use. A grant refuses a call once less than this is left. */
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
};

/** What is left, this decision included. Only the bounds the budget names appear. */
export type AutomationStudioLlmEvidenceLoopRemaining = {
  decisionsLeft: number;
  tokensLeft?: number;
  costLeftUsd?: number;
  secondsLeft?: number;
};

/** The evidence entry the remaining budget is shown under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID = "core.budget";

const BUDGET_INSTRUCTION = "What this exploration has left, this decision included. Plan to complete while it is enough: running out ends the exploration without a result.";
const FINAL_INSTRUCTION = "This is your last decision, so only complete is offered: write the result now from the evidence you have.";

/** How many decisions each bound still allows, and the smallest of them with `decisionsLeft` from the iteration backstop. */
export function automationStudioLlmEvidenceLoopRemaining(budget: AutomationStudioLlmEvidenceLoopBudget, spent: AutomationStudioLlmEvidenceLoopSpending, iterationsLeft: number): AutomationStudioLlmEvidenceLoopRemaining {
  const unreported = Math.max(0, spent.decisions - spent.reportedDecisions);
  const averageTokens = spent.reportedDecisions ? spent.totalTokens / spent.reportedDecisions : budget.maxTokensPerDecision ?? 0;
  const averageCost = spent.reportedDecisions ? spent.estimatedCostUsd / spent.reportedDecisions : 0;
  const counts = [iterationsLeft];
  const remaining: Omit<AutomationStudioLlmEvidenceLoopRemaining, "decisionsLeft"> = {};
  if (budget.maxTotalTokens !== undefined) {
    // Unreported decisions at the average, and one more held back.
    const tokensLeft = budget.maxTotalTokens - spent.totalTokens - (unreported + 1) * averageTokens;
    const perDecision = budget.maxTokensPerDecision ?? averageTokens;
    counts.push(tokensLeft < perDecision ? 0 : 1 + Math.floor((tokensLeft - perDecision) / Math.max(1, averageTokens)));
    remaining.tokensLeft = Math.max(0, Math.floor(tokensLeft));
  }
  if (budget.maxCostUsd !== undefined) {
    const costLeft = budget.maxCostUsd - spent.estimatedCostUsd - (unreported + 1) * averageCost;
    counts.push(costLeft <= 0 ? 0 : averageCost > 0 ? Math.floor(costLeft / averageCost) : iterationsLeft);
    remaining.costLeftUsd = Math.max(0, Math.floor(costLeft * 10_000) / 10_000);
  }
  if (budget.maxDurationMs !== undefined) {
    const msLeft = budget.maxDurationMs - spent.elapsedMs;
    const averageMs = spent.decisions ? spent.elapsedMs / spent.decisions : 0;
    counts.push(msLeft <= 0 ? 0 : averageMs > 0 ? Math.floor(msLeft / averageMs) : iterationsLeft);
    remaining.secondsLeft = Math.max(0, Math.floor(msLeft / 1_000));
  }
  return { decisionsLeft: Math.max(0, Math.min(...counts)), ...remaining };
}

/** The entry the model reads its remaining budget from: closed numbers and Core's words. */
export function automationStudioLlmEvidenceBudgetEntry(iteration: number, remaining: AutomationStudioLlmEvidenceLoopRemaining): { callId: string; toolId: string; value: JsonObject } {
  return {
    callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID}.${iteration}`,
    toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID,
    value: { code: "llm_evidence_loop.budget", ...remaining, instruction: remaining.decisionsLeft <= 1 ? FINAL_INSTRUCTION : BUDGET_INSTRUCTION }
  };
}

/** Whether every bound given is a finite number a loop can count down from. */
export function automationStudioLlmEvidenceLoopBudgetValid(budget: AutomationStudioLlmEvidenceLoopBudget): boolean {
  const bounds = [budget.maxTotalTokens, budget.maxTokensPerDecision, budget.maxCostUsd, budget.maxDurationMs];
  return bounds.every((bound) => bound === undefined || (typeof bound === "number" && Number.isFinite(bound) && bound > 0))
    && (budget.now === undefined || typeof budget.now === "function");
}
