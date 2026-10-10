import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation, AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
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
  /**
   * This run's in-run repairs (state-aware recovery plan, C6 step 8), present
   * on an adapting run whose session supplied the executor's `repairIncident`
   * (`../runtime-session/in-run-repair.ts`). Its receipts join the run detail,
   * and the detached recovery reads it so an incident already repaired in the
   * run is never sent to a model a second time.
   */
  inRunRepairs?: AutomationStudioInRunRepairLedgerView;
};

/** What a run's in-run repairs leave for the rest of the run session to read. */
export type AutomationStudioInRunRepairLedgerView = {
  /** One receipt per patch overlaid, and one per incident that got none, in the order asked. */
  receipts(): JsonObject[];
  /** Whether the run already asked for a repair of the incident this failed attempt belongs to. */
  attempted(failedAttempt: { nodeId: string; framePath?: readonly string[] | undefined }): boolean;
  /**
   * What each in-run recovery left for the run detail, in the order asked: the
   * same interventions, gate, trace and review records a recovery after the
   * run writes, since it is the same recovery (`../../recovery/annotation/in-run.ts`).
   */
  recoveries(): Array<{
    interventions: AutomationStudioFlowRunDetail["interventions"];
    adaptationIds: string[];
    changeProposalIds: string[];
    /** `llmGate`, `recoveryTrace`, and `permissionRequest` and `runtimePatchAttempts` when there are any. */
    metadata: JsonObject;
  }>;
  /**
   * What an in-run recovery threw, when one could not finish: a read the
   * recovery deliberately does not catch, such as the run's thread. The
   * executor reads the throw as no fix and the run ends failed; the recovery
   * after the run throws it again, so the run session ends the run on it as it
   * would have had the recovery run there.
   */
  fault(): unknown;
  /**
   * Each fix overlaid, in the order overlaid: its repair, the frames it was
   * made in (outermost first, so the run's root frame alone is a path of one),
   * and the graph it left that frame running. Whether the run kept it is the
   * root trace's to say (`trace.repairs`); a dropped fix is listed here too.
   */
  overlays(): Array<{ repairId: string; framePath: string[]; graph: AutomationStudioFlowDocument }>;
};
