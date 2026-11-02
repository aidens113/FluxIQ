import type { AutomationStudioExplorationScopePolicy } from "../scope/index.ts";

export type AutomationStudioExplorationBudget = {
  schemaVersion: "automation-studio.exploration-budget.v1";
  /** The wall clock for this one exploration. The whole recovery has its own. */
  maxDurationMs: number;
  /** Every action attempted, refused ones included. */
  maxActions: number;
  /** Provider decisions. The loop's iteration ceiling is the backstop above it. */
  maxProviderCalls: number;
  /** How many refusals before the exploration is treated as blocked rather than adjusting. */
  maxRefusedActions: number;
  /** How many times one identical action may be attempted, mutations notwithstanding. */
  maxRepeatsPerAction: number;
  /** Consecutive steps that may fail to advance before the loop is stopped. */
  maxStepsWithoutProgress: number;
  /** Not a switch. There is no value that turns destructive actions on. */
  allowDestructive: false;
  scopePolicy: AutomationStudioExplorationScopePolicy;
};
