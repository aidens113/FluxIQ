import type { ModelRunBudgetDiagnostic } from "../../../agents/ledger/index.ts";
import type { AutomationStudioExplorationOutcome } from "./contract.ts";

/** Each run-budget diagnostic's outcome, for an exploration refused before it starts. */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET: Readonly<Record<ModelRunBudgetDiagnostic["code"], AutomationStudioExplorationOutcome>> = Object.freeze({
  "llm_budget.run_call_limit": "budget_exhausted",
  "llm_budget.run_total_limit": "budget_exhausted",
  "llm_budget.run_output_limit": "budget_exhausted",
  "llm_budget.run_cost_limit": "budget_exhausted",
  "llm_budget.duplicate_request": "failed",
  "llm_budget.invalid_reservation": "failed"
});
