import type { AutomationStudioLlmRunBudgetLimits } from "../run-budget.ts";

/** Whole-run limits and the separately granted, time-priced per-call ceiling. */
export type AutomationStudioLlmRunBudgetProfile = {
  ledger: Required<AutomationStudioLlmRunBudgetLimits>;
  maxEstimatedCostUsdPerCall: number;
  maxEstimatedCostUsdPerCallAt(atMs?: number): number;
  declaredCallsPerRun?: number;
};
