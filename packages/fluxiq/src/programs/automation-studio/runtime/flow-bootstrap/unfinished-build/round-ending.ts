// How one live round ended, read for what the build does next.
//
// **The line this draws is the user's (2026-09-30).** A round that stopped
// short -- out of decisions, out of tool calls, stalled on refusals, stopped by
// its no-progress guard -- has a Flow as far as it got, and that Flow is
// tested, judged and repaired; the round's ending is never the build's. A
// round a budget stopped -- its spend, its tokens, its deadline -- is reported
// as exactly that. The decision count is the one budget bound that is not a
// budget here: `budgetBound: "iterations"` is the round's backstop, which a
// repair meets afresh (`./phases.ts`).
import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/index.ts";
import type { AutomationStudioLlmEvidenceLoopBudgetBound } from "../../llm/evidence-loop/index.ts";
import type { AutomationStudioFlowBootstrapBudgetBound } from "../generation-failure/index.ts";
import type { AutomationStudioFlowBootstrapRoundEnding } from "./contracts.ts";
import { AutomationStudioFlowBootstrapUnfinishedStall } from "./unfinished-stall.ts";

const BUDGET_BOUNDS: Readonly<Record<Exclude<AutomationStudioLlmEvidenceLoopBudgetBound, "iterations">, AutomationStudioFlowBootstrapBudgetBound>> = Object.freeze({
  cost: "cost",
  tokens: "tokens",
  duration: "duration"
});

/** The round's ending: finished, stopped short, stopped by a budget, or one this lifecycle does not reach past. */
export function automationStudioFlowBootstrapRoundEnding(
  outcome: AutomationStudioLlmEvidenceLoopResult | AutomationStudioFlowBootstrapUnfinishedStall
): AutomationStudioFlowBootstrapRoundEnding {
  if (outcome instanceof AutomationStudioFlowBootstrapUnfinishedStall) {
    const { issueCodes, trace, accounting, steps } = outcome.progress;
    return { kind: "unfinished", stopped: "unusable_decisions", steps: steps.map((step) => structuredClone(step)), lastIssueCodes: [...issueCodes], completionAttempts: 0, progress: { trace, accounting } };
  }
  if (outcome.ok) return { kind: "finished", loop: outcome };
  const progress = { trace: outcome.trace, accounting: outcome.accounting };
  if (outcome.code === "llm_evidence_loop.repeat_without_progress") {
    return { kind: "unfinished", stopped: "repeat_without_progress", steps: outcome.steps, lastIssueCodes: [], completionAttempts: 0, progress };
  }
  const exhaustion = outcome.code === "llm_evidence_loop.iteration_limit" ? outcome.exhaustion : undefined;
  if (!exhaustion) return { kind: "other", loop: outcome };
  const held = { steps: outcome.steps, lastIssueCodes: [...exhaustion.lastIssueCodes], completionAttempts: exhaustion.completionAttempts, progress: { ...progress, exhaustion } };
  if (exhaustion.bound === "budget" && exhaustion.budgetBound && exhaustion.budgetBound !== "iterations") {
    return { kind: "budget", bound: BUDGET_BOUNDS[exhaustion.budgetBound], ...held };
  }
  return { kind: "unfinished", stopped: exhaustion.bound === "tool_calls" ? "tool_calls" : "iterations", ...held };
}
