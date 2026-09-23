import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import type { AutomationStudioResultCheckSchedule, AutomationStudioResultCheckState } from "../../result-check-schedule/index.ts";
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
  /** Which runs of this Flow have their result judged. Resolved from the settings, replaceable. */
  resultCheckSchedule: AutomationStudioResultCheckSchedule;
  /**
   * Where this run stands in that schedule. `ordinal` already counts the run
   * that is starting, because the decision is taken when it finishes and the
   * question is "is *this* run checked".
   */
  resultCheckState: AutomationStudioResultCheckState;
  /**
   * The Flow revision this run belongs to, written on its row so the count
   * restarts when the Flow changes. A landed repair bumps `flows.graph_revision`
   * inside the apply transaction, so the three-run window reopens for free.
   */
  resultCheckEpoch: number;
  diagnostics: string[];
};
