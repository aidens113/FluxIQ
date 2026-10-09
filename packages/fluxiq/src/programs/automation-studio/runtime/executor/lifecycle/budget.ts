// The run-level lifecycle recovery budget (state-aware recovery plan, C7).
//
// This module owns the budget's shape and how it is read from a run's
// recovery settings. The defaults are the named constants in
// `model/flows.ts`; the spending is `./budget-ledger.ts`. Handler body steps
// count against the run's `maxSteps` as ordinary steps, which the step loop
// already bounds.

import {
  AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_INCIDENT,
  AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_RUN,
  AUTOMATION_STUDIO_DEFAULT_MAX_RECOVERY_ATTEMPTS_PER_SUBFLOW,
  AUTOMATION_STUDIO_DEFAULT_MAX_REROUTES_PER_RUN
} from "../../../model/index.ts";
import type { AutomationStudioRecoveryBudget } from "../contracts.ts";

/** One run's allowances, counted across every frame of it. */
export type AutomationStudioLifecycleBudget = {
  maxHandlerRunsPerIncident: number;
  maxHandlerRunsPerRun: number;
  /** Routes to a checkpoint per run: the existing `maxReroutesPerRun`. */
  maxRoutesPerRun: number;
  /** Known alternatives per incident: the existing `maxRecoveryAttemptsPerSubflow`. */
  maxAlternativesPerIncident: number;
};

/** The run's recovery settings, with the two handler allowances a Flow may also set. */
export type AutomationStudioLifecycleBudgetSettings = AutomationStudioRecoveryBudget & {
  maxHandlerRunsPerIncident?: number;
  maxHandlerRunsPerRun?: number;
};

/**
 * The budget a run spends from: each allowance the settings state as a
 * finite, non-negative number (floored), else its default. Nothing here
 * touches a node's attempt allowance, so no setting reaches below the
 * four-attempt floor (`../retry-policy.ts`).
 */
export function automationStudioLifecycleBudget(settings?: AutomationStudioLifecycleBudgetSettings): AutomationStudioLifecycleBudget {
  return {
    maxHandlerRunsPerIncident: allowance(settings?.maxHandlerRunsPerIncident, AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_INCIDENT),
    maxHandlerRunsPerRun: allowance(settings?.maxHandlerRunsPerRun, AUTOMATION_STUDIO_DEFAULT_MAX_HANDLER_RUNS_PER_RUN),
    maxRoutesPerRun: allowance(settings?.maxReroutesPerRun, AUTOMATION_STUDIO_DEFAULT_MAX_REROUTES_PER_RUN),
    maxAlternativesPerIncident: allowance(settings?.maxRecoveryAttemptsPerSubflow, AUTOMATION_STUDIO_DEFAULT_MAX_RECOVERY_ATTEMPTS_PER_SUBFLOW)
  };
}

function allowance(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
