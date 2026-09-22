import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowRunDetail, AutomationStudioFlowRunSummary } from "../../../model/index.ts";
import type { AutomationStudioRecoveryBudget } from "../../executor.ts";
import { annotateRunDetailWithTrainingMode, type AutomationStudioTrainingBudgetState, type AutomationStudioTrainingModeBehavior, type AutomationStudioTrainingModeSettings, type decideAutomationStudioTrainingBudget } from "../../training-modes.ts";
import { firstFiniteNumber } from "../scalar-readings/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "./contracts.ts";
import { normalizeAutomationStudioRuntimeInterventionMode, type AutomationStudioRuntimeInterventionMode } from "./intervention-mode.ts";

// The runtime adaptation context a run carries: how a run-level override
// narrows it, the recovery budget it implies, and the summary a run detail
// records.

export function runtimeTrainingBudgetStateFromSummaries(runs: AutomationStudioFlowRunSummary[]): AutomationStudioTrainingBudgetState {
  return {
    interventionsThisRun: 0,
    tokensThisRun: 0,
    costUsdThisTrainingWindow: runs.reduce((sum, run) => sum + (run.tokenUsage?.estimatedCostUsd ?? 0), 0)
  };
}

export function runtimeAdaptationContextDiagnostics(
  settings: AutomationStudioTrainingModeSettings,
  policy: AutomationStudioAdaptationPolicy,
  behavior: AutomationStudioTrainingModeBehavior,
  budgetDecision: ReturnType<typeof decideAutomationStudioTrainingBudget>
): string[] {
  const diagnostics: string[] = [];
  if (!behavior.invokeLlm) diagnostics.push("LLM intervention is disabled by training mode or settings.");
  if (!behavior.createAdaptations) diagnostics.push("Adaptation creation is disabled by training mode or settings.");
  if (!policy.allowRuntimeRecovery) diagnostics.push("Runtime recovery is disabled by adaptation policy.");
  if (!budgetDecision.ok) diagnostics.push(`Training budget exhausted: ${budgetDecision.exhausted.join(", ")}.`);
  if (settings.mode === "normal") diagnostics.push("Normal mode records adaptive context without invoking LLM.");
  return diagnostics;
}

export function runtimeAdaptationContextWithRunOverride(
  context: AutomationStudioRuntimeAdaptationContext,
  input: { adaptiveMode?: AutomationStudioRuntimeInterventionMode; dryRunLlm?: boolean }
): AutomationStudioRuntimeAdaptationContext {
  const mode = normalizeAutomationStudioRuntimeInterventionMode(input.adaptiveMode);
  if (mode === "fully_adaptive" && input.dryRunLlm !== true) return context;
  const behavior = { ...context.behavior };
  const metadata: JsonObject = { ...(context.settings.metadata ?? {}), runtimeOverrideMode: mode };
  if (mode === "no_llm_intervention") {
    behavior.invokeLlm = false;
    behavior.createAdaptations = false;
    behavior.promoteAdaptations = false;
  }
  if (mode === "manual_approval") {
    behavior.invokeLlm = true;
    behavior.runRecovery = false;
    behavior.createAdaptations = false;
    behavior.promoteAdaptations = false;
    context = { ...context, policy: { ...context.policy, proposalMode: "manual" } };
  }
  if (input.dryRunLlm === true) {
    behavior.invokeLlm = true;
    behavior.runRecovery = true;
    behavior.createAdaptations = true;
    behavior.promoteAdaptations = false;
    metadata.dryRunAdaptation = true;
  }
  return {
    ...context,
    behavior,
    settings: {
      ...context.settings,
      metadata
    },
    diagnostics: [
      ...context.diagnostics,
      ...(mode !== "fully_adaptive" ? [`Runtime override mode: ${mode}.`] : []),
      ...(input.dryRunLlm === true ? ["Runtime override enabled dry-run LLM adaptation suggestions."] : [])
    ]
  };
}

export function recoveryBudgetFromRuntimeAdaptationContext(context: AutomationStudioRuntimeAdaptationContext): AutomationStudioRecoveryBudget {
  const maxAdaptationOrLlmAttemptsPerRun = firstFiniteNumber(context.policy.maxInterventionsPerRun, context.settings.budgets?.maxInterventionsPerRun);
  return {
    ...(context.settings.recoveryBudget ?? {}),
    ...(maxAdaptationOrLlmAttemptsPerRun !== undefined ? { maxAdaptationOrLlmAttemptsPerRun } : {})
  };
}

export function runtimeRunDetailWithAdaptationContext(detail: AutomationStudioFlowRunDetail, context: AutomationStudioRuntimeAdaptationContext | null): AutomationStudioFlowRunDetail {
  if (!context) return detail;
  const annotated = annotateRunDetailWithTrainingMode(detail, context.settings, context.behavior);
  return {
    ...annotated,
    metadata: {
      ...(annotated.metadata ?? {}),
      runtimeAdaptationContext: runtimeAdaptationContextSummary(context)
    }
  };
}

function runtimeAdaptationContextSummary(context: AutomationStudioRuntimeAdaptationContext): JsonObject {
  return {
    flowId: context.flowId,
    mode: context.settings.mode,
    policyId: context.policy.policyId,
    policyPreset: context.policy.preset,
    approvalMode: context.policy.proposalMode,
    behavior: {
      invokeLlm: context.behavior.invokeLlm,
      runRecovery: context.behavior.runRecovery,
      createAdaptations: context.behavior.createAdaptations,
      promoteAdaptations: context.behavior.promoteAdaptations
    },
    budget: {
      ok: context.budgetDecision.ok,
      behavior: context.budgetDecision.behavior,
      exhausted: context.budgetDecision.exhausted,
      interventionsThisRun: context.budgetState.interventionsThisRun,
      tokensThisRun: context.budgetState.tokensThisRun,
      costUsdThisTrainingWindow: context.budgetState.costUsdThisTrainingWindow
    },
    metrics: {
      stabilityScore: context.metrics.stabilityScore,
      deterministicSuccessRuns: context.metrics.deterministicSuccessRuns,
      unresolvedFailures: context.metrics.unresolvedFailures,
      llmInterventionsPerRun: context.metrics.llmInterventionsPerRun,
      acceptedAdaptations: context.metrics.acceptedAdaptations,
      rejectedAdaptations: context.metrics.rejectedAdaptations
    },
    runsCompleted: context.runsCompleted,
    recentRunCount: context.recentRunCount,
    recentAdaptationCount: context.recentAdaptationCount,
    diagnostics: context.diagnostics
  };
}
