import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioChangeProposalKind, AutomationStudioChangeProposalMode, AutomationStudioChangeProposalStatus, AutomationStudioFlowAdaptation, AutomationStudioFlowRunDetail, AutomationStudioFlowRunSummary, AutomationStudioFlowSubflow } from "../model/index.ts";

export type AutomationStudioTrainingAdaptationSummary = {
  adaptationId: string;
  flowId: string;
  projectId: string;
  subflowId?: string;
  status: AutomationStudioFlowAdaptation["status"];
  riskLevel: AutomationStudioFlowAdaptation["riskLevel"];
  trigger: string;
  updatedAt: number;
};

export type AutomationStudioExecutionMode =
  | "normal"
  | "train_for_runs"
  | "train_until_stable"
  | "continuous_adaptive";

export type AutomationStudioTrainingModeSettings = {
  mode: AutomationStudioExecutionMode;
  trainForRunCount?: number;
  stableRunThreshold?: number;
  minimumStabilityScore?: number;
  allowLlmIntervention: boolean;
  allowRuntimeRecovery: boolean;
  allowAdaptationCreation: boolean;
  proposalApprovalMode: "auto" | "manual" | "mixed";
  allowPromotion: boolean;
  budgets?: AutomationStudioTrainingBudgetControls;
  frozenScopes?: AutomationStudioFrozenScope[];
  metadata?: JsonObject;
};

export type AutomationStudioTrainingBudgetControls = {
  maxInterventionsPerRun?: number;
  maxTokensPerRun?: number;
  maxCostUsdPerTrainingWindow?: number;
  exhaustedBehavior: "stop" | "ask";
};

export type AutomationStudioFrozenScope =
  | { kind: "flow"; flowId: string }
  | { kind: "route"; flowId: string; routeRuleId: string }
  | { kind: "subflow"; flowId: string; subflowId: string };

export type AutomationStudioTrainingModeBehavior = {
  invokeLlm: boolean;
  runRecovery: boolean;
  createAdaptations: boolean;
  proposalApprovalMode: "auto" | "manual" | "mixed";
  promoteAdaptations: boolean;
};

export type AutomationStudioStabilityMetrics = {
  deterministicSuccessRuns: number;
  llmInterventionsPerRun: number;
  unresolvedFailures: number;
  repeatedTriggers: Array<{ trigger: string; count: number }>;
  acceptedAdaptations: number;
  rejectedAdaptations: number;
  msSinceLastStructuralChange?: number;
  stabilityScore: number;
};

export type AutomationStudioUncertaintySummary = {
  scope: "flow" | "route" | "subflow";
  id: string;
  unresolvedFailures: number;
  repeatedTriggerCount: number;
  pendingProposalCount: number;
  rejectedAdaptationCount: number;
  score: number;
};

export type AutomationStudioTrainingBudgetState = {
  interventionsThisRun: number;
  tokensThisRun: number;
  costUsdThisTrainingWindow: number;
};

export type AutomationStudioTrainingBudgetDecision = {
  ok: boolean;
  exhausted: string[];
  behavior: "continue" | "stop" | "ask";
};

export type AutomationStudioLlmInvocationGateInput = {
  expectedStateMatched?: boolean;
  knownRecoveryAvailable?: boolean;
  rerouteAvailable?: boolean;
  settings: AutomationStudioTrainingModeSettings;
  runsCompleted?: number;
  stabilityScore?: number;
  budgetState?: AutomationStudioTrainingBudgetState;
  policyPreset?: "locked" | "observe" | "repair" | "adaptive";
};

export type AutomationStudioLlmInvocationGateDecision = {
  invoke: boolean;
  reason: string;
  requiredPriorAction?: "none" | "known_recovery" | "reroute" | "manual_approval" | "stop";
  behavior: AutomationStudioTrainingModeBehavior;
  budget: AutomationStudioTrainingBudgetDecision;
};

export type AutomationStudioProposalApprovalGateInput = {
  proposalMode: AutomationStudioChangeProposalMode;
  riskLevel: AutomationStudioFlowAdaptation["riskLevel"];
  patchKinds: AutomationStudioChangeProposalKind[];
  validated: boolean;
  sourceKind?: "run" | "adaptation" | "instruction" | "manual_edit" | "recording";
};

export type AutomationStudioProposalApprovalGateDecision = {
  createProposal: boolean;
  status?: AutomationStudioChangeProposalStatus;
  requiresManualApproval: boolean;
  reason: string;
};

export type AutomationStudioTrainingStatus = {
  mode: AutomationStudioExecutionMode;
  runsCompleted: number;
  stabilityScore: number;
  learnedChangeCount: number;
  pendingProposalCount: number;
  uncertainty: AutomationStudioUncertaintySummary[];
  frozenScopeCount: number;
};

export function behaviorForAutomationStudioTrainingMode(settings: AutomationStudioTrainingModeSettings, runsCompleted = 0, stabilityScore = 0): AutomationStudioTrainingModeBehavior {
  if (settings.mode === "normal") {
    return { invokeLlm: false, runRecovery: settings.allowRuntimeRecovery, createAdaptations: false, proposalApprovalMode: "manual", promoteAdaptations: false };
  }
  if (settings.mode === "train_for_runs") {
    const active = runsCompleted < Math.max(0, settings.trainForRunCount ?? 0);
    return {
      invokeLlm: active && settings.allowLlmIntervention,
      runRecovery: settings.allowRuntimeRecovery,
      createAdaptations: active && settings.allowAdaptationCreation,
      proposalApprovalMode: settings.proposalApprovalMode,
      promoteAdaptations: active && settings.allowPromotion
    };
  }
  if (settings.mode === "train_until_stable") {
    const active = stabilityScore < (settings.minimumStabilityScore ?? 0.9);
    return {
      invokeLlm: active && settings.allowLlmIntervention,
      runRecovery: settings.allowRuntimeRecovery,
      createAdaptations: active && settings.allowAdaptationCreation,
      proposalApprovalMode: settings.proposalApprovalMode,
      promoteAdaptations: active && settings.allowPromotion
    };
  }
  return {
    invokeLlm: settings.allowLlmIntervention,
    runRecovery: settings.allowRuntimeRecovery,
    createAdaptations: settings.allowAdaptationCreation,
    proposalApprovalMode: settings.proposalApprovalMode,
    promoteAdaptations: settings.allowPromotion
  };
}

export function annotateRunDetailWithTrainingMode(detail: AutomationStudioFlowRunDetail, settings: AutomationStudioTrainingModeSettings, behavior: AutomationStudioTrainingModeBehavior): AutomationStudioFlowRunDetail {
  return {
    ...detail,
    metadata: {
      ...(detail.metadata ?? {}),
      trainingMode: settings.mode,
      trainingBehavior: behavior
    }
  };
}

export function computeAutomationStudioStabilityMetrics(input: { runs: AutomationStudioFlowRunSummary[]; adaptations: AutomationStudioTrainingAdaptationSummary[]; now?: number }): AutomationStudioStabilityMetrics {
  const runs = input.runs;
  const adaptations = input.adaptations;
  const runCount = Math.max(1, runs.length);
  const deterministicSuccessRuns = runs.filter((run) => run.status === "succeeded" && (run.interventionCount ?? 0) === 0).length;
  const unresolvedFailures = runs.filter((run) => run.status === "failed").length;
  const llmInterventionsPerRun = runs.reduce((sum, run) => sum + (run.interventionCount ?? 0), 0) / runCount;
  const triggerCounts = new Map<string, number>();
  for (const adaptation of adaptations) triggerCounts.set(adaptation.trigger, (triggerCounts.get(adaptation.trigger) ?? 0) + 1);
  const repeatedTriggers = [...triggerCounts.entries()].filter(([, count]) => count > 1).map(([trigger, count]) => ({ trigger, count })).sort((left, right) => right.count - left.count || left.trigger.localeCompare(right.trigger));
  const acceptedAdaptations = adaptations.filter((adaptation) => adaptation.status === "applied" || adaptation.status === "validated").length;
  const rejectedAdaptations = adaptations.filter((adaptation) => adaptation.status === "rejected" || adaptation.status === "disabled" || adaptation.status === "reverted").length;
  const lastStructuralChange = adaptations.filter((adaptation) => adaptation.status === "applied").map((adaptation) => adaptation.updatedAt).sort((left, right) => right - left)[0];
  const successRatio = deterministicSuccessRuns / runCount;
  const failurePenalty = unresolvedFailures / runCount;
  const interventionPenalty = Math.min(1, llmInterventionsPerRun);
  const rejectionPenalty = adaptations.length ? rejectedAdaptations / adaptations.length : 0;
  return {
    deterministicSuccessRuns,
    llmInterventionsPerRun,
    unresolvedFailures,
    repeatedTriggers,
    acceptedAdaptations,
    rejectedAdaptations,
    ...(lastStructuralChange !== undefined && input.now !== undefined ? { msSinceLastStructuralChange: Math.max(0, input.now - lastStructuralChange) } : {}),
    stabilityScore: Math.max(0, Math.min(1, successRatio - failurePenalty * 0.35 - interventionPenalty * 0.2 - rejectionPenalty * 0.15))
  };
}

export function summarizeAutomationStudioUncertainty(input: { flowId: string; runs: AutomationStudioFlowRunSummary[]; adaptations: AutomationStudioTrainingAdaptationSummary[]; subflows?: AutomationStudioFlowSubflow[]; pendingProposalCount?: number }): AutomationStudioUncertaintySummary[] {
  const metrics = computeAutomationStudioStabilityMetrics(input);
  const summaries: AutomationStudioUncertaintySummary[] = [{
    scope: "flow",
    id: input.flowId,
    unresolvedFailures: metrics.unresolvedFailures,
    repeatedTriggerCount: metrics.repeatedTriggers.length,
    pendingProposalCount: input.pendingProposalCount ?? 0,
    rejectedAdaptationCount: metrics.rejectedAdaptations,
    score: 1 - metrics.stabilityScore
  }];
  for (const subflow of input.subflows ?? []) {
    const scopedAdaptations = input.adaptations.filter((adaptation) => adaptation.subflowId === subflow.subflowId);
    const scopedMetrics = computeAutomationStudioStabilityMetrics({ runs: input.runs, adaptations: scopedAdaptations });
    summaries.push({
      scope: "subflow",
      id: subflow.subflowId,
      unresolvedFailures: scopedMetrics.unresolvedFailures,
      repeatedTriggerCount: scopedMetrics.repeatedTriggers.length,
      pendingProposalCount: 0,
      rejectedAdaptationCount: scopedMetrics.rejectedAdaptations,
      score: 1 - scopedMetrics.stabilityScore
    });
  }
  return summaries.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

export function decideAutomationStudioTrainingBudget(settings: AutomationStudioTrainingModeSettings, state: AutomationStudioTrainingBudgetState): AutomationStudioTrainingBudgetDecision {
  const budget = settings.budgets;
  if (!budget) return { ok: true, exhausted: [], behavior: "continue" };
  const exhausted = [
    budget.maxInterventionsPerRun !== undefined && state.interventionsThisRun >= budget.maxInterventionsPerRun ? "max interventions per run" : "",
    budget.maxTokensPerRun !== undefined && state.tokensThisRun >= budget.maxTokensPerRun ? "max tokens per run" : "",
    budget.maxCostUsdPerTrainingWindow !== undefined && state.costUsdThisTrainingWindow >= budget.maxCostUsdPerTrainingWindow ? "max cost per training window" : ""
  ].filter(Boolean);
  return {
    ok: exhausted.length === 0,
    exhausted,
    behavior: exhausted.length ? budget.exhaustedBehavior : "continue"
  };
}

export function decideAutomationStudioLlmInvocationGate(input: AutomationStudioLlmInvocationGateInput): AutomationStudioLlmInvocationGateDecision {
  const behavior = behaviorForAutomationStudioTrainingMode(input.settings, input.runsCompleted ?? 0, input.stabilityScore ?? 0);
  const budget = decideAutomationStudioTrainingBudget(input.settings, input.budgetState ?? { interventionsThisRun: 0, tokensThisRun: 0, costUsdThisTrainingWindow: 0 });
  if (input.expectedStateMatched) return { invoke: false, reason: "Expected state already matches; no LLM intervention is needed.", requiredPriorAction: "none", behavior, budget };
  if (input.policyPreset === "locked" || input.policyPreset === "observe") return { invoke: false, reason: `${input.policyPreset} policy prevents LLM intervention.`, requiredPriorAction: "manual_approval", behavior, budget };
  if (!behavior.invokeLlm) return { invoke: false, reason: "Current training mode does not allow LLM intervention.", requiredPriorAction: input.settings.proposalApprovalMode === "manual" ? "manual_approval" : "none", behavior, budget };
  if (input.knownRecoveryAvailable) return { invoke: false, reason: "A deterministic recovery path is available and must run before LLM intervention.", requiredPriorAction: "known_recovery", behavior, budget };
  if (input.rerouteAvailable) return { invoke: false, reason: "A deterministic reroute is available and must run before LLM intervention.", requiredPriorAction: "reroute", behavior, budget };
  if (!budget.ok) return { invoke: false, reason: `LLM budget exhausted: ${budget.exhausted.join(", ")}.`, requiredPriorAction: budget.behavior === "ask" ? "manual_approval" : "stop", behavior, budget };
  if (input.settings.proposalApprovalMode === "manual") return { invoke: false, reason: "Manual proposal approval mode requires explicit approval before LLM intervention.", requiredPriorAction: "manual_approval", behavior, budget };
  return { invoke: true, reason: "LLM intervention is allowed for unresolved novelty after deterministic options are exhausted.", requiredPriorAction: "none", behavior, budget };
}

export function decideAutomationStudioProposalApprovalGate(input: AutomationStudioProposalApprovalGateInput): AutomationStudioProposalApprovalGateDecision {
  if (input.sourceKind === "recording") {
    return {
      createProposal: false,
      requiresManualApproval: false,
      reason: "Recordings are optional evidence and do not directly create Flow change proposals."
    };
  }
  if (!input.validated) {
    return { createProposal: true, status: "pending", requiresManualApproval: true, reason: "Unvalidated changes require review." };
  }
  if (input.proposalMode === "manual") {
    return { createProposal: true, status: "pending", requiresManualApproval: true, reason: "Manual proposal mode requires review before approval." };
  }
  const majorPatch = input.patchKinds.some((kind) => kind === "create_subflow" || kind === "edit_router" || kind === "edit_recovery" || kind === "promote_adaptation");
  const highRisk = input.riskLevel === "high" || input.riskLevel === "destructive";
  if (input.proposalMode === "mixed" && (majorPatch || highRisk)) {
    return { createProposal: true, status: "pending", requiresManualApproval: true, reason: "Mixed proposal mode routes major or high-risk changes to manual review." };
  }
  return { createProposal: true, status: "auto_approved", requiresManualApproval: false, reason: "Validated low-risk proposal can proceed automatically." };
}

export function automationStudioScopeIsFrozen(settings: AutomationStudioTrainingModeSettings, scope: AutomationStudioFrozenScope): boolean {
  return Boolean(settings.frozenScopes?.some((candidate) => {
    if (candidate.kind !== scope.kind || candidate.flowId !== scope.flowId) return false;
    if (candidate.kind === "flow") return true;
    if (candidate.kind === "route" && scope.kind === "route") return candidate.routeRuleId === scope.routeRuleId;
    if (candidate.kind === "subflow" && scope.kind === "subflow") return candidate.subflowId === scope.subflowId;
    return false;
  }));
}

export function createAutomationStudioTrainingStatus(input: { settings: AutomationStudioTrainingModeSettings; runs: AutomationStudioFlowRunSummary[]; adaptations: AutomationStudioTrainingAdaptationSummary[]; pendingProposalCount?: number; uncertainty: AutomationStudioUncertaintySummary[] }): AutomationStudioTrainingStatus {
  const metrics = computeAutomationStudioStabilityMetrics({ runs: input.runs, adaptations: input.adaptations });
  return {
    mode: input.settings.mode,
    runsCompleted: input.runs.length,
    stabilityScore: metrics.stabilityScore,
    learnedChangeCount: metrics.acceptedAdaptations,
    pendingProposalCount: input.pendingProposalCount ?? 0,
    uncertainty: input.uncertainty,
    frozenScopeCount: input.settings.frozenScopes?.length ?? 0
  };
}
