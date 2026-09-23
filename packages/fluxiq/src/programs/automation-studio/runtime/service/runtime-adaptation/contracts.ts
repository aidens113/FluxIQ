import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import type { AutomationStudioStabilityMetrics, AutomationStudioTrainingBudgetState, AutomationStudioTrainingModeBehavior, AutomationStudioTrainingModeSettings, decideAutomationStudioTrainingBudget } from "../../training-modes.ts";

// What a run knows about its own adaptive behavior: the settings and policy in
// force, what they allow, the budget left, and the adaptations it may match a
// failure against.

export type AutomationStudioRuntimeAdaptationContext = {
  projectId: string;
  flowId: string;
  settings: AutomationStudioTrainingModeSettings;
  policy: AutomationStudioAdaptationPolicy;
  behavior: AutomationStudioTrainingModeBehavior;
  metrics: AutomationStudioStabilityMetrics;
  budgetState: AutomationStudioTrainingBudgetState;
  budgetDecision: ReturnType<typeof decideAutomationStudioTrainingBudget>;
  runsCompleted: number;
  recentRunCount: number;
  recentAdaptationCount: number;
  /** The Flow's known adaptations, which a failure is matched against. */
  recentAdaptations: AutomationStudioFlowAdaptation[];
  diagnostics: string[];
};
