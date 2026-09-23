// Assembling the adaptation context a run executes under.
//
// Lifted out of `AutomationStudioService`, which is a four-thousand-line class
// at its own line budget, and reached through ports for the reason
// `recovery/annotation/ports.ts` gives: a path that can only be driven by
// standing up a project directory and a live run is a path nobody writes an
// assertion about. The service method that remains is the binding of the four
// things this needs from it.

import { AUTOMATION_STUDIO_KNOWN_ADAPTATION_LOAD_LIMIT } from "../../recovery/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowArtifact, AutomationStudioFlowRunSummary } from "../../../model/index.ts";
import type { AutomationStudioTrainingAdaptationSummary } from "../../training-modes.ts";
import { resolveAutomationStudioResultCheckSchedule } from "../../result-check-schedule/index.ts";
import { behaviorForAutomationStudioTrainingMode, computeAutomationStudioStabilityMetrics, decideAutomationStudioTrainingBudget } from "../../training-modes.ts";
import { adaptationPolicyFromFlowMetadata, mergedFlowSettingsMetadata, trainingModeSettingsFromMetadata } from "../flow-settings/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "./contracts.ts";
import { runtimeAdaptationContextDiagnostics, runtimeTrainingBudgetStateFromSummaries } from "./context.ts";
import { automationStudioResultCheckEpoch, automationStudioResultCheckStateFromRows } from "./result-check.ts";

/** What assembling a context reaches outside itself. */
export type AutomationStudioRuntimeAdaptationContextPorts = {
  listFlowRunSummaries(input: { projectId: string; flowId: string; limit: number; offset: number }): Promise<{ runs: AutomationStudioFlowRunSummary[] }>;
  listFlowAdaptationSummaries(input: { projectId: string; flowId: string; limit: number; offset: number }): Promise<{ adaptations: AutomationStudioTrainingAdaptationSummary[] }>;
  getFlowAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioFlowAdaptation | null>;
  /** The Flow's run rows at this epoch, or null where the project has no typed run store. */
  readResultCheckState(input: { projectId: string; flowId: string; epoch: number }): Promise<{ ordinal: number; lastCheckedOrdinal: number | null; checksPassed: number; lastStatus: string | null } | null>;
};

export async function resolveAutomationStudioRuntimeAdaptationContext(input: {
  ports: AutomationStudioRuntimeAdaptationContextPorts;
  projectId: string;
  flow: AutomationStudioFlowArtifact;
  currentRunId?: string | undefined;
}): Promise<AutomationStudioRuntimeAdaptationContext> {
  const metadata = mergedFlowSettingsMetadata(input.flow.metadata);
  const settings = trainingModeSettingsFromMetadata(metadata);
  const policy = adaptationPolicyFromFlowMetadata(input.flow, metadata);
  // Each history read below propagates its failure, which fails the run's start. Read as empty, a failed read
  // would reset the training budget and the stability score, and hide every known adaptation from the gate.
  const recentRuns = await input.ports.listFlowRunSummaries({ projectId: input.projectId, flowId: input.flow.flowId, limit: 100, offset: 0 }).then((page) => page.runs.filter((run) => run.runId !== input.currentRunId));
  const recentAdaptations = await input.ports.listFlowAdaptationSummaries({ projectId: input.projectId, flowId: input.flow.flowId, limit: 100, offset: 0 }).then((page) => page.adaptations);
  const metrics = computeAutomationStudioStabilityMetrics({ runs: recentRuns, adaptations: recentAdaptations, now: Date.now() });
  const budgetState = runtimeTrainingBudgetStateFromSummaries(recentRuns);
  const behavior = behaviorForAutomationStudioTrainingMode(settings, recentRuns.length, metrics.stabilityScore);
  const budgetDecision = decideAutomationStudioTrainingBudget(settings, budgetState);
  // Summaries carry no failed action, so the records themselves are loaded: a
  // classifier given no adaptations can never match one. Only an absent record is skipped.
  const knownAdaptations = (await Promise.all(recentAdaptations.slice(0, AUTOMATION_STUDIO_KNOWN_ADAPTATION_LOAD_LIMIT).map((summary) => input.ports.getFlowAdaptation(input.projectId, summary.flowId, summary.adaptationId)))).filter((adaptation): adaptation is AutomationStudioFlowAdaptation => Boolean(adaptation));
  // The epoch is the Flow's own graph revision, so a landed repair restarts the
  // checking window with no bookkeeping. `runtime_runs.flow_revision` cannot
  // serve: nothing in Core ever sets `AutomationStudioFlowRunSummary.flowVersion`,
  // so every row in that column is 1. The 0022 migration says so at length.
  const resultCheckEpoch = automationStudioResultCheckEpoch(input.flow.metadata?.graphRevision);
  const resultCheckState = automationStudioResultCheckStateFromRows(await input.ports.readResultCheckState({ projectId: input.projectId, flowId: input.flow.flowId, epoch: resultCheckEpoch }));
  return {
    projectId: input.projectId,
    flowId: input.flow.flowId,
    settings,
    policy,
    behavior,
    metrics,
    budgetState,
    budgetDecision,
    runsCompleted: recentRuns.length,
    recentRunCount: recentRuns.length,
    recentAdaptationCount: recentAdaptations.length,
    recentAdaptations: knownAdaptations,
    resultCheckSchedule: resolveAutomationStudioResultCheckSchedule(settings.resultCheck?.schedule.shape),
    resultCheckState,
    resultCheckEpoch,
    diagnostics: runtimeAdaptationContextDiagnostics(settings, policy, behavior, budgetDecision)
  };
}
