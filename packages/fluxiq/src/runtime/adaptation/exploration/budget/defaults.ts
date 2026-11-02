import type { AutomationStudioExplorationBudget } from "./contract.ts";
import { AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS } from "../../deadline/index.ts";
import { AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS } from "../progress/index.ts";

export const AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS: AutomationStudioExplorationBudget = Object.freeze({
  schemaVersion: "automation-studio.exploration-budget.v1",
  // Time, actions and provider calls are runaway backstops. They are set where
  // a loop that is still getting somewhere will not meet them: the recovery's
  // own clock, the run's token pot and the progress guard are what a healthy
  // exploration actually ends on. The clock is the recovery deadline's own
  // default, read rather than copied, so raising the recovery's limit raises
  // this with it rather than leaving a shorter cap underneath it.
  maxDurationMs: AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS,
  maxActions: 24,
  maxProviderCalls: 24,
  maxRefusedActions: 2,
  maxRepeatsPerAction: 2,
  maxStepsWithoutProgress: AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS,
  allowDestructive: false,
  scopePolicy: Object.freeze({ kind: "same_scope" })
});
