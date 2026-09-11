import type { JsonObject } from "../../../../../core/index.ts";
import type {
  AutomationStudioFlowInstruction,
  AutomationStudioFlowIntervention,
  AutomationStudioFlowRunActionAttemptRecord,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowRunRecoveryRecord,
  AutomationStudioFlowRunSummary,
  AutomationStudioRuntimeSession
} from "../../../model/index.ts";
import type { AutomationStudioRuntimeRunSummary } from "../../../storage/index.ts";
import { classifyAutomationStudioAdaptiveFailure, compactAutomationStudioAdaptiveFailure } from "../../adaptive-orchestrator.ts";
import type { AutomationStudioInstructionSummary } from "../indexes/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord, jsonObjectFromUnknown, stringOrNull } from "../json-values.ts";

// Converting a runtime session into the run detail, summaries and intervention
// records that the summary indexes and the public run views are built from.
export const SUBFLOW_SUMMARY_MIGRATION_IO_CONCURRENCY = 16;

export function adaptiveRuntimeMetricsFromRunDetail(detail: AutomationStudioFlowRunDetail): JsonObject {
  const runtimePatchAttempts = Array.isArray(detail.metadata?.runtimePatchAttempts) ? detail.metadata.runtimePatchAttempts.filter(isJsonRecord) : [];
  const durableBehaviorChanged = runtimePatchAttempts.some((attempt) => isJsonRecord(attempt.approvalDecision) && attempt.approvalDecision.autoApply === true);
  const tokenUsage = detail.summary.tokenUsage ?? flowRunSummaryWithInterventionSummaries(detail).tokenUsage;
  return compactJsonObject({
    llmCallCount: detail.interventions.filter((intervention) => intervention.provider || intervention.promptVersion || intervention.kind === "diagnosis" || intervention.kind === "runtime_patch").length,
    tokenCount: tokenUsage?.totalTokens ?? 0,
    estimatedCostUsd: tokenUsage?.estimatedCostUsd ?? 0,
    recoveryAttemptCount: detail.recoveryAttempts?.length ?? 0,
    adaptationApplyCount: durableBehaviorChanged ? 1 : 0,
    durableBehaviorChanged,
    deterministicSuccessAfterAdaptation: detail.metadata?.adaptiveRetry && isJsonRecord(detail.metadata.adaptiveRetry) ? detail.metadata.adaptiveRetry.status === "succeeded" : false
  });
}

export function flowRunSummaryWithInterventionSummaries(detail: AutomationStudioFlowRunDetail): AutomationStudioFlowRunSummary {
  type TokenUsageSummary = NonNullable<AutomationStudioFlowRunSummary["tokenUsage"]>;
  const interventionSummaries = (detail.interventions ?? []).map((intervention) => ({
    interventionId: intervention.interventionId,
    kind: intervention.kind,
    reason: intervention.reason,
    ...(intervention.promptVersion ? { promptVersion: intervention.promptVersion } : {}),
    ...(intervention.provider ? { provider: intervention.provider } : {}),
    ...(intervention.model ? { model: intervention.model } : {}),
    ...(intervention.tokenUsage ? { tokenUsage: intervention.tokenUsage } : {})
  }));
  const tokenUsage: TokenUsageSummary = interventionSummaries.length ? interventionSummaries.reduce<TokenUsageSummary>((sum, intervention) => ({
    inputTokens: (sum.inputTokens ?? 0) + (intervention.tokenUsage?.inputTokens ?? 0),
    outputTokens: (sum.outputTokens ?? 0) + (intervention.tokenUsage?.outputTokens ?? 0),
    totalTokens: (sum.totalTokens ?? 0) + (intervention.tokenUsage?.totalTokens ?? 0),
    estimatedCostUsd: (sum.estimatedCostUsd ?? 0) + (intervention.tokenUsage?.estimatedCostUsd ?? 0)
  }), {}) : detail.summary.tokenUsage ?? {};
  const hasTokenUsage = Object.values(tokenUsage).some((value) => typeof value === "number" && value > 0);
  return {
    ...detail.summary,
    routeDecisionCount: detail.routeDecisions.length,
    subflowEntryCount: detail.subflows.length,
    actionAttemptCount: detail.actionAttempts?.length ?? detail.summary.actionAttemptCount,
    interventionCount: interventionSummaries.length,
    adaptationCount: new Set(detail.adaptationIds ?? []).size,
    ...(hasTokenUsage ? { tokenUsage } : {}),
    ...(interventionSummaries.length ? { interventionSummaries } : {})
  };
}

export function instructionSummaryFromInstruction(instruction: AutomationStudioFlowInstruction): AutomationStudioInstructionSummary {
  const scope = instruction.scope;
  return {
    instructionId: instruction.instructionId,
    summaryVersion: 2,
    ...(scope.kind !== "global" && "projectId" in scope ? { projectId: scope.projectId } : { projectId: "global" }),
    ...(scope.kind !== "global" && "flowId" in scope ? { flowId: scope.flowId } : {}),
    ...(scope.kind !== "global" && "subflowId" in scope && scope.subflowId ? { subflowId: scope.subflowId } : {}),
    title: instruction.title,
    scopeKind: scope.kind,
    status: instruction.status,
    requirement: instruction.requirement,
    priority: instruction.priority,
    updatedAt: instruction.updatedAt
  };
}

export function runtimeSessionToFlowRunDetail(session: AutomationStudioRuntimeSession, projectId: string): AutomationStudioFlowRunDetail {
  const actionAttempts = runtimeActionAttemptsFromSession(session);
  const recoveryAttempts = runtimeRecoveryAttemptsFromSession(session);
  const interventions = runtimeInterventionsFromRecoveryAttempts(session, recoveryAttempts);
  const terminalFailureReason = runtimeTerminalFailureReason(session, recoveryAttempts);
  return {
    schemaVersion: "0.1",
    summary: runtimeFlowRunSummaryFromSession(session, projectId),
    inputs: jsonObjectFromUnknown(session.metadata?.inputs) ?? {},
    routeDecisions: [],
    subflows: [],
    actionAttempts,
    recoveryAttempts,
    interventions,
    adaptationIds: [],
    changeProposalIds: [],
    metadata: {
      compatibilitySource: "runtime-session",
      targetKind: session.targetKind,
      targetId: session.targetId,
      recoveryAttemptCount: recoveryAttempts.length,
      comparisonCount: actionAttempts.filter((attempt) => attempt.comparisonStatus).length,
      ...(terminalFailureReason ? { terminalFailureReason } : {}),
      ...(session.trace?.message ? { message: session.trace.message } : {}),
      ...(session.trace?.currentNodeId ? { currentNodeId: session.trace.currentNodeId } : {})
    }
  };
}

export function runtimeSummaryFromSession(session: AutomationStudioRuntimeSession): AutomationStudioRuntimeRunSummary {
  const updatedAt = session.finishedAt ?? session.startedAt ?? session.queuedAt ?? Date.now();
  return {
    runId: session.runId,
    targetKind: session.targetKind,
    targetId: session.targetId,
    status: session.status,
    queuedAt: session.queuedAt,
    ...(session.startedAt !== undefined ? { startedAt: session.startedAt } : {}),
    ...(session.finishedAt !== undefined ? { finishedAt: session.finishedAt } : {}),
    ...(session.flowId ? { flowId: session.flowId } : {}),
    attemptCount: session.trace?.attempts?.length ?? 0,
    effectCount: session.trace?.effects?.length ?? 0,
    updatedAt
  };
}

function graphStatusToFlowRunStatus(status: string): AutomationStudioFlowRunActionAttemptRecord["status"] {
  if (status === "running" || status === "succeeded" || status === "failed" || status === "waiting" || status === "cancelled") return status;
  return "unknown";
}

function runtimeActionAttemptsFromSession(session: AutomationStudioRuntimeSession): AutomationStudioFlowRunActionAttemptRecord[] {
  return (session.trace?.attempts ?? []).map((attempt, index) => {
    const durationMs = attempt.finishedAt === undefined ? undefined : Math.max(0, attempt.finishedAt - attempt.startedAt);
    const adaptiveFailure = attempt.status === "failed"
      ? compactAutomationStudioAdaptiveFailure(classifyAutomationStudioAdaptiveFailure({
        projectId: session.projectId ?? "",
        flowId: session.flowId,
        runId: session.runId,
        attempt
      }))
      : undefined;
    return {
      attemptId: attempt.attemptId,
      nodeId: attempt.nodeId,
      definitionId: attempt.definitionId,
      order: index + 1,
      status: graphStatusToFlowRunStatus(attempt.status),
      ...(attempt.route ? { route: attempt.route } : {}),
      startedAt: attempt.startedAt,
      ...(attempt.finishedAt !== undefined ? { finishedAt: attempt.finishedAt } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(attempt.transitionComparison?.status ? { comparisonStatus: attempt.transitionComparison.status } : {}),
      ...(attempt.message ? { message: attempt.message } : {}),
      metadata: {
        ...(attempt.regionId ? { regionId: attempt.regionId } : {}),
        ...(attempt.transitionComparison?.diffSummary ? { diffSummary: attempt.transitionComparison.diffSummary } : {}),
        ...(attempt.recoveryDecision?.selected ? { recoverySelected: attempt.recoveryDecision.selected } : {}),
        ...(attempt.hostCapabilities?.length ? { hostCapabilities: attempt.hostCapabilities } : {}),
        ...(attempt.stateRefs ? { stateRefs: attempt.stateRefs } : {}),
        ...(adaptiveFailure ? { adaptiveFailure } : {})
      }
    };
  });
}

function runtimeFlowRunSummaryFromSession(session: AutomationStudioRuntimeSession, projectId: string): AutomationStudioFlowRunSummary {
  const recoveryAttemptCount = session.trace?.attempts?.filter((attempt) => attempt.recoveryDecision).length ?? 0;
  const interventionCount = session.trace?.attempts?.filter((attempt) => attempt.recoveryDecision?.selected?.kind === "llm_diagnosis").length ?? 0;
  return {
    schemaVersion: "0.1",
    runId: session.runId,
    flowId: session.flowId,
    projectId,
    status: session.status,
    startedAt: session.startedAt ?? session.queuedAt,
    ...(session.finishedAt !== undefined ? { finishedAt: session.finishedAt } : {}),
    updatedAt: Math.max(session.finishedAt ?? 0, session.startedAt ?? 0, session.queuedAt),
    routeDecisionCount: 0,
    subflowEntryCount: 0,
    actionAttemptCount: session.trace?.attempts?.length ?? 0,
    interventionCount,
    adaptationCount: 0,
    metadata: {
      compatibilitySource: "runtime-session",
      targetKind: session.targetKind,
      targetId: session.targetId,
      effectCount: session.trace?.effects?.length ?? 0,
      recoveryAttemptCount
    }
  };
}

function runtimeInterventionsFromRecoveryAttempts(session: AutomationStudioRuntimeSession, recoveryAttempts: AutomationStudioFlowRunRecoveryRecord[]): AutomationStudioFlowIntervention[] {
  return recoveryAttempts
    .filter((attempt) => attempt.status === "diagnosis_only")
    .map((attempt) => ({
      schemaVersion: "0.1",
      interventionId: `${attempt.recoveryId}.diagnosis`,
      runId: session.runId,
      flowId: session.flowId,
      projectId: session.projectId ?? "",
      kind: "diagnosis",
      reason: attempt.reason ?? "Recovery ladder reached LLM diagnosis fallback.",
      contextSummary: {
        attemptId: attempt.attemptId,
        nodeId: attempt.nodeId,
        candidateCount: attempt.candidateCount
      },
      validation: { ok: false, issues: ["LLM diagnosis provider is not configured in this runtime slice."] },
      createdAt: attempt.createdAt,
      metadata: { recoveryId: attempt.recoveryId }
    }));
}

function runtimeRecoveryAttemptsFromSession(session: AutomationStudioRuntimeSession): AutomationStudioFlowRunRecoveryRecord[] {
  const createdAt = session.finishedAt ?? session.startedAt ?? session.queuedAt;
  return (session.trace?.attempts ?? [])
    .filter((attempt) => attempt.recoveryDecision)
    .map((attempt) => {
      const decision = attempt.recoveryDecision!;
      const selected = decision.selected;
      return {
        recoveryId: `${attempt.attemptId}.recovery`,
        attemptId: attempt.attemptId,
        nodeId: attempt.nodeId,
        ...(selected?.kind ? { selectedKind: selected.kind } : {}),
        ...(selected?.targetNodeId ? { selectedTargetNodeId: selected.targetNodeId } : {}),
        ...(selected?.edgeId ? { selectedEdgeId: selected.edgeId } : {}),
        candidateCount: decision.candidates.length,
        ...(selected?.reason ? { reason: selected.reason } : {}),
        status: selected?.kind === "llm_diagnosis" ? "diagnosis_only" : selected ? "selected" : "exhausted",
        createdAt,
        metadata: {
          lookup: decision.lookup,
          candidates: decision.candidates
        }
      };
    });
}

function runtimeTerminalFailureReason(session: AutomationStudioRuntimeSession, recoveryAttempts: AutomationStudioFlowRunRecoveryRecord[]): string | undefined {
  if (session.status !== "failed") return undefined;
  const latest = recoveryAttempts[recoveryAttempts.length - 1];
  if (!latest) return session.trace?.message ?? "Run failed before recovery lookup produced a candidate.";
  if (latest.status === "diagnosis_only") return "Recovery ladder stopped at LLM diagnosis fallback because no deterministic recovery resolved the failure.";
  if (latest.status === "exhausted") return "Recovery ladder exhausted all known recovery candidates.";
  return session.trace?.message ?? "Run failed after recovery was selected.";
}
